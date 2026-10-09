const crypto = require('crypto');
const { expect } = require('chai');
const request = require('supertest');

const EDITOR_API_KEY = 'test-knowledge-editor-api-key';
const OTHER_EDITOR_API_KEY = 'test-knowledge-other-editor-api-key';
const VIEWER_API_KEY = 'test-knowledge-viewer-api-key';
const MANAGER_API_KEY = 'test-knowledge-manager-api-key';
const OUTSIDER_API_KEY = 'test-knowledge-outsider-api-key';
const ADMIN_API_KEY = 'test-knowledge-admin-api-key';
const OUTSIDER_ADMIN_API_KEY = 'test-knowledge-outsider-admin-api-key';

// gravatarUrl is present only when Gravatar is configured
const PUBLIC_USER_FIELD_NAMES = [
  'avatar',
  'gravatarUrl',
  'id',
  'isDeactivated',
  'name',
  'username',
];

const expectPublicUser = (user) => {
  expect(user).to.include.keys('id', 'name');
  expect(_.difference(Object.keys(user), PUBLIC_USER_FIELD_NAMES)).to.deep.equal([]);
};

// Broadcast payloads hold Date objects, which reach clients as JSON
const toJson = (value) => JSON.parse(JSON.stringify(value));

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const createUser = (name, values = {}) =>
  User.create({
    name,
    role: User.Roles.BOARD_USER,
    email: `${name}@planka.test`,
    username: name,
    phone: '+1 555 0100',
    organization: 'ACME',
    ...values,
  }).fetch();

