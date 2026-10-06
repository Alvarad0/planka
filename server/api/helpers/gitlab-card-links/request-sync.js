// Coalesced `syncOne` by link id, for event-driven synchronization (webhooks).
//
// Events arrive in bursts (a pipeline goes pending → running → success within seconds). While a
// sync of a link is in flight, further requests mark it dirty and exactly one more sync runs
// after it, instead of running concurrently. Every run reloads the link, so it uses its current
// branch and integration.
//
// The coalescing is per process: with several Planka processes a link may still be synced twice
// at once, which is harmless because every sync writes a full, freshly read snapshot.

const { createCoalescer } = require('../../../utils/coalescer');

const coalescer = createCoalescer();

module.exports = {
  inputs: {
    id: {
      type: 'string',
      required: true,
    },
  },

  async fn(inputs) {
    return coalescer.run(inputs.id, async () => {
      const gitlabCardLink = await GitlabCardLink.qm.getOneById(inputs.id);

      if (!gitlabCardLink) {
        return null;
      }

      return sails.helpers.gitlabCardLinks.syncOne.with({
        record: gitlabCardLink,
      });
    });
  },
};
