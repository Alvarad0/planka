import { LOCATION_CHANGE_HANDLE } from '../../lib/redux-router';

import ActionTypes from '../../constants/ActionTypes';

// Transient state of the knowledge transfer section of the currently open card. The items live in
// the KnowledgeTransfer model; this keeps what is only meaningful while the card modal is open.
const initialState = {
  cardId: null,
  isFetching: false,
  isFetched: false,
  fetchError: null,
  // Ids of the users that can be assigned (every active user), fetched when the picker opens
  candidateUserIds: null,
  isFetchingCandidates: false,
  candidatesError: null,
  isCreating: false,
  createError: null,
  updatingIds: [],
  updateError: null,
  deletingIds: [],
  deleteError: null,
};

const without = (ids, id) => ids.filter((currentId) => currentId !== id);

// eslint-disable-next-line default-param-last
export default (state = initialState, { type, payload }) => {
  switch (type) {
    case LOCATION_CHANGE_HANDLE:
      return initialState;
    case ActionTypes.KNOWLEDGE_TRANSFERS_FETCH:
      return {
        ...(payload.cardId === state.cardId ? state : initialState),
        cardId: payload.cardId,
        isFetching: true,
        fetchError: null,
      };
    case ActionTypes.KNOWLEDGE_TRANSFERS_FETCH__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isFetching: false,
        isFetched: true,
        fetchError: null,
      };
    case ActionTypes.KNOWLEDGE_TRANSFERS_FETCH__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isFetching: false,
        isFetched: true,
        fetchError: payload.error,
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isFetchingCandidates: true,
        candidatesError: null,
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        candidateUserIds: payload.users.map(({ id }) => id),
        isFetchingCandidates: false,
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isFetchingCandidates: false,
        candidatesError: payload.error,
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_CREATE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreating: true,
        createError: null,
        updateError: null,
        deleteError: null,
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_CREATE__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreating: false,
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_CREATE__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreating: false,
        createError: payload.error,
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_UPDATE:
      return {
        ...state,
        updatingIds: [...without(state.updatingIds, payload.id), payload.id],
        createError: null,
        updateError: null,
        deleteError: null,
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_UPDATE__SUCCESS:
      return {
        ...state,
        updatingIds: without(state.updatingIds, payload.knowledgeTransfer.id),
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_UPDATE__FAILURE:
      return {
        ...state,
        updatingIds: without(state.updatingIds, payload.id),
        updateError: payload.error,
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_DELETE:
      return {
        ...state,
        deletingIds: [...without(state.deletingIds, payload.id), payload.id],
        createError: null,
        updateError: null,
        deleteError: null,
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_DELETE__SUCCESS:
      return {
        ...state,
        deletingIds: without(state.deletingIds, payload.knowledgeTransfer.id),
      };
    case ActionTypes.KNOWLEDGE_TRANSFER_DELETE__FAILURE:
      return {
        ...state,
        deletingIds: without(state.deletingIds, payload.id),
        deleteError: payload.error,
      };
    default:
      return state;
  }
};
