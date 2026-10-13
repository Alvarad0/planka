// Encrypts a GitLab token for storage in the config table, with a key derived from SECRET_KEY

const { encrypt } = require('../../../utils/secret-box');

module.exports = {
  sync: true,

  inputs: {
    token: {
      type: 'string',
      required: true,
    },
  },

  fn(inputs) {
    return encrypt(inputs.token, {
      secret: sails.config.session.secret,
      context: Config.GITLAB_TOKEN_ENCRYPTION_CONTEXT,
    });
  },
};
