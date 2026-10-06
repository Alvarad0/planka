const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { expect } = require('chai');
const request = require('supertest');
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = require('undici');

const {
  BOT_USERNAME,
  BOT_NAME,
  BOT_EMAIL,
  getBotUser,
  resetBotUserCache,
} = require('../../../utils/gitlab-bot-user');

const GITLAB_URL = 'https://gitlab.test';
const GITLAB_TOKEN = 'glpat-auto-move-test-token';
const GITLAB_PROJECT_ID = 52;
const OTHER_GITLAB_PROJECT_ID = 53;

const WEBHOOK_SECRET = 'webhook-secret-of-the-auto-move-integration';
const EDITOR_API_KEY = 'test-auto-move-editor-api-key';

const OUTGOING_WEBHOOK_URL = 'https://hooks.test';

const BRANCH_NAME = '12-implement-login';
const ISSUE_IID = 12;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const buildGitlabIssue = (values = {}) => ({
  iid: ISSUE_IID,
  id: 9000 + ISSUE_IID,
  title: 'Implement login',
  state: 'opened',
  web_url: `${GITLAB_URL}/company/erp/-/issues/${ISSUE_IID}`,
  updated_at: '2026-10-05T12:00:00.000Z',
  ...values,
});

const buildGitlabMergeRequest = (values = {}) => ({
  iid: 7,
  id: 5007,
  title: 'Implement login',
  state: 'opened',
  draft: false,
  web_url: `${GITLAB_URL}/company/erp/-/merge_requests/7`,
  source_branch: BRANCH_NAME,
  target_branch: 'main',
  created_at: '2026-10-05T12:00:00.000Z',
  updated_at: '2026-10-05T12:00:00.000Z',
  merged_at: null,
  ...values,
});

// Snapshot shapes as stored by the synchronization
const snapshotWith = (mergeRequest) => ({
  issue: { title: 'Implement login', state: 'opened', updatedAt: '2026-10-05T12:00:00.000Z' },
  mergeRequest,
  pipeline: null,
  commitsCount: null,
  hasMoreCommits: false,
});

const READY_SNAPSHOT = snapshotWith({ id: 5007, iid: 7, state: 'opened', draft: false });
const NO_MR_SNAPSHOT = snapshotWith(null);

