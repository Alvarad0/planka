import { attr, fk } from 'redux-orm';

import BaseModel from './BaseModel';
import ActionTypes from '../constants/ActionTypes';
import ErrorCodes from '../constants/ErrorCodes';

// Users come with knowledge transfers (assignees and explainers, public fields only). They are
// upserted here rather than in the User model, so the core model stays untouched.
const upsertUsers = (User, users) => {
  if (users) {
    users.forEach((user) => {
      User.upsert(user);
    });
  }
};

export default class extends BaseModel {
  static modelName = 'KnowledgeTransfer';

  static fields = {
    id: attr(),
    userId: attr(),
    isExplained: attr(),
    explainedByUserId: attr(),
    explainedAt: attr(),
    creatorUserId: attr(),
    createdAt: attr(),
    updatedAt: attr(),
    cardId: fk({
      to: 'Card',
      as: 'card',
      relatedName: 'knowledgeTransfers',
    }),
  };

  static reducer({ type, payload }, KnowledgeTransfer, { User }) {
    switch (type) {
      case ActionTypes.KNOWLEDGE_TRANSFERS_FETCH__SUCCESS:
        upsertUsers(User, payload.users);

        // The server list is complete, so items removed meanwhile are dropped
        KnowledgeTransfer.filter({
          cardId: payload.cardId,
        }).delete();

        payload.knowledgeTransfers.forEach((knowledgeTransfer) => {
          KnowledgeTransfer.upsert(knowledgeTransfer);
        });

        break;
      case ActionTypes.KNOWLEDGE_TRANSFERS_FETCH__FAILURE:
        // Not found means that the card is no longer accessible
        if (payload.error.code === ErrorCodes.NOT_FOUND) {
          KnowledgeTransfer.filter({
            cardId: payload.cardId,
          }).delete();
        }

        break;
      case ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH__SUCCESS:
        upsertUsers(User, payload.users);

        break;
      case ActionTypes.KNOWLEDGE_TRANSFER_CREATE__SUCCESS:
      case ActionTypes.KNOWLEDGE_TRANSFER_CREATE_HANDLE:
      case ActionTypes.KNOWLEDGE_TRANSFER_UPDATE__SUCCESS:
      case ActionTypes.KNOWLEDGE_TRANSFER_UPDATE_HANDLE:
        upsertUsers(User, payload.users);
        KnowledgeTransfer.upsert(payload.knowledgeTransfer);

        break;
      case ActionTypes.KNOWLEDGE_TRANSFER_UPDATE__FAILURE:
      case ActionTypes.KNOWLEDGE_TRANSFER_DELETE__FAILURE:
        // Not found means that it was removed meanwhile or is no longer accessible
        if (payload.error.code === ErrorCodes.NOT_FOUND) {
          const knowledgeTransferModel = KnowledgeTransfer.withId(payload.id);

          if (knowledgeTransferModel) {
            knowledgeTransferModel.delete();
          }
        }

        break;
      case ActionTypes.KNOWLEDGE_TRANSFER_DELETE__SUCCESS:
      case ActionTypes.KNOWLEDGE_TRANSFER_DELETE_HANDLE: {
        const knowledgeTransferModel = KnowledgeTransfer.withId(payload.knowledgeTransfer.id);

        if (knowledgeTransferModel) {
          knowledgeTransferModel.delete();
        }

        break;
      }
      default:
    }
  }
}
