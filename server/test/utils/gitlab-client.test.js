const { expect } = require('chai');
const { MockAgent } = require('undici');

const { ErrorCodes, createGitlabClient } = require('../../utils/gitlab-client');

const BASE_URL = 'https://gitlab.test';
const TOKEN = 'glpat-test-secret-token';

const PROJECT_RESPONSE = {
  id: 42,
  name: 'ERP',
  path_with_namespace: 'company/erp',
  default_branch: 'develop',
  web_url: 'https://gitlab.test/company/erp',
  namespace: { id: 7 },
};

const expectGitlabError = async (promise, code) => {
  try {
    await promise;
  } catch (error) {
    expect(error.name).to.equal('GitlabError');
    expect(error.code).to.equal(code);
    expect(error.message).to.not.include(TOKEN);

    return error;
  }

  throw new Error(`Expected GitlabError with code ${code}`);
};

describe('GitLab client', () => {
  let mockAgent;
  let gitlab;
  let client;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();

    gitlab = mockAgent.get(BASE_URL);

    client = createGitlabClient({
      baseUrl: BASE_URL,
      token: TOKEN,
      dispatcher: mockAgent,
      timeout: 100,
    });
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  describe('createGitlabClient', () => {
    it('requires a base URL and a token', () => {
      expect(() => createGitlabClient({ token: TOKEN })).to.throw('not configured');
      expect(() => createGitlabClient({ baseUrl: BASE_URL })).to.throw('not configured');
    });
  });

  describe('getProject', () => {
    it('fetches a project by numeric ID and presents only the needed fields', async () => {
      gitlab
        .intercept({
          path: '/api/v4/projects/42',
          method: 'GET',
          headers: { 'private-token': TOKEN },
        })
        .reply(200, PROJECT_RESPONSE);

      const project = await client.getProject(42);

      expect(project).to.deep.equal({
        id: 42,
        name: 'ERP',
        pathWithNamespace: 'company/erp',
        defaultBranch: 'develop',
        webUrl: 'https://gitlab.test/company/erp',
      });
    });

    it('URL-encodes a project path', async () => {
      gitlab
        .intercept({ path: '/api/v4/projects/company%2Ferp', method: 'GET' })
        .reply(200, PROJECT_RESPONSE);

      const project = await client.getProject('company/erp');

      expect(project.id).to.equal(42);
    });

    it('rejects references that could escape /projects', async () => {
      await expectGitlabError(client.getProject('company/..'), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getProject('../users'), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getProject('erp'), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getProject('company/erp?x=1'), ErrorCodes.REQUEST_FAILED);
    });

    it('maps 401 to gitlabUnauthorized', async () => {
      gitlab.intercept({ path: '/api/v4/projects/42' }).reply(401, { message: '401 Unauthorized' });

      await expectGitlabError(client.getProject(42), ErrorCodes.UNAUTHORIZED);
    });

    it('maps 403 to gitlabForbidden', async () => {
      gitlab.intercept({ path: '/api/v4/projects/42' }).reply(403, { message: '403 Forbidden' });

      await expectGitlabError(client.getProject(42), ErrorCodes.FORBIDDEN);
    });

    it('maps 404 to gitlabNotFound', async () => {
      gitlab.intercept({ path: '/api/v4/projects/42' }).reply(404, { message: '404 Not Found' });

      await expectGitlabError(client.getProject(42), ErrorCodes.NOT_FOUND);
    });

    it('maps 5xx to gitlabUnavailable', async () => {
      gitlab.intercept({ path: '/api/v4/projects/42' }).reply(502, 'Bad Gateway');

      await expectGitlabError(client.getProject(42), ErrorCodes.UNAVAILABLE);
    });

    it('maps other 4xx to gitlabRequestFailed', async () => {
      gitlab.intercept({ path: '/api/v4/projects/42' }).reply(422, { message: 'Invalid' });

      const error = await expectGitlabError(client.getProject(42), ErrorCodes.REQUEST_FAILED);

      expect(error.status).to.equal(422);
    });

    it('maps a timeout to gitlabUnavailable', async () => {
      gitlab.intercept({ path: '/api/v4/projects/42' }).reply(200, PROJECT_RESPONSE).delay(500);

      const error = await expectGitlabError(client.getProject(42), ErrorCodes.UNAVAILABLE);

      expect(error.message).to.include('timed out');
    });

    it('maps a network failure to gitlabUnavailable', async () => {
      gitlab.intercept({ path: '/api/v4/projects/42' }).replyWithError(new Error('ECONNREFUSED'));

      const error = await expectGitlabError(client.getProject(42), ErrorCodes.UNAVAILABLE);

      expect(error.message).to.include('unreachable');
    });

    it('maps a non-JSON response to gitlabUnavailable', async () => {
      gitlab.intercept({ path: '/api/v4/projects/42' }).reply(200, '<html>login</html>');

      await expectGitlabError(client.getProject(42), ErrorCodes.UNAVAILABLE);
    });

    it('never leaks the token even if GitLab echoes it back', async () => {
      gitlab
        .intercept({ path: '/api/v4/projects/42' })
        .reply(400, { message: `bad token ${TOKEN}` });

      await expectGitlabError(client.getProject(42), ErrorCodes.REQUEST_FAILED);
    });
  });

  describe('getBranch', () => {
    it('fetches a branch and presents only the needed fields', async () => {
      gitlab
        .intercept({
          path: '/api/v4/projects/42/repository/branches/develop',
          method: 'GET',
          headers: { 'private-token': TOKEN },
        })
        .reply(200, {
          name: 'develop',
          web_url: 'https://gitlab.test/company/erp/-/tree/develop',
          commit: { id: 'abc' },
          protected: true,
        });

      const branch = await client.getBranch(42, 'develop');

      expect(branch).to.deep.equal({
        name: 'develop',
        webUrl: 'https://gitlab.test/company/erp/-/tree/develop',
      });
    });

    it('URL-encodes branch names containing slashes', async () => {
      gitlab
        .intercept({
          path: '/api/v4/projects/company%2Ferp/repository/branches/release%2F1.0',
          method: 'GET',
        })
        .reply(200, { name: 'release/1.0', web_url: 'https://gitlab.test/x' });

      const branch = await client.getBranch('company/erp', 'release/1.0');

      expect(branch.name).to.equal('release/1.0');
    });

    it('maps 404 to gitlabNotFound', async () => {
      gitlab
        .intercept({ path: '/api/v4/projects/42/repository/branches/missing' })
        .reply(404, { message: '404 Branch Not Found' });

      await expectGitlabError(client.getBranch(42, 'missing'), ErrorCodes.NOT_FOUND);
    });

    it('rejects invalid branch names without calling GitLab', async () => {
      await expectGitlabError(client.getBranch(42, ''), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getBranch(42, 'a'.repeat(256)), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getBranch(42, 'bad\nname'), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getBranch(42, null), ErrorCodes.REQUEST_FAILED);
    });

    it('rejects dot-segment branch names that would escape /repository/branches', async () => {
      await expectGitlabError(client.getBranch(42, '.'), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getBranch(42, '..'), ErrorCodes.REQUEST_FAILED);
    });
  });

  describe('createIssue', () => {
    const ISSUE_RESPONSE = {
      id: 9001,
      iid: 12,
      title: 'Implement login',
      state: 'opened',
      web_url: 'https://gitlab.test/company/erp/-/issues/12',
      updated_at: '2026-10-05T12:00:00.000Z',
      author: { id: 1 },
    };

    it('sends a JSON body and presents only the needed fields', async () => {
      let sentBody;

      gitlab
        .intercept({
          path: '/api/v4/projects/42/issues',
          method: 'POST',
          headers: {
            'private-token': TOKEN,
            'content-type': 'application/json',
          },
          body: (body) => {
            sentBody = JSON.parse(body);

            return true;
          },
        })
        .reply(201, ISSUE_RESPONSE);

      const issue = await client.createIssue(42, {
        title: '  Implement login  ',
        description: 'Details',
      });

      expect(sentBody).to.deep.equal({
        title: 'Implement login',
        description: 'Details',
      });

      expect(issue).to.deep.equal({
        id: 9001,
        iid: 12,
        title: 'Implement login',
        state: 'opened',
        webUrl: 'https://gitlab.test/company/erp/-/issues/12',
        updatedAt: '2026-10-05T12:00:00.000Z',
      });
    });

    it('omits a missing description and truncates long titles to 255 characters', async () => {
      let sentBody;

      gitlab
        .intercept({
          path: '/api/v4/projects/42/issues',
          method: 'POST',
          body: (body) => {
            sentBody = JSON.parse(body);

            return true;
          },
        })
        .reply(201, ISSUE_RESPONSE);

      await client.createIssue(42, {
        title: 'a'.repeat(300),
        description: null,
      });

      expect(sentBody.title).to.equal('a'.repeat(255));
      expect(sentBody).to.not.have.property('description');
    });

    it('rejects an empty title without calling GitLab', async () => {
      await expectGitlabError(client.createIssue(42, { title: '   ' }), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.createIssue(42, {}), ErrorCodes.REQUEST_FAILED);

      expect(mockAgent.pendingInterceptors()).to.have.lengthOf(0);
    });

    it('maps 404 to gitlabNotFound', async () => {
      gitlab
        .intercept({ path: '/api/v4/projects/42/issues', method: 'POST' })
        .reply(404, { message: '404 Project Not Found' });

      await expectGitlabError(client.createIssue(42, { title: 'x' }), ErrorCodes.NOT_FOUND);
    });
  });

  describe('getIssue', () => {
    it('fetches an issue by IID', async () => {
      gitlab
        .intercept({
          path: '/api/v4/projects/42/issues/12',
          method: 'GET',
          headers: { 'private-token': TOKEN },
        })
        .reply(200, {
          id: 9001,
          iid: 12,
          title: 'Implement login',
          state: 'closed',
          web_url: 'https://gitlab.test/company/erp/-/issues/12',
          updated_at: '2026-10-05T12:00:00.000Z',
          description: 'Not presented',
        });

      const issue = await client.getIssue(42, 12);

      expect(issue).to.deep.equal({
        id: 9001,
        iid: 12,
        title: 'Implement login',
        state: 'closed',
        webUrl: 'https://gitlab.test/company/erp/-/issues/12',
        updatedAt: '2026-10-05T12:00:00.000Z',
      });
    });

    it('rejects invalid IIDs without calling GitLab', async () => {
      await expectGitlabError(client.getIssue(42, 0), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getIssue(42, -1), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getIssue(42, 1.5), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getIssue(42, '12'), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(client.getIssue(42, '../1'), ErrorCodes.REQUEST_FAILED);
    });

    it('maps 404 to gitlabNotFound', async () => {
      gitlab
        .intercept({ path: '/api/v4/projects/42/issues/99' })
        .reply(404, { message: '404 Not found' });

      await expectGitlabError(client.getIssue(42, 99), ErrorCodes.NOT_FOUND);
    });
  });
});
