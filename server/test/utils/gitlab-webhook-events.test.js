const { expect } = require('chai');

const { getEventType, resolveEventTarget } = require('../../utils/gitlab-webhook-events');

describe('GitLab webhook events', () => {
  describe('getEventType', () => {
    it('maps the handled X-Gitlab-Event values', () => {
      expect(getEventType('Push Hook')).to.equal('push');
      expect(getEventType('Merge Request Hook')).to.equal('merge_request');
      expect(getEventType('Pipeline Hook')).to.equal('pipeline');
      expect(getEventType('Issue Hook')).to.equal('issue');
      expect(getEventType('Confidential Issue Hook')).to.equal('issue');
    });

    it('ignores other or missing values', () => {
      expect(getEventType('Tag Push Hook')).to.equal(null);
      expect(getEventType('Note Hook')).to.equal(null);
      expect(getEventType('push hook')).to.equal(null);
      expect(getEventType('constructor')).to.equal(null);
      expect(getEventType(undefined)).to.equal(null);
    });
  });

  describe('resolveEventTarget', () => {
    it('maps a push to its branch, including branch deletions', () => {
      expect(resolveEventTarget('push', { ref: 'refs/heads/12-login' })).to.deep.equal({
        branchName: '12-login',
      });

      expect(
        resolveEventTarget('push', {
          ref: 'refs/heads/feature/12-login',
          after: '0000000000000000000000000000000000000000',
        }),
      ).to.deep.equal({
        branchName: 'feature/12-login',
      });
    });

    it('ignores tag pushes and malformed pushes', () => {
      expect(resolveEventTarget('push', { ref: 'refs/tags/v1.0.0' })).to.equal(null);
      expect(resolveEventTarget('push', { ref: 'refs/heads/' })).to.equal(null);
      expect(resolveEventTarget('push', {})).to.equal(null);
      expect(resolveEventTarget('push', null)).to.equal(null);
    });

    it('maps a merge request to its source branch', () => {
      expect(
        resolveEventTarget('merge_request', {
          object_attributes: { source_branch: '12-login', target_branch: 'main' },
        }),
      ).to.deep.equal({ branchName: '12-login' });

      expect(resolveEventTarget('merge_request', { object_attributes: {} })).to.equal(null);
    });

    it('maps a branch pipeline to its ref', () => {
      expect(
        resolveEventTarget('pipeline', {
          object_attributes: { ref: '12-login', tag: false },
          merge_request: null,
        }),
      ).to.deep.equal({ branchName: '12-login' });
    });

    it('maps a merge request pipeline to the source branch', () => {
      expect(
        resolveEventTarget('pipeline', {
          object_attributes: { ref: 'refs/merge-requests/7/head', tag: false },
          merge_request: { iid: 7, source_branch: '12-login', target_branch: 'main' },
        }),
      ).to.deep.equal({ branchName: '12-login' });
    });

    it('ignores tag pipelines and unresolvable merge request refs', () => {
      expect(
        resolveEventTarget('pipeline', { object_attributes: { ref: 'v1.0.0', tag: true } }),
      ).to.equal(null);

      expect(
        resolveEventTarget('pipeline', {
          object_attributes: { ref: 'refs/merge-requests/7/head', tag: false },
        }),
      ).to.equal(null);
    });

    it('maps an issue to its IID', () => {
      expect(resolveEventTarget('issue', { object_attributes: { iid: 12 } })).to.deep.equal({
        issueIid: 12,
      });

      expect(resolveEventTarget('issue', { object_attributes: { iid: '12' } })).to.equal(null);
      expect(resolveEventTarget('issue', { object_attributes: { iid: 0 } })).to.equal(null);
    });
  });
});
