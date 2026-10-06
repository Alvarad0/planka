// Presents a canonical relationship from the perspective of one of its cards:
// - (card, other, 'depends_on') -> 'dependsOn';
// - (other, card, 'depends_on') -> 'blocks';
// - 'related' -> 'related' from both sides.
// relatedCard is the summary of the other card, or null when the user cannot read it.

module.exports = {
  sync: true,

  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
    cardId: {
      type: 'string',
      required: true,
    },
    summariesById: {
      type: 'ref',
      required: true,
    },
  },

  fn(inputs) {
    const { record, cardId } = inputs;

    const isSource = record.cardId === cardId;
    const relatedCardId = isSource ? record.relatedCardId : record.cardId;

    let type;
    if (record.type === CardRelationship.Types.RELATED) {
      type = CardRelationship.ViewTypes.RELATED;
    } else {
      type = isSource ? CardRelationship.ViewTypes.DEPENDS_ON : CardRelationship.ViewTypes.BLOCKS;
    }

    return {
      type,
      relatedCardId,
      id: record.id,
      relatedCard: inputs.summariesById[relatedCardId] || null,
    };
  },
};
