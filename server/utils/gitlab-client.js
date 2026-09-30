// The only module that talks HTTP to GitLab. Everything else goes through this client, so
// timeouts, proxying, authentication and error mapping live in one place.
//
// Security rules:
// - The token is sent only in the PRIVATE-TOKEN header.
// - The token never appears in error messages, logs or return values.
// - Only a normalized, operator-configured base URL is ever requested (see gitlab-url.js).

const { fetch, ProxyAgent } = require('undici');

const DEFAULT_TIMEOUT = 5000;

const ErrorCodes = {
  UNAVAILABLE: 'gitlabUnavailable',
  UNAUTHORIZED: 'gitlabUnauthorized',
  FORBIDDEN: 'gitlabForbidden',
  NOT_FOUND: 'gitlabNotFound',
  REQUEST_FAILED: 'gitlabRequestFailed',
};

class GitlabError extends Error {
  constructor(code, message, status) {
    super(message);

    this.name = 'GitlabError';
    this.code = code;
    this.status = status;
  }
}

const PROJECT_PATH_REGEX = /^[\w.-]+(\/[\w.-]+)+$/;

// Accepts a numeric ID or a full path like "company/erp". Dot segments are rejected because
// URL resolution would turn ".." into a request outside /projects.
const encodeProjectRef = (projectRef) => {
  const value = String(projectRef).trim();

  if (/^[1-9][0-9]*$/.test(value)) {
    return value;
  }

  const hasDotSegment = value.split('/').some((segment) => segment === '.' || segment === '..');

  if (!PROJECT_PATH_REGEX.test(value) || hasDotSegment) {
    throw new GitlabError(ErrorCodes.REQUEST_FAILED, 'Invalid GitLab project reference');
  }

  return encodeURIComponent(value);
};

const errorFromStatus = (status) => {
  if (status === 401) {
    return new GitlabError(ErrorCodes.UNAUTHORIZED, 'GitLab token is invalid or expired', status);
  }

  if (status === 403) {
    return new GitlabError(ErrorCodes.FORBIDDEN, 'GitLab token lacks permission', status);
  }

  if (status === 404) {
    return new GitlabError(ErrorCodes.NOT_FOUND, 'GitLab resource not found', status);
  }

  if (status >= 500) {
    return new GitlabError(ErrorCodes.UNAVAILABLE, `GitLab responded with ${status}`, status);
  }

  return new GitlabError(
    ErrorCodes.REQUEST_FAILED,
    `GitLab rejected the request (${status})`,
    status,
  );
};

const presentProject = (project) => ({
  id: project.id,
  name: project.name,
  pathWithNamespace: project.path_with_namespace,
  defaultBranch: project.default_branch,
  webUrl: project.web_url,
});

const createGitlabClient = ({
  baseUrl,
  token,
  proxyUrl,
  dispatcher,
  timeout = DEFAULT_TIMEOUT,
}) => {
  if (!baseUrl || !token) {
    throw new GitlabError(ErrorCodes.UNAVAILABLE, 'GitLab is not configured');
  }

  const requestDispatcher = dispatcher || (proxyUrl ? new ProxyAgent(proxyUrl) : undefined);

  const request = async (method, path) => {
    let response;
    try {
      response = await fetch(`${baseUrl}/api/v4${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'PRIVATE-TOKEN': token,
          'User-Agent': 'planka-gitlab-bridge',
        },
        dispatcher: requestDispatcher,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      const reason = error.name === 'TimeoutError' ? 'timed out' : 'is unreachable';

      throw new GitlabError(ErrorCodes.UNAVAILABLE, `GitLab ${reason}`);
    }

    if (!response.ok) {
      // Discard the body so the connection is released; its content is never used in messages
      if (response.body) {
        await response.body.cancel();
      }

      throw errorFromStatus(response.status);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new GitlabError(ErrorCodes.UNAVAILABLE, 'GitLab returned an invalid response');
    }
  };

  return {
    async getProject(projectRef) {
      const project = await request('GET', `/projects/${encodeProjectRef(projectRef)}`);

      return presentProject(project);
    },
  };
};

module.exports = {
  ErrorCodes,
  GitlabError,
  createGitlabClient,
};
