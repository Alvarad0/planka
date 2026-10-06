import ActionTypes from '../constants/ActionTypes';

const fetchGitlabIntegration = (projectId) => ({
  type: ActionTypes.GITLAB_INTEGRATION_FETCH,
  payload: {
    projectId,
  },
});

fetchGitlabIntegration.success = (projectId, gitlabIntegration, gitlabListOptions) => ({
  type: ActionTypes.GITLAB_INTEGRATION_FETCH__SUCCESS,
  payload: {
    projectId,
    gitlabIntegration,
    gitlabListOptions,
  },
});

fetchGitlabIntegration.failure = (projectId, error) => ({
  type: ActionTypes.GITLAB_INTEGRATION_FETCH__FAILURE,
  payload: {
    projectId,
    error,
  },
});

const createGitlabIntegration = (projectId, data) => ({
  type: ActionTypes.GITLAB_INTEGRATION_CREATE,
  payload: {
    projectId,
    data,
  },
});

createGitlabIntegration.success = (gitlabIntegration, gitlabListOptions) => ({
  type: ActionTypes.GITLAB_INTEGRATION_CREATE__SUCCESS,
  payload: {
    gitlabIntegration,
    gitlabListOptions,
  },
});

createGitlabIntegration.failure = (projectId, error) => ({
  type: ActionTypes.GITLAB_INTEGRATION_CREATE__FAILURE,
  payload: {
    projectId,
    error,
  },
});

const updateGitlabIntegration = (id, data) => ({
  type: ActionTypes.GITLAB_INTEGRATION_UPDATE,
  payload: {
    id,
    data,
  },
});

updateGitlabIntegration.success = (gitlabIntegration) => ({
  type: ActionTypes.GITLAB_INTEGRATION_UPDATE__SUCCESS,
  payload: {
    gitlabIntegration,
  },
});

updateGitlabIntegration.failure = (id, error) => ({
  type: ActionTypes.GITLAB_INTEGRATION_UPDATE__FAILURE,
  payload: {
    id,
    error,
  },
});

const deleteGitlabIntegration = (id) => ({
  type: ActionTypes.GITLAB_INTEGRATION_DELETE,
  payload: {
    id,
  },
});

deleteGitlabIntegration.success = (gitlabIntegration) => ({
  type: ActionTypes.GITLAB_INTEGRATION_DELETE__SUCCESS,
  payload: {
    gitlabIntegration,
  },
});

deleteGitlabIntegration.failure = (id, error) => ({
  type: ActionTypes.GITLAB_INTEGRATION_DELETE__FAILURE,
  payload: {
    id,
    error,
  },
});

const testGitlabIntegrationConnection = (id) => ({
  type: ActionTypes.GITLAB_INTEGRATION_CONNECTION_TEST,
  payload: {
    id,
  },
});

testGitlabIntegrationConnection.success = (gitlabIntegration, gitlabProject) => ({
  type: ActionTypes.GITLAB_INTEGRATION_CONNECTION_TEST__SUCCESS,
  payload: {
    gitlabIntegration,
    gitlabProject,
  },
});

testGitlabIntegrationConnection.failure = (id, error) => ({
  type: ActionTypes.GITLAB_INTEGRATION_CONNECTION_TEST__FAILURE,
  payload: {
    id,
    error,
  },
});

const rotateGitlabIntegrationWebhookSecret = (id) => ({
  type: ActionTypes.GITLAB_INTEGRATION_WEBHOOK_SECRET_ROTATE,
  payload: {
    id,
  },
});

rotateGitlabIntegrationWebhookSecret.success = (gitlabIntegration) => ({
  type: ActionTypes.GITLAB_INTEGRATION_WEBHOOK_SECRET_ROTATE__SUCCESS,
  payload: {
    gitlabIntegration,
  },
});

rotateGitlabIntegrationWebhookSecret.failure = (id, error) => ({
  type: ActionTypes.GITLAB_INTEGRATION_WEBHOOK_SECRET_ROTATE__FAILURE,
  payload: {
    id,
    error,
  },
});

const syncGitlabIntegration = (id) => ({
  type: ActionTypes.GITLAB_INTEGRATION_SYNC,
  payload: {
    id,
  },
});

syncGitlabIntegration.success = (gitlabIntegration, syncedCount, failedCount) => ({
  type: ActionTypes.GITLAB_INTEGRATION_SYNC__SUCCESS,
  payload: {
    gitlabIntegration,
    syncedCount,
    failedCount,
  },
});

syncGitlabIntegration.failure = (id, error) => ({
  type: ActionTypes.GITLAB_INTEGRATION_SYNC__FAILURE,
  payload: {
    id,
    error,
  },
});

export default {
  fetchGitlabIntegration,
  createGitlabIntegration,
  updateGitlabIntegration,
  deleteGitlabIntegration,
  testGitlabIntegrationConnection,
  rotateGitlabIntegrationWebhookSecret,
  syncGitlabIntegration,
};
