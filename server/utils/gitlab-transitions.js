// Merge request transitions between two snapshots of a card link (see utils/gitlab-snapshot.js),
// which decide automatic card moves.
//
// Moves are edge-triggered: only a change of the merge request state between the previously
// stored snapshot and the new one moves a card, never the current state alone. So a card moved
// back by hand stays where it is on every following sync with the same state.
//
// - ready (open and not draft) after not ready (no merge request, draft, closed, ...) ⇒ review
// - merged after not merged ⇒ completed (also wins when both happen in one jump)
// - a closed merge request or a closed issue never moves a card
// - no previous snapshot, or one stored before merge requests were supported (no `issue` key),
//   never moves a card: the first sync after an upgrade must not move cards in bulk

const MoveTargets = {
  REVIEW: 'review',
  COMPLETED: 'completed',
};

const getMergeRequest = (snapshot) =>
  _.isPlainObject(snapshot.mergeRequest) ? snapshot.mergeRequest : null;

const isReady = (mergeRequest) =>
  !!mergeRequest && mergeRequest.state === 'opened' && !mergeRequest.draft;

const isMerged = (mergeRequest) => !!mergeRequest && mergeRequest.state === 'merged';

const isComparable = (snapshot) => _.isPlainObject(snapshot) && _.has(snapshot, 'issue');

// Returns a MoveTargets value or null
const detectMoveTarget = (prevSnapshot, snapshot) => {
  if (!isComparable(prevSnapshot) || !isComparable(snapshot)) {
    return null;
  }

  const prevMergeRequest = getMergeRequest(prevSnapshot);
  const mergeRequest = getMergeRequest(snapshot);

  if (isMerged(mergeRequest) && !isMerged(prevMergeRequest)) {
    return MoveTargets.COMPLETED;
  }

  if (isReady(mergeRequest) && !isReady(prevMergeRequest)) {
    return MoveTargets.REVIEW;
  }

  return null;
};

module.exports = {
  MoveTargets,
  detectMoveTarget,
};
