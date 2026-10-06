module.exports = {
  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
    // Boards of both cards, notified of the removal
    boardIds: {
      type: 'ref',
      required: true,
    },
    request: {
      type: 'ref',
    },
  },

  async fn(inputs) {
    const cardRelationship = await CardRelationship.qm.deleteOne(inputs.record.id);

    if (cardRelationship) {
      sails.helpers.cardRelationships.broadcast.with({
        event: 'cardRelationshipDelete',
        record: cardRelationship,
        boardIds: inputs.boardIds,
        request: inputs.request,
      });
    }

    return cardRelationship;
  },
};
