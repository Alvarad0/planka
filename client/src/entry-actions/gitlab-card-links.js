import EntryActionTypes from '../constants/EntryActionTypes';

const fetchGitlabCardLinkInCurrentCard = () => ({
  type: EntryActionTypes.GITLAB_CARD_LINK_IN_CURRENT_CARD_FETCH,
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

export default {
  fetchGitlabCardLinkInCurrentCard,
  handleGitlabCardLinkCreate,
  handleGitlabCardLinkUpdate,
  handleGitlabCardLinkDelete,
  createGitlabIssueForCurrentCard,
  linkGitlabIssueToCurrentCard,
  unlinkGitlabIssueFromCurrentCard,
  createGitlabBranchForCurrentCard,
};
