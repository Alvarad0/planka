// Resolves a card for the GitLab Bridge card endpoints and applies the core card permissions:
// - read: the same rule as cards/show.js (admins without an owner project manager, project
//   managers and board members);
// - requireEditor: the same rule as cards/update.js (board membership with the editor role).
//
// Non-members always get 'cardNotFound', so the card's existence is not disclosed.

module.exports = {
  inputs: {
    cardId: {
      type: 'string',
      required: true,
    },
    currentUser: {
      type: 'ref',
      required: true,
    },
    requireEditor: {
      type: 'boolean',
      defaultsTo: false,
    },
  },

  exits: {
    cardNotFound: {},
    notEnoughRights: {},
  },

  async fn(inputs) {
    const { currentUser } = inputs;

    const { card, list, board, project } = await sails.helpers.cards
      .getPathToProjectById(inputs.cardId)
      .intercept('pathNotFound', () => 'cardNotFound');

    if (inputs.requireEditor) {
      const boardMembership = await BoardMembership.qm.getOneByBoardIdAndUserId(
        board.id,
        currentUser.id,
      );

      if (!boardMembership) {
        throw 'cardNotFound'; // Forbidden
      }

      if (boardMembership.role !== BoardMembership.Roles.EDITOR) {
        throw 'notEnoughRights';
      }
    } else if (currentUser.role !== User.Roles.ADMIN || project.ownerProjectManagerId) {
      const isProjectManager = await sails.helpers.users.isProjectManager(
        currentUser.id,
        project.id,
      );

      if (!isProjectManager) {
        const boardMembership = await BoardMembership.qm.getOneByBoardIdAndUserId(
          card.boardId,
          currentUser.id,
        );

        if (!boardMembership) {
          throw 'cardNotFound'; // Forbidden
        }
      }
    }

    const gitlabIntegration = await GitlabIntegration.qm.getOneByProjectId(project.id);
    const gitlabCardLink = await GitlabCardLink.qm.getOneByCardId(card.id);

    return {
      card,
      list,
      board,
      project,
      gitlabIntegration,
      gitlabCardLink,
    };
  },
};
