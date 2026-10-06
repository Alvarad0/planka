import { createSelector } from 'redux-orm';

import orm from '../orm';
import { selectPath } from './router';
import { selectCurrentUserId } from './users';
import { BoardMembershipRoles } from '../constants/Enums';

export const selectCardRelationshipState = ({ ui: { cardRelationshipState } }) =>
  cardRelationshipState;

// Cards that can be related to the current card: the loaded cards of the current project's boards
// where the current user is an editor, as the server requires editing rights on both cards
export const selectCardsForCardRelationshipInCurrentCard = createSelector(
  orm,
  (state) => selectPath(state).projectId,
  (state) => selectPath(state).cardId,
  (state) => selectCurrentUserId(state),
  ({ Project }, projectId, cardId, currentUserId) => {
    if (!projectId) {
      return [];
    }

    const projectModel = Project.withId(projectId);

    if (!projectModel) {
      return [];
    }

    return projectModel
      .getBoardsQuerySet()
      .toModelArray()
      .filter((boardModel) => {
        const boardMembershipModel = boardModel.getMembershipModelByUserId(currentUserId);

        return !!boardMembershipModel && boardMembershipModel.role === BoardMembershipRoles.EDITOR;
      })
      .flatMap((boardModel) =>
        boardModel
          .getCardsModelArray()
          .filter((cardModel) => cardModel.id !== cardId)
          .map((cardModel) => ({
            id: cardModel.id,
            name: cardModel.name,
            boardId: boardModel.id,
            boardName: boardModel.name,
          })),
      );
  },
);

export default {
  selectCardRelationshipState,
  selectCardsForCardRelationshipInCurrentCard,
};
