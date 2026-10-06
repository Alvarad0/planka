import EntryActionTypes from '../constants/EntryActionTypes';

const fetchCardRelationshipsInCurrentCard = () => ({
  type: EntryActionTypes.CARD_RELATIONSHIPS_IN_CURRENT_CARD_FETCH,
  payload: {},
});

const createCardRelationshipInCurrentCard = (data) => ({
  type: EntryActionTypes.CARD_RELATIONSHIP_IN_CURRENT_CARD_CREATE,
  payload: {
    data,
  },
});

const deleteCardRelationship = (id) => ({
  type: EntryActionTypes.CARD_RELATIONSHIP_DELETE,
  payload: {
    id,
  },
});

const handleCardRelationshipCreate = (cardRelationship) => ({
  type: EntryActionTypes.CARD_RELATIONSHIP_CREATE_HANDLE,
  payload: {
    cardRelationship,
  },
});

const handleCardRelationshipDelete = (cardRelationship) => ({
  type: EntryActionTypes.CARD_RELATIONSHIP_DELETE_HANDLE,
  payload: {
    cardRelationship,
  },
});

export default {
  fetchCardRelationshipsInCurrentCard,
  createCardRelationshipInCurrentCard,
  deleteCardRelationship,
  handleCardRelationshipCreate,
  handleCardRelationshipDelete,
};