describe('GitLab auto-move (helpers)', () => {
  const originalCustom = {};

  let originalDispatcher;
  let mockAgent;
  let gitlab;

  let editor;

  let project;
  let board;
  let todoList;
  let reviewList;
  let doneList;
  let otherBoard;
  let otherBoardList;
  let archiveList;
  let integration;

  let otherProject;
  let otherProjectBoard;
  let otherProjectList;

  let card;

  const createBoard = (projectId, name, position = 65536) =>
    Board.create({
      projectId,
      position,
      name,
      defaultView: 'kanban',
      defaultCardType: 'project',
      limitCardTypesToDefaultOne: false,
      alwaysDisplayCardCreator: false,
    }).fetch();

  const createList = (boardId, name, type = List.Types.ACTIVE, position = 65536) =>
    List.create({
      boardId,
      type,
      name,
      position: List.FINITE_TYPES.includes(type) ? position : null,
    }).fetch();

  const createCard = (list, boardId, position = 65536, name = 'Implement login') =>
    Card.create({
      name,
      boardId,
      position,
      listId: list.id,
      type: 'project',
    }).fetch();

  const createLink = (snapshot) =>
    GitlabCardLink.qm.createOne({
      snapshot,
      cardId: card.id,
      gitlabIntegrationId: integration.id,
      issueId: 9000 + ISSUE_IID,
      issueIid: ISSUE_IID,
      issueUrl: `${GITLAB_URL}/company/erp/-/issues/${ISSUE_IID}`,
      branchName: BRANCH_NAME,
      branchUrl: `${GITLAB_URL}/company/erp/-/tree/${BRANCH_NAME}`,
    });

  const enableAutoMove = (values = {}) =>
    GitlabIntegration.qm.updateOne(integration.id, {
      autoMoveOnMrOpen: true,
      autoMoveOnMrMerge: true,
      reviewListId: reviewList.id,
      completedListId: doneList.id,
      ...values,
    });

  const gitlabGet = (subpath, query) =>
    gitlab.intercept({
      path: `/api/v4/projects/${GITLAB_PROJECT_ID}${subpath}`,
      method: 'GET',
      headers: { 'private-token': GITLAB_TOKEN },
      ...(query && { query }),
    });

  const mockListMergeRequests = (state, mergeRequests) =>
    gitlabGet('/merge_requests', {
      state,
      source_branch: BRANCH_NAME,
      order_by: 'created_at',
      sort: 'desc',
      per_page: '20',
    }).reply(200, mergeRequests);

  // The four reads of a summary of a card with a branch
  const mockSummary = (mergeRequests) => {
    gitlabGet(`/issues/${ISSUE_IID}`).reply(200, buildGitlabIssue());
    mockListMergeRequests('all', mergeRequests);
    gitlabGet('/pipelines', {
      ref: BRANCH_NAME,
      order_by: 'id',
      sort: 'desc',
      per_page: '1',
    }).reply(200, []);
    gitlabGet('/repository/commits', {
      ref_name: `main..${BRANCH_NAME}`,
      per_page: '100',
    }).reply(200, []);
  };

  const syncLink = async (link, mergeRequests) => {
    mockSummary(mergeRequests);

    return sails.helpers.gitlabCardLinks.syncOne.with({
      record: await GitlabCardLink.qm.getOneById(link.id),
    });
  };

  const getCard = () => Card.qm.getOneById(card.id);

  const deliverMergeRequestEvent = async (attributes) => {
    const uuid = crypto.randomUUID();

    const response = await request(sails.hooks.http.app)
      .post(`/api/gitlab/webhooks/${integration.id}`)
      .set('Content-Type', 'application/json')
      .set('X-Gitlab-Token', WEBHOOK_SECRET)
      .set('X-Gitlab-Event', 'Merge Request Hook')
      .set('Idempotency-Key', uuid)
      .send({
        object_kind: 'merge_request',
        object_attributes: {
          iid: 7,
          source_branch: BRANCH_NAME,
          target_branch: 'main',
          ...attributes,
        },
      });

    expect(response.status).to.equal(200);

    for (let attempt = 0; attempt < 200; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const delivery = await GitlabWebhookDelivery.qm.getOneByEventUuid(uuid);

      if (delivery && delivery.status !== GitlabWebhookDelivery.Statuses.RECEIVED) {
        return delivery;
      }

      // eslint-disable-next-line no-await-in-loop
      await wait(10);
    }

    throw new Error('Delivery was not processed in time');
  };

  const deleteBotUsers = async () => {
    const users = await User.find({
      or: [{ email: BOT_EMAIL }, { username: BOT_USERNAME }],
    });

    const ids = users.map(({ id }) => id);

    if (ids.length > 0) {
      await Action.destroy({ userId: ids });
      await Notification.destroy({ creatorUserId: ids });
      await User.destroy({ id: ids });
    }

    resetBotUserCache();
  };

  before(async () => {
    ['gitlabUrl', 'gitlabToken', 'outgoingProxy'].forEach((key) => {
      originalCustom[key] = sails.config.custom[key];
    });

    originalDispatcher = getGlobalDispatcher();

    editor = await User.create({
      name: 'automoveeditor',
      role: User.Roles.BOARD_USER,
      email: 'automoveeditor@planka.test',
      apiKeyHash: sha256(EDITOR_API_KEY),
    }).fetch();
  });

  after(async () => {
    Object.assign(sails.config.custom, originalCustom);
    setGlobalDispatcher(originalDispatcher);

    await deleteBotUsers();
    await User.destroy({ id: editor.id });
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

    project = await Project.create({ name: 'ERP', isHidden: false }).fetch();
    board = await createBoard(project.id, 'Development');
    todoList = await createList(board.id, 'To Do', List.Types.ACTIVE, 65536);
    reviewList = await createList(board.id, 'Review', List.Types.ACTIVE, 131072);
    doneList = await createList(board.id, 'Done', List.Types.CLOSED, 196608);
    archiveList = await createList(board.id, 'Archive', List.Types.ARCHIVE);
    await createList(board.id, 'Trash', List.Types.TRASH);

    otherBoard = await createBoard(project.id, 'QA', 131072);
    otherBoardList = await createList(otherBoard.id, 'QA Review');

    otherProject = await Project.create({ name: 'CRM', isHidden: false }).fetch();
    otherProjectBoard = await createBoard(otherProject.id, 'CRM Development');
    otherProjectList = await createList(otherProjectBoard.id, 'CRM To Do');

    integration = await GitlabIntegration.qm.createOne({
      gitlabProjectId: GITLAB_PROJECT_ID,
      projectId: project.id,
      gitlabProjectPath: 'company/erp',
      defaultBranch: 'main',
      webhookSecretHash: sha256(WEBHOOK_SECRET),
    });

    await GitlabIntegration.qm.createOne({
      gitlabProjectId: OTHER_GITLAB_PROJECT_ID,
      projectId: otherProject.id,
      gitlabProjectPath: 'company/crm',
      defaultBranch: 'main',
      webhookSecretHash: sha256('other-secret'),
    });

    await BoardMembership.create({
      role: BoardMembership.Roles.EDITOR,
      projectId: project.id,
      boardId: board.id,
      userId: editor.id,
      canComment: null,
    });

    card = await createCard(todoList, board.id);
  });

  afterEach(async () => {
    setGlobalDispatcher(originalDispatcher);
    await mockAgent.close();

    await sails.sendNativeQuery('DELETE FROM gitlab_webhook_delivery');
    await sails.sendNativeQuery('DELETE FROM gitlab_card_link');
    await sails.sendNativeQuery('DELETE FROM gitlab_integration');
    await Webhook.destroy({});
    await Notification.destroy({});
    await Action.destroy({});
    await CardSubscription.destroy({});
    await BoardMembership.destroy({});
    await Card.destroy({});
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
  });

  describe('moves', () => {
    it('moves the card to the review list when a webhook reports a ready merge request', async () => {
      await enableAutoMove();
      await createLink(NO_MR_SNAPSHOT);

      mockSummary([buildGitlabMergeRequest()]);
      const delivery = await deliverMergeRequestEvent({ action: 'open', state: 'opened' });

      expect(delivery.status).to.equal('processed');
      expect(mockAgent.pendingInterceptors()).to.deep.equal([]);

      const movedCard = await getCard();

      expect(movedCard.listId).to.equal(reviewList.id);
      expect(movedCard.isClosed).to.equal(false);
    });

    it('moves the card to the completed list when a webhook reports a merge', async () => {
      await enableAutoMove();
      await createLink(READY_SNAPSHOT);

      mockSummary([buildGitlabMergeRequest({ state: 'merged' })]);
      const delivery = await deliverMergeRequestEvent({ action: 'merge', state: 'merged' });

      expect(delivery.status).to.equal('processed');

      const movedCard = await getCard();

      expect(movedCard.listId).to.equal(doneList.id);
      expect(movedCard.isClosed).to.equal(true);
    });

    it('records the bot as the actor of the move, its notifications and webhooks', async () => {
      await enableAutoMove();
      const link = await createLink(NO_MR_SNAPSHOT);

      await CardSubscription.create({ cardId: card.id, userId: editor.id });

      await Webhook.create({
        name: 'Audit',
        url: `${OUTGOING_WEBHOOK_URL}/planka`,
        events: [Webhook.Events.CARD_UPDATE],
      });

      let webhookBody;
      mockAgent
        .get(OUTGOING_WEBHOOK_URL)
        .intercept({
          path: '/planka',
          method: 'POST',
          body: (body) => {
            webhookBody = JSON.parse(body);

            return true;
          },
        })
        .reply(200, {});

      await syncLink(link, [buildGitlabMergeRequest()]);

      const botUser = await User.qm.getOneByEmail(BOT_EMAIL);
      const actions = await Action.find({ cardId: card.id, type: Action.Types.MOVE_CARD });

      expect(actions).to.have.lengthOf(1);
      expect(actions[0].userId).to.equal(botUser.id);
      expect(actions[0].data.fromList.id).to.equal(todoList.id);
      expect(actions[0].data.toList.id).to.equal(reviewList.id);

      const notifications = await Notification.find({ userId: editor.id });

      expect(notifications).to.have.lengthOf(1);
      expect(notifications[0].creatorUserId).to.equal(botUser.id);

      for (let attempt = 0; attempt < 100 && !webhookBody; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        await wait(10);
      }

      expect(webhookBody.event).to.equal(Webhook.Events.CARD_UPDATE);
      expect(webhookBody.user.id).to.equal(botUser.id);
      expect(webhookBody.user.name).to.equal(BOT_NAME);
      expect(webhookBody.user).to.not.have.property('password');
      expect(webhookBody.data.item.listId).to.equal(reviewList.id);
    });

    it('appends the card at the end of the target list', async () => {
      await enableAutoMove();
      await createCard(reviewList, board.id, 65536, 'First');
      await createCard(reviewList, board.id, 131072, 'Second');
      const link = await createLink(NO_MR_SNAPSHOT);

      await syncLink(link, [buildGitlabMergeRequest()]);

      const movedCard = await getCard();

      expect(movedCard.listId).to.equal(reviewList.id);
      expect(movedCard.position).to.equal(131072 + 65536);
    });

    it('moves the card to a list of another board of the project', async () => {
      await enableAutoMove({ reviewListId: otherBoardList.id });
      const link = await createLink(NO_MR_SNAPSHOT);

      await syncLink(link, [buildGitlabMergeRequest()]);

      const movedCard = await getCard();

      expect(movedCard.boardId).to.equal(otherBoard.id);
      expect(movedCard.listId).to.equal(otherBoardList.id);
      expect(movedCard.position).to.equal(65536);
    });

    it('moves the card to the review list when a merge request is created from Planka', async () => {
      await enableAutoMove();
      await createLink(NO_MR_SNAPSHOT);

      mockListMergeRequests('opened', []);
      gitlabGet(`/issues/${ISSUE_IID}`).reply(200, buildGitlabIssue());
      gitlab
        .intercept({
          path: `/api/v4/projects/${GITLAB_PROJECT_ID}/merge_requests`,
          method: 'POST',
          headers: { 'private-token': GITLAB_TOKEN },
        })
        .reply(201, buildGitlabMergeRequest());

      const response = await request(sails.hooks.http.app)
        .post(`/api/cards/${card.id}/gitlab-merge-request`)
        .set('X-Api-Key', EDITOR_API_KEY);

      expect(response.status).to.equal(200);
      expect(response.body.included.isExistingMergeRequest).to.equal(false);
      expect((await getCard()).listId).to.equal(reviewList.id);
    });

    it('moves the card when opening it reveals a merge', async () => {
      await enableAutoMove();
      await createLink(READY_SNAPSHOT);

      mockSummary([buildGitlabMergeRequest({ state: 'merged' })]);

      const response = await request(sails.hooks.http.app)
        .get(`/api/cards/${card.id}/gitlab`)
        .set('X-Api-Key', EDITOR_API_KEY);

      expect(response.status).to.equal(200);
      expect(response.body.included.isStale).to.equal(false);
      expect(response.body.included.gitlabMergeRequest.state).to.equal('merged');
      expect((await getCard()).listId).to.equal(doneList.id);
    });

    it('does not move a card moved back by hand on the next sync with the same state', async () => {
      await enableAutoMove();
      const link = await createLink(NO_MR_SNAPSHOT);

      await syncLink(link, [buildGitlabMergeRequest()]);
      expect((await getCard()).listId).to.equal(reviewList.id);

      await Card.updateOne(card.id).set({ listId: todoList.id });

      await syncLink(link, [buildGitlabMergeRequest()]);
      expect((await getCard()).listId).to.equal(todoList.id);

      const actions = await Action.find({ cardId: card.id, type: Action.Types.MOVE_CARD });
      expect(actions).to.have.lengthOf(1);
    });

    it('only moves the first of concurrent syncs seeing the same transition', async () => {
      await enableAutoMove();
      const link = await createLink(NO_MR_SNAPSHOT);

      mockSummary([buildGitlabMergeRequest()]);
      mockSummary([buildGitlabMergeRequest()]);

      const record = await GitlabCardLink.qm.getOneById(link.id);

      await Promise.all([
        sails.helpers.gitlabCardLinks.syncOne.with({ record }),
        sails.helpers.gitlabCardLinks.syncOne.with({ record }),
      ]);

      expect((await getCard()).listId).to.equal(reviewList.id);

      const actions = await Action.find({ cardId: card.id, type: Action.Types.MOVE_CARD });
      expect(actions).to.have.lengthOf(1);
    });
  });

  describe('no move', () => {
    const expectNotMoved = async () => {
      const unchangedCard = await getCard();

      expect(unchangedCard.listId).to.equal(card.listId);
      expect(await Action.count({ cardId: card.id, type: Action.Types.MOVE_CARD })).to.equal(0);
    };

    it('does not move when the option is off', async () => {
      await enableAutoMove({ autoMoveOnMrOpen: false, autoMoveOnMrMerge: false });
      const link = await createLink(NO_MR_SNAPSHOT);

      await syncLink(link, [buildGitlabMergeRequest()]);
      await expectNotMoved();

      await syncLink(link, [buildGitlabMergeRequest({ state: 'merged' })]);
      await expectNotMoved();
    });

    it('does not move to a deleted list', async () => {
      await enableAutoMove();
      await List.destroy({ id: reviewList.id });

      const link = await createLink(NO_MR_SNAPSHOT);

      await syncLink(link, [buildGitlabMergeRequest()]);
      await expectNotMoved();
    });

    it('does not move a card already in the target list', async () => {
      await enableAutoMove();
      await Card.updateOne(card.id).set({ listId: reviewList.id });
      card = await getCard();

      const link = await createLink(NO_MR_SNAPSHOT);

      await syncLink(link, [buildGitlabMergeRequest()]);
      await expectNotMoved();
    });

    it('does not move an archived or trashed card', async () => {
      await enableAutoMove();
      await Card.updateOne(card.id).set({ listId: archiveList.id, position: null });
      card = await getCard();

      const link = await createLink(NO_MR_SNAPSHOT);

      await syncLink(link, [buildGitlabMergeRequest({ state: 'merged' })]);
      await expectNotMoved();
    });

    it('does not move a card that was moved to another project', async () => {
      await enableAutoMove();
      await Card.updateOne(card.id).set({
        boardId: otherProjectBoard.id,
        listId: otherProjectList.id,
      });
      card = await getCard();

      const link = await createLink(NO_MR_SNAPSHOT);

      await syncLink(link, [buildGitlabMergeRequest()]);
      await expectNotMoved();
    });

    it('does not move on the first sync of a legacy snapshot', async () => {
      await enableAutoMove();
      const link = await createLink({ title: 'Implement login', state: 'opened' });

      await syncLink(link, [buildGitlabMergeRequest({ state: 'merged' })]);
      await expectNotMoved();
    });

    it('does not move for a closed merge request', async () => {
      await enableAutoMove();
      const link = await createLink(READY_SNAPSHOT);

      await syncLink(link, [buildGitlabMergeRequest({ state: 'closed' })]);
      await expectNotMoved();
    });

    it('keeps syncing when the move fails', async () => {
      await enableAutoMove();
      const link = await createLink(NO_MR_SNAPSHOT);

      resetBotUserCache();

      const originalGetOneByEmail = User.qm.getOneByEmail;
      User.qm.getOneByEmail = async () => {
        throw new Error('Simulated failure');
      };

      let syncedLink;
      try {
        syncedLink = await syncLink(link, [buildGitlabMergeRequest()]);
      } finally {
        User.qm.getOneByEmail = originalGetOneByEmail;
      }

      expect(syncedLink.snapshot.mergeRequest.state).to.equal('opened');
      expect(syncedLink.lastSyncedAt).to.not.equal(null);
      await expectNotMoved();
    });
  });

  describe('bot user', () => {
    beforeEach(deleteBotUsers);

    it('creates a deactivated bot user once and caches it', async () => {
      const botUser = await getBotUser();

      expect(botUser).to.include({
        username: BOT_USERNAME,
        name: BOT_NAME,
        email: BOT_EMAIL,
        role: User.Roles.BOARD_USER,
        isDeactivated: true,
      });
      expect(botUser.password).to.match(/^\$2[aby]\$10\$/);

      expect(await getBotUser()).to.equal(botUser);

      resetBotUserCache();

      const [first, second] = await Promise.all([getBotUser(), getBotUser()]);

      expect(first.id).to.equal(botUser.id);
      expect(second).to.equal(first);
      expect(await User.count({ email: BOT_EMAIL })).to.equal(1);
    });

    it('adopts a bot user created by another process', async () => {
      const existingUser = await User.create({
        email: BOT_EMAIL,
        name: BOT_NAME,
        username: BOT_USERNAME,
        role: User.Roles.BOARD_USER,
        isDeactivated: true,
      }).fetch();

      expect((await getBotUser()).id).to.equal(existingUser.id);
    });

    it('recovers from losing the creation race', async () => {
      const originalGetOneByEmail = User.qm.getOneByEmail;

      // The first lookup misses the bot that another process creates right after
      let isFirstLookup = true;
      User.qm.getOneByEmail = async (email) => {
        if (isFirstLookup) {
          isFirstLookup = false;

          await User.create({
            email: BOT_EMAIL,
            name: BOT_NAME,
            username: BOT_USERNAME,
            role: User.Roles.BOARD_USER,
            isDeactivated: true,
          });

          return null;
        }

        return originalGetOneByEmail(email);
      };

      let botUser;
      try {
        botUser = await getBotUser();
      } finally {
        User.qm.getOneByEmail = originalGetOneByEmail;
      }

      expect(botUser.email).to.equal(BOT_EMAIL);
      expect(await User.count({ email: BOT_EMAIL })).to.equal(1);
    });

    it('refuses to adopt a user named gitlab-bot without the sentinel email', async () => {
      const human = await User.create({
        email: 'gitlab-bot@company.test',
        name: 'Human',
        username: BOT_USERNAME,
        role: User.Roles.BOARD_USER,
      }).fetch();

      expect(await getBotUser()).to.equal(null);

      const humanAfter = await User.qm.getOneById(human.id);

      expect(humanAfter.email).to.equal('gitlab-bot@company.test');
      expect(humanAfter.isDeactivated).to.equal(false);

      // And no card is moved as that user
      await enableAutoMove();
      const link = await createLink(NO_MR_SNAPSHOT);

      await syncLink(link, [buildGitlabMergeRequest()]);

      expect((await getCard()).listId).to.equal(todoList.id);
      expect(await Action.count({ userId: human.id })).to.equal(0);
    });

    it('cannot log in', async () => {
      const botUser = await getBotUser();

      // Even with a known password, the deactivated bot is rejected
      await User.updateOne(botUser.id).set({ password: await bcrypt.hash('known-password', 10) });

      const logIn = (emailOrUsername) =>
        request(sails.hooks.http.app)
          .post('/api/access-tokens')
          .send({ emailOrUsername, password: 'known-password' });

      const byEmail = await logIn(BOT_EMAIL);

      expect(byEmail.status).to.equal(401);
      expect(byEmail.body).to.not.have.property('item');

      // The API username format has no hyphen, so the username is rejected even earlier
      const byUsername = await logIn(BOT_USERNAME);

      expect(byUsername.status).to.equal(400);
      expect(byUsername.body).to.not.have.property('item');

      // Proves the rejections come from the deactivation, not from the password
      await User.updateOne(botUser.id).set({ isDeactivated: false });

      try {
        expect((await logIn(BOT_EMAIL)).status).to.not.equal(401);
      } finally {
        await User.updateOne(botUser.id).set({ isDeactivated: true });
      }
    });
  });
});
