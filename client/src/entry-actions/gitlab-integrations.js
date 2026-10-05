import EntryActionTypes from '../constants/EntryActionTypes';

const fetchGitlabIntegrationInCurrentProject = () => ({
  type: EntryActionTypes.GITLAB_INTEGRATION_IN_CURRENT_PROJECT_FETCH,
  payload: {},
});

const createGitlabIntegrationInCurrentProject = (data) => ({
  type: EntryActionTypes.GITLAB_INTEGRATION_IN_CURRENT_PROJECT_CREATE,
  payload: {
    data,
  },
});

const updateGitlabIntegration = (id, data) => ({
  type: EntryActionTypes.GITLAB_INTEGRATION_UPDATE,
  payload: {
    id,
    data,
  },
});

const deleteGitlabIntegration = (id) => ({
  type: EntryActionTypes.GITLAB_INTEGRATION_DELETE,
  payload: {
    id,
  },
});

const testGitlabIntegrationConnection = (id) => ({
  type: EntryActionTypes.GITLAB_INTEGRATION_CONNECTION_TEST,
  payload: {
    id,
  },
});

const rotateGitlabIntegrationWebhookSecret = (id) => ({
  type: EntryActionTypes.GITLAB_INTEGRATION_WEBHOOK_SECRET_ROTATE,
  payload: {
    id,
  },
});

export default {
  fetchGitlabIntegrationInCurrentProject,
  createGitlabIntegrationInCurrentProject,
  updateGitlabIntegration,
  deleteGitlabIntegration,
  testGitlabIntegrationConnection,
  rotateGitlabIntegrationWebhookSecret,
};
