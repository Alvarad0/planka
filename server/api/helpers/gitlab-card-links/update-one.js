module.exports = {
  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
    values: {
      type: 'ref',
      required: true,
    },
    // Extra criteria the stored link must still match (e.g. { branchName: null }), so concurrent
    // updates do not overwrite each other
    conditions: {
      type: 'ref',
      defaultsTo: {},
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
    const gitlabCardLink = await GitlabCardLink.qm.updateOne(
      {
        ...inputs.conditions,
        id: inputs.record.id,
      },
      inputs.values,
    );

    if (gitlabCardLink) {
      sails.sockets.broadcast(
        `board:${inputs.board.id}`,
        'gitlabCardLinkUpdate',
        {
          item: sails.helpers.gitlabCardLinks.presentOne(gitlabCardLink),
        },
        inputs.request,
      );
    }

    return gitlabCardLink;
  },
};
