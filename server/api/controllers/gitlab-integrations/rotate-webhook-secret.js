/**
 * @swagger
 * /gitlab-integrations/{id}/rotate-webhook-secret:
 *   post:
 *     summary: Rotate GitLab webhook secret
 *     description: Generates a new webhook secret for a GitLab integration. The previous secret stops working immediately, so the GitLab webhook must be updated. Requires project manager or admin privileges. The new secret is returned only in this response.
 *     tags:
 *       - GitLab Integrations
 *     operationId: rotateGitlabIntegrationWebhookSecret
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the GitLab integration whose webhook secret to rotate
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     responses:
 *       200:
 *         description: Webhook secret rotated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   allOf:
 *                     - $ref: '#/components/schemas/GitlabIntegration'
 *                     - type: object
 *                       properties:
 *                         webhookUrl:
 *                           type: string
 *                           description: URL to configure as the GitLab webhook
 *                           example: https://planka.example.com/api/gitlab/webhooks/1357158568008091264
 *                         webhookSecret:
 *                           type: string
 *                           description: New secret token to configure in the GitLab webhook (shown only once)
 *                           example: 4ZpQd1L0yYb7Hn2sXw9TcVe3RkMa6UjF8gNqBoCi
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

const { idInput } = require('../../../utils/inputs');

const WEBHOOK_SECRET_LENGTH = 40;

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

    const webhookSecret = sails.helpers.utils.generateRandomString(WEBHOOK_SECRET_LENGTH);

    gitlabIntegration = await GitlabIntegration.qm.updateOne(gitlabIntegration.id, {
      webhookSecretHash: sails.helpers.utils.hash(webhookSecret),
    });

    if (!gitlabIntegration) {
      throw Errors.GITLAB_INTEGRATION_NOT_FOUND;
    }

    return {
      item: {
        ...sails.helpers.gitlabIntegrations.presentOne(gitlabIntegration),
        webhookSecret,
      },
    };
  },
};
