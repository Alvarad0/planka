/**
 * @swagger
 * /projects/{projectId}/gitlab-integration:
 *   get:
 *     summary: Get GitLab integration
 *     description: Retrieves the GitLab integration of a project. Requires project manager or admin privileges. The webhook secret is never returned.
 *     tags:
 *       - GitLab Integrations
 *     operationId: getGitlabIntegration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         description: ID of the project whose GitLab integration to retrieve
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     responses:
 *       200:
 *         description: GitLab integration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *                 - included
 *               properties:
 *                 item:
 *                   allOf:
 *                     - $ref: '#/components/schemas/GitlabIntegration'
 *                     - type: object
 *                       properties:
 *                         webhookUrl:
 *                           type: string
 *                           description: URL to configure as the GitLab webhook
 *                           example: https://planka.example.com/api/gitlab/webhooks/1357158568008091266
 *                 included:
 *                   type: object
 *                   required:
 *                     - gitlabListOptions
 *                   properties:
 *                     gitlabListOptions:
 *                       type: array
 *                       description: Active and closed lists of the project, ordered by board and list position
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "1357158568008091265"
 *                           name:
 *                             type: string
 *                             example: Code Review
 *                           type:
 *                             type: string
 *                             enum: [active, closed]
 *                             example: active
 *                           boardId:
 *                             type: string
 *                             example: "1357158568008091264"
 *                           boardName:
 *                             type: string
 *                             example: Development
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
  PROJECT_NOT_FOUND: {
    projectNotFound: 'Project not found',
  },
  GITLAB_INTEGRATION_NOT_FOUND: {
    gitlabIntegrationNotFound: 'GitLab integration not found',
  },
};

module.exports = {
  inputs: {
    projectId: {
      ...idInput,
      required: true,
    },
  },

  exits: {
    projectNotFound: {
      responseType: 'notFound',
    },
    gitlabIntegrationNotFound: {
      responseType: 'notFound',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const project = await Project.qm.getOneById(inputs.projectId);

    if (!project) {
      throw Errors.PROJECT_NOT_FOUND;
    }

    if (currentUser.role !== User.Roles.ADMIN) {
      const isProjectManager = await sails.helpers.users.isProjectManager(
        currentUser.id,
        project.id,
      );

      if (!isProjectManager) {
        throw Errors.PROJECT_NOT_FOUND; // Forbidden
      }
    }

    const gitlabIntegration = await GitlabIntegration.qm.getOneByProjectId(project.id);

    if (!gitlabIntegration) {
      throw Errors.GITLAB_INTEGRATION_NOT_FOUND;
    }

    const gitlabListOptions = await sails.helpers.gitlabIntegrations.getListOptions(project.id);

    return {
      item: sails.helpers.gitlabIntegrations.presentOne(gitlabIntegration),
      included: {
        gitlabListOptions,
      },
    };
  },
};
