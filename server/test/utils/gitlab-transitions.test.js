const { expect } = require('chai');

const { MoveTargets, detectMoveTarget } = require('../../utils/gitlab-transitions');

const ISSUE = { title: 'Implement login', state: 'opened', updatedAt: null };

const snapshotWith = (mergeRequest, issue = ISSUE) => ({
  issue,
  mergeRequest,
  pipeline: null,
  commitsCount: null,
  hasMoreCommits: false,
});

const mr = (state, draft = false) => ({ id: 5007, iid: 7, state, draft });

const NONE = snapshotWith(null);
const DRAFT = snapshotWith(mr('opened', true));
const READY = snapshotWith(mr('opened'));
const MERGED = snapshotWith(mr('merged'));
const CLOSED = snapshotWith(mr('closed'));

describe('GitLab transitions', () => {
  describe('detectMoveTarget', () => {
    it('moves to review when a ready merge request appears', () => {
      expect(detectMoveTarget(NONE, READY)).to.equal(MoveTargets.REVIEW);
    });

    it('moves to review when a draft becomes ready', () => {
      expect(detectMoveTarget(DRAFT, READY)).to.equal(MoveTargets.REVIEW);
    });

    it('moves to review when a new merge request replaces a closed one', () => {
      expect(detectMoveTarget(CLOSED, READY)).to.equal(MoveTargets.REVIEW);
    });

    it('does not move while the state stays the same', () => {
      expect(detectMoveTarget(READY, READY)).to.equal(null);
      expect(detectMoveTarget(MERGED, MERGED)).to.equal(null);
      expect(detectMoveTarget(DRAFT, DRAFT)).to.equal(null);
      expect(detectMoveTarget(NONE, NONE)).to.equal(null);
    });

    it('does not move for a draft', () => {
      expect(detectMoveTarget(NONE, DRAFT)).to.equal(null);
      expect(detectMoveTarget(READY, DRAFT)).to.equal(null);
    });

    it('moves to completed when the merge request is merged', () => {
      expect(detectMoveTarget(READY, MERGED)).to.equal(MoveTargets.COMPLETED);
      expect(detectMoveTarget(DRAFT, MERGED)).to.equal(MoveTargets.COMPLETED);
    });

    it('only moves to completed when opened and merged in one jump', () => {
      expect(detectMoveTarget(NONE, MERGED)).to.equal(MoveTargets.COMPLETED);
    });

    it('never moves for a closed merge request or a closed issue', () => {
      expect(detectMoveTarget(READY, CLOSED)).to.equal(null);
      expect(detectMoveTarget(NONE, CLOSED)).to.equal(null);
      expect(detectMoveTarget(NONE, snapshotWith(null, { ...ISSUE, state: 'closed' }))).to.equal(
        null,
      );
      expect(
        detectMoveTarget(READY, snapshotWith(mr('opened'), { ...ISSUE, state: 'closed' })),
      ).to.equal(null);
    });

    it('never moves without a comparable previous snapshot', () => {
      expect(detectMoveTarget(null, READY)).to.equal(null);
      expect(detectMoveTarget(undefined, MERGED)).to.equal(null);
      // Stored before merge requests were supported
      expect(detectMoveTarget({ title: 'Legacy', state: 'opened' }, MERGED)).to.equal(null);
      expect(detectMoveTarget({ title: 'Legacy', state: 'opened' }, READY)).to.equal(null);
    });

    it('tolerates a malformed new snapshot', () => {
      expect(detectMoveTarget(NONE, null)).to.equal(null);
      expect(detectMoveTarget(NONE, snapshotWith('not-an-object'))).to.equal(null);
    });
  });
});
