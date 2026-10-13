/**
 * @swagger
 * /gitlab-integrations/{id}/test-connection:
 *   post:
 *     summary: Test GitLab connection
 *     description: Checks that the GitLab project and the default branch of an integration are reachable with the configured token. Requires project manager or admin privileges.
 *     tags:
 *       - GitLab Integrations
 *     operationId: testGitlabIntegrationConnection
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the GitLab integration to test
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     responses:
 *       200:
 *         description: Connection to GitLab works
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *                 - included
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/GitlabIntegration'
 *                 included:
 *                   type: object
 *                   required:
 *                     - gitlabProject
 *                   properties:
 *                     gitlabProject:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 7
 *                         name:
 *                           type: string
 *                           example: Project
 *                         pathWithNamespace:
 *                           type: string
 *                           example: group/project
 *                         defaultBranch:
 *                           type: string
 *                           example: main
 *                         webUrl:
 *                           type: string
 *                           example: https://gitlab.example.com/group/project
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
    gitlabIntegrationNotFound: {
      responseType: 'notFound',
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

    let gitlabProject;
    let notFoundError = Errors.GITLAB_PROJECT_NOT_FOUND;
    try {
      const client = await sails.helpers.gitlab.makeClient();

      gitlabProject = await client.getProject(gitlabIntegration.gitlabProjectId);

      notFoundError = Errors.GITLAB_BRANCH_NOT_FOUND;
      await client.getBranch(gitlabIntegration.gitlabProjectId, gitlabIntegration.defaultBranch);
    } catch (error) {
      throw mapGitlabError(error, {
        notFoundError,
        projectId: gitlabIntegration.projectId,
        integrationId: gitlabIntegration.id,
      });
    }

    gitlabIntegration = await GitlabIntegration.qm.updateOne(gitlabIntegration.id, {
      lastSyncedAt: new Date().toISOString(),
    });

    if (!gitlabIntegration) {
      throw Errors.GITLAB_INTEGRATION_NOT_FOUND;
    }

    return {
      item: sails.helpers.gitlabIntegrations.presentOne(gitlabIntegration),
      included: {
        gitlabProject: _.pick(gitlabProject, [
          'id',
          'name',
          'pathWithNamespace',
          'defaultBranch',
          'webUrl',
        ]),
      },
    };
  },
};
