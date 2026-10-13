const { createGitlabClient } = require('../../../utils/gitlab-client');

module.exports = {
  exits: {
    gitlabNotConfigured: {},
  },

  async fn() {
    const { url, token } = await sails.helpers.gitlab.getSettings();

    if (!url || !token) {
      throw 'gitlabNotConfigured';
    }

    return createGitlabClient({
      baseUrl: url,
      token,
      proxyUrl: sails.config.custom.outgoingProxy,
    });
  },
};
