import { all, takeEvery } from 'redux-saga/effects';

import services from '../services';
import EntryActionTypes from '../../../constants/EntryActionTypes';

export default function* gitlabCardLinksWatchers() {
  yield all([
    takeEvery(EntryActionTypes.GITLAB_CARD_LINK_IN_CURRENT_CARD_FETCH, () =>
      services.fetchGitlabCardLinkInCurrentCard(),
    ),
    takeEvery(EntryActionTypes.GITLAB_CARD_LINK_CREATE_HANDLE, ({ payload: { gitlabCardLink } }) =>
      services.handleGitlabCardLinkCreate(gitlabCardLink),
    ),
    takeEvery(EntryActionTypes.GITLAB_CARD_LINK_UPDATE_HANDLE, ({ payload: { gitlabCardLink } }) =>
      services.handleGitlabCardLinkUpdate(gitlabCardLink),
    ),
    takeEvery(EntryActionTypes.GITLAB_CARD_LINK_DELETE_HANDLE, ({ payload: { gitlabCardLink } }) =>
      services.handleGitlabCardLinkDelete(gitlabCardLink),
    ),
    takeEvery(EntryActionTypes.GITLAB_ISSUE_FOR_CURRENT_CARD_CREATE, () =>
      services.createGitlabIssueForCurrentCard(),
    ),
    takeEvery(EntryActionTypes.GITLAB_ISSUE_TO_CURRENT_CARD_LINK, ({ payload: { data } }) =>
      services.linkGitlabIssueToCurrentCard(data),
    ),
    takeEvery(EntryActionTypes.GITLAB_ISSUE_FROM_CURRENT_CARD_UNLINK, () =>
      services.unlinkGitlabIssueFromCurrentCard(),
    ),
    takeEvery(EntryActionTypes.GITLAB_BRANCH_FOR_CURRENT_CARD_CREATE, ({ payload: { data } }) =>
      services.createGitlabBranchForCurrentCard(data),
    ),
    takeEvery(EntryActionTypes.GITLAB_MERGE_REQUEST_FOR_CURRENT_CARD_CREATE, () =>
      services.createGitlabMergeRequestForCurrentCard(),
    ),
    takeEvery(EntryActionTypes.GITLAB_COMMITS_IN_CURRENT_CARD_FETCH, () =>
      services.fetchGitlabCommitsInCurrentCard(),
    ),
  ]);
}
