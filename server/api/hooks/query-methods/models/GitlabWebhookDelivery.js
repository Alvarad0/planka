/* Query methods */

const createOne = (values) => GitlabWebhookDelivery.create({ ...values }).fetch();

const getOneById = (id) => GitlabWebhookDelivery.findOne(id);

const getOneByEventUuid = (eventUuid) =>
  GitlabWebhookDelivery.findOne({
    eventUuid,
  });

const updateOne = (criteria, values) =>
  GitlabWebhookDelivery.updateOne(criteria).set({ ...values });

module.exports = {
  createOne,
  getOneById,
  getOneByEventUuid,
  updateOne,
};
