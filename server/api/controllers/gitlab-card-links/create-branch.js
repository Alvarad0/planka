/**
 * @swagger
 * /cards/{id}/gitlab-branch:
 *   post:
 *     summary: Create GitLab branch for a card
 *     description: Creates a branch in the GitLab project of the card's linked issue and stores it on the link. The name defaults to `<issue IID>-<slug of the card name>` and the base branch to the default branch of the project's GitLab integration. If the branch already exists in GitLab, it is linked as is (`isExistingBranch`). Requires board editor permissions.
 *     tags:
 *       - GitLab Card Links
 *     operationId: createCardGitlabBranch
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
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 255
 *                 description: Name of the branch (must be a valid Git branch name)
 *                 example: 12-implement-login
 *               ref:
 *                 type: string
 *                 maxLength: 255
 *                 description: Branch to create the new branch from
 *                 example: develop
 *     responses:
 *       200:
 *         description: GitLab branch created (or existing one linked) successfully
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
 *                     - gitlabBranch
 *                     - isExistingBranch
 *                   properties:
 *                     gitlabBranch:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           example: 12-implement-login
 *                         webUrl:
 *                           type: string
 *                           example: https://gitlab.example.com/group/project/-/tree/12-implement-login
 *                     isExistingBranch:
 *                       type: boolean
 *                       description: Whether the branch already existed in GitLab and was linked instead of created
 *                       example: false
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       422:
 *         $ref: '#/components/responses/UnprocessableEntity'
 */

const { idInput } = require('../../../utils/inputs');
const { ErrorCodes } = require('../../../utils/gitlab-client');
const { GitlabErrors, gitlabExits, mapGitlabError } = require('../../../utils/gitlab-errors');
const { buildBranchName, validateBranchName } = require('../../../utils/git-branch-name');

const MAX_BRANCH_NAME_LENGTH = 255;

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
  CARD_ALREADY_HAS_BRANCH: {
    cardAlreadyHasBranch: 'Card already has a GitLab branch',
  },
  BRANCH_ALREADY_LINKED_TO_ANOTHER_CARD: {
    branchAlreadyLinkedToAnotherCard: 'GitLab branch is already linked to another card',
  },
  INVALID_BRANCH_NAME: {
    invalidBranchName: 'Invalid branch name',
  },
  INVALID_BASE_BRANCH_NAME: {
    invalidBaseBranchName: 'Invalid base branch name',
  },
};

module.exports = {
  inputs: {
    id: {
      ...idInput,
      required: true,
    },
    name: {
      type: 'string',
      maxLength: MAX_BRANCH_NAME_LENGTH,
    },
    ref: {
      type: 'string',
      maxLength: MAX_BRANCH_NAME_LENGTH,
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
    cardAlreadyHasBranch: {
      responseType: 'conflict',
    },
    branchAlreadyLinkedToAnotherCard: {
      responseType: 'conflict',
    },
    invalidBranchName: {
      responseType: 'unprocessableEntity',
    },
    invalidBaseBranchName: {
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

    // The branch would be created in the current project's GitLab project, not the issue's one
    if (!gitlabIntegration || gitlabCardLink.gitlabIntegrationId !== gitlabIntegration.id) {
      throw Errors.CARD_WAS_MOVED_TO_ANOTHER_PROJECT;
    }

    if (gitlabCardLink.branchName) {
      throw Errors.CARD_ALREADY_HAS_BRANCH;
    }

    const name = inputs.name || buildBranchName(gitlabCardLink.issueIid, card.name);

    if (!validateBranchName(name)) {
      throw Errors.INVALID_BRANCH_NAME;
    }

    const ref = inputs.ref || gitlabIntegration.defaultBranch;

    if (!validateBranchName(ref)) {
      throw Errors.INVALID_BASE_BRANCH_NAME;
    }

    // Checked before calling GitLab, so no branch is created that could not be linked
    const branchGitlabCardLink = await GitlabCardLink.qm.getOneByIntegrationIdAndBranchName(
      gitlabIntegration.id,
      name,
    );

    if (branchGitlabCardLink) {
      throw Errors.BRANCH_ALREADY_LINKED_TO_ANOTHER_CARD;
    }

    const mapError = (error, notFoundError) =>
      mapGitlabError(error, {
        notFoundError,
        projectId: project.id,
        integrationId: gitlabIntegration.id,
      });

    let client;
    try {
      client = sails.helpers.gitlab.makeClient();
    } catch (error) {
      throw mapError(error, Errors.GITLAB_PROJECT_NOT_FOUND);
    }

    let gitlabBranch;
    let isExistingBranch = false;
    try {
      gitlabBranch = await client.createBranch(gitlabIntegration.gitlabProjectId, {
        name,
        ref,
      });
    } catch (error) {
      if (error.code !== ErrorCodes.ALREADY_EXISTS) {
        throw mapError(error, Errors.GITLAB_PROJECT_NOT_FOUND);
      }

      // Idempotent: a branch with this name (e.g. created by hand) is linked as is
      try {
        gitlabBranch = await client.getBranch(gitlabIntegration.gitlabProjectId, name);
      } catch (getError) {
        throw mapError(getError, Errors.GITLAB_BRANCH_NOT_FOUND);
      }

      isExistingBranch = true;
    }

    let nextGitlabCardLink;
    try {
      nextGitlabCardLink = await sails.helpers.gitlabCardLinks.updateOne.with({
        board,
        record: gitlabCardLink,
        values: {
          branchName: gitlabBranch.name,
          branchUrl: gitlabBranch.webUrl || null,
        },
        conditions: {
          branchName: null,
        },
        request: this.req,
      });
    } catch (error) {
      // Lost a race with another card linking the same branch
      if (error.code === 'E_UNIQUE') {
        throw Errors.BRANCH_ALREADY_LINKED_TO_ANOTHER_CARD;
      }

      throw error;
    }

    if (!nextGitlabCardLink) {
      // Lost a race: the link was removed or got a branch concurrently; the GitLab branch stays
      sails.log.warn(
        `GitLab branch was created but card ${card.id} changed concurrently ` +
          `(integration: ${gitlabIntegration.id})`,
      );

      const currentGitlabCardLink = await GitlabCardLink.qm.getOneByCardId(card.id);

      throw currentGitlabCardLink
        ? Errors.CARD_ALREADY_HAS_BRANCH
        : Errors.CARD_IS_NOT_LINKED_TO_GITLAB_ISSUE;
    }

    return {
      item: sails.helpers.gitlabCardLinks.presentOne(nextGitlabCardLink),
      included: {
        gitlabBranch,
        isExistingBranch,
      },
    };
  },
};
