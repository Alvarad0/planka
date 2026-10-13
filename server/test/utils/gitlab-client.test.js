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

  describe('getCurrentUser', () => {
    it('fetches the user the token belongs to and presents only the needed fields', async () => {
      gitlab
        .intercept({
          path: '/api/v4/user',
          method: 'GET',
          headers: { 'private-token': TOKEN },
        })
        .reply(200, {
          id: 9,
          username: 'project_42_bot',
          name: 'Planka Bot',
          email: 'bot@gitlab.test',
        });

      expect(await client.getCurrentUser()).to.deep.equal({
        username: 'project_42_bot',
        name: 'Planka Bot',
      });
    });

    it('maps a rejected token to an unauthorized error', async () => {
      gitlab
        .intercept({ path: '/api/v4/user', method: 'GET' })
        .reply(401, { message: `401 Unauthorized ${TOKEN}` });

      await expectGitlabError(client.getCurrentUser(), ErrorCodes.UNAUTHORIZED);
    });

    it('rejects a response without a username', async () => {
      gitlab.intercept({ path: '/api/v4/user', method: 'GET' }).reply(200, { id: 9 });

      await expectGitlabError(client.getCurrentUser(), ErrorCodes.UNAVAILABLE);
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

  describe('createBranch', () => {
    const BRANCH_PATH = '/api/v4/projects/42/repository/branches';

    it('posts branch and ref and presents only the needed fields', async () => {
      let sentBody;

      gitlab
        .intercept({
          path: BRANCH_PATH,
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
        .reply(201, {
          name: '12-implement-login',
          web_url: 'https://gitlab.test/company/erp/-/tree/12-implement-login',
          commit: { id: 'abc' },
        });

      const branch = await client.createBranch(42, { name: '12-implement-login', ref: 'develop' });

      expect(sentBody).to.deep.equal({
        branch: '12-implement-login',
        ref: 'develop',
      });

      expect(branch).to.deep.equal({
        name: '12-implement-login',
        webUrl: 'https://gitlab.test/company/erp/-/tree/12-implement-login',
      });
    });

    it('detects an existing branch without exposing the GitLab message', async () => {
      gitlab
        .intercept({ path: BRANCH_PATH, method: 'POST' })
        .reply(400, { message: 'Branch already exists' });

      const error = await expectGitlabError(
        client.createBranch(42, { name: 'x', ref: 'develop' }),
        ErrorCodes.ALREADY_EXISTS,
      );

      expect(error.status).to.equal(400);
      expect(error.message).to.equal('GitLab branch already exists');
    });

    it('detects an existing branch case-insensitively', async () => {
      gitlab
        .intercept({ path: BRANCH_PATH, method: 'POST' })
        .reply(400, { message: 'BRANCH ALREADY EXISTS' });

      await expectGitlabError(
        client.createBranch(42, { name: 'x', ref: 'develop' }),
        ErrorCodes.ALREADY_EXISTS,
      );
    });

    it('detects a missing base ref', async () => {
      gitlab
        .intercept({ path: BRANCH_PATH, method: 'POST' })
        .reply(400, { message: 'Invalid reference name: missing' });

      const error = await expectGitlabError(
        client.createBranch(42, { name: 'x', ref: 'missing' }),
        ErrorCodes.REF_NOT_FOUND,
      );

      expect(error.message).to.not.include('missing');
    });

    it('maps any other 400 to gitlabRequestFailed', async () => {
      gitlab
        .intercept({ path: BRANCH_PATH, method: 'POST' })
        .reply(400, { message: 'Something else' });

      const error = await expectGitlabError(
        client.createBranch(42, { name: 'x', ref: 'develop' }),
        ErrorCodes.REQUEST_FAILED,
      );

      expect(error.message).to.not.include('Something else');
    });

    it('maps a 400 with a non-JSON body to gitlabRequestFailed', async () => {
      gitlab.intercept({ path: BRANCH_PATH, method: 'POST' }).reply(400, 'Bad Request');

      await expectGitlabError(
        client.createBranch(42, { name: 'x', ref: 'develop' }),
        ErrorCodes.REQUEST_FAILED,
      );
    });

    it('maps 404 to gitlabNotFound', async () => {
      gitlab
        .intercept({ path: BRANCH_PATH, method: 'POST' })
        .reply(404, { message: '404 Project Not Found' });

      await expectGitlabError(
        client.createBranch(42, { name: 'x', ref: 'develop' }),
        ErrorCodes.NOT_FOUND,
      );
    });

    it('never leaks the token even if GitLab echoes it back', async () => {
      gitlab
        .intercept({ path: BRANCH_PATH, method: 'POST' })
        .reply(400, { message: `Branch already exists ${TOKEN}` });

      await expectGitlabError(
        client.createBranch(42, { name: 'x', ref: 'develop' }),
        ErrorCodes.ALREADY_EXISTS,
      );

      gitlab
        .intercept({ path: BRANCH_PATH, method: 'POST' })
        .reply(400, { message: `bad token ${TOKEN}` });

      await expectGitlabError(
        client.createBranch(42, { name: 'x', ref: 'develop' }),
        ErrorCodes.REQUEST_FAILED,
      );
    });

    it('rejects invalid names and refs without calling GitLab', async () => {
      await expectGitlabError(
        client.createBranch(42, { name: '', ref: 'develop' }),
        ErrorCodes.REQUEST_FAILED,
      );
      await expectGitlabError(
        client.createBranch(42, { name: 'x', ref: 'bad\nref' }),
        ErrorCodes.REQUEST_FAILED,
      );
      await expectGitlabError(client.createBranch(42, {}), ErrorCodes.REQUEST_FAILED);

      expect(mockAgent.pendingInterceptors()).to.have.lengthOf(0);
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

  describe('listMergeRequests', () => {
    const MERGE_REQUESTS_PATH = '/api/v4/projects/42/merge_requests';

    const MERGE_REQUEST_RESPONSE = {
      id: 5001,
      iid: 7,
      title: 'Implement login',
      state: 'opened',
      draft: true,
      web_url: 'https://gitlab.test/company/erp/-/merge_requests/7',
      source_branch: 'feature/login',
      target_branch: 'develop',
      created_at: '2026-10-05T12:00:00.000Z',
      updated_at: '2026-10-05T13:00:00.000Z',
      merged_at: null,
      author: { id: 1 },
    };

    it('filters by source branch and state, newest first, and presents only the needed fields', async () => {
      gitlab
        .intercept({
          path: MERGE_REQUESTS_PATH,
          method: 'GET',
          headers: { 'private-token': TOKEN },
          query: {
            source_branch: 'feature/login',
            state: 'all',
            order_by: 'created_at',
            sort: 'desc',
            per_page: '20',
          },
        })
        .reply(200, [MERGE_REQUEST_RESPONSE]);

      const mergeRequests = await client.listMergeRequests(42, {
        sourceBranch: 'feature/login',
        state: 'all',
      });

      expect(mergeRequests).to.deep.equal([
        {
          id: 5001,
          iid: 7,
          title: 'Implement login',
          state: 'opened',
          draft: true,
          webUrl: 'https://gitlab.test/company/erp/-/merge_requests/7',
          sourceBranch: 'feature/login',
          targetBranch: 'develop',
          createdAt: '2026-10-05T12:00:00.000Z',
          updatedAt: '2026-10-05T13:00:00.000Z',
          mergedAt: null,
        },
      ]);
    });

    it('defaults to all states', async () => {
      gitlab
        .intercept({
          path: MERGE_REQUESTS_PATH,
          method: 'GET',
          query: {
            source_branch: 'x',
            state: 'all',
            order_by: 'created_at',
            sort: 'desc',
            per_page: '20',
          },
        })
        .reply(200, []);

      expect(await client.listMergeRequests(42, { sourceBranch: 'x' })).to.deep.equal([]);
    });

    it('maps 404 to gitlabNotFound', async () => {
      gitlab
        .intercept({ path: (path) => path.startsWith(MERGE_REQUESTS_PATH), method: 'GET' })
        .reply(404, { message: '404 Project Not Found' });

      await expectGitlabError(
        client.listMergeRequests(42, { sourceBranch: 'x' }),
        ErrorCodes.NOT_FOUND,
      );
    });

    it('maps a non-array response to gitlabUnavailable', async () => {
      gitlab
        .intercept({ path: (path) => path.startsWith(MERGE_REQUESTS_PATH), method: 'GET' })
        .reply(200, { message: 'unexpected' });

      await expectGitlabError(
        client.listMergeRequests(42, { sourceBranch: 'x' }),
        ErrorCodes.UNAVAILABLE,
      );
    });

    it('rejects invalid branches and states without calling GitLab', async () => {
      await expectGitlabError(client.listMergeRequests(42, {}), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(
        client.listMergeRequests(42, { sourceBranch: 'bad\nname' }),
        ErrorCodes.REQUEST_FAILED,
      );
      await expectGitlabError(
        client.listMergeRequests(42, { sourceBranch: 'x', state: 'bogus' }),
        ErrorCodes.REQUEST_FAILED,
      );
    });
  });

  describe('createMergeRequest', () => {
    const MERGE_REQUESTS_PATH = '/api/v4/projects/42/merge_requests';

    const MERGE_REQUEST_RESPONSE = {
      id: 5001,
      iid: 7,
      title: 'Implement login',
      state: 'opened',
      draft: false,
      web_url: 'https://gitlab.test/company/erp/-/merge_requests/7',
      source_branch: '12-implement-login',
      target_branch: 'develop',
      created_at: '2026-10-05T12:00:00.000Z',
      updated_at: '2026-10-05T12:00:00.000Z',
      merged_at: null,
    };

    const mergeRequestValues = {
      sourceBranch: '12-implement-login',
      targetBranch: 'develop',
      title: 'Implement login',
    };

    it('posts a JSON body and presents only the needed fields', async () => {
      let sentBody;

      gitlab
        .intercept({
          path: MERGE_REQUESTS_PATH,
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
        .reply(201, MERGE_REQUEST_RESPONSE);

      const mergeRequest = await client.createMergeRequest(42, {
        ...mergeRequestValues,
        title: '  Implement login  ',
        description: 'Closes #12',
      });

      expect(sentBody).to.deep.equal({
        source_branch: '12-implement-login',
        target_branch: 'develop',
        title: 'Implement login',
        description: 'Closes #12',
      });

      expect(mergeRequest).to.deep.equal({
        id: 5001,
        iid: 7,
        title: 'Implement login',
        state: 'opened',
        draft: false,
        webUrl: 'https://gitlab.test/company/erp/-/merge_requests/7',
        sourceBranch: '12-implement-login',
        targetBranch: 'develop',
        createdAt: '2026-10-05T12:00:00.000Z',
        updatedAt: '2026-10-05T12:00:00.000Z',
        mergedAt: null,
      });
    });

    it('omits a missing description and truncates long titles to 255 characters', async () => {
      let sentBody;

      gitlab
        .intercept({
          path: MERGE_REQUESTS_PATH,
          method: 'POST',
          body: (body) => {
            sentBody = JSON.parse(body);

            return true;
          },
        })
        .reply(201, MERGE_REQUEST_RESPONSE);

      await client.createMergeRequest(42, { ...mergeRequestValues, title: 'a'.repeat(300) });

      expect(sentBody.title).to.equal('a'.repeat(255));
      expect(sentBody).to.not.have.property('description');
    });

    it('detects an existing open merge request without exposing the GitLab message', async () => {
      gitlab.intercept({ path: MERGE_REQUESTS_PATH, method: 'POST' }).reply(409, {
        message: ['Another open merge request already exists for this source branch: !7'],
      });

      const error = await expectGitlabError(
        client.createMergeRequest(42, mergeRequestValues),
        ErrorCodes.MERGE_REQUEST_ALREADY_EXISTS,
      );

      expect(error.status).to.equal(409);
      expect(error.message).to.equal('GitLab merge request already exists');
    });

    it('detects an existing open merge request from a string message', async () => {
      gitlab.intercept({ path: MERGE_REQUESTS_PATH, method: 'POST' }).reply(409, {
        message: 'Another open merge request already exists for this source branch: !7',
      });

      await expectGitlabError(
        client.createMergeRequest(42, mergeRequestValues),
        ErrorCodes.MERGE_REQUEST_ALREADY_EXISTS,
      );
    });

    it('maps any other 409 to gitlabRequestFailed', async () => {
      gitlab.intercept({ path: MERGE_REQUESTS_PATH, method: 'POST' }).reply(409, {
        message: ["You can't use same project/branch for source and target"],
      });

      const error = await expectGitlabError(
        client.createMergeRequest(42, mergeRequestValues),
        ErrorCodes.REQUEST_FAILED,
      );

      expect(error.status).to.equal(409);
    });

    it('maps 404 to gitlabNotFound', async () => {
      gitlab
        .intercept({ path: MERGE_REQUESTS_PATH, method: 'POST' })
        .reply(404, { message: '404 Project Not Found' });

      await expectGitlabError(
        client.createMergeRequest(42, mergeRequestValues),
        ErrorCodes.NOT_FOUND,
      );
    });

    it('rejects invalid branches and titles without calling GitLab', async () => {
      await expectGitlabError(
        client.createMergeRequest(42, { ...mergeRequestValues, sourceBranch: '' }),
        ErrorCodes.REQUEST_FAILED,
      );
      await expectGitlabError(
        client.createMergeRequest(42, { ...mergeRequestValues, targetBranch: 'bad\nref' }),
        ErrorCodes.REQUEST_FAILED,
      );
      await expectGitlabError(
        client.createMergeRequest(42, { ...mergeRequestValues, title: '  ' }),
        ErrorCodes.REQUEST_FAILED,
      );
      await expectGitlabError(client.createMergeRequest(42, {}), ErrorCodes.REQUEST_FAILED);

      expect(mockAgent.pendingInterceptors()).to.have.lengthOf(0);
    });
  });

  describe('getLatestPipeline', () => {
    const PIPELINES_PATH = '/api/v4/projects/42/pipelines';

    it('fetches the newest pipeline of a ref and presents only the needed fields', async () => {
      gitlab
        .intercept({
          path: PIPELINES_PATH,
          method: 'GET',
          headers: { 'private-token': TOKEN },
          query: {
            ref: 'feature/login',
            order_by: 'id',
            sort: 'desc',
            per_page: '1',
          },
        })
        .reply(200, [
          {
            id: 287,
            iid: 144,
            project_id: 42,
            status: 'success',
            source: 'push',
            ref: 'feature/login',
            sha: '50f0acb7',
            web_url: 'https://gitlab.test/company/erp/-/pipelines/287',
            created_at: '2026-10-05T12:00:00.000Z',
            updated_at: '2026-10-05T12:05:00.000Z',
          },
        ]);

      const pipeline = await client.getLatestPipeline(42, { ref: 'feature/login' });

      expect(pipeline).to.deep.equal({
        id: 287,
        status: 'success',
        ref: 'feature/login',
        sha: '50f0acb7',
        webUrl: 'https://gitlab.test/company/erp/-/pipelines/287',
        createdAt: '2026-10-05T12:00:00.000Z',
        updatedAt: '2026-10-05T12:05:00.000Z',
      });
    });

    it('returns null when the ref has no pipelines', async () => {
      gitlab
        .intercept({ path: (path) => path.startsWith(PIPELINES_PATH), method: 'GET' })
        .reply(200, []);

      expect(await client.getLatestPipeline(42, { ref: 'x' })).to.equal(null);
    });

    it('maps 403 to gitlabForbidden', async () => {
      gitlab
        .intercept({ path: (path) => path.startsWith(PIPELINES_PATH), method: 'GET' })
        .reply(403, { message: '403 Forbidden' });

      await expectGitlabError(client.getLatestPipeline(42, { ref: 'x' }), ErrorCodes.FORBIDDEN);
    });

    it('rejects invalid refs without calling GitLab', async () => {
      await expectGitlabError(client.getLatestPipeline(42, {}), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(
        client.getLatestPipeline(42, { ref: '..' }),
        ErrorCodes.REQUEST_FAILED,
      );
    });
  });

  describe('listCommits', () => {
    const COMMITS_PATH = '/api/v4/projects/42/repository/commits';

    const buildCommit = (index) => ({
      id: `${index}`.repeat(40),
      short_id: `${index}`.repeat(8),
      title: `Commit ${index}`,
      author_name: 'Jane Doe',
      author_email: 'jane@example.com',
      created_at: `2026-10-0${index}T12:00:00.000Z`,
      message: 'not presented',
      web_url: `https://gitlab.test/company/erp/-/commit/${`${index}`.repeat(40)}`,
    });

    it('lists the commits of the revision range as returned (newest first)', async () => {
      gitlab
        .intercept({
          path: `${COMMITS_PATH}?ref_name=develop..feature%2Flogin&per_page=100`,
          method: 'GET',
          headers: { 'private-token': TOKEN },
        })
        .reply(200, [buildCommit(2), buildCommit(1)]);

      const commits = await client.listCommits(42, { from: 'develop', to: 'feature/login' });

      expect(commits).to.deep.equal([
        {
          id: '2'.repeat(40),
          shortId: '2'.repeat(8),
          title: 'Commit 2',
          authorName: 'Jane Doe',
          createdAt: '2026-10-02T12:00:00.000Z',
          webUrl: `https://gitlab.test/company/erp/-/commit/${'2'.repeat(40)}`,
        },
        {
          id: '1'.repeat(40),
          shortId: '1'.repeat(8),
          title: 'Commit 1',
          authorName: 'Jane Doe',
          createdAt: '2026-10-01T12:00:00.000Z',
          webUrl: `https://gitlab.test/company/erp/-/commit/${'1'.repeat(40)}`,
        },
      ]);
    });

    it('requests the given limit, clamped to 1..100', async () => {
      [
        [50, '50'],
        [500, '100'],
        [0, '1'],
        [undefined, '100'],
      ].forEach(([, perPage]) => {
        gitlab
          .intercept({
            path: COMMITS_PATH,
            method: 'GET',
            query: { ref_name: 'develop..x', per_page: perPage },
          })
          .reply(200, []);
      });

      await client.listCommits(42, { from: 'develop', to: 'x', limit: 50 });
      await client.listCommits(42, { from: 'develop', to: 'x', limit: 500 });
      await client.listCommits(42, { from: 'develop', to: 'x', limit: 0 });
      await client.listCommits(42, { from: 'develop', to: 'x' });

      expect(mockAgent.pendingInterceptors()).to.have.lengthOf(0);
    });

    it('returns an empty list when the branch has no new commits', async () => {
      gitlab
        .intercept({ path: (path) => path.startsWith(COMMITS_PATH), method: 'GET' })
        .reply(200, []);

      expect(await client.listCommits(42, { from: 'develop', to: 'x' })).to.deep.equal([]);
    });

    it('maps 404 to gitlabNotFound', async () => {
      gitlab
        .intercept({ path: (path) => path.startsWith(COMMITS_PATH), method: 'GET' })
        .reply(404, { message: '404 Not Found' });

      await expectGitlabError(
        client.listCommits(42, { from: 'develop', to: 'deleted' }),
        ErrorCodes.NOT_FOUND,
      );
    });

    it('maps a non-array response to gitlabUnavailable', async () => {
      gitlab
        .intercept({ path: (path) => path.startsWith(COMMITS_PATH), method: 'GET' })
        .reply(200, {});

      await expectGitlabError(
        client.listCommits(42, { from: 'develop', to: 'x' }),
        ErrorCodes.UNAVAILABLE,
      );
    });

    it('rejects invalid refs without calling GitLab', async () => {
      await expectGitlabError(client.listCommits(42, { to: 'x' }), ErrorCodes.REQUEST_FAILED);
      await expectGitlabError(
        client.listCommits(42, { from: 'develop', to: 'bad\nref' }),
        ErrorCodes.REQUEST_FAILED,
      );
    });
  });
});
