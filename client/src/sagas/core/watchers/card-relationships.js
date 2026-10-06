import { all, takeEvery } from 'redux-saga/effects';

import services from '../services';
import EntryActionTypes from '../../../constants/EntryActionTypes';

export default function* cardRelationshipsWatchers() {
  yield all([
    takeEvery(EntryActionTypes.CARD_RELATIONSHIPS_IN_CURRENT_CARD_FETCH, () =>
      services.fetchCardRelationshipsInCurrentCard(),
    ),
    takeEvery(EntryActionTypes.CARD_RELATIONSHIP_IN_CURRENT_CARD_CREATE, ({ payload: { data } }) =>
      services.createCardRelationshipInCurrentCard(data),
    ),
    takeEvery(EntryActionTypes.CARD_RELATIONSHIP_DELETE, ({ payload: { id } }) =>
      services.deleteCardRelationship(id),
    ),
    takeEvery(
      EntryActionTypes.CARD_RELATIONSHIP_CREATE_HANDLE,
      ({ payload: { cardRelationship } }) =>
        services.handleCardRelationshipCreate(cardRelationship),
    ),
    takeEvery(
      EntryActionTypes.CARD_RELATIONSHIP_DELETE_HANDLE,
      ({ payload: { cardRelationship } }) =>
        services.handleCardRelationshipDelete(cardRelationship),
    ),
  ]);
}
