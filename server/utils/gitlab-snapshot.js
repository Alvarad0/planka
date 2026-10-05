// Shape of `gitlab_card_link.snapshot`, the last known GitLab data of a card shown when GitLab
// cannot be reached:
//   { issue: { title, state, updatedAt }, mergeRequest, pipeline, commitsCount, hasMoreCommits }
// Links stored before merge requests were supported hold only the issue part
// ({ title, state, updatedAt }), which is still read as such.

const ISSUE_FIELDS = ['title', 'state', 'updatedAt'];

const buildSnapshot = ({
  issue,
  mergeRequest = null,
  pipeline = null,
  commitsCount = null,
  hasMoreCommits = false,
}) => ({
  issue: _.pick(issue, ISSUE_FIELDS),
  mergeRequest,
  pipeline,
  commitsCount,
  hasMoreCommits,
});

const readSnapshot = (snapshot) => {
  if (!_.isPlainObject(snapshot)) {
    return buildSnapshot({ issue: {} });
  }

  // Legacy shape
  if (!_.has(snapshot, 'issue')) {
    return buildSnapshot({ issue: snapshot });
  }

  return buildSnapshot({
    issue: snapshot.issue || {},
    mergeRequest: snapshot.mergeRequest || null,
    pipeline: snapshot.pipeline || null,
    commitsCount: _.isNumber(snapshot.commitsCount) ? snapshot.commitsCount : null,
    hasMoreCommits: snapshot.hasMoreCommits === true,
  });
};

const buildIssueFromSnapshot = (gitlabCardLink) => {
  const { issue } = readSnapshot(gitlabCardLink.snapshot);

  return {
    id: gitlabCardLink.issueId,
    iid: gitlabCardLink.issueIid,
    title: issue.title || null,
    state: issue.state || null,
    webUrl: gitlabCardLink.issueUrl,
    updatedAt: issue.updatedAt || null,
  };
};

// The merge request shown for a card's branch: the newest open one, else the newest merged one.
// A branch with only closed merge requests has none. Expects them newest first.
const selectMergeRequest = (mergeRequests) =>
  mergeRequests.find(({ state }) => state === 'opened') ||
  mergeRequests.find(({ state }) => state === 'merged') ||
  null;

module.exports = {
  buildSnapshot,
  readSnapshot,
  buildIssueFromSnapshot,
  selectMergeRequest,
};
