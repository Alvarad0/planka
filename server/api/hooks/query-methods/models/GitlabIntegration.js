/* Query methods */

const createOne = (values) => GitlabIntegration.create({ ...values }).fetch();

const getOneById = (id) => GitlabIntegration.findOne(id);

const getOneByProjectId = (projectId) =>
  GitlabIntegration.findOne({
    projectId,
  });

const updateOne = (criteria, values) => GitlabIntegration.updateOne(criteria).set({ ...values });

const deleteOne = (criteria) => GitlabIntegration.destroyOne(criteria);

module.exports = {
  createOne,
  getOneById,
  getOneByProjectId,
  updateOne,
  deleteOne,
};
