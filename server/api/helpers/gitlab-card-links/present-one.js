// Holds no secrets today; kept so every GitLab Bridge record goes through a presenter. It hides
// internal fields.
module.exports = {
  sync: true,

  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
  },

  fn(inputs) {
    // lastSyncAttemptedAt is internal to the periodic sync
    return _.omit(inputs.record, ['lastSyncAttemptedAt']);
  },
};
