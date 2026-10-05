import { attr, fk } from 'redux-orm';

import BaseModel from './BaseModel';
import { LOCATION_CHANGE_HANDLE } from '../lib/redux-router';
import ActionTypes from '../constants/ActionTypes';
import ErrorCodes from '../constants/ErrorCodes';

export default class extends BaseModel {
  static modelName = 'GitlabIntegration';

  static fields = {
    id: attr(),
    gitlabProjectId: attr(),
    gitlabProjectPath: attr(),
    defaultBranch: attr(),
    reviewListId: attr(),
    completedListId: attr(),
    autoMoveOnMrOpen: attr(),
    autoMoveOnMrMerge: attr(),
    lastSyncedAt: attr(),
    webhookUrl: attr(),
    // Present only right after create or rotate, cleared when the modal closes
    webhookSecret: attr({
      getDefault: () => null,
    }),
    createdAt: attr(),
    updatedAt: attr(),
    projectId: fk({
      to: 'Project',
      as: 'project',
      relatedName: 'gitlabIntegrations',
    }),
  };

  static reducer({ type, payload }, GitlabIntegration) {
    switch (type) {
      case LOCATION_CHANGE_HANDLE:
      case ActionTypes.MODAL_CLOSE:
        GitlabIntegration.all()
          .toModelArray()
          .forEach((gitlabIntegrationModel) => {
            if (gitlabIntegrationModel.webhookSecret) {
              gitlabIntegrationModel.update({
                webhookSecret: null,
              });
            }
          });

        break;
      case ActionTypes.GITLAB_INTEGRATION_FETCH__SUCCESS:
      case ActionTypes.GITLAB_INTEGRATION_CREATE__SUCCESS:
      case ActionTypes.GITLAB_INTEGRATION_UPDATE__SUCCESS:
      case ActionTypes.GITLAB_INTEGRATION_CONNECTION_TEST__SUCCESS:
      case ActionTypes.GITLAB_INTEGRATION_WEBHOOK_SECRET_ROTATE__SUCCESS:
        GitlabIntegration.upsert(payload.gitlabIntegration);

        break;
      case ActionTypes.GITLAB_INTEGRATION_FETCH__FAILURE:
        if (payload.error.code === ErrorCodes.NOT_FOUND) {
          GitlabIntegration.filter({
            projectId: payload.projectId,
          }).delete();
        }

        break;
      case ActionTypes.GITLAB_INTEGRATION_DELETE__SUCCESS: {
        const gitlabIntegrationModel = GitlabIntegration.withId(payload.gitlabIntegration.id);

        if (gitlabIntegrationModel) {
          gitlabIntegrationModel.delete();
        }

        break;
      }
      default:
    }
  }
}
