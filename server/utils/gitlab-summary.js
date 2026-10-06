// Live GitLab summary of a card link: its issue and, when the card has a branch, the branch's
// merge request, latest pipeline and commits ahead of the default branch.
//
// Shared by the card endpoint (show) and every synchronization path (manual sync, webhooks), so
// they all compute the snapshot the same way.

const { ErrorCodes } = require('./gitlab-client');
const { selectMergeRequest } = require('./gitlab-snapshot');

// Commits are counted up to this many; a full page means there are more
const COMMITS_LIMIT = 100;

// A deleted branch makes pipeline and commit lookups answer 404, which means there is no data
// (the commit lookup may also answer with an empty list)
const nullIfNotFound = (promise) =>
  promise.catch((error) => {
    if (error.code === ErrorCodes.NOT_FOUND) {
      return null;
    }

    throw error;
  });

// All calls run in parallel and any failure rejects the whole summary, so a summary is either
// fully live or not produced at all
const fetchSummary = async (client, linkIntegration, gitlabCardLink) => {
  const projectRef = linkIntegration.gitlabProjectId;
  const { branchName } = gitlabCardLink;

  if (!branchName) {
    const issue = await client.getIssue(projectRef, gitlabCardLink.issueIid);

    return {
      issue,
      mergeRequest: null,
      pipeline: null,
      commitsCount: null,
      hasMoreCommits: false,
    };
  }

  const [issue, mergeRequests, pipeline, commits] = await Promise.all([
    client.getIssue(projectRef, gitlabCardLink.issueIid),
    client.listMergeRequests(projectRef, {
      sourceBranch: branchName,
      state: 'all',
    }),
    nullIfNotFound(
      client.getLatestPipeline(projectRef, {
        ref: branchName,
      }),
    ),
    nullIfNotFound(
      client.listCommits(projectRef, {
        from: linkIntegration.defaultBranch,
        to: branchName,
        limit: COMMITS_LIMIT,
      }),
    ),
  ]);

  const mergeRequest = selectMergeRequest(mergeRequests);

  // Once merged, the branch has no commits ahead of the default branch (and may be deleted)
  const isMerged = !!mergeRequest && mergeRequest.state === 'merged';
  const hasCommits = !isMerged && !!commits;

  return {
    issue,
    mergeRequest,
    pipeline,
    commitsCount: hasCommits ? commits.length : null,
    hasMoreCommits: hasCommits && commits.length === COMMITS_LIMIT,
  };
};

module.exports = {
  COMMITS_LIMIT,
  fetchSummary,
};
