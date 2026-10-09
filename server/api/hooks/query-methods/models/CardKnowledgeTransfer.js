const defaultFind = (criteria) => CardKnowledgeTransfer.find(criteria).sort('id');

/* Query methods */

const createOne = (values) => CardKnowledgeTransfer.create({ ...values }).fetch();

const getByCardId = (cardId) =>
  defaultFind({
    cardId,
  });

const getOneById = (id) => CardKnowledgeTransfer.findOne(id);

const updateOne = (criteria, values) =>
  CardKnowledgeTransfer.updateOne(criteria).set({ ...values });

const deleteOne = (criteria) => CardKnowledgeTransfer.destroyOne(criteria);

module.exports = {
  createOne,
  getByCardId,
  getOneById,
  updateOne,
  deleteOne,
};
