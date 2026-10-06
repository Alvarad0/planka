/**
 * GitlabWebhookDelivery.js
 *
 * @description :: A received GitLab webhook delivery, for idempotency and audit (GitLab Bridge).
 *                 Internal only: never presented to clients.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

const EventTypes = {
  PUSH: 'push',
  MERGE_REQUEST: 'merge_request',
  PIPELINE: 'pipeline',
  ISSUE: 'issue',
};

const Statuses = {
  RECEIVED: 'received',
  PROCESSED: 'processed',
  IGNORED: 'ignored',
  FAILED: 'failed',
};

module.exports = {
  EventTypes,
  Statuses,

  attributes: {
    //  ╔═╗╦═╗╦╔╦╗╦╔╦╗╦╦  ╦╔═╗╔═╗
    //  ╠═╝╠╦╝║║║║║ ║ ║╚╗╔╝║╣ ╚═╗
    //  ╩  ╩╚═╩╩ ╩╩ ╩ ╩ ╚╝ ╚═╝╚═╝

    eventUuid: {
      type: 'string',
      required: true,
      columnName: 'event_uuid',
    },
    eventType: {
      type: 'string',
      isIn: Object.values(EventTypes),
      required: true,
      columnName: 'event_type',
    },
    status: {
      type: 'string',
      isIn: Object.values(Statuses),
      required: true,
    },
    // Never contains tokens or secrets
    error: {
      type: 'string',
      allowNull: true,
    },

    //  ╔═╗╔╦╗╔╗ ╔═╗╔╦╗╔═╗
    //  ║╣ ║║║╠╩╗║╣  ║║╚═╗
    //  ╚═╝╩ ╩╚═╝╚═╝═╩╝╚═╝

    //  ╔═╗╔═╗╔═╗╔═╗╔═╗╦╔═╗╔╦╗╦╔═╗╔╗╔╔═╗
    //  ╠═╣╚═╗╚═╗║ ║║  ║╠═╣ ║ ║║ ║║║║╚═╗
    //  ╩ ╩╚═╝╚═╝╚═╝╚═╝╩╩ ╩ ╩ ╩╚═╝╝╚╝╚═╝

    gitlabIntegrationId: {
      model: 'GitlabIntegration',
      required: true,
      columnName: 'gitlab_integration_id',
    },
  },

  tableName: 'gitlab_webhook_delivery',
};
