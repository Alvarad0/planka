/**
 * @swagger
 * /gitlab-integrations/{id}:
 *   delete:
 *     summary: Delete GitLab integration
 *     description: Deletes a GitLab integration. Requires project manager or admin privileges. The webhook configured in GitLab stops being accepted.
 *     tags:
 *       - GitLab Integrations
 *     operationId: deleteGitlabIntegration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the GitLab integration to delete
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     responses:
 *       200:
 *         description: GitLab integration deleted successfully
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
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
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
    gitlabIntegrationNotFound: {
      responseType: 'notFound',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const { gitlabIntegration } = await sails.helpers.gitlabIntegrations
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

    const deletedGitlabIntegration = await GitlabIntegration.qm.deleteOne(gitlabIntegration.id);

    if (!deletedGitlabIntegration) {
      throw Errors.GITLAB_INTEGRATION_NOT_FOUND;
    }

    return {
      item: sails.helpers.gitlabIntegrations.presentOne(deletedGitlabIntegration),
    };
  },
};
