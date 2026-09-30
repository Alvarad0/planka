const { expect } = require('chai');
const { normalizeGitlabUrl } = require('../../utils/gitlab-url');

describe('normalizeGitlabUrl', () => {
  it('returns null when not configured', () => {
    expect(normalizeGitlabUrl(undefined)).to.equal(null);
    expect(normalizeGitlabUrl('')).to.equal(null);
    expect(normalizeGitlabUrl('   ')).to.equal(null);
  });

  it('strips trailing slashes', () => {
    expect(normalizeGitlabUrl('https://gitlab.example.com/')).to.equal(
      'https://gitlab.example.com',
    );
  });

  it('keeps a subpath', () => {
    expect(normalizeGitlabUrl('https://example.com/gitlab/')).to.equal(
      'https://example.com/gitlab',
    );
  });

  it('keeps a custom port', () => {
    expect(normalizeGitlabUrl('http://gitlab.local:8080')).to.equal('http://gitlab.local:8080');
  });

  it('rejects invalid URLs', () => {
    expect(() => normalizeGitlabUrl('gitlab.example.com')).to.throw('not a valid URL');
  });

  it('rejects non-http protocols', () => {
    expect(() => normalizeGitlabUrl('ftp://gitlab.example.com')).to.throw('http or https');
    expect(() => normalizeGitlabUrl('file:///etc/passwd')).to.throw('http or https');
  });

  it('rejects embedded credentials', () => {
    expect(() => normalizeGitlabUrl('https://user:glpat-secret@gitlab.example.com')).to.throw(
      'credentials',
    );
  });

  it('rejects query strings and fragments', () => {
    expect(() => normalizeGitlabUrl('https://gitlab.example.com?x=1')).to.throw('query string');
    expect(() => normalizeGitlabUrl('https://gitlab.example.com#x')).to.throw('query string');
  });
});
