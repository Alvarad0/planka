module.exports = {
  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
    board: {
      type: 'ref',
      required: true,
    },
    request: {
      type: 'ref',
    },
  },

  async fn(inputs) {
    const gitlabCardLink = await GitlabCardLink.qm.deleteOne(inputs.record.id);

    if (gitlabCardLink) {
      sails.sockets.broadcast(
        `board:${inputs.board.id}`,
        'gitlabCardLinkDelete',
        {
          item: sails.helpers.gitlabCardLinks.presentOne(gitlabCardLink),
        },
        inputs.request,
      );
    }

    return gitlabCardLink;
  },
};
