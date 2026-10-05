// Holds no secrets today; kept so every GitLab Bridge record goes through a presenter.
module.exports = {
  sync: true,

  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
  },

  fn(inputs) {
    return {
      ...inputs.record,
    };
  },
};
