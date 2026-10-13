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
  ALREADY_EXISTS: 'gitlabAlreadyExists',
  REF_NOT_FOUND: 'gitlabRefNotFound',
  MERGE_REQUEST_ALREADY_EXISTS: 'gitlabMergeRequestAlreadyExists',
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

const MAX_BRANCH_NAME_LENGTH = 255;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u001f\u007f]/;

const encodeBranchName = (branchName) => {
  if (
    typeof branchName !== 'string' ||
    branchName.length === 0 ||
    branchName.length > MAX_BRANCH_NAME_LENGTH ||
    CONTROL_CHARS_REGEX.test(branchName) ||
    // Dot segments would be resolved by URL parsing and escape /repository/branches
    branchName === '.' ||
    branchName === '..'
  ) {
    throw new GitlabError(ErrorCodes.REQUEST_FAILED, 'Invalid GitLab branch name');
  }

  return encodeURIComponent(branchName);
};

const MAX_ISSUE_TITLE_LENGTH = 255;

const normalizeIssueTitle = (title) => {
  const value = typeof title === 'string' ? title.trim() : '';

  if (value.length === 0) {
    throw new GitlabError(ErrorCodes.REQUEST_FAILED, 'Invalid issue title');
  }

  // Code points, not UTF-16 units, so a surrogate pair is never split
  return Array.from(value).slice(0, MAX_ISSUE_TITLE_LENGTH).join('');
};

const MAX_COMMITS_PER_PAGE = 100;

const MERGE_REQUEST_STATES = ['opened', 'closed', 'locked', 'merged', 'all'];

