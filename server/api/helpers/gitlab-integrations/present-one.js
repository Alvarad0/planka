module.exports = {
  sync: true,

  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
  },

  fn(inputs) {
    return _.omit(inputs.record, ['webhookSecretHash']);
  },
};
