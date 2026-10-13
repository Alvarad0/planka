/**
 * @swagger
 * /gitlab-integrations/{id}:
 *   patch:
 *     summary: Update GitLab integration
 *     description: Updates a GitLab integration. Requires project manager or admin privileges. Target lists must belong to a board of the same project.
 *     tags:
 *       - GitLab Integrations
 *     operationId: updateGitlabIntegration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the GitLab integration to update
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defaultBranch:
 *                 type: string
 *                 maxLength: 255
 *                 description: Branch new branches are created from (must exist in GitLab)
 *                 example: develop
 *               reviewListId:
 *                 type: string
 *                 nullable: true
 *                 description: ID of the active list cards are moved to when a merge request is opened
 *                 example: "1357158568008091265"
 *               completedListId:
 *                 type: string
 *                 nullable: true
 *                 description: ID of the closed list cards are moved to when a merge request is merged
 *                 example: "1357158568008091266"
 *               autoMoveOnMrOpen:
 *                 type: boolean
 *                 description: Whether to move cards to the review list when a merge request is opened
 *                 example: true
 *               autoMoveOnMrMerge:
 *                 type: boolean
 *                 description: Whether to move cards to the completed list when a merge request is merged
 *                 example: true
 *     responses:
 *       200:
 *         description: GitLab integration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/GitlabIntegration'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/UnprocessableEntity'
 */

const { idInput } = require('../../../utils/inputs');
const { GitlabErrors, gitlabExits, mapGitlabError } = require('../../../utils/gitlab-errors');

const Errors = {
  ...GitlabErrors,
  GITLAB_INTEGRATION_NOT_FOUND: {
    gitlabIntegrationNotFound: 'GitLab integration not found',
  },
  LIST_MUST_BELONG_TO_PROJECT: {
    listMustBelongToProject: 'List must belong to project',
  },
  REVIEW_LIST_MUST_BE_ACTIVE: {
    reviewListMustBeActive: 'Review list must be active',
  },
  COMPLETED_LIST_MUST_BE_CLOSED: {
    completedListMustBeClosed: 'Completed list must be closed',
  },
};

// Returns the list only if it belongs to a board of the given project
const getProjectList = async (listId, projectId) => {
  const list = await List.qm.getOneById(listId);

  if (!list) {
    return null;
  }

  const board = await Board.qm.getOneById(list.boardId);

  if (!board || board.projectId !== projectId) {
    return null;
  }

  return list;
};

module.exports = {
  inputs: {
    id: {
      ...idInput,
      required: true,
    },
    defaultBranch: {
      type: 'string',
      isNotEmptyString: true,
      maxLength: 255,
    },
    reviewListId: {
      ...idInput,
      allowNull: true,
    },
    completedListId: {
      ...idInput,
      allowNull: true,
    },
    autoMoveOnMrOpen: {
      type: 'boolean',
    },
    autoMoveOnMrMerge: {
      type: 'boolean',
    },
  },

  exits: {
    ...gitlabExits,
    gitlabIntegrationNotFound: {
      responseType: 'notFound',
    },
    listMustBelongToProject: {
      responseType: 'unprocessableEntity',
    },
    reviewListMustBeActive: {
      responseType: 'unprocessableEntity',
    },
    completedListMustBeClosed: {
      responseType: 'unprocessableEntity',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    let { gitlabIntegration } = await sails.helpers.gitlabIntegrations
      .getPathToProjectById(inputs.id)
      .intercept('pathNotFound', () => Errors.GITLAB_INTEGRATION_NOT_FOUND);

    if (currentUser.role !== User.Roles.ADMIN) {
      const isProjectManager = await sails.helpers.users.isProjectManager(
        currentUser.id,
        gitlabIntegration.projectId,
      );

      if (!isProjectManager) {
        throw Errors.GITLAB_INTEGRATION_NOT_FOUND; // Forbidden
      }
    }

    if (inputs.reviewListId) {
      const reviewList = await getProjectList(inputs.reviewListId, gitlabIntegration.projectId);

      if (!reviewList) {
        throw Errors.LIST_MUST_BELONG_TO_PROJECT;
      }

      if (reviewList.type !== List.Types.ACTIVE) {
        throw Errors.REVIEW_LIST_MUST_BE_ACTIVE;
      }
    }

    if (inputs.completedListId) {
      const completedList = await getProjectList(
        inputs.completedListId,
        gitlabIntegration.projectId,
      );

      if (!completedList) {
        throw Errors.LIST_MUST_BELONG_TO_PROJECT;
      }

      if (completedList.type !== List.Types.CLOSED) {
        throw Errors.COMPLETED_LIST_MUST_BE_CLOSED;
      }
    }

    if (inputs.defaultBranch && inputs.defaultBranch !== gitlabIntegration.defaultBranch) {
      try {
        const client = await sails.helpers.gitlab.makeClient();

        await client.getBranch(gitlabIntegration.gitlabProjectId, inputs.defaultBranch);
      } catch (error) {
        throw mapGitlabError(error, {
          notFoundError: Errors.GITLAB_BRANCH_NOT_FOUND,
          projectId: gitlabIntegration.projectId,
          integrationId: gitlabIntegration.id,
        });
      }
    }

    const values = _.pick(inputs, [
      'defaultBranch',
      'reviewListId',
      'completedListId',
      'autoMoveOnMrOpen',
      'autoMoveOnMrMerge',
    ]);

    if (!_.isEmpty(values)) {
      gitlabIntegration = await GitlabIntegration.qm.updateOne(gitlabIntegration.id, values);

      if (!gitlabIntegration) {
        throw Errors.GITLAB_INTEGRATION_NOT_FOUND;
      }
    }

    return {
      item: sails.helpers.gitlabIntegrations.presentOne(gitlabIntegration),
    };
  },
};
