const crypto = require('crypto');
const { expect } = require('chai');
const request = require('supertest');
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = require('undici');

const GITLAB_URL = 'https://gitlab.test';
const GITLAB_TOKEN = 'glpat-test-token';

const MANAGER_API_KEY = 'test-manager-api-key';
const BOARD_USER_API_KEY = 'test-board-user-api-key';

const GITLAB_PROJECT = {
  id: 42,
  name: 'ERP',
  path_with_namespace: 'company/erp',
  default_branch: 'develop',
  web_url: 'https://gitlab.test/company/erp',
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const createUser = (name, role, apiKey) =>
  User.create({
    role,
    name,
    email: `${name}@planka.test`,
    apiKeyHash: sha256(apiKey),
  }).fetch();

const createProjectWithLists = async (name) => {
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

  const activeList = await List.create({
    boardId: board.id,
    type: List.Types.ACTIVE,
    position: 65536,
    name: 'Code Review',
  }).fetch();

  const closedList = await List.create({
    boardId: board.id,
    type: List.Types.CLOSED,
    position: 131072,
    name: 'Done',
  }).fetch();

  return { project, board, activeList, closedList };
};

describe('GitLab integrations (controllers)', () => {
  const originalCustom = {};
  const responseBodies = [];

  let originalDispatcher;
  let mockAgent;
  let gitlab;

  let manager;
  let boardUser;
  let project;
  let activeList;
  let closedList;

  const api = (method, url, apiKey = MANAGER_API_KEY) => {
    const req = request(sails.hooks.http.app)[method](url);

    return apiKey ? req.set('X-Api-Key', apiKey) : req;
  };

  // Records every response body so the suite can assert that the token never leaks
  const send = async (req, body) => {
    const response = await (body ? req.send(body) : req);
    responseBodies.push(response.text);

    return response;
  };

  const mockGetProject = (ref = '42', status = 200, body = GITLAB_PROJECT) =>
    gitlab
      .intercept({
        path: `/api/v4/projects/${ref}`,
        method: 'GET',
        headers: { 'private-token': GITLAB_TOKEN },
      })
      .reply(status, body);

  const mockGetBranch = (branchName, status = 200) =>
    gitlab
      .intercept({
        path: `/api/v4/projects/42/repository/branches/${encodeURIComponent(branchName)}`,
        method: 'GET',
      })
      .reply(status, { name: branchName, web_url: `${GITLAB_URL}/company/erp/-/tree/x` });

  const createIntegrationResponse = async () => {
    mockGetProject('company%2Ferp');

    const response = await send(api('post', `/api/projects/${project.id}/gitlab-integration`), {
      gitlabProject: 'company/erp',
    });

    expect(response.status).to.equal(200);

    return response.body;
  };

  const createIntegration = async () => (await createIntegrationResponse()).item;

  before(async () => {
    ['gitlabUrl', 'gitlabToken', 'outgoingProxy'].forEach((key) => {
      originalCustom[key] = sails.config.custom[key];
    });

    originalDispatcher = getGlobalDispatcher();

    manager = await createUser('manager', User.Roles.PROJECT_OWNER, MANAGER_API_KEY);
    boardUser = await createUser('boarduser', User.Roles.BOARD_USER, BOARD_USER_API_KEY);
  });

  after(async () => {
    Object.assign(sails.config.custom, originalCustom);
    setGlobalDispatcher(originalDispatcher);

    await User.destroy({ id: [manager.id, boardUser.id] });
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

    ({ project, activeList, closedList } = await createProjectWithLists('ERP'));

    await ProjectManager.create({ projectId: project.id, userId: manager.id });
  });

  afterEach(async () => {
    setGlobalDispatcher(originalDispatcher);
    await mockAgent.close();

    await sails.sendNativeQuery('DELETE FROM gitlab_integration');
    await ProjectManager.destroy({});
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
  });

  describe('authentication and permissions', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const response = await send(
        api('get', `/api/projects/${project.id}/gitlab-integration`, null),
      );

      expect(response.status).to.equal(401);
    });

    it('hides integrations from users who are not project managers', async () => {
      const integration = await createIntegration();

      const responses = [
        await send(
          api('post', `/api/projects/${project.id}/gitlab-integration`, BOARD_USER_API_KEY),
          { gitlabProject: 'company/erp' },
        ),
        await send(
          api('get', `/api/projects/${project.id}/gitlab-integration`, BOARD_USER_API_KEY),
        ),
        await send(api('patch', `/api/gitlab-integrations/${integration.id}`, BOARD_USER_API_KEY), {
          autoMoveOnMrOpen: true,
        }),
        await send(api('delete', `/api/gitlab-integrations/${integration.id}`, BOARD_USER_API_KEY)),
        await send(
          api(
            'post',
            `/api/gitlab-integrations/${integration.id}/rotate-webhook-secret`,
            BOARD_USER_API_KEY,
          ),
        ),
      ];

      responses.forEach((response) => {
        expect(response.status).to.equal(404);
        expect(response.body.code).to.equal('E_NOT_FOUND');
      });

      expect(await GitlabIntegration.qm.getOneById(integration.id)).to.not.equal(undefined);
    });
  });

  describe('create', () => {
    it('creates an integration and returns the webhook secret once', async () => {
      const { item, included: createdIncluded } = await createIntegrationResponse();

      expect(item.projectId).to.equal(project.id);
      expect(item.gitlabProjectId).to.equal(42);
      expect(item.gitlabProjectPath).to.equal('company/erp');
      expect(item.defaultBranch).to.equal('develop');
      expect(item.webhookUrl).to.equal(
        `${sails.config.custom.baseUrl}/api/gitlab/webhooks/${item.id}`,
      );
      expect(item.webhookSecret).to.be.a('string').with.lengthOf(40);
      expect(item).to.not.have.property('webhookSecretHash');
      expect(createdIncluded.gitlabListOptions.map(({ id }) => id)).to.deep.equal([
        activeList.id,
        closedList.id,
      ]);

      const stored = await GitlabIntegration.qm.getOneById(item.id);

      expect(stored.webhookSecretHash).to.equal(sha256(item.webhookSecret));
    });

    it('verifies an explicit default branch', async () => {
      mockGetProject('42');
      mockGetBranch('release/1.0');

      const response = await send(api('post', `/api/projects/${project.id}/gitlab-integration`), {
        gitlabProject: '42',
        defaultBranch: 'release/1.0',
      });

      expect(response.status).to.equal(200);
      expect(response.body.item.defaultBranch).to.equal('release/1.0');
    });

    it('rejects a default branch that does not exist in GitLab', async () => {
      mockGetProject('42');
      mockGetBranch('missing', 404);

      const response = await send(api('post', `/api/projects/${project.id}/gitlab-integration`), {
        gitlabProject: '42',
        defaultBranch: 'missing',
      });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab branch not found');
    });

    it('rejects a second integration for the same project with 409', async () => {
      await createIntegration();

      const response = await send(api('post', `/api/projects/${project.id}/gitlab-integration`), {
        gitlabProject: 'company/erp',
      });

      expect(response.status).to.equal(409);
    });

    it('answers 422 when the GitLab project does not exist', async () => {
      mockGetProject('company%2Fmissing', 404, { message: '404 Project Not Found' });

      const response = await send(api('post', `/api/projects/${project.id}/gitlab-integration`), {
        gitlabProject: 'company/missing',
      });

      expect(response.status).to.equal(422);
      expect(response.body.code).to.equal('E_UNPROCESSABLE_ENTITY');
      expect(response.body.message).to.equal('GitLab project not found');
      expect(await GitlabIntegration.qm.getOneByProjectId(project.id)).to.equal(undefined);
    });

    it('answers 422, never 401, when the GitLab token is rejected', async () => {
      mockGetProject('company%2Ferp', 401, { message: '401 Unauthorized' });

      const response = await send(api('post', `/api/projects/${project.id}/gitlab-integration`), {
        gitlabProject: 'company/erp',
      });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab token is invalid or expired');
    });

    it('answers 422 when GitLab is not configured', async () => {
      sails.config.custom.gitlabUrl = null;

      const response = await send(api('post', `/api/projects/${project.id}/gitlab-integration`), {
        gitlabProject: 'company/erp',
      });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab is not configured');
    });
  });

  describe('show', () => {
    it('returns the integration without any secret', async () => {
      const integration = await createIntegration();

      const response = await send(api('get', `/api/projects/${project.id}/gitlab-integration`));

      expect(response.status).to.equal(200);
      expect(response.body.item.id).to.equal(integration.id);
      expect(response.body.item.webhookUrl).to.equal(integration.webhookUrl);
      expect(response.body.item).to.not.have.property('webhookSecret');
      expect(response.body.item).to.not.have.property('webhookSecretHash');
    });

    it('answers 404 when the project has no integration', async () => {
      const response = await send(api('get', `/api/projects/${project.id}/gitlab-integration`));

      expect(response.status).to.equal(404);
    });

    it('includes the active and closed lists of the project as list options', async () => {
      await createIntegration();

      const board = await Board.qm.getOneById(activeList.boardId);

      const secondBoard = await Board.create({
        projectId: project.id,
        position: 131072,
        name: 'Operations',
        defaultView: 'kanban',
        defaultCardType: 'project',
        limitCardTypesToDefaultOne: false,
        alwaysDisplayCardCreator: false,
      }).fetch();

      const secondBoardList = await List.create({
        boardId: secondBoard.id,
        type: List.Types.ACTIVE,
        position: 65536,
        name: 'Testing',
      }).fetch();

      await List.create({ boardId: board.id, type: List.Types.ARCHIVE });
      await List.create({ boardId: board.id, type: List.Types.TRASH });
      await createProjectWithLists('Other');

      const response = await send(api('get', `/api/projects/${project.id}/gitlab-integration`));

      expect(response.status).to.equal(200);
      expect(response.body.included.gitlabListOptions).to.deep.equal([
        {
          id: activeList.id,
          name: 'Code Review',
          type: List.Types.ACTIVE,
          boardId: board.id,
          boardName: 'Development',
        },
        {
          id: closedList.id,
          name: 'Done',
          type: List.Types.CLOSED,
          boardId: board.id,
          boardName: 'Development',
        },
        {
          id: secondBoardList.id,
          name: 'Testing',
          type: List.Types.ACTIVE,
          boardId: secondBoard.id,
          boardName: 'Operations',
        },
      ]);
    });
  });

  describe('update', () => {
    it('accepts a closed list as completed list and keeps other fields', async () => {
      const integration = await createIntegration();

      const response = await send(api('patch', `/api/gitlab-integrations/${integration.id}`), {
        completedListId: closedList.id,
        autoMoveOnMrMerge: true,
      });

      expect(response.status).to.equal(200);
      expect(response.body.item.completedListId).to.equal(closedList.id);
      expect(response.body.item.autoMoveOnMrMerge).to.equal(true);
      expect(response.body.item.autoMoveOnMrOpen).to.equal(false);
      expect(response.body.item.defaultBranch).to.equal('develop');
      expect(response.body.item.reviewListId).to.equal(null);

      const next = await send(api('patch', `/api/gitlab-integrations/${integration.id}`), {
        reviewListId: activeList.id,
      });

      expect(next.status).to.equal(200);
      expect(next.body.item.reviewListId).to.equal(activeList.id);
      expect(next.body.item.completedListId).to.equal(closedList.id);
      expect(next.body.item.autoMoveOnMrMerge).to.equal(true);
    });

    it('rejects an active list as completed list', async () => {
      const integration = await createIntegration();

      const response = await send(api('patch', `/api/gitlab-integrations/${integration.id}`), {
        completedListId: activeList.id,
      });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Completed list must be closed');
    });

    it('rejects a closed list as review list', async () => {
      const integration = await createIntegration();

      const response = await send(api('patch', `/api/gitlab-integrations/${integration.id}`), {
        reviewListId: closedList.id,
      });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Review list must be active');
    });

    it('rejects a list from another project', async () => {
      const integration = await createIntegration();
      const other = await createProjectWithLists('Other');

      const response = await send(api('patch', `/api/gitlab-integrations/${integration.id}`), {
        completedListId: other.closedList.id,
      });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('List must belong to project');
    });

    it('verifies a new default branch in GitLab', async () => {
      const integration = await createIntegration();

      mockGetBranch('missing', 404);

      const response = await send(api('patch', `/api/gitlab-integrations/${integration.id}`), {
        defaultBranch: 'missing',
      });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab branch not found');

      mockGetBranch('main');

      const next = await send(api('patch', `/api/gitlab-integrations/${integration.id}`), {
        defaultBranch: 'main',
      });

      expect(next.status).to.equal(200);
      expect(next.body.item.defaultBranch).to.equal('main');
    });
  });

  describe('delete', () => {
    it('deletes the integration', async () => {
      const integration = await createIntegration();

      const response = await send(api('delete', `/api/gitlab-integrations/${integration.id}`));

      expect(response.status).to.equal(200);
      expect(response.body.item.id).to.equal(integration.id);
      expect(response.body.item).to.not.have.property('webhookSecretHash');
      expect(await GitlabIntegration.qm.getOneById(integration.id)).to.equal(undefined);
    });
  });

  describe('test-connection', () => {
    it('checks GitLab and records the synchronization time', async () => {
      const integration = await createIntegration();

      mockGetProject('42');
      mockGetBranch('develop');

      const response = await send(
        api('post', `/api/gitlab-integrations/${integration.id}/test-connection`),
      );

      expect(response.status).to.equal(200);
      expect(response.body.item.lastSyncedAt).to.be.a('string');
      expect(response.body.included.gitlabProject).to.deep.equal({
        id: 42,
        name: 'ERP',
        pathWithNamespace: 'company/erp',
        defaultBranch: 'develop',
        webUrl: 'https://gitlab.test/company/erp',
      });

      const stored = await GitlabIntegration.qm.getOneById(integration.id);

      expect(stored.lastSyncedAt).to.not.equal(null);
    });

    it('answers 422 when GitLab is unreachable', async () => {
      const integration = await createIntegration();

      gitlab
        .intercept({ path: '/api/v4/projects/42', method: 'GET' })
        .replyWithError(new Error('ECONNREFUSED'));

      const response = await send(
        api('post', `/api/gitlab-integrations/${integration.id}/test-connection`),
      );

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab is unavailable');

      const stored = await GitlabIntegration.qm.getOneById(integration.id);

      expect(stored.lastSyncedAt).to.equal(null);
    });
  });

  describe('rotate-webhook-secret', () => {
    it('returns a new secret and replaces the stored hash', async () => {
      const integration = await createIntegration();

      const response = await send(
        api('post', `/api/gitlab-integrations/${integration.id}/rotate-webhook-secret`),
      );

      expect(response.status).to.equal(200);
      expect(response.body.item.webhookSecret).to.be.a('string').with.lengthOf(40);
      expect(response.body.item.webhookSecret).to.not.equal(integration.webhookSecret);
      expect(response.body.item).to.not.have.property('webhookSecretHash');

      const stored = await GitlabIntegration.qm.getOneById(integration.id);

      expect(stored.webhookSecretHash).to.equal(sha256(response.body.item.webhookSecret));
    });
  });

  describe('secrets', () => {
    it('never returns the GitLab token in any response', () => {
      expect(responseBodies.length).to.be.greaterThan(0);

      responseBodies.forEach((body) => {
        expect(body).to.not.include(GITLAB_TOKEN);
      });
    });
  });
});
