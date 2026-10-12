/**
 * @swagger
 * /cards/{id}/gitlab-sync:
 *   post:
 *     summary: Synchronize GitLab data of a card
 *     description: Re-fetches the GitLab data of a linked card (issue and, when the card has a branch, its merge request, latest pipeline and commits ahead of the default branch), stores it as the link's snapshot and broadcasts the updated link. Unlike getting the card's GitLab data, a GitLab failure is reported as an error instead of falling back to the snapshot. Responds like getting the card's GitLab data. Requires board editor permissions.
 *     tags:
 *       - GitLab Card Links
 *     operationId: syncCardGitlab
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
 *         description: GitLab data of the card synchronized successfully (same shape as `GET /cards/{id}/gitlab`, with `isStale` false)
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
 *                   description: Same fields as `included` of `GET /cards/{id}/gitlab`
 *                   properties:
 *                     gitlabIntegration:
 *                       type: object
 *                       nullable: true
 *                     gitlabIssue:
 *                       $ref: '#/components/schemas/GitlabIssue'
 *                     gitlabMergeRequest:
 *                       allOf:
 *                         - $ref: '#/components/schemas/GitlabMergeRequest'
 *                       nullable: true
 *                     gitlabPipeline:
 *                       allOf:
 *                         - $ref: '#/components/schemas/GitlabPipeline'
 *                       nullable: true
 *                     commitsCount:
 *                       type: integer
 *                       nullable: true
 *                     hasMoreCommits:
 *                       type: boolean
 *                     isStale:
 *                       type: boolean
 *                       example: false
 *                     isProjectMismatch:
 *                       type: boolean
 *                     suggestedBranchName:
 *                       type: string
 *                       nullable: true
 *                     defaultBranch:
 *                       type: string
 *                       nullable: true
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
const { GitlabErrors, gitlabExits, mapGitlabError } = require('../../../utils/gitlab-errors');
const { buildBranchName } = require('../../../utils/git-branch-name');
const { readSnapshot, buildIssueFromSnapshot } = require('../../../utils/gitlab-snapshot');

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
};

// A sync is skipped when the link changed while GitLab was being read (e.g. a branch was
// created); it is then retried once with the current link
const MAX_ATTEMPTS = 2;

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
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const { card, project, gitlabIntegration, gitlabCardLink } =
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

    let currentGitlabCardLink = gitlabCardLink;
    let syncedGitlabCardLink = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !syncedGitlabCardLink; attempt += 1) {
      if (attempt > 0) {
        // eslint-disable-next-line no-await-in-loop
        currentGitlabCardLink = await GitlabCardLink.qm.getOneById(currentGitlabCardLink.id);

        if (!currentGitlabCardLink) {
          throw Errors.CARD_IS_NOT_LINKED_TO_GITLAB_ISSUE;
        }
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        syncedGitlabCardLink = await sails.helpers.gitlabCardLinks.syncOne.with({
          record: currentGitlabCardLink,
          request: this.req,
        });
      } catch (error) {
        // Never a 401: that would log the user out although the GitLab token is at fault
        throw mapGitlabError(error, {
          notFoundError: Errors.GITLAB_ISSUE_NOT_FOUND,
          projectId: project.id,
          integrationId: currentGitlabCardLink.gitlabIntegrationId,
        });
      }
    }

    if (!syncedGitlabCardLink) {
      // Unlinked concurrently, or kept changing while GitLab was being read
      throw Errors.CARD_IS_NOT_LINKED_TO_GITLAB_ISSUE;
    }

    const currentIntegrationId = gitlabIntegration ? gitlabIntegration.id : null;
    const snapshot = readSnapshot(syncedGitlabCardLink.snapshot);

    return {
      item: sails.helpers.gitlabCardLinks.presentOne(syncedGitlabCardLink),
      included: {
        gitlabIntegration: gitlabIntegration
          ? _.pick(gitlabIntegration, ['id', 'gitlabProjectPath'])
          : null,
        // The snapshot was just fetched, so it holds the live data
        gitlabIssue: buildIssueFromSnapshot(syncedGitlabCardLink),
        gitlabMergeRequest: snapshot.mergeRequest,
        gitlabPipeline: snapshot.pipeline,
        commitsCount: snapshot.commitsCount,
        hasMoreCommits: snapshot.hasMoreCommits,
        isStale: false,
        isProjectMismatch: syncedGitlabCardLink.gitlabIntegrationId !== currentIntegrationId,
        suggestedBranchName: syncedGitlabCardLink.branchName
          ? null
          : buildBranchName(
              syncedGitlabCardLink.issueIid,
              await sails.helpers.gitlabCardLinks.getBranchNameSource(card),
            ),
        defaultBranch: gitlabIntegration ? gitlabIntegration.defaultBranch : null,
      },
    };
  },
};
