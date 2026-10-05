/* Query methods */

const createOne = (values) => GitlabCardLink.create({ ...values }).fetch();

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
  getOneById,
  getOneByCardId,
  getOneByIntegrationIdAndIssueIid,
  getOneByIntegrationIdAndBranchName,
  updateOne,
  deleteOne,
};
