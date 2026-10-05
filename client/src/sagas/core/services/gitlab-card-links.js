import { call, put, select } from 'redux-saga/effects';

import request from '../request';
import selectors from '../../../selectors';
import actions from '../../../actions';
import api from '../../../api';

export function* fetchGitlabCardLink(cardId) {
  yield put(actions.fetchGitlabCardLink(cardId));

  let gitlabCardLink;
  let gitlabIntegration;
  let gitlabIssue;
  let isStale;
  let isProjectMismatch;

  try {
    ({
      item: gitlabCardLink,
      included: { gitlabIntegration, gitlabIssue, isStale, isProjectMismatch },
    } = yield call(request, api.getGitlabCardLink, cardId));
  } catch (error) {
    // E_NOT_FOUND means that the card is no longer accessible, the reducers handle it
    yield put(actions.fetchGitlabCardLink.failure(cardId, error));
    return;
  }

  yield put(
    actions.fetchGitlabCardLink.success(
      cardId,
      gitlabCardLink,
      gitlabIntegration,
      gitlabIssue,
      isStale,
      isProjectMismatch,
    ),
  );
}

export function* fetchGitlabCardLinkInCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(fetchGitlabCardLink, cardId);
}

export function* handleGitlabCardLinkCreate(gitlabCardLink) {
  yield put(actions.handleGitlabCardLinkCreate(gitlabCardLink));
}

export function* handleGitlabCardLinkDelete(gitlabCardLink) {
  yield put(actions.handleGitlabCardLinkDelete(gitlabCardLink));
}

export function* createGitlabIssueForCard(cardId) {
  yield put(actions.createGitlabIssueForCard(cardId));

  let gitlabCardLink;
  let gitlabIssue;

  try {
    ({
      item: gitlabCardLink,
      included: { gitlabIssue },
    } = yield call(request, api.createGitlabIssueForCard, cardId));
  } catch (error) {
    yield put(actions.createGitlabIssueForCard.failure(cardId, error));
    return;
  }

  yield put(actions.createGitlabIssueForCard.success(cardId, gitlabCardLink, gitlabIssue));
}

export function* createGitlabIssueForCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(createGitlabIssueForCard, cardId);
}

export function* linkGitlabIssueToCard(cardId, data) {
  yield put(actions.linkGitlabIssueToCard(cardId, data));

  let gitlabCardLink;
  let gitlabIssue;

  try {
    ({
      item: gitlabCardLink,
      included: { gitlabIssue },
    } = yield call(request, api.linkGitlabIssueToCard, cardId, data));
  } catch (error) {
    yield put(actions.linkGitlabIssueToCard.failure(cardId, error));
    return;
  }

  yield put(actions.linkGitlabIssueToCard.success(cardId, gitlabCardLink, gitlabIssue));
}

export function* linkGitlabIssueToCurrentCard(data) {
  const { cardId } = yield select(selectors.selectPath);

  yield call(linkGitlabIssueToCard, cardId, data);
}

export function* unlinkGitlabIssueFromCard(cardId) {
  yield put(actions.unlinkGitlabIssueFromCard(cardId));

  let gitlabCardLink;
  try {
    ({ item: gitlabCardLink } = yield call(request, api.unlinkGitlabIssueFromCard, cardId));
  } catch (error) {
    yield put(actions.unlinkGitlabIssueFromCard.failure(cardId, error));
    return;
  }

  yield put(actions.unlinkGitlabIssueFromCard.success(cardId, gitlabCardLink));
}

export function* unlinkGitlabIssueFromCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(unlinkGitlabIssueFromCard, cardId);
}

export default {
  fetchGitlabCardLink,
  fetchGitlabCardLinkInCurrentCard,
  handleGitlabCardLinkCreate,
  handleGitlabCardLinkDelete,
  createGitlabIssueForCard,
  createGitlabIssueForCurrentCard,
  linkGitlabIssueToCard,
  linkGitlabIssueToCurrentCard,
  unlinkGitlabIssueFromCard,
  unlinkGitlabIssueFromCurrentCard,
};
