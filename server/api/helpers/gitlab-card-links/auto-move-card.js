// Moves the card of a link after its snapshot changed, when the merge request transition between
// the previous and the new snapshot asks for it (see utils/gitlab-transitions.js) and the link's
// integration enables it. Called by `updateOne` after every snapshot write.
//
// The card is moved as the GitLab bot user, to the end of the configured list, which may be on
// another board of the same project. Nothing happens when the option is off, the list is unset or
// gone, the card already is in it, the card is archived or trashed (never resurrected), or the
// card was moved to another project. The card is loaded fresh, so of two concurrent syncs seeing
// the same transition, the second finds it already in the list.
//
// Returns the moved card, or null when it was not moved.

const { POSITION_GAP } = require('../../../constants');
const { MoveTargets, detectMoveTarget } = require('../../../utils/gitlab-transitions');
const { getBotUser } = require('../../../utils/gitlab-bot-user');

const getTargetListId = (gitlabIntegration, moveTarget) => {
  switch (moveTarget) {
    case MoveTargets.REVIEW:
      return gitlabIntegration.autoMoveOnMrOpen ? gitlabIntegration.reviewListId : null;
    case MoveTargets.COMPLETED:
      return gitlabIntegration.autoMoveOnMrMerge ? gitlabIntegration.completedListId : null;
    default:
      return null;
  }
};

// Same as appending in the client: after the last card of the list
const getAppendPosition = async (list, cardId) => {
  const cards = await Card.qm.getByListId(list.id, {
    exceptIdOrIds: cardId,
  });

  const lastCard = _.last(cards);

  return (lastCard ? lastCard.position : 0) + POSITION_GAP;
};

module.exports = {
  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
    prevSnapshot: {
      type: 'ref',
    },
  },

  async fn(inputs) {
    const { record } = inputs;

    const moveTarget = detectMoveTarget(inputs.prevSnapshot, record.snapshot);

    if (!moveTarget) {
      return null;
    }

    const gitlabIntegration = await GitlabIntegration.qm.getOneById(record.gitlabIntegrationId);

    if (!gitlabIntegration) {
      return null;
    }

    const targetListId = getTargetListId(gitlabIntegration, moveTarget);

    if (!targetListId) {
      return null;
    }

    const path = await sails.helpers.cards
      .getPathToProjectById(record.cardId)
      .tolerate('pathNotFound', () => null);

    if (!path) {
      return null;
    }

    const { card, list, board, project } = path;

    // The card was moved to another project, whose lists the integration does not configure
    if (project.id !== gitlabIntegration.projectId) {
      return null;
    }

    if (card.listId === targetListId || sails.helpers.lists.isArchiveOrTrash(list)) {
      return null;
    }

    // The list may have been deleted meanwhile (the integration is cleared by the foreign key)
    const targetList = await List.qm.getOneById(targetListId);

    if (!targetList || !sails.helpers.lists.isFinite(targetList)) {
      return null;
    }

    const targetBoard =
      targetList.boardId === board.id ? board : await Board.qm.getOneById(targetList.boardId);

    if (!targetBoard || targetBoard.projectId !== project.id) {
      return null;
    }

    const botUser = await getBotUser();

    if (!botUser) {
      return null;
    }

    const movedCard = await sails.helpers.cards.updateOne.with({
      project,
      board,
      list,
      record: card,
      values: {
        board: targetBoard,
        list: targetList,
        position: await getAppendPosition(targetList, card.id),
      },
      actorUser: botUser,
    });

    if (movedCard) {
      sails.log.info(
        `GitLab Bridge moved card ${card.id} to list ${targetList.id} (merge request ${moveTarget})`,
      );
    }

    return movedCard || null;
  },
};
