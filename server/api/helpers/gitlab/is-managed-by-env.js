// GitLab is managed by env when both GITLAB_URL and GITLAB_TOKEN are set: they override the
// settings saved from the UI, which become read-only (like the SMTP env vars)

module.exports = {
  sync: true,

  fn() {
    return !!sails.config.custom.gitlabUrl && !!sails.config.custom.gitlabToken;
  },
};
