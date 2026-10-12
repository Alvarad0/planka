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
  let gitlabMergeRequest;
  let gitlabPipeline;
  let commitsCount;
  let hasMoreCommits;
  let isStale;
  let isProjectMismatch;
  let suggestedBranchName;
  let defaultBranch;

  try {
    ({
      item: gitlabCardLink,
      included: {
        gitlabIntegration,
        gitlabIssue,
        gitlabMergeRequest,
        gitlabPipeline,
        commitsCount,
        hasMoreCommits,
        isStale,
        isProjectMismatch,
        suggestedBranchName,
        defaultBranch,
      },
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
      gitlabMergeRequest,
      gitlabPipeline,
      commitsCount,
      hasMoreCommits,
      isStale,
      isProjectMismatch,
      suggestedBranchName,
      defaultBranch,
    ),
  );
}

export function* fetchGitlabCardLinkInCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(fetchGitlabCardLink, cardId);
}

export function* syncGitlabCardLink(cardId) {
  yield put(actions.syncGitlabCardLink(cardId));

  let gitlabCardLink;
  let gitlabIntegration;
  let gitlabIssue;
  let gitlabMergeRequest;
  let gitlabPipeline;
  let commitsCount;
  let hasMoreCommits;
  let isStale;
  let isProjectMismatch;
  let suggestedBranchName;
  let defaultBranch;

  try {
    ({
      item: gitlabCardLink,
      included: {
        gitlabIntegration,
        gitlabIssue,
        gitlabMergeRequest,
        gitlabPipeline,
        commitsCount,
        hasMoreCommits,
        isStale,
        isProjectMismatch,
        suggestedBranchName,
        defaultBranch,
      },
    } = yield call(request, api.syncGitlabCardLink, cardId));
  } catch (error) {
    yield put(actions.syncGitlabCardLink.failure(cardId, error));
    return;
  }

  yield put(
    actions.syncGitlabCardLink.success(
      cardId,
      gitlabCardLink,
      gitlabIntegration,
      gitlabIssue,
      gitlabMergeRequest,
      gitlabPipeline,
      commitsCount,
      hasMoreCommits,
      isStale,
      isProjectMismatch,
      suggestedBranchName,
      defaultBranch,
    ),
  );
}

export function* syncGitlabCardLinkInCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(syncGitlabCardLink, cardId);
}

export function* handleGitlabCardLinkCreate(gitlabCardLink) {
  yield put(actions.handleGitlabCardLinkCreate(gitlabCardLink));
}

export function* handleGitlabCardLinkUpdate(gitlabCardLink) {
  yield put(actions.handleGitlabCardLinkUpdate(gitlabCardLink));
}

export function* handleGitlabCardLinkDelete(gitlabCardLink) {
  yield put(actions.handleGitlabCardLinkDelete(gitlabCardLink));
}

export function* createGitlabIssueForCard(cardId) {
  yield put(actions.createGitlabIssueForCard(cardId));

  let gitlabCardLink;
  let gitlabIssue;
  let suggestedBranchName;
  let defaultBranch;

  try {
    ({
      item: gitlabCardLink,
      included: { gitlabIssue, suggestedBranchName, defaultBranch },
    } = yield call(request, api.createGitlabIssueForCard, cardId));
  } catch (error) {
    yield put(actions.createGitlabIssueForCard.failure(cardId, error));
    return;
  }

  yield put(
    actions.createGitlabIssueForCard.success(
      cardId,
      gitlabCardLink,
      gitlabIssue,
      suggestedBranchName,
      defaultBranch,
    ),
  );
}

export function* createGitlabIssueForCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(createGitlabIssueForCard, cardId);
}

