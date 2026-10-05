import { createSelector } from 'redux-orm';

import orm from '../orm';
import { selectPath } from './router';

export const selectGitlabCardLinkForCurrentCard = createSelector(
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

    const gitlabCardLinkModel = cardModel.gitlabCardLinks.first();

    return gitlabCardLinkModel ? gitlabCardLinkModel.ref : null;
  },
);

export const selectGitlabCardLinkState = ({ ui: { gitlabCardLinkState } }) => gitlabCardLinkState;

export default {
  selectGitlabCardLinkForCurrentCard,
  selectGitlabCardLinkState,
};