const encodeIssueIid = (issueIid) => {
  if (!Number.isInteger(issueIid) || issueIid <= 0) {
    throw new GitlabError(ErrorCodes.REQUEST_FAILED, 'Invalid GitLab issue IID');
  }

  return String(issueIid);
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

// Error bodies are read only to recognize these fixed GitLab messages; their text never reaches an
// error message, since GitLab may echo request data back
const BRANCH_ALREADY_EXISTS_REGEX = /branch already exists/i;
const INVALID_REFERENCE_NAME_REGEX = /invalid reference name/i;

// Validation errors may come as an array of messages (e.g. `{ "message": ["..."] }`)
const readErrorMessage = async (response) => {
  try {
    const body = await response.json();

    if (!body) {
      return null;
    }

    if (typeof body.message === 'string') {
      return body.message;
    }

    if (Array.isArray(body.message)) {
      return body.message.filter((item) => typeof item === 'string').join('\n');
    }

    return null;
  } catch (error) {
    return null;
  }
};

const detectCreateBranchError = async (response) => {
  if (response.status !== 400) {
    return null;
  }

  const message = await readErrorMessage(response);

  if (message === null) {
    return null;
  }

  if (BRANCH_ALREADY_EXISTS_REGEX.test(message)) {
    return new GitlabError(ErrorCodes.ALREADY_EXISTS, 'GitLab branch already exists', 400);
  }

  if (INVALID_REFERENCE_NAME_REGEX.test(message)) {
    return new GitlabError(ErrorCodes.REF_NOT_FOUND, 'GitLab base branch not found', 400);
  }

  return null;
};

// GitLab answers 409 with "Another open merge request already exists for this source branch: !<iid>"
// (same branch used as source and target is a 409 as well, so the message is checked)
const MERGE_REQUEST_ALREADY_EXISTS_REGEX = /another open merge request already exists/i;

const detectCreateMergeRequestError = async (response) => {
  if (response.status !== 409) {
    return null;
  }

  const message = await readErrorMessage(response);

  if (message !== null && MERGE_REQUEST_ALREADY_EXISTS_REGEX.test(message)) {
    return new GitlabError(
      ErrorCodes.MERGE_REQUEST_ALREADY_EXISTS,
      'GitLab merge request already exists',
      409,
    );
  }

  return null;
};

const buildQuery = (params) => new URLSearchParams(params).toString();

const presentProject = (project) => ({
  id: project.id,
  name: project.name,
  pathWithNamespace: project.path_with_namespace,
  defaultBranch: project.default_branch,
  webUrl: project.web_url,
});

const presentBranch = (branch) => ({
  name: branch.name,
  webUrl: branch.web_url,
});

const presentIssue = (issue) => ({
  id: issue.id,
  iid: issue.iid,
  title: issue.title,
  state: issue.state,
  webUrl: issue.web_url,
  updatedAt: issue.updated_at,
});

const presentMergeRequest = (mergeRequest) => ({
  id: mergeRequest.id,
  iid: mergeRequest.iid,
  title: mergeRequest.title,
  state: mergeRequest.state,
  draft: !!mergeRequest.draft,
  webUrl: mergeRequest.web_url,
  sourceBranch: mergeRequest.source_branch,
  targetBranch: mergeRequest.target_branch,
  createdAt: mergeRequest.created_at,
  updatedAt: mergeRequest.updated_at,
  mergedAt: mergeRequest.merged_at || null,
});

const presentPipeline = (pipeline) => ({
  id: pipeline.id,
  status: pipeline.status,
  ref: pipeline.ref,
  sha: pipeline.sha,
  webUrl: pipeline.web_url,
  createdAt: pipeline.created_at,
  updatedAt: pipeline.updated_at,
});

const presentCommit = (commit) => ({
  id: commit.id,
  shortId: commit.short_id,
  title: commit.title,
  authorName: commit.author_name,
  createdAt: commit.created_at,
  webUrl: commit.web_url || null,
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

  // `detectError` may inspect a failed response (and consume its body) to return a more specific
  // GitlabError; when it returns nothing, the error is derived from the status alone
  const request = async (method, path, body, { detectError } = {}) => {
    const headers = {
      Accept: 'application/json',
      'PRIVATE-TOKEN': token,
      'User-Agent': 'planka-gitlab-bridge',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response;
    try {
      response = await fetch(`${baseUrl}/api/v4${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        dispatcher: requestDispatcher,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      const reason = error.name === 'TimeoutError' ? 'timed out' : 'is unreachable';

      throw new GitlabError(ErrorCodes.UNAVAILABLE, `GitLab ${reason}`);
    }

    if (!response.ok) {
      if (detectError) {
        const detectedError = await detectError(response);

        if (detectedError) {
          throw detectedError;
        }
      }

      // Discard the body so the connection is released; its content is never used in messages
      if (response.body && !response.bodyUsed) {
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
    // The user the token belongs to (a bot user for project/group access tokens); used to test
    // the connection settings
    async getCurrentUser() {
      const user = await request('GET', '/user');

      if (!user || typeof user.username !== 'string') {
        throw new GitlabError(ErrorCodes.UNAVAILABLE, 'GitLab returned an invalid response');
      }

      return {
        username: user.username,
        name: typeof user.name === 'string' ? user.name : null,
      };
    },

    async getProject(projectRef) {
      const project = await request('GET', `/projects/${encodeProjectRef(projectRef)}`);

      return presentProject(project);
    },

    async getBranch(projectRef, branchName) {
      const branch = await request(
        'GET',
        `/projects/${encodeProjectRef(projectRef)}/repository/branches/${encodeBranchName(branchName)}`,
      );

      return presentBranch(branch);
    },

    async createBranch(projectRef, { name, ref } = {}) {
      // Both names are validated like path segments, although they travel in the JSON body
      encodeBranchName(name);
      encodeBranchName(ref);

      const branch = await request(
        'POST',
        `/projects/${encodeProjectRef(projectRef)}/repository/branches`,
        {
          ref,
          branch: name,
        },
        {
          detectError: detectCreateBranchError,
        },
      );

      return presentBranch(branch);
    },

    async createIssue(projectRef, { title, description } = {}) {
      const body = {
        title: normalizeIssueTitle(title),
      };

      if (description !== undefined && description !== null) {
        body.description = description;
      }

      const issue = await request('POST', `/projects/${encodeProjectRef(projectRef)}/issues`, body);

      return presentIssue(issue);
    },

    async getIssue(projectRef, issueIid) {
      const issue = await request(
        'GET',
        `/projects/${encodeProjectRef(projectRef)}/issues/${encodeIssueIid(issueIid)}`,
      );

      return presentIssue(issue);
    },

    // Newest first
    async listMergeRequests(projectRef, { sourceBranch, state = 'all' } = {}) {
      encodeBranchName(sourceBranch);

      if (!MERGE_REQUEST_STATES.includes(state)) {
        throw new GitlabError(ErrorCodes.REQUEST_FAILED, 'Invalid merge request state');
      }

      const query = buildQuery({
        state,
        source_branch: sourceBranch,
        order_by: 'created_at',
        sort: 'desc',
        per_page: 20,
      });

      const mergeRequests = await request(
        'GET',
        `/projects/${encodeProjectRef(projectRef)}/merge_requests?${query}`,
      );

      if (!Array.isArray(mergeRequests)) {
        throw new GitlabError(ErrorCodes.UNAVAILABLE, 'GitLab returned an invalid response');
      }

      return mergeRequests.map(presentMergeRequest);
    },

    async createMergeRequest(projectRef, { sourceBranch, targetBranch, title, description } = {}) {
      // Both names are validated like path segments, although they travel in the JSON body
      encodeBranchName(sourceBranch);
      encodeBranchName(targetBranch);

      const body = {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title: normalizeIssueTitle(title),
      };

      if (description !== undefined && description !== null) {
        body.description = description;
      }

      const mergeRequest = await request(
        'POST',
        `/projects/${encodeProjectRef(projectRef)}/merge_requests`,
        body,
        {
          detectError: detectCreateMergeRequestError,
        },
      );

      return presentMergeRequest(mergeRequest);
    },

    // A ref without pipelines (or a deleted branch) yields an empty list, hence null
    async getLatestPipeline(projectRef, { ref } = {}) {
      encodeBranchName(ref);

      const query = buildQuery({
        ref,
        order_by: 'id',
        sort: 'desc',
        per_page: 1,
      });

      const pipelines = await request(
        'GET',
        `/projects/${encodeProjectRef(projectRef)}/pipelines?${query}`,
      );

      if (!Array.isArray(pipelines)) {
        throw new GitlabError(ErrorCodes.UNAVAILABLE, 'GitLab returned an invalid response');
      }

      return pipelines.length > 0 ? presentPipeline(pipelines[0]) : null;
    },

    // Commits of `to` that are not in `from` (revision range `from..to`), newest first, at most
    // `limit` (GitLab caps a page at 100). The commits API is used instead of compare because
    // compare always returns full diffs. A range with a missing ref (e.g. a deleted branch) is
    // answered with 404, or possibly with an empty list.
    async listCommits(projectRef, { from, to, limit } = {}) {
      encodeBranchName(from);
      encodeBranchName(to);

      const perPage = Number.isFinite(limit)
        ? Math.min(MAX_COMMITS_PER_PAGE, Math.max(1, Math.floor(limit)))
        : MAX_COMMITS_PER_PAGE;

      const query = buildQuery({
        ref_name: `${from}..${to}`,
        per_page: perPage,
      });

      const commits = await request(
        'GET',
        `/projects/${encodeProjectRef(projectRef)}/repository/commits?${query}`,
      );

      if (!Array.isArray(commits)) {
        throw new GitlabError(ErrorCodes.UNAVAILABLE, 'GitLab returned an invalid response');
      }

      return commits.map(presentCommit);
    },
  };
};

module.exports = {
  ErrorCodes,
  GitlabError,
  createGitlabClient,
};
