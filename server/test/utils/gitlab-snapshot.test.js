const { expect } = require('chai');

const {
  buildSnapshot,
  readSnapshot,
  buildIssueFromSnapshot,
  selectMergeRequest,
} = require('../../utils/gitlab-snapshot');

const ISSUE = {
  title: 'Implement login',
  state: 'opened',
  updatedAt: '2026-10-05T12:00:00.000Z',
};

describe('GitLab snapshot', () => {
  describe('buildSnapshot', () => {
    it('keeps only the stored issue fields and defaults the other parts to null', () => {
      expect(buildSnapshot({ issue: { ...ISSUE, id: 1, webUrl: 'x' } })).to.deep.equal({
        issue: ISSUE,
        mergeRequest: null,
        pipeline: null,
        commitsCount: null,
        hasMoreCommits: false,
      });
    });
  });

  describe('readSnapshot', () => {
    it('reads the current shape', () => {
      const snapshot = {
        issue: ISSUE,
        mergeRequest: { iid: 7 },
        pipeline: { id: 287 },
        commitsCount: 0,
        hasMoreCommits: true,
      };

      expect(readSnapshot(snapshot)).to.deep.equal(snapshot);
    });

    it('reads a legacy snapshot as the issue part', () => {
      expect(readSnapshot(ISSUE)).to.deep.equal({
        issue: ISSUE,
        mergeRequest: null,
        pipeline: null,
        commitsCount: null,
        hasMoreCommits: false,
      });
    });

    it('reads a missing snapshot as empty', () => {
      expect(readSnapshot(null)).to.deep.equal({
        issue: {},
        mergeRequest: null,
        pipeline: null,
        commitsCount: null,
        hasMoreCommits: false,
      });
    });
  });

  describe('buildIssueFromSnapshot', () => {
    it('combines the link with the stored issue fields', () => {
      expect(
        buildIssueFromSnapshot({
          issueId: 9012,
          issueIid: 12,
          issueUrl: 'https://gitlab.test/x/-/issues/12',
          snapshot: { title: 'Legacy' },
        }),
      ).to.deep.equal({
        id: 9012,
        iid: 12,
        title: 'Legacy',
        state: null,
        webUrl: 'https://gitlab.test/x/-/issues/12',
        updatedAt: null,
      });
    });
  });

  describe('selectMergeRequest', () => {
    it('prefers the newest open merge request, then the newest merged one', () => {
      const closed = { iid: 4, state: 'closed' };
      const merged = { iid: 3, state: 'merged' };
      const olderMerged = { iid: 2, state: 'merged' };
      const opened = { iid: 1, state: 'opened' };

      expect(selectMergeRequest([closed, merged, olderMerged, opened])).to.equal(opened);
      expect(selectMergeRequest([closed, merged, olderMerged])).to.equal(merged);
      expect(selectMergeRequest([closed])).to.equal(null);
      expect(selectMergeRequest([])).to.equal(null);
    });
  });
});
