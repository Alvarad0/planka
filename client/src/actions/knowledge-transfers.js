import ActionTypes from '../constants/ActionTypes';

const fetchKnowledgeTransfers = (cardId) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFERS_FETCH,
  payload: {
    cardId,
  },
});

fetchKnowledgeTransfers.success = (cardId, knowledgeTransfers, users) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFERS_FETCH__SUCCESS,
  payload: {
    cardId,
    knowledgeTransfers,
    users,
  },
});

fetchKnowledgeTransfers.failure = (cardId, error) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFERS_FETCH__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const fetchKnowledgeTransferCandidates = (cardId) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH,
  payload: {
    cardId,
  },
});

fetchKnowledgeTransferCandidates.success = (cardId, users) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH__SUCCESS,
  payload: {
    cardId,
    users,
  },
});

fetchKnowledgeTransferCandidates.failure = (cardId, error) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const createKnowledgeTransfer = (cardId, data) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE,
  payload: {
    cardId,
    data,
  },
});

createKnowledgeTransfer.success = (cardId, knowledgeTransfer, users) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE__SUCCESS,
  payload: {
    cardId,
    knowledgeTransfer,
    users,
  },
});

createKnowledgeTransfer.failure = (cardId, error) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const handleKnowledgeTransferCreate = (knowledgeTransfer, users) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE_HANDLE,
  payload: {
    knowledgeTransfer,
    users,
  },
});

const updateKnowledgeTransfer = (id, data) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_UPDATE,
  payload: {
    id,
    data,
  },
});

updateKnowledgeTransfer.success = (knowledgeTransfer, users) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_UPDATE__SUCCESS,
  payload: {
    knowledgeTransfer,
    users,
  },
});

updateKnowledgeTransfer.failure = (id, error) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_UPDATE__FAILURE,
  payload: {
    id,
    error,
  },
});

const handleKnowledgeTransferUpdate = (knowledgeTransfer, users) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_UPDATE_HANDLE,
  payload: {
    knowledgeTransfer,
    users,
  },
});

const deleteKnowledgeTransfer = (id) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_DELETE,
  payload: {
    id,
  },
});

deleteKnowledgeTransfer.success = (knowledgeTransfer) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_DELETE__SUCCESS,
  payload: {
    knowledgeTransfer,
  },
});

deleteKnowledgeTransfer.failure = (id, error) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_DELETE__FAILURE,
  payload: {
    id,
    error,
  },
});

const handleKnowledgeTransferDelete = (knowledgeTransfer) => ({
  type: ActionTypes.KNOWLEDGE_TRANSFER_DELETE_HANDLE,
  payload: {
    knowledgeTransfer,
  },
});

export default {
  fetchKnowledgeTransfers,
  fetchKnowledgeTransferCandidates,
  createKnowledgeTransfer,
  handleKnowledgeTransferCreate,
  updateKnowledgeTransfer,
  handleKnowledgeTransferUpdate,
  deleteKnowledgeTransfer,
  handleKnowledgeTransferDelete,
};
