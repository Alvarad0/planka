module.exports = {
  inputs: {
    projectId: {
      type: 'string',
      required: true,
    },
  },

  async fn(inputs) {
    const boards = await Board.qm.getByProjectId(inputs.projectId);

    // One query per board keeps list ordering from the query method (boards are few per project)
    const listsByBoard = await Promise.all(
      boards.map((board) =>
        List.qm.getByBoardId(board.id, {
          typeOrTypes: List.FINITE_TYPES,
        }),
      ),
    );

    return boards.flatMap((board, index) =>
      listsByBoard[index].map((list) => ({
        id: list.id,
        name: list.name,
        type: list.type,
        boardId: board.id,
        boardName: board.name,
      })),
    );
  },
};
