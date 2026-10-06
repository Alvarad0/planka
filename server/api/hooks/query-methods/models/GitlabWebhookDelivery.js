/* Query methods */

const createOne = (values) => GitlabWebhookDelivery.create({ ...values }).fetch();

const getOneById = (id) => GitlabWebhookDelivery.findOne(id);

const getOneByEventUuid = (eventUuid) =>
  GitlabWebhookDelivery.findOne({
    eventUuid,
  });

const updateOne = (criteria, values) =>
  GitlabWebhookDelivery.updateOne(criteria).set({ ...values });

// Deletes deliveries received before `createdBefore` (an ISO string; see
// GitlabCardLink.getStaleByAttemptOrder about time zones) and returns how many were deleted
const deleteCreatedBefore = async (createdBefore) => {
  const queryResult = await sails.sendNativeQuery(
    'DELETE FROM gitlab_webhook_delivery WHERE created_at < $1',
    [createdBefore],
  );

  return queryResult.rowCount;
};

module.exports = {
  createOne,
  getOneById,
  getOneByEventUuid,
  updateOne,
  deleteCreatedBefore,
};
