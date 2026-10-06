// Whether a relationship in stored form (as pushed by socket events) involves the given card
export default (cardRelationship, cardId) =>
  !!cardId && (cardRelationship.cardId === cardId || cardRelationship.relatedCardId === cardId);
