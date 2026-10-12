import EntryActionTypes from '../constants/EntryActionTypes';

const fetchGitlabCardLinkInCurrentCard = () => ({
  type: EntryActionTypes.GITLAB_CARD_LINK_IN_CURRENT_CARD_FETCH,
  payload: {},
});

const syncGitlabCardLinkInCurrentCard = () => ({
  type: EntryActionTypes.GITLAB_CARD_LINK_IN_CURRENT_CARD_SYNC,
  payload: {},
});

const handleGitlabCardLinkCreate = (gitlabCardLink) => ({
  type: EntryActionTypes.GITLAB_CARD_LINK_CREATE_HANDLE,
  payload: {
    gitlabCardLink,
  },
});

const handleGitlabCardLinkUpdate = (gitlabCardLink) => ({
  type: EntryActionTypes.GITLAB_CARD_LINK_UPDATE_HANDLE,
  payload: {
    gitlabCardLink,
  },
});

const handleGitlabCardLinkDelete = (gitlabCardLink) => ({
  type: EntryActionTypes.GITLAB_CARD_LINK_DELETE_HANDLE,
  payload: {
    gitlabCardLink,
  },
});

const createGitlabIssueForCurrentCard = () => ({
  type: EntryActionTypes.GITLAB_ISSUE_FOR_CURRENT_CARD_CREATE,
  payload: {},
});

const linkGitlabIssueToCurrentCard = (data) => ({
  type: EntryActionTypes.GITLAB_ISSUE_TO_CURRENT_CARD_LINK,
  payload: {
    data,
  },
});

const unlinkGitlabIssueFromCurrentCard = () => ({
  type: EntryActionTypes.GITLAB_ISSUE_FROM_CURRENT_CARD_UNLINK,
  payload: {},
});

const createGitlabBranchForCurrentCard = (data) => ({
  type: EntryActionTypes.GITLAB_BRANCH_FOR_CURRENT_CARD_CREATE,
  payload: {
    data,
  },
});

const createGitlabMergeRequestForCurrentCard = () => ({
  type: EntryActionTypes.GITLAB_MERGE_REQUEST_FOR_CURRENT_CARD_CREATE,
  payload: {},
});

const fetchGitlabCommitsInCurrentCard = () => ({
  type: EntryActionTypes.GITLAB_COMMITS_IN_CURRENT_CARD_FETCH,
  payload: {},
});

const fetchGitlabBranchSuggestionInCurrentCard = () => ({
  type: EntryActionTypes.GITLAB_BRANCH_SUGGESTION_IN_CURRENT_CARD_FETCH,
  payload: {},
});

export default {
  fetchGitlabCardLinkInCurrentCard,
  syncGitlabCardLinkInCurrentCard,
  handleGitlabCardLinkCreate,
  handleGitlabCardLinkUpdate,
  handleGitlabCardLinkDelete,
  createGitlabIssueForCurrentCard,
  linkGitlabIssueToCurrentCard,
  unlinkGitlabIssueFromCurrentCard,
  createGitlabBranchForCurrentCard,
  createGitlabMergeRequestForCurrentCard,
  fetchGitlabCommitsInCurrentCard,
  fetchGitlabBranchSuggestionInCurrentCard,
};