const createProjectWithBoard = async (name) => {
  const project = await Project.create({ name, isHidden: false }).fetch();

  const board = await Board.create({
    projectId: project.id,
    position: 65536,
    name: `${name} board`,
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
    name: 'Billing module',
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

describe('Knowledge transfers (controllers)', () => {
  let editor;
  let otherEditor;
  let viewer;
  let manager;
  let outsider;
  let admin;
  let outsiderAdmin;
  let learner;
  let deactivatedUser;

  let path;
  let otherPath;
  let card;

  const api = (method, url, apiKey = EDITOR_API_KEY) => {
    const req = request(sails.hooks.http.app)[method](url);

    return apiKey ? req.set('X-Api-Key', apiKey) : req;
  };

  const list = (apiKey) => api('get', `/api/cards/${card.id}/knowledge-transfers`, apiKey);

  const add = (userId, apiKey) =>
    api('post', `/api/cards/${card.id}/knowledge-transfers`, apiKey).send({ userId });

  const setExplained = (id, isExplained, apiKey) =>
    api('patch', `/api/knowledge-transfers/${id}`, apiKey).send({ isExplained });

  const remove = (id, apiKey) => api('delete', `/api/knowledge-transfers/${id}`, apiKey);

  const candidates = (apiKey) =>
    api('get', `/api/cards/${card.id}/knowledge-transfer-candidates`, apiKey);

  before(async () => {
    editor = await createUser('knowledgeeditor', { apiKeyHash: sha256(EDITOR_API_KEY) });
    otherEditor = await createUser('knowledgeothereditor', {
      apiKeyHash: sha256(OTHER_EDITOR_API_KEY),
    });
    viewer = await createUser('knowledgeviewer', { apiKeyHash: sha256(VIEWER_API_KEY) });
    manager = await createUser('knowledgemanager', { apiKeyHash: sha256(MANAGER_API_KEY) });
    outsider = await createUser('knowledgeoutsider', { apiKeyHash: sha256(OUTSIDER_API_KEY) });
    admin = await createUser('knowledgeadmin', {
      role: User.Roles.ADMIN,
      apiKeyHash: sha256(ADMIN_API_KEY),
    });
    // Admin without board membership
    outsiderAdmin = await createUser('knowledgeoutsideradmin', {
      role: User.Roles.ADMIN,
      apiKeyHash: sha256(OUTSIDER_ADMIN_API_KEY),
    });
    deactivatedUser = await createUser('knowledgedeactivated', { isDeactivated: true });
  });

  after(async () => {
    await User.destroy({
      id: [
        editor.id,
        otherEditor.id,
        viewer.id,
        manager.id,
        outsider.id,
        deactivatedUser.id,
        admin.id,
        outsiderAdmin.id,
      ],
    });
  });

  beforeEach(async () => {
    // Not a member of any board: knowledge can be transferred to anyone active
    learner = await createUser('knowledgelearner');

    path = await createProjectWithBoard('ERP');
    otherPath = await createProjectWithBoard('CRM');
    card = await createCard(path);

    await addBoardMember(path, editor, BoardMembership.Roles.EDITOR);
    await addBoardMember(path, otherEditor, BoardMembership.Roles.EDITOR);
    await addBoardMember(otherPath, otherEditor, BoardMembership.Roles.EDITOR);
    await addBoardMember(path, viewer, BoardMembership.Roles.VIEWER);
    await addBoardMember(path, admin, BoardMembership.Roles.EDITOR);

    await ProjectManager.create({ projectId: path.project.id, userId: manager.id }).fetch();
  });

  afterEach(async () => {
    await sails.sendNativeQuery('DELETE FROM card_knowledge_transfer');
    await ProjectManager.destroy({});
    await BoardMembership.destroy({});
    await Card.destroy({});
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
    await User.destroy({ id: learner.id });
  });

  describe('create', () => {
    it('adds any active user, with the editor as creator, and returns public user fields', async () => {
      const response = await add(learner.id);

      expect(response.status).to.equal(200);
      expect(response.body.item).to.deep.equal({
        id: response.body.item.id,
        cardId: card.id,
        userId: learner.id,
        isExplained: false,
        explainedByUserId: null,
        explainedAt: null,
        creatorUserId: editor.id,
        createdAt: response.body.item.createdAt,
        updatedAt: response.body.item.updatedAt,
      });

      expect(response.body.included.users).to.have.lengthOf(1);
      expectPublicUser(response.body.included.users[0]);
      expect(response.body.included.users[0]).to.include({
        id: learner.id,
        name: 'knowledgelearner',
        username: 'knowledgelearner',
        isDeactivated: false,
      });

      const stored = await CardKnowledgeTransfer.qm.getOneById(response.body.item.id);

      expect(stored).to.include({
        cardId: card.id,
        userId: learner.id,
        isExplained: false,
        creatorUserId: editor.id,
      });
    });

    it('rejects a user already assigned to the card with 409', async () => {
      expect((await add(learner.id)).status).to.equal(200);

      const response = await add(learner.id);

      expect(response.status).to.equal(409);
      expect(response.body.code).to.equal('E_CONFLICT');
    });

    it('allows the same user on another card', async () => {
      expect((await add(learner.id)).status).to.equal(200);

      const otherCard = await createCard(path, { name: 'Invoicing' });
      const response = await api('post', `/api/cards/${otherCard.id}/knowledge-transfers`).send({
        userId: learner.id,
      });

      expect(response.status).to.equal(200);
    });

    it('rejects a deactivated user with 422', async () => {
      const response = await add(deactivatedUser.id);

      expect(response.status).to.equal(422);
      expect(await CardKnowledgeTransfer.qm.getByCardId(card.id)).to.have.lengthOf(0);
    });

    it('rejects an unknown user with 404', async () => {
      const response = await add('1');

      expect(response.status).to.equal(404);
    });

    it('rejects viewers with 403 and non-members with 404', async () => {
      expect((await add(learner.id, VIEWER_API_KEY)).status).to.equal(403);
      expect((await add(learner.id, MANAGER_API_KEY)).status).to.equal(404);
      expect((await add(learner.id, OUTSIDER_API_KEY)).status).to.equal(404);

      expect(await CardKnowledgeTransfer.qm.getByCardId(card.id)).to.have.lengthOf(0);
    });

    it('rejects unauthenticated requests', async () => {
      const response = await add(learner.id, null);

      expect(response.status).to.equal(401);
    });

    it('broadcasts the item and the assignee to the board, excluding the requester', async () => {
      const broadcasts = captureBroadcasts();

      let response;
      try {
        response = await add(learner.id);
      } finally {
        broadcasts.restore();
      }

      const events = broadcasts.filter(({ event }) => event === 'knowledgeTransferCreate');

      expect(events).to.have.lengthOf(1);
      expect(events[0].room).to.equal(`board:${path.board.id}`);
      expect(events[0].req).to.be.an('object');
      expect(toJson(events[0].data.item)).to.deep.equal(response.body.item);
      expect(events[0].data.included.users.map(({ id }) => id)).to.deep.equal([learner.id]);
      expectPublicUser(events[0].data.included.users[0]);
    });
  });

  describe('index', () => {
    it('lists items with the assignees and explainers', async () => {
      const { body: created } = await add(learner.id);
      await add(viewer.id);
      await setExplained(created.item.id, true);

      const response = await list(VIEWER_API_KEY);

      expect(response.status).to.equal(200);
      expect(response.body.items.map(({ userId }) => userId)).to.deep.equal([
        learner.id,
        viewer.id,
      ]);
      expect(response.body.items[0]).to.include({
        isExplained: true,
        explainedByUserId: editor.id,
      });
      expect(response.body.included.users.map(({ id }) => id).sort()).to.deep.equal(
        [learner.id, viewer.id, editor.id].sort(),
      );

      response.body.included.users.forEach((user) => {
        expectPublicUser(user);
      });
    });

    it('is readable by board members and project managers, not by outsiders', async () => {
      await add(learner.id);

      expect((await list(EDITOR_API_KEY)).status).to.equal(200);
      expect((await list(VIEWER_API_KEY)).status).to.equal(200);
      expect((await list(MANAGER_API_KEY)).status).to.equal(200);

      const response = await list(OUTSIDER_API_KEY);

      expect(response.status).to.equal(404);
      expect(response.body).to.not.have.property('items');
    });

    it('returns 404 for a missing card', async () => {
      const response = await api('get', '/api/cards/1/knowledge-transfers');

      expect(response.status).to.equal(404);
    });
  });

  describe('candidates', () => {
    it('lists every active user with public fields only, for editors', async () => {
      const response = await candidates();

      expect(response.status).to.equal(200);

      const ids = response.body.items.map(({ id }) => id);

      // Board membership does not matter
      expect(ids).to.include.members([learner.id, outsider.id, editor.id, viewer.id]);
      expect(ids).to.not.include(deactivatedUser.id);
      expect(response.body.items.every(({ isDeactivated }) => isDeactivated === false)).to.equal(
        true,
      );

      response.body.items.forEach((user) => {
        expectPublicUser(user);
      });
    });

    it('rejects viewers with 403 and non-members with 404', async () => {
      expect((await candidates(VIEWER_API_KEY)).status).to.equal(403);
      expect((await candidates(MANAGER_API_KEY)).status).to.equal(404);
      expect((await candidates(OUTSIDER_API_KEY)).status).to.equal(404);
    });
  });

  describe('update', () => {
    let knowledgeTransferId;

    beforeEach(async () => {
      knowledgeTransferId = (await add(learner.id)).body.item.id;
    });

    it('sets the explainer and time from the current user when ticked', async () => {
      const before = Date.now();
      const response = await setExplained(knowledgeTransferId, true, OTHER_EDITOR_API_KEY);

      expect(response.status).to.equal(200);
      expect(response.body.item).to.include({
        isExplained: true,
        explainedByUserId: otherEditor.id,
      });
      expect(new Date(response.body.item.explainedAt).getTime()).to.be.within(
        before - 1000,
        Date.now() + 1000,
      );
      expect(response.body.included.users.map(({ id }) => id)).to.deep.equal([otherEditor.id]);

      const stored = await CardKnowledgeTransfer.qm.getOneById(knowledgeTransferId);

      expect(stored).to.include({ isExplained: true, explainedByUserId: otherEditor.id });
      expect(stored.explainedAt).to.not.equal(null);
    });

    it('ignores explainer and time sent by the client', async () => {
      const response = await api('patch', `/api/knowledge-transfers/${knowledgeTransferId}`).send({
        isExplained: true,
        explainedByUserId: viewer.id,
        explainedAt: '2000-01-01T00:00:00.000Z',
      });

      expect(response.status).to.equal(200);
      expect(response.body.item.explainedByUserId).to.equal(editor.id);
      expect(response.body.item.explainedAt).to.not.equal('2000-01-01T00:00:00.000Z');
    });

    it('requires isExplained', async () => {
      const response = await api('patch', `/api/knowledge-transfers/${knowledgeTransferId}`).send(
        {},
      );

      expect(response.status).to.equal(400);
    });

    it('keeps the first explainer when ticked again', async () => {
      const { body: first } = await setExplained(knowledgeTransferId, true);
      const response = await setExplained(knowledgeTransferId, true, OTHER_EDITOR_API_KEY);

      expect(response.status).to.equal(200);
      expect(response.body.item).to.include({
        explainedByUserId: editor.id,
        explainedAt: first.item.explainedAt,
      });
    });

    it('lets admins untick, clearing the explainer and time', async () => {
      await setExplained(knowledgeTransferId, true);

      const response = await setExplained(knowledgeTransferId, false, ADMIN_API_KEY);

      expect(response.status).to.equal(200);
      expect(response.body.item).to.include({
        isExplained: false,
        explainedByUserId: null,
        explainedAt: null,
      });
      expect(response.body.included.users).to.deep.equal([]);

      const stored = await CardKnowledgeTransfer.qm.getOneById(knowledgeTransferId);

      expect(stored).to.include({ isExplained: false, explainedByUserId: null, explainedAt: null });
    });

    it('locks explained items: editors cannot untick them', async () => {
      await setExplained(knowledgeTransferId, true);

      const response = await setExplained(knowledgeTransferId, false, OTHER_EDITOR_API_KEY);

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Knowledge transfer is already explained');

      const stored = await CardKnowledgeTransfer.qm.getOneById(knowledgeTransferId);

      expect(stored).to.include({ isExplained: true, explainedByUserId: editor.id });
    });

    it('applies the card access rule to admins too', async () => {
      await setExplained(knowledgeTransferId, true);

      expect(
        (await setExplained(knowledgeTransferId, false, OUTSIDER_ADMIN_API_KEY)).status,
      ).to.equal(404);
      expect((await CardKnowledgeTransfer.qm.getOneById(knowledgeTransferId)).isExplained).to.equal(
        true,
      );
    });

    it('rejects viewers with 403 and non-members with 404', async () => {
      expect((await setExplained(knowledgeTransferId, true, VIEWER_API_KEY)).status).to.equal(403);
      expect((await setExplained(knowledgeTransferId, true, MANAGER_API_KEY)).status).to.equal(404);
      expect((await setExplained(knowledgeTransferId, true, OUTSIDER_API_KEY)).status).to.equal(
        404,
      );

      const stored = await CardKnowledgeTransfer.qm.getOneById(knowledgeTransferId);

      expect(stored.isExplained).to.equal(false);
    });

    it('returns 404 for a missing knowledge transfer', async () => {
      expect((await setExplained('1', true)).status).to.equal(404);
    });

    it('broadcasts the item and the explainer to the board, excluding the requester', async () => {
      const broadcasts = captureBroadcasts();

      let response;
      try {
        response = await setExplained(knowledgeTransferId, true);
      } finally {
        broadcasts.restore();
      }

      const events = broadcasts.filter(({ event }) => event === 'knowledgeTransferUpdate');

      expect(events).to.have.lengthOf(1);
      expect(events[0].room).to.equal(`board:${path.board.id}`);
      expect(events[0].req).to.be.an('object');
      expect(toJson(events[0].data.item)).to.deep.equal(response.body.item);
      expect(events[0].data.included.users.map(({ id }) => id)).to.deep.equal([editor.id]);
      expectPublicUser(events[0].data.included.users[0]);
    });

    it('does not broadcast when nothing changes', async () => {
      const broadcasts = captureBroadcasts();

      try {
        expect((await setExplained(knowledgeTransferId, false)).status).to.equal(200);
      } finally {
        broadcasts.restore();
      }

      expect(broadcasts.filter(({ event }) => event === 'knowledgeTransferUpdate')).to.deep.equal(
        [],
      );
    });

    it("follows the card to another board and broadcasts to the card's current board", async () => {
      await Card.updateOne(card.id).set({
        boardId: otherPath.board.id,
        listId: otherPath.list.id,
      });

      // The editor is not a member of the new board
      expect((await setExplained(knowledgeTransferId, true)).status).to.equal(404);

      const broadcasts = captureBroadcasts();

      try {
        expect(
          (await setExplained(knowledgeTransferId, true, OTHER_EDITOR_API_KEY)).status,
        ).to.equal(200);
      } finally {
        broadcasts.restore();
      }

      const events = broadcasts.filter(({ event }) => event === 'knowledgeTransferUpdate');

      expect(events.map(({ room }) => room)).to.deep.equal([`board:${otherPath.board.id}`]);
    });
  });

  describe('delete', () => {
    let knowledgeTransferId;

    beforeEach(async () => {
      knowledgeTransferId = (await add(learner.id)).body.item.id;
    });

    it('removes the knowledge transfer and broadcasts it', async () => {
      const broadcasts = captureBroadcasts();

      let response;
      try {
        response = await remove(knowledgeTransferId);
      } finally {
        broadcasts.restore();
      }

      expect(response.status).to.equal(200);
      expect(response.body.item.id).to.equal(knowledgeTransferId);
      expect(await CardKnowledgeTransfer.qm.getOneById(knowledgeTransferId)).to.equal(undefined);

      const events = broadcasts.filter(({ event }) => event === 'knowledgeTransferDelete');

      expect(events).to.have.lengthOf(1);
      expect(events[0].room).to.equal(`board:${path.board.id}`);
      expect(events[0].req).to.be.an('object');
      expect(toJson(events[0].data)).to.deep.equal({ item: response.body.item });
    });

    it('rejects viewers with 403 and non-members with 404', async () => {
      expect((await remove(knowledgeTransferId, VIEWER_API_KEY)).status).to.equal(403);
      expect((await remove(knowledgeTransferId, OUTSIDER_API_KEY)).status).to.equal(404);

      expect(await CardKnowledgeTransfer.qm.getOneById(knowledgeTransferId)).to.not.equal(
        undefined,
      );
    });

    it('locks explained items: editors cannot remove them', async () => {
      await setExplained(knowledgeTransferId, true);

      const response = await remove(knowledgeTransferId, OTHER_EDITOR_API_KEY);

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Knowledge transfer is already explained');
      expect(await CardKnowledgeTransfer.qm.getOneById(knowledgeTransferId)).to.not.equal(
        undefined,
      );
    });

    it('lets admins remove explained items', async () => {
      await setExplained(knowledgeTransferId, true);

      expect((await remove(knowledgeTransferId, OUTSIDER_ADMIN_API_KEY)).status).to.equal(404);
      expect((await remove(knowledgeTransferId, ADMIN_API_KEY)).status).to.equal(200);
      expect(await CardKnowledgeTransfer.qm.getOneById(knowledgeTransferId)).to.equal(undefined);
    });

    it('returns 404 once removed', async () => {
      expect((await remove(knowledgeTransferId)).status).to.equal(200);
      expect((await remove(knowledgeTransferId)).status).to.equal(404);
    });
  });

  describe('cascades', () => {
    it('removes knowledge transfers with their card', async () => {
      const { body } = await add(learner.id);

      await Card.destroyOne(card.id);

      expect(await CardKnowledgeTransfer.qm.getOneById(body.item.id)).to.equal(undefined);
    });

    it('removes knowledge transfers of a deleted assignee', async () => {
      const { body } = await add(learner.id);

      await User.destroyOne(learner.id);

      expect(await CardKnowledgeTransfer.qm.getOneById(body.item.id)).to.equal(undefined);
    });

    it('keeps knowledge transfers whose explainer or creator was deleted', async () => {
      const temporaryApiKey = 'test-knowledge-temporary-api-key';
      const temporaryEditor = await createUser('knowledgetemporary', {
        apiKeyHash: sha256(temporaryApiKey),
      });
      await addBoardMember(path, temporaryEditor, BoardMembership.Roles.EDITOR);

      const { body } = await add(learner.id, temporaryApiKey);
      await setExplained(body.item.id, true, temporaryApiKey);

      await BoardMembership.destroy({ userId: temporaryEditor.id });
      await User.destroyOne(temporaryEditor.id);

      const stored = await CardKnowledgeTransfer.qm.getOneById(body.item.id);

      expect(stored).to.include({
        isExplained: true,
        explainedByUserId: null,
        creatorUserId: null,
      });
      expect(stored.explainedAt).to.not.equal(null);
    });
  });
});
