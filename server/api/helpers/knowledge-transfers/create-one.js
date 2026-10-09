module.exports = {
  inputs: {
    values: {
      type: 'ref',
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

  exits: {
    userAlreadyAssigned: {},
  },

  async fn(inputs) {
    const { values } = inputs;

    let knowledgeTransfer;
    try {
      knowledgeTransfer = await CardKnowledgeTransfer.qm.createOne({
        cardId: values.card.id,
        userId: values.user.id,
        isExplained: false,
        creatorUserId: inputs.actorUser.id,
      });
    } catch (error) {
      if (error.code === 'E_UNIQUE') {
        throw 'userAlreadyAssigned';
      }

      throw error;
    }

    // presentUsers keeps public fields only, whoever the users are presented to
    sails.sockets.broadcast(
      `board:${inputs.board.id}`,
      'knowledgeTransferCreate',
      {
        item: sails.helpers.knowledgeTransfers.presentOne(knowledgeTransfer),
        included: {
          users: sails.helpers.knowledgeTransfers.presentUsers([values.user], inputs.actorUser),
        },
      },
      inputs.request,
    );

    return knowledgeTransfer;
  },
};
