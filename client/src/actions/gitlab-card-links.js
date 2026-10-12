import ActionTypes from '../constants/ActionTypes';

const fetchGitlabCardLink = (cardId) => ({
  type: ActionTypes.GITLAB_CARD_LINK_FETCH,
  payload: {
    cardId,
  },
});

fetchGitlabCardLink.success = (
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
) => ({
  type: ActionTypes.GITLAB_CARD_LINK_FETCH__SUCCESS,
  payload: {
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
  },
});

fetchGitlabCardLink.failure = (cardId, error) => ({
  type: ActionTypes.GITLAB_CARD_LINK_FETCH__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const syncGitlabCardLink = (cardId) => ({
  type: ActionTypes.GITLAB_CARD_LINK_SYNC,
  payload: {
    cardId,
  },
});

// Same payload as a fetch success: a sync responds like getting the card's GitLab data
syncGitlabCardLink.success = (
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
) => ({
  type: ActionTypes.GITLAB_CARD_LINK_SYNC__SUCCESS,
  payload: {
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
  },
});

syncGitlabCardLink.failure = (cardId, error) => ({
  type: ActionTypes.GITLAB_CARD_LINK_SYNC__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const handleGitlabCardLinkCreate = (gitlabCardLink) => ({
  type: ActionTypes.GITLAB_CARD_LINK_CREATE_HANDLE,
  payload: {
    gitlabCardLink,
  },
});

const handleGitlabCardLinkUpdate = (gitlabCardLink) => ({
  type: ActionTypes.GITLAB_CARD_LINK_UPDATE_HANDLE,
  payload: {
    gitlabCardLink,
  },
});

const handleGitlabCardLinkDelete = (gitlabCardLink) => ({
  type: ActionTypes.GITLAB_CARD_LINK_DELETE_HANDLE,
  payload: {
    gitlabCardLink,
  },
});

const createGitlabIssueForCard = (cardId) => ({
  type: ActionTypes.GITLAB_ISSUE_FOR_CARD_CREATE,
  payload: {
    cardId,
  },
});

createGitlabIssueForCard.success = (
  cardId,
  gitlabCardLink,
  gitlabIssue,
  suggestedBranchName,
  defaultBranch,
) => ({
  type: ActionTypes.GITLAB_ISSUE_FOR_CARD_CREATE__SUCCESS,
  payload: {
    cardId,
    gitlabCardLink,
    gitlabIssue,
    suggestedBranchName,
    defaultBranch,
  },
});

createGitlabIssueForCard.failure = (cardId, error) => ({
  type: ActionTypes.GITLAB_ISSUE_FOR_CARD_CREATE__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const linkGitlabIssueToCard = (cardId, data) => ({
  type: ActionTypes.GITLAB_ISSUE_TO_CARD_LINK,
  payload: {
    cardId,
    data,
  },
});

linkGitlabIssueToCard.success = (
  cardId,
  gitlabCardLink,
  gitlabIssue,
  suggestedBranchName,
  defaultBranch,
) => ({
  type: ActionTypes.GITLAB_ISSUE_TO_CARD_LINK__SUCCESS,
  payload: {
    cardId,
    gitlabCardLink,
    gitlabIssue,
    suggestedBranchName,
    defaultBranch,
  },
});

linkGitlabIssueToCard.failure = (cardId, error) => ({
  type: ActionTypes.GITLAB_ISSUE_TO_CARD_LINK__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const unlinkGitlabIssueFromCard = (cardId) => ({
  type: ActionTypes.GITLAB_ISSUE_FROM_CARD_UNLINK,
  payload: {
    cardId,
  },
});

unlinkGitlabIssueFromCard.success = (cardId, gitlabCardLink) => ({
  type: ActionTypes.GITLAB_ISSUE_FROM_CARD_UNLINK__SUCCESS,
  payload: {
    cardId,
    gitlabCardLink,
  },
});

unlinkGitlabIssueFromCard.failure = (cardId, error) => ({
  type: ActionTypes.GITLAB_ISSUE_FROM_CARD_UNLINK__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const createGitlabBranchForCard = (cardId, data) => ({
  type: ActionTypes.GITLAB_BRANCH_FOR_CARD_CREATE,
  payload: {
    cardId,
    data,
  },
});

createGitlabBranchForCard.success = (cardId, gitlabCardLink, gitlabBranch, isExistingBranch) => ({
  type: ActionTypes.GITLAB_BRANCH_FOR_CARD_CREATE__SUCCESS,
  payload: {
    cardId,
    gitlabCardLink,
    gitlabBranch,
    isExistingBranch,
  },
});

createGitlabBranchForCard.failure = (cardId, error) => ({
  type: ActionTypes.GITLAB_BRANCH_FOR_CARD_CREATE__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const createGitlabMergeRequestForCard = (cardId) => ({
  type: ActionTypes.GITLAB_MERGE_REQUEST_FOR_CARD_CREATE,
  payload: {
    cardId,
  },
});

createGitlabMergeRequestForCard.success = (
  cardId,
  gitlabCardLink,
  gitlabMergeRequest,
  isExistingMergeRequest,
) => ({
  type: ActionTypes.GITLAB_MERGE_REQUEST_FOR_CARD_CREATE__SUCCESS,
  payload: {
    cardId,
    gitlabCardLink,
    gitlabMergeRequest,
    isExistingMergeRequest,
  },
});

createGitlabMergeRequestForCard.failure = (cardId, error) => ({
  type: ActionTypes.GITLAB_MERGE_REQUEST_FOR_CARD_CREATE__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const fetchGitlabCommits = (cardId) => ({
  type: ActionTypes.GITLAB_COMMITS_FETCH,
  payload: {
    cardId,
  },
});

fetchGitlabCommits.success = (cardId, gitlabCommits) => ({
  type: ActionTypes.GITLAB_COMMITS_FETCH__SUCCESS,
  payload: {
    cardId,
    gitlabCommits,
  },
});

fetchGitlabCommits.failure = (cardId, error) => ({
  type: ActionTypes.GITLAB_COMMITS_FETCH__FAILURE,
  payload: {
    cardId,
    error,
  },
});

const fetchGitlabBranchSuggestion = (cardId) => ({
  type: ActionTypes.GITLAB_BRANCH_SUGGESTION_FETCH,
  payload: {
    cardId,
  },
});

fetchGitlabBranchSuggestion.success = (cardId, suggestedBranchName, defaultBranch) => ({
  type: ActionTypes.GITLAB_BRANCH_SUGGESTION_FETCH__SUCCESS,
  payload: {
    cardId,
    suggestedBranchName,
    defaultBranch,
  },
});

fetchGitlabBranchSuggestion.failure = (cardId, error) => ({
  type: ActionTypes.GITLAB_BRANCH_SUGGESTION_FETCH__FAILURE,
  payload: {
    cardId,
    error,
  },
});

export default {
  fetchGitlabCardLink,
  syncGitlabCardLink,
  handleGitlabCardLinkCreate,
  handleGitlabCardLinkUpdate,
  handleGitlabCardLinkDelete,
  createGitlabIssueForCard,
  linkGitlabIssueToCard,
  unlinkGitlabIssueFromCard,
  createGitlabBranchForCard,
  createGitlabMergeRequestForCard,
  fetchGitlabCommits,
  fetchGitlabBranchSuggestion,
};
