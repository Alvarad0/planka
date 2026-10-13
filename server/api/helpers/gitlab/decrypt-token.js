// Decrypts the stored GitLab token. A value that cannot be decrypted (tampered with, or SECRET_KEY
// changed since it was saved) is treated as not set: it returns null and logs a warning, never
// the value, so GitLab simply reports as not configured until the token is saved again.

const { decrypt } = require('../../../utils/secret-box');

module.exports = {
  sync: true,

  inputs: {
    encryptedToken: {
      type: 'string',
      allowNull: true,
    },
  },

  fn(inputs) {
    if (!inputs.encryptedToken) {
      return null;
    }

    try {
      return decrypt(inputs.encryptedToken, {
        secret: sails.config.session.secret,
        context: Config.GITLAB_TOKEN_ENCRYPTION_CONTEXT,
      });
    } catch (error) {
      sails.log.warn(
        'Stored GitLab token could not be decrypted (was SECRET_KEY changed?), treating it as not set',
      );

      return null;
    }
  },
};
