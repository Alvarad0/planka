import { attr, fk } from 'redux-orm';

import BaseModel from './BaseModel';
import ActionTypes from '../constants/ActionTypes';
import ErrorCodes from '../constants/ErrorCodes';

export default class extends BaseModel {
  static modelName = 'GitlabCardLink';

  static fields = {
    id: attr(),
    gitlabIntegrationId: attr(),
    issueId: attr(),
    issueIid: attr(),
    issueUrl: attr(),
    branchName: attr(),
    snapshot: attr(),
    lastSyncedAt: attr(),
    createdAt: attr(),
    updatedAt: attr(),
    cardId: fk({
      to: 'Card',
      as: 'card',
      relatedName: 'gitlabCardLinks',
    }),
  };

  static reducer({ type, payload }, GitlabCardLink) {
    switch (type) {
      case ActionTypes.GITLAB_CARD_LINK_FETCH__SUCCESS:
        if (payload.gitlabCardLink) {
          GitlabCardLink.upsert(payload.gitlabCardLink);
        } else {
          GitlabCardLink.filter({
            cardId: payload.cardId,
          }).delete();
        }

        break;
      case ActionTypes.GITLAB_CARD_LINK_FETCH__FAILURE:
      case ActionTypes.GITLAB_ISSUE_FROM_CARD_UNLINK__FAILURE:
        // Not found means that the card is no longer accessible or it is already unlinked
        if (payload.error.code === ErrorCodes.NOT_FOUND) {
          GitlabCardLink.filter({
            cardId: payload.cardId,
          }).delete();
        }

        break;
      case ActionTypes.GITLAB_ISSUE_FOR_CARD_CREATE__SUCCESS:
      case ActionTypes.GITLAB_ISSUE_TO_CARD_LINK__SUCCESS:
      case ActionTypes.GITLAB_CARD_LINK_CREATE_HANDLE:
        GitlabCardLink.upsert(payload.gitlabCardLink);

        break;
      case ActionTypes.GITLAB_ISSUE_FROM_CARD_UNLINK__SUCCESS:
      case ActionTypes.GITLAB_CARD_LINK_DELETE_HANDLE: {
        const gitlabCardLinkModel = GitlabCardLink.withId(payload.gitlabCardLink.id);

        if (gitlabCardLinkModel) {
          gitlabCardLinkModel.delete();
        }

        break;
      }
      default:
    }
  }
}
