module.exports = {
  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
    board: {
      type: 'ref',
      required: true,
    },
    request: {
      type: 'ref',
    },
  },

  async fn(inputs) {
    const knowledgeTransfer = await CardKnowledgeTransfer.qm.deleteOne(inputs.record.id);

    if (knowledgeTransfer) {
      sails.sockets.broadcast(
        `board:${inputs.board.id}`,
        'knowledgeTransferDelete',
        {
          item: sails.helpers.knowledgeTransfers.presentOne(knowledgeTransfer),
        },
        inputs.request,
      );
    }

    return knowledgeTransfer;
  },
};
