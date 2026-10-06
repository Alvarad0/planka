const crypto = require('crypto');
const { expect } = require('chai');
const request = require('supertest');
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = require('undici');

const GITLAB_URL = 'https://gitlab.test';
const GITLAB_TOKEN = 'glpat-webhooks-test-token';
const GITLAB_PROJECT_ID = 42;
const OTHER_GITLAB_PROJECT_ID = 43;

const WEBHOOK_SECRET = 'webhook-secret-of-the-erp-integration';
const OTHER_WEBHOOK_SECRET = 'webhook-secret-of-the-other-integration';

const MANAGER_API_KEY = 'test-webhooks-manager-api-key';
const EDITOR_API_KEY = 'test-webhooks-editor-api-key';
const VIEWER_API_KEY = 'test-webhooks-viewer-api-key';
const OUTSIDER_API_KEY = 'test-webhooks-outsider-api-key';

const BRANCH_NAME = '12-implement-login';
const OTHER_BRANCH_NAME = '13-implement-logout';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const createUser = (name, role, apiKey) =>
  User.create({
    name,
    role,
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

const createCard = ({ board, list }, name = 'Implement login') =>
  Card.create({
    name,
    boardId: board.id,
    listId: list.id,
    type: 'project',
    position: 65536,
  }).fetch();

const createIntegration = (project, gitlabProjectId, webhookSecret) =>
  GitlabIntegration.qm.createOne({
    gitlabProjectId,
    projectId: project.id,
    gitlabProjectPath: `company/project-${gitlabProjectId}`,
    defaultBranch: 'main',
    webhookSecretHash: sha256(webhookSecret),
  });

const createLink = (card, integration, issueIid, branchName = null) =>
  GitlabCardLink.qm.createOne({
    branchName,
    cardId: card.id,
    gitlabIntegrationId: integration.id,
    issueId: 9000 + issueIid,
    issueIid,
    issueUrl: `${GITLAB_URL}/company/erp/-/issues/${issueIid}`,
  });

const buildGitlabIssue = (iid, values = {}) => ({
  iid,
  id: 9000 + iid,
  title: `Issue ${iid}`,
  state: 'opened',
  web_url: `${GITLAB_URL}/company/erp/-/issues/${iid}`,
  updated_at: '2026-10-05T12:00:00.000Z',
  ...values,
});

const buildGitlabMergeRequest = (iid, branchName, values = {}) => ({
  iid,
  id: 5000 + iid,
  title: 'Issue 12',
  state: 'opened',
  draft: false,
  web_url: `${GITLAB_URL}/company/erp/-/merge_requests/${iid}`,
  source_branch: branchName,
  target_branch: 'main',
  created_at: '2026-10-05T12:00:00.000Z',
  updated_at: '2026-10-05T12:00:00.000Z',
  merged_at: null,
  ...values,
});

const buildGitlabPipeline = (id, branchName, values = {}) => ({
  id,
  status: 'success',
  ref: branchName,
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
  created_at: '2026-10-05T12:00:00.000Z',
  web_url: `${GITLAB_URL}/company/erp/-/commit/${`${index}`.padStart(40, '0')}`,
});

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('GitLab webhooks and synchronization (controllers)', () => {
  const originalCustom = {};
  const responseBodies = [];

  let originalDispatcher;
  let mockAgent;
  let gitlab;

  let manager;
  let editor;
  let viewer;
  let outsider;

  let path;
  let integration;
  let otherPath;
  let otherIntegration;

  let uuidCounter = 0;

  const nextUuid = () => {
    uuidCounter += 1;

    return `00000000-0000-4000-8000-${`${uuidCounter}`.padStart(12, '0')}`;
  };

  const api = (method, url, apiKey = EDITOR_API_KEY) => {
    const req = request(sails.hooks.http.app)[method](url);

    return apiKey ? req.set('X-Api-Key', apiKey) : req;
  };

  // Records every response body so the suite can assert that secrets never leak
  const send = async (req, body) => {
    const response = await (body ? req.send(body) : req);
    responseBodies.push(response.text);

    return response;
  };

  const deliver = (
    integrationId,
    event,
    payload,
    { token = WEBHOOK_SECRET, uuid = nextUuid(), uuidHeader = 'Idempotency-Key' } = {},
  ) => {
    let req = request(sails.hooks.http.app)
      .post(`/api/gitlab/webhooks/${integrationId}`)
      .set('Content-Type', 'application/json');

    if (token !== null) {
      req = req.set('X-Gitlab-Token', token);
    }

    if (event !== null) {
      req = req.set('X-Gitlab-Event', event);
    }

    if (uuid !== null) {
      req = req.set(uuidHeader, uuid);
    }

    return send(req, payload);
  };

  // Processing runs after the response; waits until the delivery leaves the `received` status
  const waitForDelivery = async (eventUuid) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const delivery = await GitlabWebhookDelivery.qm.getOneByEventUuid(eventUuid);

      if (delivery && delivery.status !== GitlabWebhookDelivery.Statuses.RECEIVED) {
        return delivery;
      }

      // eslint-disable-next-line no-await-in-loop
      await wait(10);
    }

    throw new Error(`Delivery ${eventUuid} was not processed in time`);
  };

  const deliverAndWait = async (integrationId, event, payload, options = {}) => {
    const uuid = options.uuid || nextUuid();
    const response = await deliver(integrationId, event, payload, { ...options, uuid });

    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({ status: 'accepted' });

    return waitForDelivery(uuid);
  };

  const gitlabGet = (gitlabProjectId, subpath, query) =>
    gitlab.intercept({
      path: `/api/v4/projects/${gitlabProjectId}${subpath}`,
      method: 'GET',
      headers: { 'private-token': GITLAB_TOKEN },
      ...(query && { query }),
    });

  const mockGetIssue = (iid, { gitlabProjectId = GITLAB_PROJECT_ID, status = 200 } = {}) =>
    gitlabGet(gitlabProjectId, `/issues/${iid}`).reply(status, buildGitlabIssue(iid));

  // The four reads of a summary of a card with a branch
  const mockBranchSummary = (
    iid,
    branchName,
    { gitlabProjectId = GITLAB_PROJECT_ID, pipelineStatus = 'success', commitsCount = 2 } = {},
  ) => {
    mockGetIssue(iid, { gitlabProjectId });

    gitlabGet(gitlabProjectId, '/merge_requests', {
      state: 'all',
      source_branch: branchName,
      order_by: 'created_at',
      sort: 'desc',
      per_page: '20',
    }).reply(200, [buildGitlabMergeRequest(7, branchName)]);

    gitlabGet(gitlabProjectId, '/pipelines', {
      ref: branchName,
      order_by: 'id',
      sort: 'desc',
      per_page: '1',
    }).reply(200, [buildGitlabPipeline(287, branchName, { status: pipelineStatus })]);

    gitlabGet(gitlabProjectId, '/repository/commits', {
      ref_name: `main..${branchName}`,
      per_page: '100',
    }).reply(
      200,
      Array.from({ length: commitsCount }, (_value, index) => buildGitlabCommit(index + 1)),
    );
  };

  const expectAllGitlabCallsMade = () => {
    expect(mockAgent.pendingInterceptors()).to.deep.equal([]);
  };

  const getLink = (id) => GitlabCardLink.qm.getOneById(id);

  const captureBroadcasts = () => {
    const broadcasts = [];
    const originalBroadcast = sails.sockets.broadcast;

    sails.sockets.broadcast = (room, event, data, req) => {
      broadcasts.push({ room, event, data, req });
    };

    broadcasts.restore = () => {
      sails.sockets.broadcast = originalBroadcast;
    };

    return broadcasts;
  };

  before(async () => {
    ['gitlabUrl', 'gitlabToken', 'outgoingProxy'].forEach((key) => {
      originalCustom[key] = sails.config.custom[key];
    });

    originalDispatcher = getGlobalDispatcher();

    manager = await createUser('webhooksmanager', User.Roles.PROJECT_OWNER, MANAGER_API_KEY);
    editor = await createUser('webhookseditor', User.Roles.BOARD_USER, EDITOR_API_KEY);
    viewer = await createUser('webhooksviewer', User.Roles.BOARD_USER, VIEWER_API_KEY);
    outsider = await createUser('webhooksoutsider', User.Roles.BOARD_USER, OUTSIDER_API_KEY);
  });

  after(async () => {
    Object.assign(sails.config.custom, originalCustom);
    setGlobalDispatcher(originalDispatcher);

    await User.destroy({ id: [manager.id, editor.id, viewer.id, outsider.id] });

    const leaked = responseBodies.filter(
      (body) =>
        body.includes(GITLAB_TOKEN) ||
        body.includes(WEBHOOK_SECRET) ||
        body.includes(sha256(WEBHOOK_SECRET)),
    );

    expect(leaked).to.deep.equal([]);
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
    integration = await createIntegration(path.project, GITLAB_PROJECT_ID, WEBHOOK_SECRET);

    otherPath = await createProjectWithBoard('CRM');
    otherIntegration = await createIntegration(
      otherPath.project,
      OTHER_GITLAB_PROJECT_ID,
      OTHER_WEBHOOK_SECRET,
    );

    await ProjectManager.create({ projectId: path.project.id, userId: manager.id });

    await BoardMembership.create({
      role: BoardMembership.Roles.EDITOR,
      projectId: path.project.id,
      boardId: path.board.id,
      userId: editor.id,
      canComment: null,
    });

    await BoardMembership.create({
      role: BoardMembership.Roles.VIEWER,
      projectId: path.project.id,
      boardId: path.board.id,
      userId: viewer.id,
      canComment: false,
    });
  });

  afterEach(async () => {
    setGlobalDispatcher(originalDispatcher);
    await mockAgent.close();

    await sails.sendNativeQuery('DELETE FROM gitlab_webhook_delivery');
    await sails.sendNativeQuery('DELETE FROM gitlab_card_link');
    await sails.sendNativeQuery('DELETE FROM gitlab_integration');
    await ProjectManager.destroy({});
    await BoardMembership.destroy({});
    await Card.destroy({});
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
  });

  describe('receive', () => {
    describe('verification', () => {
      it('answers unknown integrations, malformed IDs and wrong tokens identically', async () => {
        const responses = [
          await deliver(integration.id, 'Issue Hook', {}, { token: 'wrong-secret' }),
          await deliver(integration.id, 'Issue Hook', {}, { token: null }),
          await deliver(integration.id, 'Issue Hook', {}, { token: '' }),
          await deliver(integration.id, 'Issue Hook', {}, { token: OTHER_WEBHOOK_SECRET }),
          await deliver('1357158568008091264', 'Issue Hook', {}),
          await deliver('not-an-id', 'Issue Hook', {}),
          await deliver('99999999999999999999999', 'Issue Hook', {}),
        ];

        responses.forEach((response) => {
          expect(response.status).to.equal(401);
          expect(response.body).to.deep.equal({
            code: 'E_UNAUTHORIZED',
            message: 'Invalid webhook token',
          });
        });

        expect(await GitlabWebhookDelivery.count()).to.equal(0);
      });

      it('works without a Planka session', async () => {
        const response = await deliver(integration.id, 'Issue Hook', {}, { uuid: null });

        // Past authentication: rejected for the missing event UUID, not for the session
        expect(response.status).to.equal(400);
      });

      it('rejects deliveries without an event UUID', async () => {
        const response = await deliver(
          integration.id,
          'Issue Hook',
          { object_attributes: { iid: 12 } },
          { uuid: null },
        );

        expect(response.status).to.equal(400);
        expect(response.body.code).to.equal('E_MISSING_OR_INVALID_PARAMS');
        expect(await GitlabWebhookDelivery.count()).to.equal(0);
      });

      it('acknowledges events that are not handled without storing them', async () => {
        const responses = [
          await deliver(integration.id, 'Tag Push Hook', { ref: 'refs/tags/v1.0.0' }),
          await deliver(integration.id, 'Note Hook', {}),
          await deliver(integration.id, null, {}),
        ];

        responses.forEach((response) => {
          expect(response.status).to.equal(202);
          expect(response.body).to.deep.equal({ status: 'ignored' });
        });

        expect(await GitlabWebhookDelivery.count()).to.equal(0);
      });

      it('answers retries of a delivery as duplicates and processes it once', async () => {
        const card = await createCard(path);
        const link = await createLink(card, integration, 12);

        mockGetIssue(12);

        const uuid = nextUuid();
        const payload = { object_attributes: { iid: 12 } };

        const delivery = await deliverAndWait(integration.id, 'Issue Hook', payload, { uuid });

        expect(delivery.status).to.equal('processed');

        const retry = await deliver(integration.id, 'Issue Hook', payload, { uuid });

        expect(retry.status).to.equal(200);
        expect(retry.body).to.deep.equal({ status: 'duplicate' });

        expect(await GitlabWebhookDelivery.count()).to.equal(1);
        expectAllGitlabCallsMade();
        expect((await getLink(link.id)).lastSyncedAt).to.be.an.instanceof(Date);
      });

      it('falls back to X-Gitlab-Event-UUID', async () => {
        const uuid = nextUuid();

        const delivery = await deliverAndWait(
          integration.id,
          'Issue Hook',
          { object_attributes: { iid: 99 } },
          { uuid, uuidHeader: 'X-Gitlab-Event-UUID' },
        );

        expect(delivery.eventUuid).to.equal(uuid);
        expect(delivery.eventType).to.equal('issue');
        expect(delivery.gitlabIntegrationId).to.equal(integration.id);
      });
    });

    describe('processing', () => {
      let card;
      let link;
      let otherCard;
      let otherBranchLink;
      let otherIntegrationLink;

      beforeEach(async () => {
        card = await createCard(path);
        link = await createLink(card, integration, 12, BRANCH_NAME);

        otherCard = await createCard(path, 'Implement logout');
        otherBranchLink = await createLink(otherCard, integration, 13, OTHER_BRANCH_NAME);

        // Same issue IID and branch name, but in another GitLab project
        const foreignCard = await createCard(otherPath);
        otherIntegrationLink = await createLink(foreignCard, otherIntegration, 12, BRANCH_NAME);
      });

      const expectOnlyLinkSynced = async () => {
        expect((await getLink(link.id)).lastSyncedAt).to.be.an.instanceof(Date);
        expect((await getLink(otherBranchLink.id)).lastSyncedAt).to.equal(null);
        expect((await getLink(otherIntegrationLink.id)).lastSyncedAt).to.equal(null);
        expectAllGitlabCallsMade();
      };

      it('re-syncs the link of a pushed branch from GitLab and broadcasts it', async () => {
        mockBranchSummary(12, BRANCH_NAME, { pipelineStatus: 'running', commitsCount: 3 });

        const broadcasts = captureBroadcasts();

        let delivery;
        try {
          delivery = await deliverAndWait(integration.id, 'Push Hook', {
            object_kind: 'push',
            ref: `refs/heads/${BRANCH_NAME}`,
            // Payload data is never used to build the snapshot
            total_commits_count: 50,
          });
        } finally {
          broadcasts.restore();
        }

        expect(delivery.status).to.equal('processed');
        expect(delivery.eventType).to.equal('push');
        expect(delivery.error).to.equal(null);

        await expectOnlyLinkSynced();

        const { snapshot } = await getLink(link.id);

        expect(snapshot.commitsCount).to.equal(3);
        expect(snapshot.pipeline.status).to.equal('running');
        expect(snapshot.mergeRequest.iid).to.equal(7);
        expect(snapshot.issue.title).to.equal('Issue 12');

        const updates = broadcasts.filter(({ event }) => event === 'gitlabCardLinkUpdate');

        expect(updates).to.have.length(1);
        expect(updates[0].room).to.equal(`board:${path.board.id}`);
        expect(updates[0].data.item.id).to.equal(link.id);
        expect(updates[0].data.item.snapshot.commitsCount).to.equal(3);
      });

      it('still syncs when a branch is deleted', async () => {
        mockGetIssue(12);

        gitlabGet(GITLAB_PROJECT_ID, '/merge_requests', {
          state: 'all',
          source_branch: BRANCH_NAME,
          order_by: 'created_at',
          sort: 'desc',
          per_page: '20',
        }).reply(200, []);

        gitlabGet(GITLAB_PROJECT_ID, '/pipelines', {
          ref: BRANCH_NAME,
          order_by: 'id',
          sort: 'desc',
          per_page: '1',
        }).reply(200, []);

        gitlabGet(GITLAB_PROJECT_ID, '/repository/commits', {
          ref_name: `main..${BRANCH_NAME}`,
          per_page: '100',
        }).reply(404, { message: '404 Not Found' });

        const delivery = await deliverAndWait(integration.id, 'Push Hook', {
          ref: `refs/heads/${BRANCH_NAME}`,
          after: '0000000000000000000000000000000000000000',
        });

        expect(delivery.status).to.equal('processed');
        await expectOnlyLinkSynced();
        expect((await getLink(link.id)).snapshot.commitsCount).to.equal(null);
      });

      it('ignores pushes of tags or of branches without a card', async () => {
        const tagDelivery = await deliverAndWait(integration.id, 'Push Hook', {
          ref: 'refs/tags/v1.0.0',
        });

        const unknownBranchDelivery = await deliverAndWait(integration.id, 'Push Hook', {
          ref: 'refs/heads/unrelated',
        });

        expect(tagDelivery.status).to.equal('ignored');
        expect(unknownBranchDelivery.status).to.equal('ignored');
        expect((await getLink(link.id)).lastSyncedAt).to.equal(null);
      });

      it('re-syncs the link of a merge request source branch', async () => {
        mockBranchSummary(12, BRANCH_NAME);

        const delivery = await deliverAndWait(integration.id, 'Merge Request Hook', {
          object_kind: 'merge_request',
          object_attributes: {
            iid: 7,
            action: 'merge',
            state: 'merged',
            source_branch: BRANCH_NAME,
            target_branch: 'main',
          },
        });

        expect(delivery.status).to.equal('processed');
        expect(delivery.eventType).to.equal('merge_request');
        await expectOnlyLinkSynced();
      });

      it('re-syncs the link of a branch pipeline', async () => {
        mockBranchSummary(12, BRANCH_NAME);

        const delivery = await deliverAndWait(integration.id, 'Pipeline Hook', {
          object_kind: 'pipeline',
          object_attributes: { id: 287, ref: BRANCH_NAME, tag: false, status: 'running' },
          merge_request: null,
        });

        expect(delivery.status).to.equal('processed');
        expect(delivery.eventType).to.equal('pipeline');
        await expectOnlyLinkSynced();

        // The stored status is GitLab's current one, not the (older) one of the event
        expect((await getLink(link.id)).snapshot.pipeline.status).to.equal('success');
      });

      it('re-syncs the link of a merge request pipeline by its source branch', async () => {
        mockBranchSummary(12, BRANCH_NAME);

        const delivery = await deliverAndWait(integration.id, 'Pipeline Hook', {
          object_kind: 'pipeline',
          object_attributes: { id: 288, ref: 'refs/merge-requests/7/head', tag: false },
          merge_request: { iid: 7, source_branch: BRANCH_NAME, target_branch: 'main' },
        });

        expect(delivery.status).to.equal('processed');
        await expectOnlyLinkSynced();
      });

      it('ignores tag pipelines', async () => {
        const delivery = await deliverAndWait(integration.id, 'Pipeline Hook', {
          object_attributes: { id: 289, ref: 'v1.0.0', tag: true },
          merge_request: null,
        });

        expect(delivery.status).to.equal('ignored');
      });

      it('re-syncs the link of an issue', async () => {
        mockBranchSummary(12, BRANCH_NAME);

        const delivery = await deliverAndWait(integration.id, 'Issue Hook', {
          object_kind: 'issue',
          object_attributes: { iid: 12, state: 'closed', action: 'close' },
        });

        expect(delivery.status).to.equal('processed');
        expect(delivery.eventType).to.equal('issue');
        await expectOnlyLinkSynced();
      });

      it('ignores issues without a card', async () => {
        const delivery = await deliverAndWait(integration.id, 'Issue Hook', {
          object_attributes: { iid: 404 },
        });

        expect(delivery.status).to.equal('ignored');
      });

      it('marks the delivery failed and writes nothing when GitLab fails', async () => {
        mockGetIssue(12, { status: 503 });

        // The other reads of the summary may or may not be made before the failure
        gitlab
          .intercept({
            path: (requestPath) => !requestPath.includes('/issues/'),
            method: 'GET',
          })
          .reply(200, [])
          .persist();

        const delivery = await deliverAndWait(integration.id, 'Issue Hook', {
          object_attributes: { iid: 12 },
        });

        expect(delivery.status).to.equal('failed');
        expect(delivery.error).to.match(/^GitLab sync failed \(code: \w+, status: 503\)$/);
        expect(delivery.error).to.not.include(GITLAB_TOKEN);

        const unchangedLink = await getLink(link.id);

        expect(unchangedLink.lastSyncedAt).to.equal(null);
        expect(unchangedLink.snapshot).to.equal(null);
      });

      it('marks the delivery failed when GitLab is not configured', async () => {
        sails.config.custom.gitlabToken = undefined;

        const delivery = await deliverAndWait(integration.id, 'Issue Hook', {
          object_attributes: { iid: 12 },
        });

        expect(delivery.status).to.equal('failed');
        expect(delivery.error).to.equal(
          'GitLab sync failed (code: gitlabNotConfigured, status: none)',
        );
      });
    });
  });

  describe('card sync', () => {
    let card;

    beforeEach(async () => {
      card = await createCard(path);
    });

    it('hides the card from non-members and refuses viewers', async () => {
      await createLink(card, integration, 12);

      const outsiderResponse = await send(
        api('post', `/api/cards/${card.id}/gitlab-sync`, OUTSIDER_API_KEY),
      );

      expect(outsiderResponse.status).to.equal(404);

      const viewerResponse = await send(
        api('post', `/api/cards/${card.id}/gitlab-sync`, VIEWER_API_KEY),
      );

      expect(viewerResponse.status).to.equal(403);

      const anonymousResponse = await send(api('post', `/api/cards/${card.id}/gitlab-sync`, null));

      expect(anonymousResponse.status).to.equal(401);
    });

    it('rejects cards without a link', async () => {
      const response = await send(api('post', `/api/cards/${card.id}/gitlab-sync`));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Card is not linked to a GitLab issue');
    });

    it('stores the fresh summary and answers like show', async () => {
      const link = await createLink(card, integration, 12, BRANCH_NAME);

      mockBranchSummary(12, BRANCH_NAME, { commitsCount: 4 });

      const broadcasts = captureBroadcasts();

      let response;
      try {
        response = await send(api('post', `/api/cards/${card.id}/gitlab-sync`));
      } finally {
        broadcasts.restore();
      }

      expect(response.status).to.equal(200);
      expect(response.body.item.id).to.equal(link.id);
      expect(response.body.item.lastSyncedAt).to.be.a('string');

      expect(response.body.included).to.deep.equal({
        gitlabIntegration: {
          id: integration.id,
          gitlabProjectPath: integration.gitlabProjectPath,
        },
        gitlabIssue: {
          id: 9012,
          iid: 12,
          title: 'Issue 12',
          state: 'opened',
          webUrl: `${GITLAB_URL}/company/erp/-/issues/12`,
          updatedAt: '2026-10-05T12:00:00.000Z',
        },
        gitlabMergeRequest: response.body.item.snapshot.mergeRequest,
        gitlabPipeline: response.body.item.snapshot.pipeline,
        commitsCount: 4,
        hasMoreCommits: false,
        isStale: false,
        isProjectMismatch: false,
        suggestedBranchName: null,
        defaultBranch: 'main',
      });

      expect(response.body.included.gitlabMergeRequest.iid).to.equal(7);
      expect(response.body.included.gitlabPipeline.id).to.equal(287);
      expectAllGitlabCallsMade();

      // The requester gets the response; other clients get the broadcast
      const updates = broadcasts.filter(({ event }) => event === 'gitlabCardLinkUpdate');

      expect(updates).to.have.length(1);
      expect(updates[0].room).to.equal(`board:${path.board.id}`);
      expect(updates[0].req).to.not.equal(undefined);
    });

    it('answers GitLab failures with 422 (never 401) and writes nothing', async () => {
      const link = await createLink(card, integration, 12);

      mockGetIssue(12, { status: 503 });

      const unavailableResponse = await send(api('post', `/api/cards/${card.id}/gitlab-sync`));

      expect(unavailableResponse.status).to.equal(422);
      expect(unavailableResponse.body.message).to.equal('GitLab is unavailable');

      mockGetIssue(12, { status: 401 });

      const unauthorizedResponse = await send(api('post', `/api/cards/${card.id}/gitlab-sync`));

      expect(unauthorizedResponse.status).to.equal(422);
      expect(unauthorizedResponse.body.message).to.equal('GitLab token is invalid or expired');

      mockGetIssue(12, { status: 404 });

      const notFoundResponse = await send(api('post', `/api/cards/${card.id}/gitlab-sync`));

      expect(notFoundResponse.status).to.equal(422);
      expect(notFoundResponse.body.message).to.equal('GitLab issue not found');

      sails.config.custom.gitlabToken = undefined;

      const notConfiguredResponse = await send(api('post', `/api/cards/${card.id}/gitlab-sync`));

      expect(notConfiguredResponse.status).to.equal(422);
      expect(notConfiguredResponse.body.message).to.equal('GitLab is not configured');

      expect((await getLink(link.id)).lastSyncedAt).to.equal(null);
    });
  });

  describe('integration sync', () => {
    it('hides the integration from users who are not project managers', async () => {
      const editorResponse = await send(
        api('post', `/api/gitlab-integrations/${integration.id}/sync`, EDITOR_API_KEY),
      );

      expect(editorResponse.status).to.equal(404);

      const otherResponse = await send(
        api('post', `/api/gitlab-integrations/${otherIntegration.id}/sync`, MANAGER_API_KEY),
      );

      expect(otherResponse.status).to.equal(404);
    });

    it('syncs every link, continues past failures and counts them', async () => {
      const links = await Promise.all(
        [12, 13, 14].map(async (iid) =>
          createLink(await createCard(path, `Card ${iid}`), integration, iid),
        ),
      );

      // A link of another integration is not touched
      const foreignLink = await createLink(await createCard(otherPath), otherIntegration, 12);

      mockGetIssue(12);
      mockGetIssue(13, { status: 503 });
      mockGetIssue(14);

      const response = await send(
        api('post', `/api/gitlab-integrations/${integration.id}/sync`, MANAGER_API_KEY),
      );

      expect(response.status).to.equal(200);
      expect(response.body.item.id).to.equal(integration.id);
      expect(response.body.item.lastSyncedAt).to.be.a('string');
      expect(response.body.item).to.not.have.property('webhookSecretHash');
      expect(response.body.included).to.deep.equal({ syncedCount: 2, failedCount: 1 });

      const [first, second, third] = await Promise.all(links.map(({ id }) => getLink(id)));

      expect(first.lastSyncedAt).to.be.an.instanceof(Date);
      expect(second.lastSyncedAt).to.equal(null);
      expect(third.lastSyncedAt).to.be.an.instanceof(Date);
      expect((await getLink(foreignLink.id)).lastSyncedAt).to.equal(null);
      expectAllGitlabCallsMade();
    });

    it('keeps the last sync time when every link fails', async () => {
      await createLink(await createCard(path), integration, 12);

      mockGetIssue(12, { status: 503 });

      const response = await send(
        api('post', `/api/gitlab-integrations/${integration.id}/sync`, MANAGER_API_KEY),
      );

      expect(response.status).to.equal(200);
      expect(response.body.item.lastSyncedAt).to.equal(null);
      expect(response.body.included).to.deep.equal({ syncedCount: 0, failedCount: 1 });
    });

    it('answers an integration without links', async () => {
      const response = await send(
        api('post', `/api/gitlab-integrations/${integration.id}/sync`, MANAGER_API_KEY),
      );

      expect(response.status).to.equal(200);
      expect(response.body.item.lastSyncedAt).to.equal(null);
      expect(response.body.included).to.deep.equal({ syncedCount: 0, failedCount: 0 });
    });
  });
});
