import ActionTypes from '../constants/ActionTypes';

const fetchCardRelationships = (cardId) => ({
  type: ActionTypes.CARD_RELATIONSHIPS_FETCH,
  payload: {
    cardId,
  },
});

fetchCardRelationships.success = (cardId, cardRelationships, parentCards, blockingOpenCount) => ({
  type: ActionTypes.CARD_RELATIONSHIPS_FETCH__SUCCESS,
  payload: {
    cardId,
    cardRelationships,
    parentCards,
    blockingOpenCount,
  },
});

fetchCardRelationships.failure = (cardId, error) => ({
  type: ActionTypes.CARD_RELATIONSHIPS_FETCH__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const createCardRelationship = (cardId, data) => ({
  type: ActionTypes.CARD_RELATIONSHIP_CREATE,
  payload: {
    cardId,
    data,
  },
});

createCardRelationship.success = (cardId, cardRelationship) => ({
  type: ActionTypes.CARD_RELATIONSHIP_CREATE__SUCCESS,
  payload: {
    cardId,
    cardRelationship,
  },
});

createCardRelationship.failure = (cardId, error) => ({
  type: ActionTypes.CARD_RELATIONSHIP_CREATE__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const deleteCardRelationship = (cardId, id) => ({
  type: ActionTypes.CARD_RELATIONSHIP_DELETE,
  payload: {
    cardId,
    id,
  },
});

deleteCardRelationship.success = (cardId, id) => ({
  type: ActionTypes.CARD_RELATIONSHIP_DELETE__SUCCESS,
  payload: {
    cardId,
    id,
  },
});

deleteCardRelationship.failure = (cardId, id, error) => ({
  type: ActionTypes.CARD_RELATIONSHIP_DELETE__FAILURE,
  payload: {
    cardId,
    id,
    error,
  },
});

export default {
  fetchCardRelationships,
  createCardRelationship,
  deleteCardRelationship,
};
