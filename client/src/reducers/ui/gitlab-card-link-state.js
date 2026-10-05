import { LOCATION_CHANGE_HANDLE } from '../../lib/redux-router';

import ActionTypes from '../../constants/ActionTypes';
import ErrorCodes from '../../constants/ErrorCodes';

// Transient state of the GitLab section of the currently open card. The link itself lives in the
// GitlabCardLink model; this keeps what is only meaningful while the card modal is open.
const initialState = {
  cardId: null,
  gitlabIntegration: null,
  gitlabIssue: null,
  // Merge request, pipeline and commit count of the card's branch
  gitlabMergeRequest: null,
  gitlabPipeline: null,
  commitsCount: null,
  hasMoreCommits: false,
  isStale: false,
  isProjectMismatch: false,
  // Prefilled values of the "Create branch" form, computed by the server
  suggestedBranchName: null,
  defaultBranch: null,
  isFetching: false,
  isFetched: false,
  fetchError: null,
  isCreating: false,
  createError: null,
  isLinking: false,
  linkError: null,
  isUnlinking: false,
  unlinkError: null,
  isCreatingBranch: false,
  createBranchError: null,
  isCreatingMergeRequest: false,
  createMergeRequestError: null,
  // Commits of the card's branch, fetched when the list is first opened
  gitlabCommits: null,
  isFetchingCommits: false,
  commitsError: null,
};

// Branch data that no longer matches the link (e.g. its branch changed)
const resetBranchData = (state) => ({
  ...state,
  gitlabMergeRequest: null,
  gitlabPipeline: null,
  commitsCount: null,
  hasMoreCommits: false,
  gitlabCommits: null,
  isFetchingCommits: false,
  commitsError: null,
});

// The live issue no longer matches the link, so the section falls back to the link's snapshot
const resetIssue = (state) => ({
  ...resetBranchData(state),
  gitlabIssue: null,
  isStale: false,
  isProjectMismatch: false,
});

// eslint-disable-next-line default-param-last
export default (state = initialState, { type, payload }) => {
  switch (type) {
    case LOCATION_CHANGE_HANDLE:
      return initialState;
    case ActionTypes.GITLAB_CARD_LINK_FETCH:
      return {
        ...(payload.cardId === state.cardId ? state : initialState),
        cardId: payload.cardId,
        isFetching: true,
        fetchError: null,
      };
    case ActionTypes.GITLAB_CARD_LINK_FETCH__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        gitlabIntegration: payload.gitlabIntegration,
        gitlabIssue: payload.gitlabIssue,
        gitlabMergeRequest: payload.gitlabMergeRequest,
        gitlabPipeline: payload.gitlabPipeline,
        commitsCount: payload.commitsCount,
        hasMoreCommits: payload.hasMoreCommits,
        isStale: payload.isStale,
        isProjectMismatch: payload.isProjectMismatch,
        suggestedBranchName: payload.suggestedBranchName,
        defaultBranch: payload.defaultBranch,
        isFetching: false,
        isFetched: true,
      };
    case ActionTypes.GITLAB_CARD_LINK_FETCH__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      // Not found means that the card is no longer accessible: nothing to show, no error
      if (payload.error.code === ErrorCodes.NOT_FOUND) {
        return {
          ...initialState,
          cardId: state.cardId,
          isFetched: true,
        };
      }

      return {
        ...state,
        isFetching: false,
        isFetched: true,
        fetchError: payload.error,
      };
    case ActionTypes.GITLAB_CARD_LINK_CREATE_HANDLE:
    case ActionTypes.GITLAB_CARD_LINK_DELETE_HANDLE:
      if (payload.gitlabCardLink.cardId !== state.cardId) {
        return state;
      }

      return resetIssue(state);
    case ActionTypes.GITLAB_ISSUE_FOR_CARD_CREATE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreating: true,
        createError: null,
        linkError: null,
        unlinkError: null,
        createBranchError: null,
        createMergeRequestError: null,
      };
    case ActionTypes.GITLAB_ISSUE_FOR_CARD_CREATE__SUCCESS:
    case ActionTypes.GITLAB_ISSUE_TO_CARD_LINK__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...resetBranchData(state),
        gitlabIssue: payload.gitlabIssue,
        isStale: false,
        isProjectMismatch: false,
        suggestedBranchName: payload.suggestedBranchName,
        defaultBranch: payload.defaultBranch,
        isCreating: false,
        isLinking: false,
      };
    case ActionTypes.GITLAB_ISSUE_FOR_CARD_CREATE__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreating: false,
        createError: payload.error,
      };
    case ActionTypes.GITLAB_ISSUE_TO_CARD_LINK:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isLinking: true,
        createError: null,
        linkError: null,
        unlinkError: null,
        createBranchError: null,
        createMergeRequestError: null,
      };
    case ActionTypes.GITLAB_ISSUE_TO_CARD_LINK__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isLinking: false,
        linkError: payload.error,
      };
    case ActionTypes.GITLAB_ISSUE_FROM_CARD_UNLINK:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isUnlinking: true,
        createError: null,
        linkError: null,
        unlinkError: null,
        createBranchError: null,
        createMergeRequestError: null,
      };
    case ActionTypes.GITLAB_ISSUE_FROM_CARD_UNLINK__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...resetIssue(state),
        isUnlinking: false,
      };
    case ActionTypes.GITLAB_ISSUE_FROM_CARD_UNLINK__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      // Not found means that the link is already gone, which is what was asked for
      if (payload.error.code === ErrorCodes.NOT_FOUND) {
        return {
          ...resetIssue(state),
          isUnlinking: false,
        };
      }

      return {
        ...state,
        isUnlinking: false,
        unlinkError: payload.error,
      };
    case ActionTypes.GITLAB_BRANCH_FOR_CARD_CREATE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreatingBranch: true,
        createError: null,
        linkError: null,
        unlinkError: null,
        createBranchError: null,
        createMergeRequestError: null,
      };
    case ActionTypes.GITLAB_BRANCH_FOR_CARD_CREATE__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...resetBranchData(state),
        isCreatingBranch: false,
      };
    case ActionTypes.GITLAB_BRANCH_FOR_CARD_CREATE__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreatingBranch: false,
        createBranchError: payload.error,
      };
    case ActionTypes.GITLAB_MERGE_REQUEST_FOR_CARD_CREATE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreatingMergeRequest: true,
        createError: null,
        linkError: null,
        unlinkError: null,
        createBranchError: null,
        createMergeRequestError: null,
      };
    case ActionTypes.GITLAB_MERGE_REQUEST_FOR_CARD_CREATE__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        gitlabMergeRequest: payload.gitlabMergeRequest,
        isCreatingMergeRequest: false,
      };
    case ActionTypes.GITLAB_MERGE_REQUEST_FOR_CARD_CREATE__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isCreatingMergeRequest: false,
        createMergeRequestError: payload.error,
      };
    case ActionTypes.GITLAB_COMMITS_FETCH:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isFetchingCommits: true,
        commitsError: null,
      };
    case ActionTypes.GITLAB_COMMITS_FETCH__SUCCESS:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        gitlabCommits: payload.gitlabCommits,
        isFetchingCommits: false,
      };
    case ActionTypes.GITLAB_COMMITS_FETCH__FAILURE:
      if (payload.cardId !== state.cardId) {
        return state;
      }

      return {
        ...state,
        isFetchingCommits: false,
        commitsError: payload.error,
      };
    default:
      return state;
  }
};
