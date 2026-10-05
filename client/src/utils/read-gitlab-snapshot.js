// Reads `snapshot` of a GitLab card link, the last known GitLab data of a card:
//   { issue: { title, state, updatedAt }, mergeRequest, pipeline, commitsCount, hasMoreCommits }
// Links stored before merge requests were supported hold only the issue part
// ({ title, state, updatedAt }), which is still read as such.

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

export default (snapshot) => {
  if (!isPlainObject(snapshot)) {
    return {
      issue: {},
      mergeRequest: null,
      pipeline: null,
      commitsCount: null,
      hasMoreCommits: false,
    };
  }

  // Legacy shape
  if (!('issue' in snapshot)) {
    return {
      issue: {
        title: snapshot.title,
        state: snapshot.state,
        updatedAt: snapshot.updatedAt,
      },
      mergeRequest: null,
      pipeline: null,
      commitsCount: null,
      hasMoreCommits: false,
    };
  }

  return {
    issue: isPlainObject(snapshot.issue) ? snapshot.issue : {},
    mergeRequest: isPlainObject(snapshot.mergeRequest) ? snapshot.mergeRequest : null,
    pipeline: isPlainObject(snapshot.pipeline) ? snapshot.pipeline : null,
    commitsCount: typeof snapshot.commitsCount === 'number' ? snapshot.commitsCount : null,
    hasMoreCommits: snapshot.hasMoreCommits === true,
  };
};
