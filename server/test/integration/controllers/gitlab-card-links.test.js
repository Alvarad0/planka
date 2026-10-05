const crypto = require('crypto');
const { expect } = require('chai');
const request = require('supertest');
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = require('undici');

const GITLAB_URL = 'https://gitlab.test';
const GITLAB_TOKEN = 'glpat-card-links-test-token';
const GITLAB_PROJECT_ID = 42;

const EDITOR_API_KEY = 'test-card-links-editor-api-key';
const VIEWER_API_KEY = 'test-card-links-viewer-api-key';
const OUTSIDER_API_KEY = 'test-card-links-outsider-api-key';

const buildGitlabIssue = (iid, values = {}) => ({
  iid,
  id: 9000 + iid,
  title: `Issue ${iid}`,
  state: 'opened',
  web_url: `${GITLAB_URL}/company/erp/-/issues/${iid}`,
  updated_at: '2026-10-05T12:00:00.000Z',
  ...values,
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const createUser = (name, apiKey) =>
  User.create({
    name,
    role: User.Roles.BOARD_USER,
    email: `${name}@planka.test`,
    apiKeyHash: sha256(apiKey),
  }).fetch();

const createProjectWithBoard = async (name) => {
  const project = await Project.create({ name, isHidden: false }).fetch();

  const board = await Board.create({
    projectId: project.id,
    position: 65536,
    name: 'Development',
    defaultView: 'kanban',
    defaultCardType: 'project',
    limitCardTypesToDefaultOne: false,
    alwaysDisplayCardCreator: false,
  }).fetch();

  const list = await List.create({
    boardId: board.id,
    type: List.Types.ACTIVE,
    position: 65536,
    name: 'To Do',
  }).fetch();

  return { project, board, list };
};

const createCard = ({ board, list }, values = {}) =>
  Card.create({
    boardId: board.id,
    listId: list.id,
    type: 'project',
    position: 65536,
    name: 'Implement login',
    ...values,
  }).fetch();

const addBoardMember = ({ project, board }, user, role) =>
  BoardMembership.create({
    role,
    projectId: project.id,
    boardId: board.id,
    userId: user.id,
    canComment: role === BoardMembership.Roles.VIEWER ? false : null,
  }).fetch();

const createIntegration = (project, gitlabProjectId = GITLAB_PROJECT_ID) =>
  GitlabIntegration.qm.createOne({
    gitlabProjectId,
    projectId: project.id,
    gitlabProjectPath: `company/project-${gitlabProjectId}`,
    defaultBranch: 'main',
    webhookSecretHash: 'a'.repeat(64),
  });

describe('GitLab card links (controllers)', () => {
  const originalCustom = {};
  const responseBodies = [];

  let originalDispatcher;
  let mockAgent;
  let gitlab;

  let editor;
  let viewer;
  let outsider;

  let path;
  let card;
  let integration;

  const api = (method, url, apiKey = EDITOR_API_KEY) => {
    const req = request(sails.hooks.http.app)[method](url);

    return apiKey ? req.set('X-Api-Key', apiKey) : req;
  };

  // Records every response body so the suite can assert that the token never leaks
  const send = async (req, body) => {
    const response = await (body ? req.send(body) : req);
    responseBodies.push(response.text);

    return response;
  };

  const mockCreateIssue = (onBody, status = 201, response = buildGitlabIssue(12)) =>
    gitlab
      .intercept({
        path: `/api/v4/projects/${GITLAB_PROJECT_ID}/issues`,
        method: 'POST',
        headers: { 'private-token': GITLAB_TOKEN },
        body: (body) => {
          onBody(JSON.parse(body));

          return true;
        },
      })
      .reply(status, response);

  const mockGetIssue = (iid, status = 200, response = buildGitlabIssue(iid)) =>
    gitlab
      .intercept({
        path: `/api/v4/projects/${GITLAB_PROJECT_ID}/issues/${iid}`,
        method: 'GET',
        headers: { 'private-token': GITLAB_TOKEN },
      })
      .reply(status, response);

  const BRANCHES_PATH = `/api/v4/projects/${GITLAB_PROJECT_ID}/repository/branches`;

  const buildGitlabBranch = (name) => ({
    name,
    web_url: `${GITLAB_URL}/company/erp/-/tree/${name}`,
    commit: { id: 'abc' },
  });

  // Without a response, GitLab answers with the requested branch
  const mockCreateBranch = (onBody, { status = 201, response } = {}) =>
    gitlab
      .intercept({
        path: BRANCHES_PATH,
        method: 'POST',
        headers: { 'private-token': GITLAB_TOKEN },
        body: (body) => {
          onBody(JSON.parse(body));

          return true;
        },
      })
      .reply(status, (options) => response || buildGitlabBranch(JSON.parse(options.body).branch));

  const mockGetBranch = (name, status = 200, response = buildGitlabBranch(name)) =>
    gitlab
      .intercept({
        path: `${BRANCHES_PATH}/${encodeURIComponent(name)}`,
        method: 'GET',
        headers: { 'private-token': GITLAB_TOKEN },
      })
      .reply(status, response);

  const BRANCH_NAME = '12-implement-login';
  const MERGE_REQUESTS_PATH = `/api/v4/projects/${GITLAB_PROJECT_ID}/merge_requests`;
  const PIPELINES_PATH = `/api/v4/projects/${GITLAB_PROJECT_ID}/pipelines`;
  const COMMITS_PATH = `/api/v4/projects/${GITLAB_PROJECT_ID}/repository/commits`;

  const buildGitlabMergeRequest = (iid, values = {}) => ({
    iid,
    id: 5000 + iid,
    title: 'Issue 12',
    state: 'opened',
    draft: false,
    web_url: `${GITLAB_URL}/company/erp/-/merge_requests/${iid}`,
    source_branch: BRANCH_NAME,
    target_branch: 'main',
    created_at: '2026-10-05T12:00:00.000Z',
    updated_at: '2026-10-05T12:00:00.000Z',
    merged_at: null,
    ...values,
  });

  const presentGitlabMergeRequest = (mergeRequest) => ({
    id: mergeRequest.id,
    iid: mergeRequest.iid,
    title: mergeRequest.title,
    state: mergeRequest.state,
    draft: mergeRequest.draft,
    webUrl: mergeRequest.web_url,
    sourceBranch: mergeRequest.source_branch,
    targetBranch: mergeRequest.target_branch,
    createdAt: mergeRequest.created_at,
    updatedAt: mergeRequest.updated_at,
    mergedAt: mergeRequest.merged_at,
  });

  const buildGitlabPipeline = (id, values = {}) => ({
    id,
    status: 'success',
    ref: BRANCH_NAME,
    sha: 'abc123',
    web_url: `${GITLAB_URL}/company/erp/-/pipelines/${id}`,
    created_at: '2026-10-05T12:00:00.000Z',
    updated_at: '2026-10-05T12:05:00.000Z',
    ...values,
  });

  const buildGitlabCommit = (index) => ({
    id: `${index}`.padStart(40, '0'),
    short_id: `${index}`.padStart(8, '0'),
    title: `Commit ${index}`,
    author_name: 'Jane Doe',
    author_email: 'jane@example.com',
    created_at: '2026-10-05T12:00:00.000Z',
    web_url: `${GITLAB_URL}/company/erp/-/commit/${`${index}`.padStart(40, '0')}`,
  });

  const mockListMergeRequests = (state, status = 200, response = []) =>
    gitlab
      .intercept({
        path: MERGE_REQUESTS_PATH,
        method: 'GET',
        headers: { 'private-token': GITLAB_TOKEN },
        query: {
          state,
          source_branch: BRANCH_NAME,
          order_by: 'created_at',
          sort: 'desc',
          per_page: '20',
        },
      })
      .reply(status, response);

  const mockCreateMergeRequest = (onBody, status = 201, response = buildGitlabMergeRequest(7)) =>
    gitlab
      .intercept({
        path: MERGE_REQUESTS_PATH,
        method: 'POST',
        headers: { 'private-token': GITLAB_TOKEN },
        body: (body) => {
          onBody(JSON.parse(body));

          return true;
        },
      })
      .reply(status, response);

  const mockLatestPipeline = (status = 200, response = []) =>
    gitlab
      .intercept({
        path: PIPELINES_PATH,
        method: 'GET',
        headers: { 'private-token': GITLAB_TOKEN },
        query: {
          ref: BRANCH_NAME,
          order_by: 'id',
          sort: 'desc',
          per_page: '1',
        },
      })
      .reply(status, response);

  // Commits of the branch not in the default branch, newest first
  const mockListCommits = (status = 200, response = [], perPage = '100') =>
    gitlab
      .intercept({
        path: COMMITS_PATH,
        method: 'GET',
        headers: { 'private-token': GITLAB_TOKEN },
        query: {
          ref_name: `main..${BRANCH_NAME}`,
          per_page: perPage,
        },
      })
      .reply(status, response);

  const createLink = (cardId, values = {}) =>
    GitlabCardLink.qm.createOne({
      cardId,
      gitlabIntegrationId: integration.id,
      issueId: 9012,
      issueIid: 12,
      issueUrl: `${GITLAB_URL}/company/erp/-/issues/12`,
      ...values,
    });

  before(async () => {
    ['gitlabUrl', 'gitlabToken', 'outgoingProxy'].forEach((key) => {
      originalCustom[key] = sails.config.custom[key];
    });

    originalDispatcher = getGlobalDispatcher();

    editor = await createUser('cardlinkseditor', EDITOR_API_KEY);
    viewer = await createUser('cardlinksviewer', VIEWER_API_KEY);
    outsider = await createUser('cardlinksoutsider', OUTSIDER_API_KEY);
  });

  after(async () => {
    Object.assign(sails.config.custom, originalCustom);
    setGlobalDispatcher(originalDispatcher);

    await User.destroy({ id: [editor.id, viewer.id, outsider.id] });
  });

  beforeEach(async () => {
    Object.assign(sails.config.custom, {
      gitlabUrl: GITLAB_URL,
      gitlabToken: GITLAB_TOKEN,
      outgoingProxy: undefined,
    });

    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);

    gitlab = mockAgent.get(GITLAB_URL);

    path = await createProjectWithBoard('ERP');
    card = await createCard(path);
    integration = await createIntegration(path.project);

    await addBoardMember(path, editor, BoardMembership.Roles.EDITOR);
    await addBoardMember(path, viewer, BoardMembership.Roles.VIEWER);
  });

  afterEach(async () => {
    setGlobalDispatcher(originalDispatcher);
    await mockAgent.close();

    await sails.sendNativeQuery('DELETE FROM gitlab_card_link');
    await sails.sendNativeQuery('DELETE FROM gitlab_integration');
    await BoardMembership.destroy({});
    await Card.destroy({});
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
  });

  describe('authentication and permissions', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const response = await send(api('get', `/api/cards/${card.id}/gitlab`, null));

      expect(response.status).to.equal(401);
    });

    it('hides the card from users who are not board members', async () => {
      const responses = [
        await send(api('get', `/api/cards/${card.id}/gitlab`, OUTSIDER_API_KEY)),
        await send(api('post', `/api/cards/${card.id}/gitlab-issue`, OUTSIDER_API_KEY)),
        await send(api('post', `/api/cards/${card.id}/gitlab-link`, OUTSIDER_API_KEY), {
          issueIid: 12,
        }),
        await send(api('delete', `/api/cards/${card.id}/gitlab-link`, OUTSIDER_API_KEY)),
        await send(api('post', `/api/cards/${card.id}/gitlab-branch`, OUTSIDER_API_KEY)),
        await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`, OUTSIDER_API_KEY)),
        await send(api('get', `/api/cards/${card.id}/gitlab-commits`, OUTSIDER_API_KEY)),
      ];

      responses.forEach((response) => {
        expect(response.status).to.equal(404);
        expect(response.body.code).to.equal('E_NOT_FOUND');
      });
    });

    it('lets viewers read but not change the link', async () => {
      await createLink(card.id);
      mockGetIssue(12);

      const showResponse = await send(api('get', `/api/cards/${card.id}/gitlab`, VIEWER_API_KEY));

      expect(showResponse.status).to.equal(200);

      const commitsResponse = await send(
        api('get', `/api/cards/${card.id}/gitlab-commits`, VIEWER_API_KEY),
      );

      expect(commitsResponse.status).to.equal(200);

      const responses = [
        await send(api('post', `/api/cards/${card.id}/gitlab-issue`, VIEWER_API_KEY)),
        await send(api('post', `/api/cards/${card.id}/gitlab-link`, VIEWER_API_KEY), {
          issueIid: 12,
        }),
        await send(api('delete', `/api/cards/${card.id}/gitlab-link`, VIEWER_API_KEY)),
        await send(api('post', `/api/cards/${card.id}/gitlab-branch`, VIEWER_API_KEY)),
        await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`, VIEWER_API_KEY)),
      ];

      responses.forEach((response) => {
        expect(response.status).to.equal(403);
        expect(response.body.message).to.equal('Not enough rights');
      });

      expect(await GitlabCardLink.qm.getOneByCardId(card.id)).to.not.equal(undefined);
    });
  });

  describe('show', () => {
    it('returns no link for an unlinked card', async () => {
      const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

      expect(response.status).to.equal(200);
      expect(response.body.item).to.equal(null);
      expect(response.body.included).to.deep.equal({
        gitlabIntegration: {
          id: integration.id,
          gitlabProjectPath: integration.gitlabProjectPath,
        },
        gitlabIssue: null,
        gitlabMergeRequest: null,
        gitlabPipeline: null,
        commitsCount: null,
        hasMoreCommits: false,
        isStale: false,
        isProjectMismatch: false,
        suggestedBranchName: null,
        defaultBranch: 'main',
      });
    });

    it('returns the live issue and refreshes the snapshot', async () => {
      const link = await createLink(card.id);
      mockGetIssue(12, 200, buildGitlabIssue(12, { title: 'Renamed', state: 'closed' }));

      const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

      expect(response.status).to.equal(200);
      expect(response.body.item.id).to.equal(link.id);
      expect(response.body.item.snapshot).to.deep.equal({
        issue: {
          title: 'Renamed',
          state: 'closed',
          updatedAt: '2026-10-05T12:00:00.000Z',
        },
        mergeRequest: null,
        pipeline: null,
        commitsCount: null,
        hasMoreCommits: false,
      });
      expect(response.body.included.gitlabIssue).to.deep.equal({
        id: 9012,
        iid: 12,
        title: 'Renamed',
        state: 'closed',
        webUrl: `${GITLAB_URL}/company/erp/-/issues/12`,
        updatedAt: '2026-10-05T12:00:00.000Z',
      });
      expect(response.body.included.isStale).to.equal(false);
      expect(response.body.included.isProjectMismatch).to.equal(false);

      const stored = await GitlabCardLink.qm.getOneById(link.id);

      expect(stored.snapshot.issue.title).to.equal('Renamed');
      expect(stored.lastSyncedAt).to.not.equal(null);
    });

    it('returns the suggested branch name and default branch for a linked card', async () => {
      const accentedCard = await createCard(path, { name: 'Cálculo de Ñandú' });
      await createLink(accentedCard.id);
      mockGetIssue(12);

      const response = await send(api('get', `/api/cards/${accentedCard.id}/gitlab`));

      expect(response.status).to.equal(200);
      expect(response.body.included.suggestedBranchName).to.equal('12-calculo-de-nandu');
      expect(response.body.included.defaultBranch).to.equal('main');
    });

    it('returns no suggested branch name when the card already has a branch', async () => {
      await createLink(card.id, {
        branchName: '12-implement-login',
        branchUrl: `${GITLAB_URL}/company/erp/-/tree/12-implement-login`,
      });
      mockGetIssue(12);
      mockListMergeRequests('all');
      mockLatestPipeline();
      mockListCommits();

      const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

      expect(response.status).to.equal(200);
      expect(response.body.item.branchName).to.equal('12-implement-login');
      expect(response.body.item.branchUrl).to.equal(
        `${GITLAB_URL}/company/erp/-/tree/12-implement-login`,
      );
      expect(response.body.included.suggestedBranchName).to.equal(null);
      expect(response.body.included.defaultBranch).to.equal('main');
    });

    it('falls back to the snapshot when GitLab is down', async () => {
      await createLink(card.id, {
        snapshot: { title: 'Known title', state: 'opened', updatedAt: '2026-10-01T00:00:00.000Z' },
        lastSyncedAt: '2026-10-01T00:00:00.000Z',
      });

      gitlab
        .intercept({ path: `/api/v4/projects/${GITLAB_PROJECT_ID}/issues/12`, method: 'GET' })
        .replyWithError(new Error('ECONNREFUSED'));

      const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

      expect(response.status).to.equal(200);
      expect(response.body.included.isStale).to.equal(true);
      expect(response.body.included.gitlabIssue).to.deep.equal({
        id: 9012,
        iid: 12,
        title: 'Known title',
        state: 'opened',
        webUrl: `${GITLAB_URL}/company/erp/-/issues/12`,
        updatedAt: '2026-10-01T00:00:00.000Z',
      });
      expect(response.body.item.lastSyncedAt).to.equal('2026-10-01T00:00:00.000Z');
    });

    it('falls back to the snapshot when GitLab is not configured', async () => {
      await createLink(card.id, { snapshot: { title: 'Known title', state: 'opened' } });
      sails.config.custom.gitlabToken = null;

      const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

      expect(response.status).to.equal(200);
      expect(response.body.included.isStale).to.equal(true);
      expect(response.body.included.gitlabIssue.title).to.equal('Known title');
    });

    describe('with a branch', () => {
      const branchValues = {
        branchName: BRANCH_NAME,
        branchUrl: `${GITLAB_URL}/company/erp/-/tree/${BRANCH_NAME}`,
      };

      it('returns the issue, merge request, pipeline and commit count', async () => {
        const link = await createLink(card.id, branchValues);

        const openedMergeRequest = buildGitlabMergeRequest(8, { draft: true });

        mockGetIssue(12);
        mockListMergeRequests('all', 200, [
          buildGitlabMergeRequest(9, { state: 'closed' }),
          openedMergeRequest,
          buildGitlabMergeRequest(5, { state: 'merged' }),
        ]);
        mockLatestPipeline(200, [buildGitlabPipeline(287, { status: 'running' })]);
        mockListCommits(200, [buildGitlabCommit(2), buildGitlabCommit(1)]);

        const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

        const gitlabPipeline = {
          id: 287,
          status: 'running',
          ref: BRANCH_NAME,
          sha: 'abc123',
          webUrl: `${GITLAB_URL}/company/erp/-/pipelines/287`,
          createdAt: '2026-10-05T12:00:00.000Z',
          updatedAt: '2026-10-05T12:05:00.000Z',
        };

        expect(response.status).to.equal(200);
        expect(response.body.included.isStale).to.equal(false);
        expect(response.body.included.gitlabIssue.title).to.equal('Issue 12');
        expect(response.body.included.gitlabMergeRequest).to.deep.equal(
          presentGitlabMergeRequest(openedMergeRequest),
        );
        expect(response.body.included.gitlabPipeline).to.deep.equal(gitlabPipeline);
        expect(response.body.included.commitsCount).to.equal(2);
        expect(response.body.included.hasMoreCommits).to.equal(false);
        expect(mockAgent.pendingInterceptors()).to.have.lengthOf(0);

        const stored = await GitlabCardLink.qm.getOneById(link.id);

        expect(stored.snapshot).to.deep.equal({
          issue: {
            title: 'Issue 12',
            state: 'opened',
            updatedAt: '2026-10-05T12:00:00.000Z',
          },
          mergeRequest: presentGitlabMergeRequest(openedMergeRequest),
          pipeline: gitlabPipeline,
          commitsCount: 2,
          hasMoreCommits: false,
        });
        expect(stored.lastSyncedAt).to.not.equal(null);
      });

      it('returns the newest merged merge request and no commit count once merged', async () => {
        await createLink(card.id, branchValues);

        const mergedMergeRequest = buildGitlabMergeRequest(8, {
          state: 'merged',
          merged_at: '2026-10-06T12:00:00.000Z',
        });

        mockGetIssue(12);
        mockListMergeRequests('all', 200, [
          buildGitlabMergeRequest(9, { state: 'closed' }),
          mergedMergeRequest,
          buildGitlabMergeRequest(5, { state: 'merged' }),
        ]);
        mockLatestPipeline(200, [buildGitlabPipeline(287)]);
        mockListCommits(200, []);

        const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

        expect(response.status).to.equal(200);
        expect(response.body.included.isStale).to.equal(false);
        expect(response.body.included.gitlabMergeRequest).to.deep.equal(
          presentGitlabMergeRequest(mergedMergeRequest),
        );
        expect(response.body.included.commitsCount).to.equal(null);
      });

      it('returns no merge request when the branch has only closed ones', async () => {
        await createLink(card.id, branchValues);

        mockGetIssue(12);
        mockListMergeRequests('all', 200, [buildGitlabMergeRequest(9, { state: 'closed' })]);
        mockLatestPipeline();
        mockListCommits(200, [buildGitlabCommit(1)]);

        const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

        expect(response.status).to.equal(200);
        expect(response.body.included.gitlabMergeRequest).to.equal(null);
        expect(response.body.included.gitlabPipeline).to.equal(null);
        expect(response.body.included.commitsCount).to.equal(1);
      });

      it('counts commits up to 100 and flags that there are more', async () => {
        await createLink(card.id, branchValues);

        mockGetIssue(12);
        mockListMergeRequests('all');
        mockLatestPipeline();
        mockListCommits(
          200,
          Array.from({ length: 100 }, (_value, index) => buildGitlabCommit(100 - index)),
        );

        const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

        expect(response.status).to.equal(200);
        expect(response.body.included.commitsCount).to.equal(100);
        expect(response.body.included.hasMoreCommits).to.equal(true);
        expect(response.body.item.snapshot.hasMoreCommits).to.equal(true);
      });

      it('treats a branch deleted in GitLab as having no pipeline and commits', async () => {
        await createLink(card.id, branchValues);

        mockGetIssue(12);
        mockListMergeRequests('all');
        mockLatestPipeline(404, { message: '404 Not Found' });
        mockListCommits(404, { message: '404 Not Found' });

        const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

        expect(response.status).to.equal(200);
        expect(response.body.included.isStale).to.equal(false);
        expect(response.body.included.gitlabIssue.title).to.equal('Issue 12');
        expect(response.body.included.gitlabMergeRequest).to.equal(null);
        expect(response.body.included.gitlabPipeline).to.equal(null);
        expect(response.body.included.commitsCount).to.equal(null);
        expect(response.body.item.lastSyncedAt).to.not.equal(null);
      });

      it('falls back to the whole snapshot when any GitLab call fails', async () => {
        const snapshot = {
          issue: { title: 'Known title', state: 'opened', updatedAt: '2026-10-01T00:00:00.000Z' },
          mergeRequest: presentGitlabMergeRequest(buildGitlabMergeRequest(8)),
          pipeline: { id: 1, status: 'failed', ref: BRANCH_NAME },
          commitsCount: 4,
          hasMoreCommits: true,
        };

        const link = await createLink(card.id, {
          ...branchValues,
          snapshot,
          lastSyncedAt: '2026-10-01T00:00:00.000Z',
        });

        // Everything succeeds except the pipeline lookup
        mockGetIssue(12, 200, buildGitlabIssue(12, { title: 'Live title' }));
        mockListMergeRequests('all');
        mockLatestPipeline(500, { message: 'boom' });
        mockListCommits(200, []);

        const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

        expect(response.status).to.equal(200);
        expect(response.body.included.isStale).to.equal(true);
        expect(response.body.included.gitlabIssue).to.deep.equal({
          id: 9012,
          iid: 12,
          title: 'Known title',
          state: 'opened',
          webUrl: `${GITLAB_URL}/company/erp/-/issues/12`,
          updatedAt: '2026-10-01T00:00:00.000Z',
        });
        expect(response.body.included.gitlabMergeRequest).to.deep.equal(snapshot.mergeRequest);
        expect(response.body.included.gitlabPipeline).to.deep.equal(snapshot.pipeline);
        expect(response.body.included.commitsCount).to.equal(4);
        expect(response.body.included.hasMoreCommits).to.equal(true);
        expect(response.body.item.lastSyncedAt).to.equal('2026-10-01T00:00:00.000Z');

        const stored = await GitlabCardLink.qm.getOneById(link.id);

        expect(stored.snapshot).to.deep.equal(snapshot);
      });

      it('falls back to the snapshot when the merge request lookup is forbidden', async () => {
        await createLink(card.id, {
          ...branchValues,
          snapshot: { issue: { title: 'Known title' } },
        });

        mockGetIssue(12);
        mockListMergeRequests('all', 403, { message: '403 Forbidden' });
        mockLatestPipeline();
        mockListCommits();

        const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

        expect(response.status).to.equal(200);
        expect(response.body.included.isStale).to.equal(true);
        expect(response.body.included.gitlabIssue.title).to.equal('Known title');
        expect(response.body.included.gitlabMergeRequest).to.equal(null);
      });
    });

    it('reads a legacy snapshot as the issue when GitLab is down', async () => {
      await createLink(card.id, {
        branchName: BRANCH_NAME,
        snapshot: { title: 'Legacy title', state: 'closed', updatedAt: '2026-09-01T00:00:00.000Z' },
      });
      sails.config.custom.gitlabToken = null;

      const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

      expect(response.status).to.equal(200);
      expect(response.body.included.isStale).to.equal(true);
      expect(response.body.included.gitlabIssue.title).to.equal('Legacy title');
      expect(response.body.included.gitlabIssue.state).to.equal('closed');
      expect(response.body.included.gitlabMergeRequest).to.equal(null);
      expect(response.body.included.gitlabPipeline).to.equal(null);
      expect(response.body.included.commitsCount).to.equal(null);
      expect(response.body.included.hasMoreCommits).to.equal(false);
    });

    it('flags a link that belongs to another project after the card was moved', async () => {
      await createLink(card.id);

      const otherPath = await createProjectWithBoard('CRM');
      const otherIntegration = await createIntegration(otherPath.project, 77);
      await addBoardMember(otherPath, editor, BoardMembership.Roles.EDITOR);

      await Card.updateOne(card.id).set({
        boardId: otherPath.board.id,
        listId: otherPath.list.id,
      });

      // The issue is still fetched from the GitLab project of the link's integration
      mockGetIssue(12);

      const response = await send(api('get', `/api/cards/${card.id}/gitlab`));

      expect(response.status).to.equal(200);
      expect(response.body.included.isProjectMismatch).to.equal(true);
      expect(response.body.included.isStale).to.equal(false);
      expect(response.body.included.gitlabIntegration.id).to.equal(otherIntegration.id);
      expect(response.body.included.gitlabIssue.iid).to.equal(12);
    });
  });

  describe('create issue', () => {
    it('creates an issue from the card and links it', async () => {
      await Card.updateOne(card.id).set({ description: 'Card description' });

      let sentBody;
      mockCreateIssue((body) => {
        sentBody = body;
      });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-issue`));

      expect(response.status).to.equal(200);
      expect(sentBody).to.deep.equal({
        title: 'Implement login',
        description: 'Card description',
      });
      expect(response.body.item.cardId).to.equal(card.id);
      expect(response.body.item.gitlabIntegrationId).to.equal(integration.id);
      expect(response.body.item.issueIid).to.equal(12);
      expect(response.body.item.issueUrl).to.equal(`${GITLAB_URL}/company/erp/-/issues/12`);
      expect(response.body.item.snapshot.issue.state).to.equal('opened');
      expect(response.body.included.gitlabIssue.iid).to.equal(12);
      expect(response.body.included.suggestedBranchName).to.equal('12-implement-login');
      expect(response.body.included.defaultBranch).to.equal('main');

      const stored = await GitlabCardLink.qm.getOneByCardId(card.id);

      expect(stored.issueId).to.equal(9012);
      expect(stored.lastSyncedAt).to.not.equal(null);
    });

    it('truncates long card names to 255 characters and omits an empty description', async () => {
      const longCard = await createCard(path, { name: 'x'.repeat(300) });

      let sentBody;
      mockCreateIssue((body) => {
        sentBody = body;
      });

      const response = await send(api('post', `/api/cards/${longCard.id}/gitlab-issue`));

      expect(response.status).to.equal(200);
      expect(sentBody.title).to.equal('x'.repeat(255));
      expect(sentBody).to.not.have.property('description');
    });

    it('answers 422 when the project is not linked to GitLab', async () => {
      await GitlabIntegration.qm.deleteOne(integration.id);

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-issue`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Project is not linked to GitLab');
    });

    it('answers 409 when the card is already linked', async () => {
      mockCreateIssue(() => {});

      const firstResponse = await send(api('post', `/api/cards/${card.id}/gitlab-issue`));
      const secondResponse = await send(api('post', `/api/cards/${card.id}/gitlab-issue`));

      expect(firstResponse.status).to.equal(200);
      expect(secondResponse.status).to.equal(409);
    });

    it('answers 422 when the GitLab project is gone', async () => {
      mockCreateIssue(() => {}, 404, { message: '404 Project Not Found' });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-issue`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab project not found');
      expect(await GitlabCardLink.qm.getOneByCardId(card.id)).to.equal(undefined);
    });
  });

  describe('link issue', () => {
    it('links an existing issue (IID given as a numeric string)', async () => {
      mockGetIssue(12);

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-link`), {
        issueIid: '12',
      });

      expect(response.status).to.equal(200);
      expect(response.body.item.issueIid).to.equal(12);
      expect(response.body.item.snapshot.issue.title).to.equal('Issue 12');
      expect(response.body.included.gitlabIssue.iid).to.equal(12);
      expect((await GitlabCardLink.qm.getOneByCardId(card.id)).issueId).to.equal(9012);
    });

    it('rejects invalid IIDs', async () => {
      const responses = [
        await send(api('post', `/api/cards/${card.id}/gitlab-link`), { issueIid: 0 }),
        await send(api('post', `/api/cards/${card.id}/gitlab-link`), { issueIid: 1.5 }),
        await send(api('post', `/api/cards/${card.id}/gitlab-link`), { issueIid: 'abc' }),
        await send(api('post', `/api/cards/${card.id}/gitlab-link`), {}),
      ];

      responses.forEach((response) => {
        expect(response.status).to.equal(400);
      });
    });

    it('answers 422 when the issue does not exist', async () => {
      mockGetIssue(99, 404, { message: '404 Not found' });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-link`), {
        issueIid: 99,
      });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab issue not found');
    });

    it('answers 409 when the issue is linked to another card', async () => {
      const otherCard = await createCard(path, { name: 'Other' });
      await createLink(otherCard.id);

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-link`), {
        issueIid: 12,
      });

      expect(response.status).to.equal(409);
      expect(response.body.message).to.equal('GitLab issue is already linked to another card');
    });

    it('answers 409 when the card is already linked', async () => {
      await createLink(card.id);

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-link`), {
        issueIid: 13,
      });

      expect(response.status).to.equal(409);
      expect(response.body.message).to.equal('Card is already linked to a GitLab issue');
    });
  });

  describe('create branch', () => {
    const branchUrl = (name) => `${GITLAB_URL}/company/erp/-/tree/${name}`;

    it('creates a branch with the suggested name from the default branch', async () => {
      const accentedCard = await createCard(path, { name: 'Cálculo de impuestos (IVA)' });
      const link = await createLink(accentedCard.id);

      let sentBody;
      mockCreateBranch((body) => {
        sentBody = body;
      });

      const response = await send(api('post', `/api/cards/${accentedCard.id}/gitlab-branch`));

      expect(response.status).to.equal(200);
      expect(sentBody).to.deep.equal({
        branch: '12-calculo-de-impuestos-iva',
        ref: 'main',
      });
      expect(response.body.item.id).to.equal(link.id);
      expect(response.body.item.branchName).to.equal('12-calculo-de-impuestos-iva');
      expect(response.body.item.branchUrl).to.equal(branchUrl('12-calculo-de-impuestos-iva'));
      expect(response.body.included).to.deep.equal({
        gitlabBranch: {
          name: '12-calculo-de-impuestos-iva',
          webUrl: branchUrl('12-calculo-de-impuestos-iva'),
        },
        isExistingBranch: false,
      });

      const stored = await GitlabCardLink.qm.getOneById(link.id);

      expect(stored.branchName).to.equal('12-calculo-de-impuestos-iva');
      expect(stored.branchUrl).to.equal(branchUrl('12-calculo-de-impuestos-iva'));
    });

    it('creates a branch with a custom name', async () => {
      await createLink(card.id);

      let sentBody;
      mockCreateBranch((body) => {
        sentBody = body;
      });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`), {
        name: 'feature/login',
      });

      expect(response.status).to.equal(200);
      expect(sentBody).to.deep.equal({ branch: 'feature/login', ref: 'main' });
      expect(response.body.item.branchName).to.equal('feature/login');
    });

    it('creates a branch from a custom base branch', async () => {
      await createLink(card.id);

      let sentBody;
      mockCreateBranch((body) => {
        sentBody = body;
      });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`), {
        ref: 'release/1.0',
      });

      expect(response.status).to.equal(200);
      expect(sentBody).to.deep.equal({ branch: '12-implement-login', ref: 'release/1.0' });
    });

    it('answers 403 to viewers', async () => {
      await createLink(card.id);

      const response = await send(
        api('post', `/api/cards/${card.id}/gitlab-branch`, VIEWER_API_KEY),
      );

      expect(response.status).to.equal(403);
      expect((await GitlabCardLink.qm.getOneByCardId(card.id)).branchName).to.equal(null);
    });

    it('answers 422 when the card is not linked', async () => {
      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Card is not linked to a GitLab issue');
    });

    it('answers 422 when the card was moved to a project linked to another GitLab project', async () => {
      await createLink(card.id);

      const otherPath = await createProjectWithBoard('CRM');
      await createIntegration(otherPath.project, 77);
      await addBoardMember(otherPath, editor, BoardMembership.Roles.EDITOR);

      await Card.updateOne(card.id).set({
        boardId: otherPath.board.id,
        listId: otherPath.list.id,
      });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal(
        'Card was moved to a project linked to another GitLab project',
      );
    });

    it('answers 422 when the card was moved to a project not linked to GitLab', async () => {
      await createLink(card.id);

      const otherPath = await createProjectWithBoard('CRM');
      await addBoardMember(otherPath, editor, BoardMembership.Roles.EDITOR);

      await Card.updateOne(card.id).set({
        boardId: otherPath.board.id,
        listId: otherPath.list.id,
      });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal(
        'Card was moved to a project linked to another GitLab project',
      );
    });

    it('answers 409 when the card already has a branch', async () => {
      await createLink(card.id, { branchName: 'existing' });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`));

      expect(response.status).to.equal(409);
      expect(response.body.message).to.equal('Card already has a GitLab branch');
    });

    it('answers 422 to invalid branch names without calling GitLab', async () => {
      await createLink(card.id);

      const responses = [
        await send(api('post', `/api/cards/${card.id}/gitlab-branch`), { name: 'bad..name' }),
        await send(api('post', `/api/cards/${card.id}/gitlab-branch`), { name: 'bad name' }),
        await send(api('post', `/api/cards/${card.id}/gitlab-branch`), { name: '-bad' }),
      ];

      responses.forEach((response) => {
        expect(response.status).to.equal(422);
        expect(response.body.message).to.equal('Invalid branch name');
      });

      const refResponse = await send(api('post', `/api/cards/${card.id}/gitlab-branch`), {
        ref: 'bad~ref',
      });

      expect(refResponse.status).to.equal(422);
      expect(refResponse.body.message).to.equal('Invalid base branch name');
    });

    it('rejects names longer than 255 characters', async () => {
      await createLink(card.id);

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`), {
        name: 'a'.repeat(256),
      });

      expect(response.status).to.equal(400);
    });

    it('links the branch when it already exists in GitLab', async () => {
      await createLink(card.id);

      mockCreateBranch(() => {}, { status: 400, response: { message: 'Branch already exists' } });
      mockGetBranch('12-implement-login');

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`));

      expect(response.status).to.equal(200);
      expect(response.body.item.branchName).to.equal('12-implement-login');
      expect(response.body.item.branchUrl).to.equal(branchUrl('12-implement-login'));
      expect(response.body.included.isExistingBranch).to.equal(true);
    });

    it('rejects a branch already linked to another card without calling GitLab', async () => {
      const otherCard = await createCard(path, { name: 'Other' });

      await createLink(otherCard.id, {
        issueId: 9013,
        issueIid: 13,
        issueUrl: `${GITLAB_URL}/company/erp/-/issues/13`,
        branchName: 'shared-branch',
      });
      await createLink(card.id);

      // No GitLab interceptor: a call would fail because net connect is disabled
      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`), {
        name: 'shared-branch',
      });

      expect(response.status).to.equal(409);
      expect(response.body.message).to.equal('GitLab branch is already linked to another card');
      expect((await GitlabCardLink.qm.getOneByCardId(card.id)).branchName).to.equal(null);
    });

    it('answers 422 when the base branch does not exist', async () => {
      await createLink(card.id);

      mockCreateBranch(() => {}, {
        status: 400,
        response: { message: 'Invalid reference name: missing' },
      });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`), {
        ref: 'missing',
      });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab branch not found');
      expect((await GitlabCardLink.qm.getOneByCardId(card.id)).branchName).to.equal(null);
    });

    it('answers 422 when GitLab rejects the token', async () => {
      await createLink(card.id);

      mockCreateBranch(() => {}, {
        status: 401,
        response: { message: `401 Unauthorized ${GITLAB_TOKEN}` },
      });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-branch`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab token is invalid or expired');
    });
  });

  describe('create merge request', () => {
    const branchValues = {
      branchName: BRANCH_NAME,
      branchUrl: `${GITLAB_URL}/company/erp/-/tree/${BRANCH_NAME}`,
    };

    it('creates a merge request into the default branch closing the issue', async () => {
      const link = await createLink(card.id, {
        ...branchValues,
        snapshot: {
          issue: { title: 'Issue 12', state: 'opened' },
          mergeRequest: null,
          pipeline: { id: 1, status: 'success' },
          commitsCount: 3,
        },
      });

      mockListMergeRequests('opened');
      mockGetIssue(12, 200, buildGitlabIssue(12, { title: 'Implement login' }));

      let sentBody;
      const createdMergeRequest = buildGitlabMergeRequest(7, { title: 'Implement login' });
      mockCreateMergeRequest(
        (body) => {
          sentBody = body;
        },
        201,
        createdMergeRequest,
      );

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`));

      expect(response.status).to.equal(200);
      expect(sentBody).to.deep.equal({
        source_branch: BRANCH_NAME,
        target_branch: 'main',
        title: 'Implement login',
        description: 'Closes #12',
      });
      expect(response.body.item.id).to.equal(link.id);
      expect(response.body.included).to.deep.equal({
        gitlabMergeRequest: presentGitlabMergeRequest(createdMergeRequest),
        isExistingMergeRequest: false,
      });

      const stored = await GitlabCardLink.qm.getOneById(link.id);

      expect(stored.snapshot).to.deep.equal({
        issue: { title: 'Issue 12', state: 'opened' },
        mergeRequest: presentGitlabMergeRequest(createdMergeRequest),
        pipeline: { id: 1, status: 'success' },
        commitsCount: 3,
        hasMoreCommits: false,
      });
      expect(response.body.item.snapshot).to.deep.equal(stored.snapshot);
    });

    it('returns the open merge request of the branch without creating one', async () => {
      await createLink(card.id, {
        ...branchValues,
        snapshot: { title: 'Legacy title', state: 'opened' },
      });

      const existingMergeRequest = buildGitlabMergeRequest(4);
      mockListMergeRequests('opened', 200, [existingMergeRequest]);

      // No create interceptor: a call would fail because net connect is disabled
      const response = await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`));

      expect(response.status).to.equal(200);
      expect(response.body.included).to.deep.equal({
        gitlabMergeRequest: presentGitlabMergeRequest(existingMergeRequest),
        isExistingMergeRequest: true,
      });

      const stored = await GitlabCardLink.qm.getOneByCardId(card.id);

      // A legacy snapshot is upgraded, keeping its issue part
      expect(stored.snapshot).to.deep.equal({
        issue: { title: 'Legacy title', state: 'opened' },
        mergeRequest: presentGitlabMergeRequest(existingMergeRequest),
        pipeline: null,
        commitsCount: null,
        hasMoreCommits: false,
      });
    });

    it('returns the merge request opened concurrently when GitLab reports a conflict', async () => {
      await createLink(card.id, branchValues);

      const racedMergeRequest = buildGitlabMergeRequest(6);

      mockListMergeRequests('opened');
      mockGetIssue(12);
      mockCreateMergeRequest(() => {}, 409, {
        message: ['Another open merge request already exists for this source branch: !6'],
      });
      mockListMergeRequests('opened', 200, [racedMergeRequest]);

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`));

      expect(response.status).to.equal(200);
      expect(response.body.included).to.deep.equal({
        gitlabMergeRequest: presentGitlabMergeRequest(racedMergeRequest),
        isExistingMergeRequest: true,
      });
    });

    it('answers 422 when the card has no branch', async () => {
      await createLink(card.id);

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Card has no GitLab branch');
    });

    it('answers 422 when the card is not linked', async () => {
      const response = await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Card is not linked to a GitLab issue');
    });

    it('answers 422 when the card was moved to a project linked to another GitLab project', async () => {
      await createLink(card.id, branchValues);

      const otherPath = await createProjectWithBoard('CRM');
      await createIntegration(otherPath.project, 77);
      await addBoardMember(otherPath, editor, BoardMembership.Roles.EDITOR);

      await Card.updateOne(card.id).set({
        boardId: otherPath.board.id,
        listId: otherPath.list.id,
      });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal(
        'Card was moved to a project linked to another GitLab project',
      );
    });

    it('answers 422 when GitLab is down', async () => {
      await createLink(card.id, branchValues);

      gitlab
        .intercept({ path: (value) => value.startsWith(MERGE_REQUESTS_PATH), method: 'GET' })
        .replyWithError(new Error('ECONNREFUSED'));

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab is unavailable');
    });

    it('answers 422 when GitLab rejects the token', async () => {
      await createLink(card.id, branchValues);

      mockListMergeRequests('opened', 401, { message: `401 Unauthorized ${GITLAB_TOKEN}` });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab token is invalid or expired');
    });

    it('answers 422 when the issue no longer exists', async () => {
      await createLink(card.id, branchValues);

      mockListMergeRequests('opened');
      mockGetIssue(12, 404, { message: '404 Not found' });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab issue not found');
    });

    it('answers 422 when GitLab rejects the merge request', async () => {
      await createLink(card.id, branchValues);

      mockListMergeRequests('opened');
      mockGetIssue(12);
      mockCreateMergeRequest(() => {}, 409, {
        message: ["You can't use same project/branch for source and target"],
      });

      const response = await send(api('post', `/api/cards/${card.id}/gitlab-merge-request`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab request failed');
    });
  });

  describe('commits', () => {
    it('returns the commits of the branch newest first', async () => {
      await createLink(card.id, { branchName: BRANCH_NAME });

      mockListCommits(200, [buildGitlabCommit(2), buildGitlabCommit(1)], '50');

      const response = await send(api('get', `/api/cards/${card.id}/gitlab-commits`));

      expect(response.status).to.equal(200);
      expect(response.body.items.map(({ title }) => title)).to.deep.equal(['Commit 2', 'Commit 1']);
      expect(response.body.items[0]).to.deep.equal({
        id: '2'.padStart(40, '0'),
        shortId: '2'.padStart(8, '0'),
        title: 'Commit 2',
        authorName: 'Jane Doe',
        createdAt: '2026-10-05T12:00:00.000Z',
        webUrl: `${GITLAB_URL}/company/erp/-/commit/${'2'.padStart(40, '0')}`,
      });
    });

    it('requests at most the 50 newest commits', async () => {
      await createLink(card.id, { branchName: BRANCH_NAME });

      // The interceptor only matches per_page=50
      mockListCommits(
        200,
        Array.from({ length: 50 }, (_value, index) => buildGitlabCommit(60 - index)),
        '50',
      );

      const response = await send(api('get', `/api/cards/${card.id}/gitlab-commits`));

      expect(response.status).to.equal(200);
      expect(response.body.items).to.have.lengthOf(50);
      expect(response.body.items[0].title).to.equal('Commit 60');
      expect(response.body.items[49].title).to.equal('Commit 11');
    });

    it('returns no commits when GitLab answers an empty list', async () => {
      await createLink(card.id, { branchName: BRANCH_NAME });

      mockListCommits(200, [], '50');

      const response = await send(api('get', `/api/cards/${card.id}/gitlab-commits`));

      expect(response.status).to.equal(200);
      expect(response.body.items).to.deep.equal([]);
    });

    it('returns no commits without a link or a branch, without calling GitLab', async () => {
      const unlinkedResponse = await send(api('get', `/api/cards/${card.id}/gitlab-commits`));

      await createLink(card.id);

      const noBranchResponse = await send(api('get', `/api/cards/${card.id}/gitlab-commits`));

      [unlinkedResponse, noBranchResponse].forEach((response) => {
        expect(response.status).to.equal(200);
        expect(response.body.items).to.deep.equal([]);
      });
    });

    it('returns no commits when the branch was deleted in GitLab', async () => {
      await createLink(card.id, { branchName: BRANCH_NAME });

      mockListCommits(404, { message: '404 Not Found' }, '50');

      const response = await send(api('get', `/api/cards/${card.id}/gitlab-commits`));

      expect(response.status).to.equal(200);
      expect(response.body.items).to.deep.equal([]);
    });

    it('answers 422 when GitLab fails', async () => {
      await createLink(card.id, { branchName: BRANCH_NAME });

      mockListCommits(502, 'Bad Gateway', '50');

      const response = await send(api('get', `/api/cards/${card.id}/gitlab-commits`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab is unavailable');
    });
  });

  describe('unlink', () => {
    it('removes the link without calling GitLab', async () => {
      const link = await createLink(card.id);

      // No interceptor is registered and network access is disabled: any GitLab call would fail
      const response = await send(api('delete', `/api/cards/${card.id}/gitlab-link`));

      expect(response.status).to.equal(200);
      expect(response.body.item.id).to.equal(link.id);
      expect(await GitlabCardLink.qm.getOneById(link.id)).to.equal(undefined);
    });

    it('answers 404 when the card is not linked', async () => {
      const response = await send(api('delete', `/api/cards/${card.id}/gitlab-link`));

      expect(response.status).to.equal(404);
      expect(response.body.message).to.equal('GitLab card link not found');
    });
  });

  // Nested so it runs after the other groups (Mocha runs a level's own tests before its suites)
  describe('secrets', () => {
    it('never returns the GitLab token in any response', () => {
      expect(responseBodies.length).to.be.greaterThan(0);

      responseBodies.forEach((body) => {
        expect(body).to.not.include(GITLAB_TOKEN);
      });
    });
  });
});
