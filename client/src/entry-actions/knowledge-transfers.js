import EntryActionTypes from '../constants/EntryActionTypes';

const fetchKnowledgeTransfersInCurrentCard = () => ({
  type: EntryActionTypes.KNOWLEDGE_TRANSFERS_IN_CURRENT_CARD_FETCH,
  payload: {},
});

const fetchKnowledgeTransferCandidatesInCurrentCard = () => ({
  type: EntryActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_IN_CURRENT_CARD_FETCH,
  payload: {},
});

const createKnowledgeTransferInCurrentCard = (data) => ({
  type: EntryActionTypes.KNOWLEDGE_TRANSFER_IN_CURRENT_CARD_CREATE,
  payload: {
    data,
  },
});

const handleKnowledgeTransferCreate = (knowledgeTransfer, users) => ({
  type: EntryActionTypes.KNOWLEDGE_TRANSFER_CREATE_HANDLE,
  payload: {
    knowledgeTransfer,
    users,
  },
});

const updateKnowledgeTransfer = (id, data) => ({
  type: EntryActionTypes.KNOWLEDGE_TRANSFER_UPDATE,
  payload: {
    id,
    data,
  },
});

const handleKnowledgeTransferUpdate = (knowledgeTransfer, users) => ({
  type: EntryActionTypes.KNOWLEDGE_TRANSFER_UPDATE_HANDLE,
  payload: {
    knowledgeTransfer,
    users,
  },
});

const deleteKnowledgeTransfer = (id) => ({
  type: EntryActionTypes.KNOWLEDGE_TRANSFER_DELETE,
  payload: {
    id,
  },
});

const handleKnowledgeTransferDelete = (knowledgeTransfer) => ({
  type: EntryActionTypes.KNOWLEDGE_TRANSFER_DELETE_HANDLE,
  payload: {
    knowledgeTransfer,
  },
});

export default {
  fetchKnowledgeTransfersInCurrentCard,
  fetchKnowledgeTransferCandidatesInCurrentCard,
  createKnowledgeTransferInCurrentCard,
  handleKnowledgeTransferCreate,
  updateKnowledgeTransfer,
  handleKnowledgeTransferUpdate,
  deleteKnowledgeTransfer,
  handleKnowledgeTransferDelete,
};
