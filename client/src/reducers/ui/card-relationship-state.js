import { LOCATION_CHANGE_HANDLE } from '../../lib/redux-router';

import ActionTypes from '../../constants/ActionTypes';
import ErrorCodes from '../../constants/ErrorCodes';

// Relationships of the currently open card. They are kept here rather than in a redux-orm model:
// they are only shown while the card modal is open, are always read as a whole from the server
// (names and access are resolved per user, and socket events carry no names) and are never
// joined with other records.
const initialState = {
  cardId: null,
  // Seen from the open card: { id, type, relatedCardId, relatedCard (null when unreadable) }
  items: [],
  // Cards having a task linked to the open card; unreadable ones only have an id
  parentCards: [],
  blockingOpenCount: 0,
  isFetching: false,
  isFetched: false,
  fetchError: null,
  isCreating: false,
  createError: null,
  deletingIds: [],
  deleteError: null,
};

const removeItem = (state, id) => ({
  ...state,
  items: state.items.filter((item) => item.id !== id),
  deletingIds: state.deletingIds.filter((deletingId) => deletingId !== id),
});

// eslint-disable-next-line default-param-last
export default (state = initialState, { type, payload }) => {
  switch (type) {
    case LOCATION_CHANGE_HANDLE:
      return initialState;
    case ActionTypes.CARD_RELATIONSHIPS_FETCH:
      // A refetch of the same card keeps the shown data until it completes
      return {
        ...(payload.cardId === state.cardId ? state : initialState),
        cardId: payload.cardId,
        isFetching: true,
        fetchError: null,
      };
    case ActionTypes.CARD_RELATIONSHIPS_FETCH__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        items: payload.cardRelationships,
        parentCards: payload.parentCards,
        blockingOpenCount: payload.blockingOpenCount,
        isFetching: false,
        isFetched: true,
      };
    case ActionTypes.CARD_RELATIONSHIPS_FETCH__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      // Not found means that the card is no longer accessible: nothing to show, no error
      if (payload.error.code === ErrorCodes.NOT_FOUND) {
        return {
          ...initialState,
          cardId: state.cardId,
          isFetched: true,
        };
      }

      return {
        ...state,
        isFetching: false,
        isFetched: true,
        fetchError: payload.error,
      };
    case ActionTypes.CARD_RELATIONSHIP_CREATE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreating: true,
        createError: null,
        deleteError: null,
      };
    case ActionTypes.CARD_RELATIONSHIP_CREATE__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      // Shown right away, the refetch that follows brings the derived data up to date
      return {
        ...state,
        items: state.items.some((item) => item.id === payload.cardRelationship.id)
          ? state.items
          : [...state.items, payload.cardRelationship],
        isCreating: false,
      };
    case ActionTypes.CARD_RELATIONSHIP_CREATE__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreating: false,
        createError: payload.error,
      };
    case ActionTypes.CARD_RELATIONSHIP_DELETE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        deletingIds: [...state.deletingIds, payload.id],
        createError: null,
        deleteError: null,
      };
    case ActionTypes.CARD_RELATIONSHIP_DELETE__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return removeItem(state, payload.id);
    case ActionTypes.CARD_RELATIONSHIP_DELETE__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      // Not found means that the relationship is already gone, which is what was asked for
      if (payload.error.code === ErrorCodes.NOT_FOUND) {
        return removeItem(state, payload.id);
      }

      return {
        ...state,
        deletingIds: state.deletingIds.filter((deletingId) => deletingId !== payload.id),
        deleteError: payload.error,
      };
    default:
      return state;
  }
};
