// Effective GitLab connection settings: the single place that decides which URL and token the
// GitLab Bridge uses.
//
// GITLAB_URL + GITLAB_TOKEN (both set) take precedence and make the settings read-only in the UI,
// like the SMTP env vars. Otherwise the values saved from the Administration modal are used. They
// are read on every call (one primary-key query), so changes take effect without a restart and
// stay consistent across processes.
//
// Returns { url, token, source }, where source is 'env', 'db' or null (not configured).

module.exports = {
  async fn() {
    if (sails.helpers.gitlab.isManagedByEnv()) {
      return {
        url: sails.config.custom.gitlabUrl,
        token: sails.config.custom.gitlabToken,
        source: 'env',
      };
    }

    const config = await Config.qm.getOneMain();

    const url = config && config.gitlabUrl;
    const token = config && sails.helpers.gitlab.decryptToken(config.gitlabToken);

    if (!url || !token) {
      return {
        url: null,
        token: null,
        source: null,
      };
    }

    return {
      url,
      token,
      source: 'db',
    };
  },
};
