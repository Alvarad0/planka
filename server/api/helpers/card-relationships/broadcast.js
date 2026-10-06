// Notifies the boards of both cards that a relationship changed. The payload is minimal on
// purpose (no card names): members of one board may be unable to read the other card, so clients
// refetch the relationships of the open card instead.

module.exports = {
  sync: true,

  inputs: {
    event: {
      type: 'string',
      required: true,
    },
    record: {
      type: 'ref',
      required: true,
    },
    boardIds: {
      type: 'ref',
      required: true,
    },
    request: {
      type: 'ref',
    },
  },

  fn(inputs) {
    const data = {
      item: _.pick(inputs.record, ['id', 'cardId', 'relatedCardId', 'type']),
    };

    _.uniq(_.compact(inputs.boardIds)).forEach((boardId) => {
      sails.sockets.broadcast(`board:${boardId}`, inputs.event, data, inputs.request);
    });
  },
};
