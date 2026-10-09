// Every knowledge transfer leaves the server through this presenter, so new internal columns are
// never exposed by accident.

const FIELD_NAMES = [
  'id',
  'cardId',
  'userId',
  'isExplained',
  'explainedByUserId',
  'explainedAt',
  'creatorUserId',
  'createdAt',
  'updatedAt',
];

module.exports = {
  sync: true,

  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
  },

  fn(inputs) {
    return _.pick(inputs.record, FIELD_NAMES);
  },
};
