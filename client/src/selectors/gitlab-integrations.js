import { createSelector } from 'redux-orm';

import orm from '../orm';
import { selectPath } from './router';

export const selectGitlabIntegrationForCurrentProject = createSelector(
  orm,
  (state) => selectPath(state).projectId,
  ({ Project }, id) => {
    if (!id) {
      return id;
    }

    const projectModel = Project.withId(id);

    if (!projectModel) {
      return projectModel;
    }

    const gitlabIntegrationModel = projectModel.gitlabIntegrations.first();

    return gitlabIntegrationModel ? gitlabIntegrationModel.ref : null;
  },
);

export const selectGitlabIntegrationState = ({ ui: { gitlabIntegrationState } }) =>
  gitlabIntegrationState;

export default {
  selectGitlabIntegrationForCurrentProject,
  selectGitlabIntegrationState,
};
