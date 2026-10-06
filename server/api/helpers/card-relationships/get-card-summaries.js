// Loads cards for the card relationship views and decides, in a fixed number of queries, which of
// them the current user can read. The rule is the one of cards/show.js: admins (unless the project
// has an owner project manager), project managers of the card's project and members of the card's
// board.
//
// Returns { cardsById, summariesById }: cardsById holds every existing card, summariesById maps
// each existing card id to its summary, or to null when the user cannot read it (so nothing about
// it, such as its name, is disclosed). Ids of missing cards are absent from both.

module.exports = {
  inputs: {
    cardIds: {
      type: 'ref',
      required: true,
    },
    currentUser: {
      type: 'ref',
      required: true,
    },
  },

  async fn(inputs) {
    const { currentUser } = inputs;

    const cardIds = _.uniq(inputs.cardIds);

    if (cardIds.length === 0) {
      return {
        cardsById: {},
        summariesById: {},
      };
    }

    const cards = await Card.qm.getByIds(cardIds);

    const boardIds = sails.helpers.utils.mapRecords(cards, 'boardId', true);
    const listIds = sails.helpers.utils.mapRecords(cards, 'listId', true);

    const boards = await Board.qm.getByIds(boardIds);
    const lists = await List.qm.getByIds(listIds);

    const projectIds = sails.helpers.utils.mapRecords(boards, 'projectId', true);
    const projects = await Project.qm.getByIds(projectIds);

    const boardMemberships = await BoardMembership.qm.getByBoardIdsAndUserId(
      boardIds,
      currentUser.id,
    );

    const projectManagers = await ProjectManager.qm.getByUserId(currentUser.id);

    const boardsById = _.keyBy(boards, 'id');
    const listsById = _.keyBy(lists, 'id');
    const projectsById = _.keyBy(projects, 'id');
    const memberBoardIds = new Set(sails.helpers.utils.mapRecords(boardMemberships, 'boardId'));
    const managedProjectIds = new Set(sails.helpers.utils.mapRecords(projectManagers, 'projectId'));

    const canReadBoard = (board) => {
      const project = projectsById[board.projectId];

      if (!project) {
        return false;
      }

      if (currentUser.role === User.Roles.ADMIN && !project.ownerProjectManagerId) {
        return true;
      }

      return managedProjectIds.has(project.id) || memberBoardIds.has(board.id);
    };

    const cardsById = {};
    const summariesById = {};

    cards.forEach((card) => {
      cardsById[card.id] = card;

      const board = boardsById[card.boardId];

      if (!board || !canReadBoard(board)) {
        summariesById[card.id] = null;
        return;
      }

      const list = listsById[card.listId];

      summariesById[card.id] = {
        id: card.id,
        name: card.name,
        isClosed: card.isClosed,
        boardId: board.id,
        boardName: board.name,
        listName: list ? list.name : null,
      };
    });

    return {
      cardsById,
      summariesById,
    };
  },
};
