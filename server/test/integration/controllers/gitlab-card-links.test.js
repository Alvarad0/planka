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

      const responses = [
        await send(api('post', `/api/cards/${card.id}/gitlab-issue`, VIEWER_API_KEY)),
        await send(api('post', `/api/cards/${card.id}/gitlab-link`, VIEWER_API_KEY), {
          issueIid: 12,
        }),
        await send(api('delete', `/api/cards/${card.id}/gitlab-link`, VIEWER_API_KEY)),
        await send(api('post', `/api/cards/${card.id}/gitlab-branch`, VIEWER_API_KEY)),
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
        title: 'Renamed',
        state: 'closed',
        updatedAt: '2026-10-05T12:00:00.000Z',
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

      expect(stored.snapshot.title).to.equal('Renamed');
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
      expect(response.body.item.snapshot.state).to.equal('opened');
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
      expect(response.body.item.snapshot.title).to.equal('Issue 12');
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
