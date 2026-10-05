import { call, put, select } from 'redux-saga/effects';

import request from '../request';
import selectors from '../../../selectors';
import actions from '../../../actions';
import api from '../../../api';

export function* fetchGitlabIntegration(projectId) {
  yield put(actions.fetchGitlabIntegration(projectId));

  let gitlabIntegration;
  let gitlabListOptions;

  try {
    ({
      item: gitlabIntegration,
      included: { gitlabListOptions },
    } = yield call(request, api.getGitlabIntegration, projectId));
  } catch (error) {
    // E_NOT_FOUND means that the project is not linked yet, the reducers handle it
    yield put(actions.fetchGitlabIntegration.failure(projectId, error));
    return;
  }

  yield put(
    actions.fetchGitlabIntegration.success(projectId, gitlabIntegration, gitlabListOptions),
  );
}

export function* fetchGitlabIntegrationInCurrentProject() {
  const { projectId } = yield select(selectors.selectPath);

  yield call(fetchGitlabIntegration, projectId);
}

export function* createGitlabIntegration(projectId, data) {
  yield put(actions.createGitlabIntegration(projectId, data));

  let gitlabIntegration;
  let gitlabListOptions;

  try {
    ({
      item: gitlabIntegration,
      included: { gitlabListOptions },
    } = yield call(request, api.createGitlabIntegration, projectId, data));
  } catch (error) {
    yield put(actions.createGitlabIntegration.failure(projectId, error));
    return;
  }

  yield put(actions.createGitlabIntegration.success(gitlabIntegration, gitlabListOptions));
}

export function* createGitlabIntegrationInCurrentProject(data) {
  const { projectId } = yield select(selectors.selectPath);

  yield call(createGitlabIntegration, projectId, data);
}

export function* updateGitlabIntegration(id, data) {
  yield put(actions.updateGitlabIntegration(id, data));

  let gitlabIntegration;
  try {
    ({ item: gitlabIntegration } = yield call(request, api.updateGitlabIntegration, id, data));
  } catch (error) {
    yield put(actions.updateGitlabIntegration.failure(id, error));
    return;
  }

  yield put(actions.updateGitlabIntegration.success(gitlabIntegration));
}

export function* deleteGitlabIntegration(id) {
  yield put(actions.deleteGitlabIntegration(id));

  let gitlabIntegration;
  try {
    ({ item: gitlabIntegration } = yield call(request, api.deleteGitlabIntegration, id));
  } catch (error) {
    yield put(actions.deleteGitlabIntegration.failure(id, error));
    return;
  }

  yield put(actions.deleteGitlabIntegration.success(gitlabIntegration));
}

export function* testGitlabIntegrationConnection(id) {
  yield put(actions.testGitlabIntegrationConnection(id));

  let gitlabIntegration;
  let gitlabProject;

  try {
    ({
      item: gitlabIntegration,
      included: { gitlabProject },
    } = yield call(request, api.testGitlabIntegrationConnection, id));
  } catch (error) {
    yield put(actions.testGitlabIntegrationConnection.failure(id, error));
    return;
  }

  yield put(actions.testGitlabIntegrationConnection.success(gitlabIntegration, gitlabProject));
}

export function* rotateGitlabIntegrationWebhookSecret(id) {
  yield put(actions.rotateGitlabIntegrationWebhookSecret(id));

  let gitlabIntegration;
  try {
    ({ item: gitlabIntegration } = yield call(
      request,
      api.rotateGitlabIntegrationWebhookSecret,
      id,
    ));
  } catch (error) {
    yield put(actions.rotateGitlabIntegrationWebhookSecret.failure(id, error));
    return;
  }

  yield put(actions.rotateGitlabIntegrationWebhookSecret.success(gitlabIntegration));
}

export default {
  fetchGitlabIntegration,
  fetchGitlabIntegrationInCurrentProject,
  createGitlabIntegration,
  createGitlabIntegrationInCurrentProject,
  updateGitlabIntegration,
  deleteGitlabIntegration,
  testGitlabIntegrationConnection,
  rotateGitlabIntegrationWebhookSecret,
};
