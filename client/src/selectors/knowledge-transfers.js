import { createSelector } from 'redux-orm';

import orm from '../orm';
import { selectPath } from './router';

export const selectKnowledgeTransfersForCurrentCard = createSelector(
  orm,
  (state) => selectPath(state).cardId,
  ({ Card }, id) => {
    if (!id) {
      return id;
    }

    const cardModel = Card.withId(id);

    if (!cardModel) {
      return cardModel;
    }

    return cardModel.knowledgeTransfers.orderBy(['id.length', 'id']).toRefArray();
  },
);

export const selectKnowledgeTransferState = ({ ui: { knowledgeTransferState } }) =>
  knowledgeTransferState;

// Active users that can still be assigned to the current card, once fetched (null until then)
export const selectKnowledgeTransferCandidatesForCurrentCard = createSelector(
  orm,
  (state) => selectPath(state).cardId,
  (state) => selectKnowledgeTransferState(state).candidateUserIds,
  ({ Card, User }, cardId, candidateUserIds) => {
    if (!cardId || !candidateUserIds) {
      return null;
    }

    const cardModel = Card.withId(cardId);

    const assignedUserIds = new Set(
      cardModel ? cardModel.knowledgeTransfers.toRefArray().map(({ userId }) => userId) : [],
    );

    return candidateUserIds
      .map((userId) => User.withId(userId))
      .filter(
        (userModel) => userModel && !userModel.isDeactivated && !assignedUserIds.has(userModel.id),
      )
      .map((userModel) => userModel.ref)
      .sort((user1, user2) => user1.name.localeCompare(user2.name));
  },
);

export default {
  selectKnowledgeTransfersForCurrentCard,
  selectKnowledgeTransferState,
  selectKnowledgeTransferCandidatesForCurrentCard,
};
