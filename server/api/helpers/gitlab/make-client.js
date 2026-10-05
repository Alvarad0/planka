const { createGitlabClient } = require('../../../utils/gitlab-client');

module.exports = {
  sync: true,

  exits: {
    gitlabNotConfigured: {},
  },

  fn() {
    const { gitlabUrl, gitlabToken, outgoingProxy } = sails.config.custom;

    if (!gitlabUrl || !gitlabToken) {
      throw 'gitlabNotConfigured';
    }

    return createGitlabClient({
      baseUrl: gitlabUrl,
      token: gitlabToken,
      proxyUrl: outgoingProxy,
    });
  },
};
