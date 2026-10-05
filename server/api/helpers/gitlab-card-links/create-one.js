module.exports = {
  inputs: {
    values: {
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

  exits: {
    // Either the card or the issue is already linked (unique constraints)
    alreadyLinked: {},
  },

  async fn(inputs) {
    let gitlabCardLink;
    try {
      gitlabCardLink = await GitlabCardLink.qm.createOne(inputs.values);
    } catch (error) {
      if (error.code === 'E_UNIQUE') {
        throw 'alreadyLinked';
      }

      throw error;
    }

    sails.sockets.broadcast(
      `board:${inputs.board.id}`,
      'gitlabCardLinkCreate',
      {
        item: sails.helpers.gitlabCardLinks.presentOne(gitlabCardLink),
      },
      inputs.request,
    );

    return gitlabCardLink;
  },
};
