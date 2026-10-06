// Updates a card link. This is the single place where a link's snapshot is written after it was
// created: a snapshot write also compares the new snapshot with the stored one and moves the card
// when the merge request transition asks for it (see `autoMoveCard`).
//
// The move runs after the write and is failure-isolated: an error is logged and never fails the
// caller (card view, sync, webhook, merge request creation).

const { resetBotUserCache } = require('../../../utils/gitlab-bot-user');

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
    // The card view refreshes the snapshot on every read and answers with it, without telling
    // the board
    isBroadcastSkipped: {
      type: 'boolean',
      defaultsTo: false,
    },
    request: {
      type: 'ref',
    },
  },

  async fn(inputs) {
    const criteria = {
      ...inputs.conditions,
      id: inputs.record.id,
    };

    const isSnapshotUpdate = !_.isUndefined(inputs.values.snapshot);

    let gitlabCardLink;
    let prevSnapshot;
    if (isSnapshotUpdate) {
      ({ gitlabCardLink, prevSnapshot } = await GitlabCardLink.qm.updateOneWithPrevSnapshot(
        criteria,
        inputs.values,
      ));
    } else {
      gitlabCardLink = await GitlabCardLink.qm.updateOne(criteria, inputs.values);
    }

    if (!gitlabCardLink) {
      return gitlabCardLink;
    }

    if (!inputs.isBroadcastSkipped) {
      sails.sockets.broadcast(
        `board:${inputs.board.id}`,
        'gitlabCardLinkUpdate',
        {
          item: sails.helpers.gitlabCardLinks.presentOne(gitlabCardLink),
        },
        inputs.request,
      );
    }

    if (isSnapshotUpdate) {
      try {
        await sails.helpers.gitlabCardLinks.autoMoveCard.with({
          prevSnapshot,
          record: gitlabCardLink,
        });
      } catch (error) {
        // The cached bot user may be the cause (e.g. it was deleted), so it is resolved again
        resetBotUserCache();

        sails.log.error(
          `GitLab Bridge could not move card ${gitlabCardLink.cardId} automatically ` +
            `(link: ${gitlabCardLink.id}): ${error && error.stack}`,
        );
      }
    }

    return gitlabCardLink;
  },
};
