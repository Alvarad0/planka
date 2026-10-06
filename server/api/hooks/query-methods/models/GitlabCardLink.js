const { makeRowToModelTransformer } = require('../helpers');

const transformRowToModel = makeRowToModelTransformer(GitlabCardLink);

/* Query methods */

const createOne = (values) => GitlabCardLink.create({ ...values }).fetch();

const getByIntegrationId = (gitlabIntegrationId) =>
  GitlabCardLink.find({
    gitlabIntegrationId,
  }).sort('id');

// Stale links: never synced or last synced before `syncedBefore` (an ISO string). Ordered by the
// last sync attempt (never attempted first), so links that keep failing rotate to the back
// instead of starving the others. Raw SQL because Waterline cannot sort NULLs first. Timestamps
// are stored as UTC in columns without time zone, and Postgres ignores the offset of an ISO
// string cast to them.
const getStaleByAttemptOrder = async (syncedBefore, limit) => {
  const queryResult = await sails.sendNativeQuery(
    'SELECT * FROM gitlab_card_link WHERE last_synced_at IS NULL OR last_synced_at < $1 ' +
      'ORDER BY last_sync_attempted_at ASC NULLS FIRST, id ASC LIMIT $2',
    [syncedBefore, limit],
  );

  return queryResult.rows.map((row) => transformRowToModel(row));
};

const getOneById = (id) => GitlabCardLink.findOne(id);

const getOneByCardId = (cardId) =>
  GitlabCardLink.findOne({
    cardId,
  });

const getOneByIntegrationIdAndIssueIid = (gitlabIntegrationId, issueIid) =>
  GitlabCardLink.findOne({
    gitlabIntegrationId,
    issueIid,
  });

const getOneByIntegrationIdAndBranchName = (gitlabIntegrationId, branchName) =>
  GitlabCardLink.findOne({
    gitlabIntegrationId,
    branchName,
  });

const updateOne = (criteria, values) => GitlabCardLink.updateOne(criteria).set({ ...values });

const deleteOne = (criteria) => GitlabCardLink.destroyOne(criteria);

module.exports = {
  createOne,
  getByIntegrationId,
  getStaleByAttemptOrder,
  getOneById,
  getOneByCardId,
  getOneByIntegrationIdAndIssueIid,
  getOneByIntegrationIdAndBranchName,
  updateOne,
  deleteOne,
};
