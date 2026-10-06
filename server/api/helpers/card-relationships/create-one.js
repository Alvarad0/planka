// Creates a relationship in canonical form, from the type requested on one card:
// - dependsOn: (card, related card, 'depends_on');
// - blocks: (related card, card, 'depends_on'), i.e. the related card depends on the card;
// - related: ('related') with the lower id first, so a pair has a single row.

module.exports = {
  inputs: {
    values: {
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
    cardRelationshipAlreadyExists: {},
    wouldCreateDependencyCycle: {},
    cardNotFound: {},
  },

  async fn(inputs) {
    const { card, relatedCard, viewType } = inputs.values;

    let values;
    switch (viewType) {
      case CardRelationship.ViewTypes.DEPENDS_ON:
        values = {
          cardId: card.id,
          relatedCardId: relatedCard.id,
          type: CardRelationship.Types.DEPENDS_ON,
        };

        break;
      case CardRelationship.ViewTypes.BLOCKS:
        values = {
          cardId: relatedCard.id,
          relatedCardId: card.id,
          type: CardRelationship.Types.DEPENDS_ON,
        };

        break;
      case CardRelationship.ViewTypes.RELATED: {
        // Ids are bigint strings, so they are compared as numbers
        const [lowerId, higherId] = [card.id, relatedCard.id].sort((a, b) =>
          BigInt(a) < BigInt(b) ? -1 : 1,
        );

        values = {
          cardId: lowerId,
          relatedCardId: higherId,
          type: CardRelationship.Types.RELATED,
        };

        break;
      }
      default:
        throw new Error(`Unknown card relationship type: ${viewType}`);
    }

    const { cardRelationship, isDuplicate, wouldCreateCycle, isCardMissing } =
      await CardRelationship.qm.createOne({
        ...values,
        creatorUserId: inputs.actorUser.id,
      });

    if (isDuplicate) {
      throw 'cardRelationshipAlreadyExists';
    }

    if (wouldCreateCycle) {
      throw 'wouldCreateDependencyCycle';
    }

    if (isCardMissing) {
      throw 'cardNotFound';
    }

    sails.helpers.cardRelationships.broadcast.with({
      event: 'cardRelationshipCreate',
      record: cardRelationship,
      boardIds: [card.boardId, relatedCard.boardId],
      request: inputs.request,
    });

    return cardRelationship;
  },
};
