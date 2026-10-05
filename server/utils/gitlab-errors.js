// Shared mapping from GitLab failures to controller errors.
//
// GitLab problems are always answered with 422: a 401 would make the Planka client log the user
// out, although it is the GitLab token (not the Planka session) that is wrong. Messages are fixed
// strings, so neither tokens nor GitLab response bodies can reach the client.

const { ErrorCodes } = require('./gitlab-client');

const NOT_CONFIGURED_CODE = 'gitlabNotConfigured';

const GitlabErrors = {
  GITLAB_NOT_CONFIGURED: {
    gitlabNotConfigured: 'GitLab is not configured',
  },
  GITLAB_UNAUTHORIZED: {
    gitlabUnauthorized: 'GitLab token is invalid or expired',
  },
  GITLAB_FORBIDDEN: {
    gitlabForbidden: 'GitLab token lacks permission',
  },
  GITLAB_PROJECT_NOT_FOUND: {
    gitlabProjectNotFound: 'GitLab project not found',
  },
  GITLAB_BRANCH_NOT_FOUND: {
    gitlabBranchNotFound: 'GitLab branch not found',
  },
  GITLAB_UNAVAILABLE: {
    gitlabUnavailable: 'GitLab is unavailable',
  },
  GITLAB_REQUEST_FAILED: {
    gitlabRequestFailed: 'GitLab request failed',
  },
};

const gitlabExits = Object.values(GitlabErrors).reduce(
  (result, error) => ({
    ...result,
    [Object.keys(error)[0]]: {
      responseType: 'unprocessableEntity',
    },
  }),
  {},
);

const ERRORS_BY_CODE = {
  [NOT_CONFIGURED_CODE]: GitlabErrors.GITLAB_NOT_CONFIGURED,
  [ErrorCodes.UNAUTHORIZED]: GitlabErrors.GITLAB_UNAUTHORIZED,
  [ErrorCodes.FORBIDDEN]: GitlabErrors.GITLAB_FORBIDDEN,
  [ErrorCodes.UNAVAILABLE]: GitlabErrors.GITLAB_UNAVAILABLE,
  [ErrorCodes.REQUEST_FAILED]: GitlabErrors.GITLAB_REQUEST_FAILED,
};

const isGitlabFailure = (error) =>
  !!error && (error.name === 'GitlabError' || error.code === NOT_CONFIGURED_CODE);

// Converts a GitLab failure into a controller error, logging only safe metadata. `notFoundError`
// is what a GitLab 404 means in the caller's context (missing project or missing branch).
// Anything that is not a GitLab failure is returned untouched, so it surfaces as a 500.
const mapGitlabError = (
  error,
  { notFoundError = GitlabErrors.GITLAB_PROJECT_NOT_FOUND, projectId, integrationId } = {},
) => {
  if (!isGitlabFailure(error)) {
    return error;
  }

  sails.log.warn(
    `GitLab request failed (code: ${error.code}, status: ${error.status || 'none'}, ` +
      `project: ${projectId || 'none'}, integration: ${integrationId || 'none'})`,
  );

  if (error.code === ErrorCodes.NOT_FOUND) {
    return notFoundError;
  }

  return ERRORS_BY_CODE[error.code] || GitlabErrors.GITLAB_REQUEST_FAILED;
};

module.exports = {
  GitlabErrors,
  gitlabExits,
  mapGitlabError,
};
