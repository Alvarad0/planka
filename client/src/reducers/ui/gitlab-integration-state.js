import { LOCATION_CHANGE_HANDLE } from '../../lib/redux-router';

import ActionTypes from '../../constants/ActionTypes';
import ErrorCodes from '../../constants/ErrorCodes';

// Transient state of the GitLab pane in the project settings modal
const initialState = {
  projectId: null,
  listOptions: [],
  isFetching: false,
  isFetched: false,
  fetchError: null,
  isCreating: false,
  createError: null,
  isUpdating: false,
  updateError: null,
  isConnectionTesting: false,
  connectionTestResult: null,
  isWebhookSecretRotating: false,
  webhookSecretRotateError: null,
  isSyncing: false,
  // Counts of the last "Sync all": { syncedCount, failedCount }
  syncResult: null,
  syncError: null,
  isDeleting: false,
  deleteError: null,
};

// eslint-disable-next-line default-param-last
export default (state = initialState, { type, payload }) => {
  switch (type) {
    case LOCATION_CHANGE_HANDLE:
    case ActionTypes.MODAL_CLOSE:
      return initialState;
    case ActionTypes.GITLAB_INTEGRATION_FETCH:
      return {
        ...(payload.projectId === state.projectId ? state : initialState),
        projectId: payload.projectId,
        isFetching: true,
        fetchError: null,
      };
    case ActionTypes.GITLAB_INTEGRATION_FETCH__SUCCESS:
      return {
        ...state,
        listOptions: payload.gitlabListOptions,
        isFetching: false,
        isFetched: true,
      };
    case ActionTypes.GITLAB_INTEGRATION_FETCH__FAILURE:
      return {
        ...state,
        isFetching: false,
        isFetched: true,
        // Not found means that the project is not linked yet
        fetchError: payload.error.code === ErrorCodes.NOT_FOUND ? null : payload.error,
      };
    case ActionTypes.GITLAB_INTEGRATION_CREATE:
      return {
        ...state,
        isCreating: true,
        createError: null,
      };
    case ActionTypes.GITLAB_INTEGRATION_CREATE__SUCCESS:
      return {
        ...state,
        listOptions: payload.gitlabListOptions,
        isCreating: false,
      };
    case ActionTypes.GITLAB_INTEGRATION_CREATE__FAILURE:
      return {
        ...state,
        isCreating: false,
        createError: payload.error,
      };
    case ActionTypes.GITLAB_INTEGRATION_UPDATE:
      return {
        ...state,
        isUpdating: true,
        updateError: null,
      };
    case ActionTypes.GITLAB_INTEGRATION_UPDATE__SUCCESS:
      return {
        ...state,
        isUpdating: false,
        connectionTestResult: null,
      };
    case ActionTypes.GITLAB_INTEGRATION_UPDATE__FAILURE:
      return {
        ...state,
        isUpdating: false,
        updateError: payload.error,
      };
    case ActionTypes.GITLAB_INTEGRATION_CONNECTION_TEST:
      return {
        ...state,
        isConnectionTesting: true,
        connectionTestResult: null,
      };
    case ActionTypes.GITLAB_INTEGRATION_CONNECTION_TEST__SUCCESS:
      return {
        ...state,
        isConnectionTesting: false,
        connectionTestResult: {
          gitlabProject: payload.gitlabProject,
          error: null,
        },
      };
    case ActionTypes.GITLAB_INTEGRATION_CONNECTION_TEST__FAILURE:
      return {
        ...state,
        isConnectionTesting: false,
        connectionTestResult: {
          gitlabProject: null,
          error: payload.error,
        },
      };
    case ActionTypes.GITLAB_INTEGRATION_WEBHOOK_SECRET_ROTATE:
      return {
        ...state,
        isWebhookSecretRotating: true,
        webhookSecretRotateError: null,
      };
    case ActionTypes.GITLAB_INTEGRATION_WEBHOOK_SECRET_ROTATE__SUCCESS:
      return {
        ...state,
        isWebhookSecretRotating: false,
      };
    case ActionTypes.GITLAB_INTEGRATION_WEBHOOK_SECRET_ROTATE__FAILURE:
      return {
        ...state,
        isWebhookSecretRotating: false,
        webhookSecretRotateError: payload.error,
      };
    case ActionTypes.GITLAB_INTEGRATION_SYNC:
      return {
        ...state,
        isSyncing: true,
        syncResult: null,
        syncError: null,
      };
    case ActionTypes.GITLAB_INTEGRATION_SYNC__SUCCESS:
      return {
        ...state,
        isSyncing: false,
        syncResult: {
          syncedCount: payload.syncedCount,
          failedCount: payload.failedCount,
        },
      };
    case ActionTypes.GITLAB_INTEGRATION_SYNC__FAILURE:
      return {
        ...state,
        isSyncing: false,
        syncError: payload.error,
      };
    case ActionTypes.GITLAB_INTEGRATION_DELETE:
      return {
        ...state,
        isDeleting: true,
        deleteError: null,
      };
    case ActionTypes.GITLAB_INTEGRATION_DELETE__SUCCESS:
      return {
        ...initialState,
        projectId: state.projectId,
        listOptions: state.listOptions,
        isFetched: true,
      };
    case ActionTypes.GITLAB_INTEGRATION_DELETE__FAILURE:
      return {
        ...state,
        isDeleting: false,
        deleteError: payload.error,
      };
    default:
      return state;
  }
};
