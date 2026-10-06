/**
 * @swagger
 * /gitlab/webhooks/{integrationId}:
 *   post:
 *     summary: Receive GitLab webhook
 *     description: Public endpoint called by GitLab (no Planka authentication), verified with the integration's webhook secret sent by GitLab in `X-Gitlab-Token`. Handles push, merge request, pipeline and issue events; other events are acknowledged and ignored. Deliveries are deduplicated by `Idempotency-Key` (falling back to `X-Gitlab-Event-UUID`). The response is sent before processing; processing re-synchronizes the affected cards from GitLab (the payload only identifies them) and broadcasts the updated links.
 *     tags:
 *       - GitLab Webhooks
 *     operationId: receiveGitlabWebhook
 *     security: []
 *     parameters:
 *       - name: integrationId
 *         in: path
 *         required: true
 *         description: ID of the GitLab integration
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *       - name: X-Gitlab-Token
 *         in: header
 *         required: true
 *         description: Webhook secret of the integration
 *         schema:
 *           type: string
 *       - name: X-Gitlab-Event
 *         in: header
 *         required: true
 *         description: GitLab event type
 *         schema:
 *           type: string
 *           example: Push Hook
 *       - name: Idempotency-Key
 *         in: header
 *         required: false
 *         description: Unique ID of the delivery, stable across retries (GitLab 17.4+)
 *         schema:
 *           type: string
 *           example: f5e5f430-f57b-4e6e-9fac-d9128cd7232f
 *       - name: X-Gitlab-Event-UUID
 *         in: header
 *         required: false
 *         description: Unique ID of the event, used when `Idempotency-Key` is missing
 *         schema:
 *           type: string
 *           example: 13792a34-cac6-4fda-95a8-c58e00a3954e
 *     requestBody:
 *       required: true
 *       description: GitLab webhook payload
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Delivery accepted for processing, or already received (`duplicate`)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [accepted, duplicate]
 *                   example: accepted
 *       202:
 *         description: Event type not handled; nothing was stored
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ignored]
 *                   example: ignored
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

const crypto = require('crypto');

const { isId } = require('../../../utils/validators');
const { getEventType } = require('../../../utils/gitlab-webhook-events');

const MAX_EVENT_UUID_LENGTH = 255;

// Compared against when the integration does not exist, so unknown integrations take as long as
// known ones and cannot be told apart
const UNKNOWN_INTEGRATION_HASH = '0'.repeat(64);

const MISSING_TOKEN_PLACEHOLDER = '-';

const Errors = {
  // Same response for unknown integrations and wrong tokens, so integrations cannot be enumerated
  INVALID_WEBHOOK_TOKEN: {
    invalidWebhookToken: 'Invalid webhook token',
  },
  EVENT_IGNORED: {
    eventIgnored: {
      status: 'ignored',
    },
  },
  EVENT_UUID_MISSING: {
    eventUuidMissing: {
      code: 'E_MISSING_OR_INVALID_PARAMS',
      message: 'Idempotency-Key or X-Gitlab-Event-UUID header is required',
    },
  },
};

// Hashed with the helper that stored webhookSecretHash (SHA-256, hex) and compared in constant
// time. An empty token is still hashed (the helper rejects empty input, hence the placeholder) so
// a missing header takes as long as a wrong one; it never matches.
const isTokenValid = (token, webhookSecretHash) => {
  const tokenHash = Buffer.from(sails.helpers.utils.hash(token || MISSING_TOKEN_PLACEHOLDER));
  const expectedHash = Buffer.from(webhookSecretHash);

  return (
    tokenHash.length === expectedHash.length &&
    crypto.timingSafeEqual(tokenHash, expectedHash) &&
    !!token
  );
};

const getHeader = (req, name) => {
  const value = req.headers[name];

  return typeof value === 'string' ? value : null;
};

module.exports = {
  inputs: {
    // Not validated as an ID input: a malformed ID must get the same 401 as an unknown one
    integrationId: {
      type: 'string',
      required: true,
    },
  },

  exits: {
    invalidWebhookToken: {
      responseType: 'unauthorized',
    },
    eventIgnored: {
      statusCode: 202,
    },
    eventUuidMissing: {
      statusCode: 400,
    },
  },

  async fn(inputs) {
    const { req } = this;

    const gitlabIntegration = isId(inputs.integrationId)
      ? await GitlabIntegration.qm.getOneById(inputs.integrationId)
      : null;

    const token = getHeader(req, 'x-gitlab-token') || '';

    const isAuthorized = isTokenValid(
      token,
      gitlabIntegration ? gitlabIntegration.webhookSecretHash : UNKNOWN_INTEGRATION_HASH,
    );

    if (!gitlabIntegration || !isAuthorized) {
      throw Errors.INVALID_WEBHOOK_TOKEN;
    }

    const eventType = getEventType(getHeader(req, 'x-gitlab-event'));

    // Not stored: events the Bridge does not handle (e.g. tag pushes) have nothing to audit
    if (!eventType) {
      throw Errors.EVENT_IGNORED;
    }

    // Idempotency-Key is stable across retries of a delivery (GitLab 17.4+); X-Gitlab-Event-UUID
    // is the fallback for older GitLab versions
    const eventUuid = (
      getHeader(req, 'idempotency-key') ||
      getHeader(req, 'x-gitlab-event-uuid') ||
      ''
    ).trim();

    if (!eventUuid || eventUuid.length > MAX_EVENT_UUID_LENGTH) {
      throw Errors.EVENT_UUID_MISSING;
    }

    let delivery;
    try {
      delivery = await GitlabWebhookDelivery.qm.createOne({
        eventUuid,
        eventType,
        gitlabIntegrationId: gitlabIntegration.id,
        status: GitlabWebhookDelivery.Statuses.RECEIVED,
      });
    } catch (error) {
      if (error.code === 'E_UNIQUE') {
        return {
          status: 'duplicate',
        };
      }

      throw error;
    }

    const payload = req.body;

    // Answer first: GitLab disables webhooks that time out, and processing calls GitLab back
    setImmediate(() => {
      sails.helpers.gitlabWebhooks.processDelivery
        .with({
          delivery,
          payload,
        })
        .catch((error) => {
          sails.log.error(`GitLab webhook delivery ${delivery.id} crashed: ${error.stack}`);
        });
    });

    return {
      status: 'accepted',
    };
  },
};