export function* linkGitlabIssueToCard(cardId, data) {
  yield put(actions.linkGitlabIssueToCard(cardId, data));

  let gitlabCardLink;
  let gitlabIssue;
  let suggestedBranchName;
  let defaultBranch;

  try {
    ({
      item: gitlabCardLink,
      included: { gitlabIssue, suggestedBranchName, defaultBranch },
    } = yield call(request, api.linkGitlabIssueToCard, cardId, data));
  } catch (error) {
    yield put(actions.linkGitlabIssueToCard.failure(cardId, error));
    return;
  }

  yield put(
    actions.linkGitlabIssueToCard.success(
      cardId,
      gitlabCardLink,
      gitlabIssue,
      suggestedBranchName,
      defaultBranch,
    ),
  );
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

export function* createGitlabBranchForCard(cardId, data) {
  yield put(actions.createGitlabBranchForCard(cardId, data));

  let gitlabCardLink;
  let gitlabBranch;
  let isExistingBranch;

  try {
    ({
      item: gitlabCardLink,
      included: { gitlabBranch, isExistingBranch },
    } = yield call(request, api.createGitlabBranchForCard, cardId, data));
  } catch (error) {
    yield put(actions.createGitlabBranchForCard.failure(cardId, error));
    return;
  }

  yield put(
    actions.createGitlabBranchForCard.success(
      cardId,
      gitlabCardLink,
      gitlabBranch,
      isExistingBranch,
    ),
  );
}

export function* createGitlabBranchForCurrentCard(data) {
  const { cardId } = yield select(selectors.selectPath);

  yield call(createGitlabBranchForCard, cardId, data);
}

export function* createGitlabMergeRequestForCard(cardId) {
  yield put(actions.createGitlabMergeRequestForCard(cardId));

  let gitlabCardLink;
  let gitlabMergeRequest;
  let isExistingMergeRequest;

  try {
    ({
      item: gitlabCardLink,
      included: { gitlabMergeRequest, isExistingMergeRequest },
    } = yield call(request, api.createGitlabMergeRequestForCard, cardId));
  } catch (error) {
    yield put(actions.createGitlabMergeRequestForCard.failure(cardId, error));
    return;
  }

  yield put(
    actions.createGitlabMergeRequestForCard.success(
      cardId,
      gitlabCardLink,
      gitlabMergeRequest,
      isExistingMergeRequest,
    ),
  );
}

export function* createGitlabMergeRequestForCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(createGitlabMergeRequestForCard, cardId);
}

export function* fetchGitlabCommits(cardId) {
  yield put(actions.fetchGitlabCommits(cardId));

  let gitlabCommits;
  try {
    ({ items: gitlabCommits } = yield call(request, api.getGitlabCommitsForCard, cardId));
  } catch (error) {
    yield put(actions.fetchGitlabCommits.failure(cardId, error));
    return;
  }

  yield put(actions.fetchGitlabCommits.success(cardId, gitlabCommits));
}

export function* fetchGitlabCommitsInCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(fetchGitlabCommits, cardId);
}

// Refreshes the prefilled values of the "Create branch" form, which depend on card data (e.g. the
// "ID" custom field) that may have changed since the GitLab section was fetched
export function* fetchGitlabBranchSuggestion(cardId) {
  yield put(actions.fetchGitlabBranchSuggestion(cardId));

  let suggestedBranchName;
  let defaultBranch;
  try {
    ({
      item: { suggestedBranchName, defaultBranch },
    } = yield call(request, api.getGitlabBranchSuggestionForCard, cardId));
  } catch (error) {
    // The current suggestion is kept
    console.warn('Failed to refresh the GitLab branch suggestion', error); // eslint-disable-line no-console
    yield put(actions.fetchGitlabBranchSuggestion.failure(cardId, error));
    return;
  }

  yield put(
    actions.fetchGitlabBranchSuggestion.success(cardId, suggestedBranchName, defaultBranch),
  );
}

export function* fetchGitlabBranchSuggestionInCurrentCard() {
  const { cardId } = yield select(selectors.selectPath);

  yield call(fetchGitlabBranchSuggestion, cardId);
}

export default {
  fetchGitlabCardLink,
  fetchGitlabCardLinkInCurrentCard,
  syncGitlabCardLink,
  syncGitlabCardLinkInCurrentCard,
  handleGitlabCardLinkCreate,
  handleGitlabCardLinkUpdate,
  handleGitlabCardLinkDelete,
  createGitlabIssueForCard,
  createGitlabIssueForCurrentCard,
  linkGitlabIssueToCard,
  linkGitlabIssueToCurrentCard,
  unlinkGitlabIssueFromCard,
  unlinkGitlabIssueFromCurrentCard,
  createGitlabBranchForCard,
  createGitlabBranchForCurrentCard,
  createGitlabMergeRequestForCard,
  createGitlabMergeRequestForCurrentCard,
  fetchGitlabCommits,
  fetchGitlabCommitsInCurrentCard,
  fetchGitlabBranchSuggestion,
  fetchGitlabBranchSuggestionInCurrentCard,
};
