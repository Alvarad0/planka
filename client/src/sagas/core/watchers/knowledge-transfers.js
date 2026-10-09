import { all, takeEvery } from 'redux-saga/effects';

import services from '../services';
import EntryActionTypes from '../../../constants/EntryActionTypes';

export default function* knowledgeTransfersWatchers() {
  yield all([
    takeEvery(EntryActionTypes.KNOWLEDGE_TRANSFERS_IN_CURRENT_CARD_FETCH, () =>
      services.fetchKnowledgeTransfersInCurrentCard(),
    ),
    takeEvery(EntryActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_IN_CURRENT_CARD_FETCH, () =>
      services.fetchKnowledgeTransferCandidatesInCurrentCard(),
    ),
    takeEvery(EntryActionTypes.KNOWLEDGE_TRANSFER_IN_CURRENT_CARD_CREATE, ({ payload: { data } }) =>
      services.createKnowledgeTransferInCurrentCard(data),
    ),
    takeEvery(
      EntryActionTypes.KNOWLEDGE_TRANSFER_CREATE_HANDLE,
      ({ payload: { knowledgeTransfer, users } }) =>
        services.handleKnowledgeTransferCreate(knowledgeTransfer, users),
    ),
    takeEvery(EntryActionTypes.KNOWLEDGE_TRANSFER_UPDATE, ({ payload: { id, data } }) =>
      services.updateKnowledgeTransfer(id, data),
    ),
    takeEvery(
      EntryActionTypes.KNOWLEDGE_TRANSFER_UPDATE_HANDLE,
      ({ payload: { knowledgeTransfer, users } }) =>
        services.handleKnowledgeTransferUpdate(knowledgeTransfer, users),
    ),
    takeEvery(EntryActionTypes.KNOWLEDGE_TRANSFER_DELETE, ({ payload: { id } }) =>
      services.deleteKnowledgeTransfer(id),
    ),
    takeEvery(
      EntryActionTypes.KNOWLEDGE_TRANSFER_DELETE_HANDLE,
      ({ payload: { knowledgeTransfer } }) =>
        services.handleKnowledgeTransferDelete(knowledgeTransfer),
    ),
  ]);
}
