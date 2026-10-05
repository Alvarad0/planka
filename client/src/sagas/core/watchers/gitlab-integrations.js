import { all, takeEvery } from 'redux-saga/effects';

import services from '../services';
import EntryActionTypes from '../../../constants/EntryActionTypes';

export default function* gitlabIntegrationsWatchers() {
  yield all([
    takeEvery(EntryActionTypes.GITLAB_INTEGRATION_IN_CURRENT_PROJECT_FETCH, () =>
      services.fetchGitlabIntegrationInCurrentProject(),
    ),
    takeEvery(
      EntryActionTypes.GITLAB_INTEGRATION_IN_CURRENT_PROJECT_CREATE,
      ({ payload: { data } }) => services.createGitlabIntegrationInCurrentProject(data),
    ),
    takeEvery(EntryActionTypes.GITLAB_INTEGRATION_UPDATE, ({ payload: { id, data } }) =>
      services.updateGitlabIntegration(id, data),
    ),
    takeEvery(EntryActionTypes.GITLAB_INTEGRATION_DELETE, ({ payload: { id } }) =>
      services.deleteGitlabIntegration(id),
    ),
    takeEvery(EntryActionTypes.GITLAB_INTEGRATION_CONNECTION_TEST, ({ payload: { id } }) =>
      services.testGitlabIntegrationConnection(id),
    ),
    takeEvery(EntryActionTypes.GITLAB_INTEGRATION_WEBHOOK_SECRET_ROTATE, ({ payload: { id } }) =>
      services.rotateGitlabIntegrationWebhookSecret(id),
    ),
  ]);
}
