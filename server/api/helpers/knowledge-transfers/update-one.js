// Marks a knowledge transfer as explained (by the actor, now) or not explained. The explainer and
// time are always set here, never taken from the client.

module.exports = {
  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
    isExplained: {
      type: 'boolean',
      required: true,
    },
    board: {
      type: 'ref',
      required: true,
    },
    actorUser: {
      type: 'ref',
      required: true,
    },
    request: {
      type: 'ref',
    },
  },

  async fn(inputs) {
    const { record, actorUser } = inputs;

    // Ticking an explained transfer again keeps who explained it first
    if (record.isExplained === inputs.isExplained) {
      return record;
    }

    const values = inputs.isExplained
      ? {
          isExplained: true,
          explainedByUserId: actorUser.id,
          explainedAt: new Date().toISOString(),
        }
      : {
          isExplained: false,
          explainedByUserId: null,
          explainedAt: null,
        };

    const knowledgeTransfer = await CardKnowledgeTransfer.qm.updateOne(record.id, values);

    if (knowledgeTransfer) {
      sails.sockets.broadcast(
        `board:${inputs.board.id}`,
        'knowledgeTransferUpdate',
        {
          item: sails.helpers.knowledgeTransfers.presentOne(knowledgeTransfer),
          included: {
            users: inputs.isExplained
              ? sails.helpers.knowledgeTransfers.presentUsers([actorUser], actorUser)
              : [],
          },
        },
        inputs.request,
      );
    }

    return knowledgeTransfer;
  },
};
