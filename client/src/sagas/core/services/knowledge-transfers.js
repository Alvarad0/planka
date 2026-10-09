import { call, put, select } from 'redux-saga/effects';

import request from '../request';
import selectors from '../../../selectors';
import actions from '../../../actions';
import api from '../../../api';

export function* fetchKnowledgeTransfers(cardId) {
  yield put(actions.fetchKnowledgeTransfers(cardId));

  let knowledgeTransfers;
  let users;

  try {
    ({
      items: knowledgeTransfers,
      included: { users },
    } = yield call(request, api.getKnowledgeTransfers, cardId));
  } catch (error) {
    yield put(actions.fetchKnowledgeTransfers.failure(cardId, error));
    return;
  }

  yield put(actions.fetchKnowledgeTransfers.success(cardId, knowledgeTransfers, users));
}

export function* fetchKnowledgeTransfersInCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(fetchKnowledgeTransfers, cardId);
}

export function* fetchKnowledgeTransferCandidates(cardId) {
  yield put(actions.fetchKnowledgeTransferCandidates(cardId));

  let users;

  try {
    ({ items: users } = yield call(request, api.getKnowledgeTransferCandidates, cardId));
  } catch (error) {
    yield put(actions.fetchKnowledgeTransferCandidates.failure(cardId, error));
    return;
  }

  yield put(actions.fetchKnowledgeTransferCandidates.success(cardId, users));
}

export function* fetchKnowledgeTransferCandidatesInCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(fetchKnowledgeTransferCandidates, cardId);
}

// Not optimistic: the item is shown once the server answers
export function* createKnowledgeTransfer(cardId, data) {
  yield put(actions.createKnowledgeTransfer(cardId, data));

  let knowledgeTransfer;
  let users;

  try {
    ({
      item: knowledgeTransfer,
      included: { users },
    } = yield call(request, api.createKnowledgeTransfer, cardId, data));
  } catch (error) {
    yield put(actions.createKnowledgeTransfer.failure(cardId, error));
    return;
  }

  yield put(actions.createKnowledgeTransfer.success(cardId, knowledgeTransfer, users));
}

export function* createKnowledgeTransferInCurrentCard(data) {
  const { cardId } = yield select(selectors.selectPath);

  yield call(createKnowledgeTransfer, cardId, data);
}

export function* handleKnowledgeTransferCreate(knowledgeTransfer, users) {
  yield put(actions.handleKnowledgeTransferCreate(knowledgeTransfer, users));
}

export function* updateKnowledgeTransfer(id, data) {
  yield put(actions.updateKnowledgeTransfer(id, data));

  let knowledgeTransfer;
  let users;

  try {
    ({
      item: knowledgeTransfer,
      included: { users },
    } = yield call(request, api.updateKnowledgeTransfer, id, data));
  } catch (error) {
    yield put(actions.updateKnowledgeTransfer.failure(id, error));
    return;
  }

  yield put(actions.updateKnowledgeTransfer.success(knowledgeTransfer, users));
}

export function* handleKnowledgeTransferUpdate(knowledgeTransfer, users) {
  yield put(actions.handleKnowledgeTransferUpdate(knowledgeTransfer, users));
}

export function* deleteKnowledgeTransfer(id) {
  yield put(actions.deleteKnowledgeTransfer(id));

  let knowledgeTransfer;

  try {
    ({ item: knowledgeTransfer } = yield call(request, api.deleteKnowledgeTransfer, id));
  } catch (error) {
    yield put(actions.deleteKnowledgeTransfer.failure(id, error));
    return;
  }

  yield put(actions.deleteKnowledgeTransfer.success(knowledgeTransfer));
}

export function* handleKnowledgeTransferDelete(knowledgeTransfer) {
  yield put(actions.handleKnowledgeTransferDelete(knowledgeTransfer));
}

export default {
  fetchKnowledgeTransfers,
  fetchKnowledgeTransfersInCurrentCard,
  fetchKnowledgeTransferCandidates,
  fetchKnowledgeTransferCandidatesInCurrentCard,
  createKnowledgeTransfer,
  createKnowledgeTransferInCurrentCard,
  handleKnowledgeTransferCreate,
  updateKnowledgeTransfer,
  handleKnowledgeTransferUpdate,
  deleteKnowledgeTransfer,
  handleKnowledgeTransferDelete,
};
