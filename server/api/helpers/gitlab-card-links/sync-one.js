// Refreshes a card link from GitLab: fetches the full summary from the GitLab project of the
// link's own integration (which differs from the card's current one when the card was moved),
// stores it as the snapshot and broadcasts the updated link to the card's board.
//
// It never patches the snapshot from partial data (e.g. a webhook payload): GitLab does not
// guarantee event order, so only a fresh read of the current state is written.
//
// On a GitLab failure it throws (an error accepted by `isGitlabFailure`) and writes nothing.
// Returns null when there is nothing to update: the link, its integration or its card is gone,
// or the link was changed concurrently (e.g. a branch was created) while GitLab was being read.

const { fetchSummary } = require('../../../utils/gitlab-summary');
const { buildSnapshot } = require('../../../utils/gitlab-snapshot');

const NOT_CONFIGURED_CODE = 'gitlabNotConfigured';

// Exits of a nested helper reach callers of this helper wrapped as internal errors, so the
// "not configured" exit is converted into a plain error the GitLab error mapping understands
const makeClient = () => {
  try {
    return sails.helpers.gitlab.makeClient();
  } catch (error) {
    if (error.code === NOT_CONFIGURED_CODE) {
      const notConfiguredError = new Error('GitLab is not configured');
      notConfiguredError.code = NOT_CONFIGURED_CODE;

      throw notConfiguredError;
    }

    throw error;
  }
};

module.exports = {
  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
    request: {
      type: 'ref',
    },
  },

  async fn(inputs) {
    const { record } = inputs;

    const linkIntegration = await GitlabIntegration.qm.getOneById(record.gitlabIntegrationId);

    // Foreign keys cascade, so the link is gone as well
    if (!linkIntegration) {
      return null;
    }

    const card = await Card.qm.getOneById(record.cardId);

    if (!card) {
      return null;
    }

    const client = makeClient();
    const summary = await fetchSummary(client, linkIntegration, record);

    return sails.helpers.gitlabCardLinks.updateOne.with({
      record,
      values: {
        snapshot: buildSnapshot(summary),
        lastSyncedAt: new Date().toISOString(),
      },
      // The summary describes the branch (or no branch) it was fetched for
      conditions: {
        branchName: record.branchName,
      },
      board: {
        id: card.boardId,
      },
      request: inputs.request,
    });
  },
};
