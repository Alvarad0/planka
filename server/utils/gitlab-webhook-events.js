// Pure mapping of GitLab webhook events (GitLab 17.5) to what identifies the affected card links.
//
// Webhooks are only triggers: payloads are used to find links, never to build snapshots.

// `X-Gitlab-Event` header values handled by the Bridge. Confidential issues are sent with their
// own header but the same payload as issues. Anything else (e.g. `Tag Push Hook`) is ignored.
const EVENT_TYPE_BY_HEADER = {
  'Push Hook': 'push',
  'Merge Request Hook': 'merge_request',
  'Pipeline Hook': 'pipeline',
  'Issue Hook': 'issue',
  'Confidential Issue Hook': 'issue',
};

const BRANCH_REF_PREFIX = 'refs/heads/';

const getEventType = (eventHeader) =>
  typeof eventHeader === 'string' && _.has(EVENT_TYPE_BY_HEADER, eventHeader)
    ? EVENT_TYPE_BY_HEADER[eventHeader]
    : null;

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

const getBranchFromRef = (ref) =>
  isNonEmptyString(ref) &&
  ref.startsWith(BRANCH_REF_PREFIX) &&
  ref.length > BRANCH_REF_PREFIX.length
    ? ref.slice(BRANCH_REF_PREFIX.length)
    : null;

const getObjectAttributes = (payload) =>
  _.isPlainObject(payload) && _.isPlainObject(payload.object_attributes)
    ? payload.object_attributes
    : {};

// Returns { branchName } or { issueIid } identifying the affected links, or null when the event
// cannot concern a card (e.g. a tag)
const resolveEventTarget = (eventType, payload) => {
  switch (eventType) {
    case 'push': {
      // A branch deletion (after = 000…0) is a push to refs/heads/<branch> as well, and still
      // triggers a sync; tags are pushed to refs/tags/ and ignored
      const branchName = _.isPlainObject(payload) ? getBranchFromRef(payload.ref) : null;

      return branchName ? { branchName } : null;
    }
    case 'merge_request': {
      const { source_branch: branchName } = getObjectAttributes(payload);

      return isNonEmptyString(branchName) ? { branchName } : null;
    }
    case 'pipeline': {
      // Merge request pipelines run on refs/merge-requests/<iid>/head; the merge request's source
      // branch identifies the card
      const mergeRequest = _.isPlainObject(payload) ? payload.merge_request : null;

      if (_.isPlainObject(mergeRequest) && isNonEmptyString(mergeRequest.source_branch)) {
        return { branchName: mergeRequest.source_branch };
      }

      const { ref, tag } = getObjectAttributes(payload);

      if (tag === true || !isNonEmptyString(ref) || ref.startsWith('refs/')) {
        return null;
      }

      // Branch pipelines carry the bare branch name
      return { branchName: ref };
    }
    case 'issue': {
      const { iid } = getObjectAttributes(payload);

      return Number.isSafeInteger(iid) && iid > 0 ? { issueIid: iid } : null;
    }
    default:
      return null;
  }
};

module.exports = {
  EVENT_TYPE_BY_HEADER,
  getEventType,
  resolveEventTarget,
};
