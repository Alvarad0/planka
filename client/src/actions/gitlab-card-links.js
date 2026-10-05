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
  isStale,
  isProjectMismatch,
) => ({
  type: ActionTypes.GITLAB_CARD_LINK_FETCH__SUCCESS,
  payload: {
    cardId,
    gitlabCardLink,
    gitlabIntegration,
    gitlabIssue,
    isStale,
    isProjectMismatch,
  },
});

fetchGitlabCardLink.failure = (cardId, error) => ({
  type: ActionTypes.GITLAB_CARD_LINK_FETCH__FAILURE,
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

createGitlabIssueForCard.success = (cardId, gitlabCardLink, gitlabIssue) => ({
  type: ActionTypes.GITLAB_ISSUE_FOR_CARD_CREATE__SUCCESS,
  payload: {
    cardId,
    gitlabCardLink,
    gitlabIssue,
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

linkGitlabIssueToCard.success = (cardId, gitlabCardLink, gitlabIssue) => ({
  type: ActionTypes.GITLAB_ISSUE_TO_CARD_LINK__SUCCESS,
  payload: {
    cardId,
    gitlabCardLink,
    gitlabIssue,
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

export default {
  fetchGitlabCardLink,
  handleGitlabCardLinkCreate,
  handleGitlabCardLinkDelete,
  createGitlabIssueForCard,
  linkGitlabIssueToCard,
  unlinkGitlabIssueFromCard,
};
