const { URL } = require('url');

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

// The GitLab URL is operator configuration (GITLAB_URL, or the admin-only setting in the UI), never
// input of regular users. Normalizing it keeps every API call pointed at a single, known host.
const normalizeGitlabUrl = (value) => {
  if (!value || !value.trim()) {
    return null;
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch (error) {
    throw new Error('GITLAB_URL is not a valid URL');
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new Error('GITLAB_URL must use http or https');
  }

  if (url.username || url.password) {
    throw new Error('GITLAB_URL must not contain credentials');
  }

  if (url.search || url.hash) {
    throw new Error('GITLAB_URL must not contain a query string or fragment');
  }

  // Keep the path to support GitLab served under a subpath (e.g. https://example.com/gitlab)
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
};

module.exports = {
  normalizeGitlabUrl,
};
