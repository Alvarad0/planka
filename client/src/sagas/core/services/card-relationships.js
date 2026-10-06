import { call, put, select } from 'redux-saga/effects';

import request from '../request';
import selectors from '../../../selectors';
import actions from '../../../actions';
import api from '../../../api';
import isCardRelationshipOfCard from '../../../utils/is-card-relationship-of-card';

export function* fetchCardRelationships(cardId) {
  yield put(actions.fetchCardRelationships(cardId));

  let cardRelationships;
  let parentCards;
  let blockingOpenCount;

  try {
    ({
      items: cardRelationships,
      included: { parentCards, blockingOpenCount },
    } = yield call(request, api.getCardRelationships, cardId));
  } catch (error) {
    // E_NOT_FOUND means that the card is no longer accessible, the reducer handles it
    yield put(actions.fetchCardRelationships.failure(cardId, error));
    return;
  }

  yield put(
    actions.fetchCardRelationships.success(
      cardId,
      cardRelationships,
      parentCards,
      blockingOpenCount,
    ),
  );
}

export function* fetchCardRelationshipsInCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(fetchCardRelationships, cardId);
}

export function* createCardRelationship(cardId, data) {
  yield put(actions.createCardRelationship(cardId, data));

  let cardRelationship;
  try {
    ({ item: cardRelationship } = yield call(request, api.createCardRelationship, cardId, data));
  } catch (error) {
    yield put(actions.createCardRelationship.failure(cardId, error));
    return;
  }

  yield put(actions.createCardRelationship.success(cardId, cardRelationship));

  // The blocking count and the other groups are computed by the server
  yield call(fetchCardRelationships, cardId);
}

export function* createCardRelationshipInCurrentCard(data) {
  const { cardId } = yield select(selectors.selectPath);

  yield call(createCardRelationship, cardId, data);
}

export function* deleteCardRelationship(id) {
  const { cardId } = yield select(selectors.selectCardRelationshipState);

  yield put(actions.deleteCardRelationship(cardId, id));

  try {
    yield call(request, api.deleteCardRelationship, id);
  } catch (error) {
    yield put(actions.deleteCardRelationship.failure(cardId, id, error));
    return;
  }

  yield put(actions.deleteCardRelationship.success(cardId, id));

  if (cardId) {
    yield call(fetchCardRelationships, cardId);
  }
}

// Socket events carry the stored form only (no names), so the open card's relationships are
// fetched again when it is one of the two cards
function* handleCardRelationshipChange(cardRelationship) {
  const { cardId, isFetched } = yield select(selectors.selectCardRelationshipState);

  if (!isFetched || !isCardRelationshipOfCard(cardRelationship, cardId)) {
    return;
  }

  yield call(fetchCardRelationships, cardId);
}

export function* handleCardRelationshipCreate(cardRelationship) {
  yield call(handleCardRelationshipChange, cardRelationship);
}

export function* handleCardRelationshipDelete(cardRelationship) {
  yield call(handleCardRelationshipChange, cardRelationship);
}

export default {
  fetchCardRelationships,
  fetchCardRelationshipsInCurrentCard,
  createCardRelationship,
  createCardRelationshipInCurrentCard,
  deleteCardRelationship,
  handleCardRelationshipCreate,
  handleCardRelationshipDelete,
};
