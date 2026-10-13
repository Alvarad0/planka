/**
 * @swagger
 * /cards/{id}/gitlab-merge-request:
 *   post:
 *     summary: Create GitLab merge request for a card
 *     description: Creates a merge request from the card's branch into the default branch of the project's GitLab integration, titled after the linked issue and closing it (`Closes #<issue IID>`). If the branch already has an open merge request, that one is returned instead (`isExistingMergeRequest`). The merge request is stored in the link's snapshot. Requires board editor permissions.
 *     tags:
 *       - GitLab Card Links
 *     operationId: createCardGitlabMergeRequest
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the card
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     responses:
 *       200:
 *         description: GitLab merge request created (or existing one returned) successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *                 - included
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/GitlabCardLink'
 *                 included:
 *                   type: object
 *                   required:
 *                     - gitlabMergeRequest
 *                     - isExistingMergeRequest
 *                   properties:
 *                     gitlabMergeRequest:
 *                       $ref: '#/components/schemas/GitlabMergeRequest'
 *                     isExistingMergeRequest:
 *                       type: boolean
 *                       description: Whether the branch already had an open merge request, which is returned instead of creating one
 *                       example: false
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/UnprocessableEntity'
 */

const { idInput } = require('../../../utils/inputs');
const { ErrorCodes } = require('../../../utils/gitlab-client');
const { GitlabErrors, gitlabExits, mapGitlabError } = require('../../../utils/gitlab-errors');
const { buildSnapshot, readSnapshot } = require('../../../utils/gitlab-snapshot');

const Errors = {
  ...GitlabErrors,
  NOT_ENOUGH_RIGHTS: {
    notEnoughRights: 'Not enough rights',
  },
  CARD_NOT_FOUND: {
    cardNotFound: 'Card not found',
  },
  CARD_IS_NOT_LINKED_TO_GITLAB_ISSUE: {
    cardIsNotLinkedToGitlabIssue: 'Card is not linked to a GitLab issue',
  },
  CARD_WAS_MOVED_TO_ANOTHER_PROJECT: {
    cardWasMovedToAnotherProject: 'Card was moved to a project linked to another GitLab project',
  },
  CARD_HAS_NO_BRANCH: {
    cardHasNoBranch: 'Card has no GitLab branch',
  },
};

module.exports = {
  inputs: {
    id: {
      ...idInput,
      required: true,
    },
  },

  exits: {
    ...gitlabExits,
    notEnoughRights: {
      responseType: 'forbidden',
    },
    cardNotFound: {
      responseType: 'notFound',
    },
    cardIsNotLinkedToGitlabIssue: {
      responseType: 'unprocessableEntity',
    },
    cardWasMovedToAnotherProject: {
      responseType: 'unprocessableEntity',
    },
    cardHasNoBranch: {
      responseType: 'unprocessableEntity',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const { card, board, project, gitlabIntegration, gitlabCardLink } =
      await sails.helpers.gitlabCardLinks.getCardContext
        .with({
          currentUser,
          cardId: inputs.id,
          requireEditor: true,
        })
        .intercept('cardNotFound', () => Errors.CARD_NOT_FOUND)
        .intercept('notEnoughRights', () => Errors.NOT_ENOUGH_RIGHTS);

    if (!gitlabCardLink) {
      throw Errors.CARD_IS_NOT_LINKED_TO_GITLAB_ISSUE;
    }

    // The merge request would target the current project's default branch, not the issue's one
    if (!gitlabIntegration || gitlabCardLink.gitlabIntegrationId !== gitlabIntegration.id) {
      throw Errors.CARD_WAS_MOVED_TO_ANOTHER_PROJECT;
    }

    const { branchName } = gitlabCardLink;

    if (!branchName) {
      throw Errors.CARD_HAS_NO_BRANCH;
    }

    const mapError = (error, notFoundError = Errors.GITLAB_PROJECT_NOT_FOUND) =>
      mapGitlabError(error, {
        notFoundError,
        projectId: project.id,
        integrationId: gitlabIntegration.id,
      });

    let client;
    try {
      client = await sails.helpers.gitlab.makeClient();
    } catch (error) {
      throw mapError(error);
    }

    const projectRef = gitlabIntegration.gitlabProjectId;

    const findOpenMergeRequest = async () => {
      const mergeRequests = await client.listMergeRequests(projectRef, {
        sourceBranch: branchName,
        state: 'opened',
      });

      return mergeRequests[0] || null;
    };

    let gitlabMergeRequest;
    let isExistingMergeRequest = false;
    try {
      // Idempotent: an open merge request of the branch (e.g. opened by hand) is returned as is
      gitlabMergeRequest = await findOpenMergeRequest();

      if (gitlabMergeRequest) {
        isExistingMergeRequest = true;
      } else {
        let gitlabIssue;
        try {
          gitlabIssue = await client.getIssue(projectRef, gitlabCardLink.issueIid);
        } catch (error) {
          throw mapError(error, Errors.GITLAB_ISSUE_NOT_FOUND);
        }

        try {
          gitlabMergeRequest = await client.createMergeRequest(projectRef, {
            sourceBranch: branchName,
            targetBranch: gitlabIntegration.defaultBranch,
            title: gitlabIssue.title,
            description: `Closes #${gitlabCardLink.issueIid}`,
          });
        } catch (error) {
          if (error.code !== ErrorCodes.MERGE_REQUEST_ALREADY_EXISTS) {
            throw error;
          }

          // Lost a race with another request opening a merge request for the branch
          gitlabMergeRequest = await findOpenMergeRequest();

          if (!gitlabMergeRequest) {
            throw error;
          }

          isExistingMergeRequest = true;
        }
      }
    } catch (error) {
      throw mapError(error);
    }

    const nextGitlabCardLink = await sails.helpers.gitlabCardLinks.updateOne.with({
      board,
      record: gitlabCardLink,
      values: {
        snapshot: buildSnapshot({
          ...readSnapshot(gitlabCardLink.snapshot),
          mergeRequest: gitlabMergeRequest,
        }),
      },
      request: this.req,
    });

    if (!nextGitlabCardLink) {
      // Lost a race: the link was removed concurrently; the GitLab merge request stays
      sails.log.warn(
        `GitLab merge request was created but card ${card.id} was unlinked concurrently ` +
          `(integration: ${gitlabIntegration.id})`,
      );

      throw Errors.CARD_IS_NOT_LINKED_TO_GITLAB_ISSUE;
    }

    return {
      item: sails.helpers.gitlabCardLinks.presentOne(nextGitlabCardLink),
      included: {
        gitlabMergeRequest,
        isExistingMergeRequest,
      },
    };
  },
};
