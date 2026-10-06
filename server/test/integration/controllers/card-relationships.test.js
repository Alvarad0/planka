const crypto = require('crypto');
const { expect } = require('chai');
const request = require('supertest');

const EDITOR_API_KEY = 'test-relationships-editor-api-key';
const MIXED_API_KEY = 'test-relationships-mixed-api-key';
const DEV_ONLY_API_KEY = 'test-relationships-dev-only-api-key';
const MANAGER_API_KEY = 'test-relationships-manager-api-key';
const OUTSIDER_API_KEY = 'test-relationships-outsider-api-key';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const createUser = (name, apiKey) =>
  User.create({
    name,
    role: User.Roles.BOARD_USER,
    email: `${name}@planka.test`,
    apiKeyHash: sha256(apiKey),
  }).fetch();

const createBoard = async (project, name) => {
  const board = await Board.create({
    name,
    projectId: project.id,
    position: 65536,
    defaultView: 'kanban',
    defaultCardType: 'project',
    limitCardTypesToDefaultOne: false,
    alwaysDisplayCardCreator: false,
  }).fetch();

  const list = await List.create({
    boardId: board.id,
    type: List.Types.ACTIVE,
    position: 65536,
    name: `${name} To Do`,
  }).fetch();

  return { project, board, list };
};

const createCard = ({ board, list }, name, values = {}) =>
  Card.create({
    name,
    boardId: board.id,
    listId: list.id,
    type: 'project',
    position: 65536,
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

const linkTask = async (parentCard, linkedCard) => {
  const taskList = await TaskList.create({
    cardId: parentCard.id,
    position: 65536,
    name: 'Subtasks',
  }).fetch();

  return Task.create({
    taskListId: taskList.id,
    linkedCardId: linkedCard.id,
    position: 65536,
    name: linkedCard.name,
  }).fetch();
};

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

describe('Card relationships (controllers)', () => {
  // editor: editor on dev, ops and other (other project)
  // mixed: editor on dev, viewer on ops
  // devOnly: editor on dev only
  // manager: project manager of the ERP project, no board membership
  let editor;
  let mixed;
  let devOnly;
  let manager;
  let outsider;

  let erp;
  let dev;
  let ops;
  let other;

  let cardA;
  let cardB;
  let cardC;
  let cardD;
  let opsCard;
  let otherCard;

  const api = (method, url, apiKey = EDITOR_API_KEY) => {
    const req = request(sails.hooks.http.app)[method](url);

    return apiKey ? req.set('X-Api-Key', apiKey) : req;
  };

  const relate = (card, relatedCard, type, apiKey) =>
    api('post', `/api/cards/${card.id}/card-relationships`, apiKey).send({
      type,
      relatedCardId: relatedCard.id,
    });

  const list = (card, apiKey) => api('get', `/api/cards/${card.id}/card-relationships`, apiKey);

  const summaryOf = (card, { board }) => ({
    id: card.id,
    name: card.name,
    isClosed: card.isClosed,
    boardId: board.id,
    boardName: board.name,
    listName: `${board.name} To Do`,
  });

  before(async () => {
    editor = await createUser('relationshipseditor', EDITOR_API_KEY);
    mixed = await createUser('relationshipsmixed', MIXED_API_KEY);
    devOnly = await createUser('relationshipsdevonly', DEV_ONLY_API_KEY);
    manager = await createUser('relationshipsmanager', MANAGER_API_KEY);
    outsider = await createUser('relationshipsoutsider', OUTSIDER_API_KEY);
  });

  after(async () => {
    await User.destroy({ id: [editor.id, mixed.id, devOnly.id, manager.id, outsider.id] });
  });

  beforeEach(async () => {
    erp = await Project.create({ name: 'ERP', isHidden: false }).fetch();
    const otherProject = await Project.create({ name: 'CRM', isHidden: false }).fetch();

    dev = await createBoard(erp, 'Development');
    ops = await createBoard(erp, 'Operations');
    other = await createBoard(otherProject, 'Sales');

    cardA = await createCard(dev, 'A');
    cardB = await createCard(dev, 'B');
    cardC = await createCard(dev, 'C');
    cardD = await createCard(dev, 'D');
    opsCard = await createCard(ops, 'Deploy secret service');
    otherCard = await createCard(other, 'Other project card');

    await addBoardMember(dev, editor, BoardMembership.Roles.EDITOR);
    await addBoardMember(ops, editor, BoardMembership.Roles.EDITOR);
    await addBoardMember(other, editor, BoardMembership.Roles.EDITOR);
    await addBoardMember(dev, mixed, BoardMembership.Roles.EDITOR);
    await addBoardMember(ops, mixed, BoardMembership.Roles.VIEWER);
    await addBoardMember(dev, devOnly, BoardMembership.Roles.EDITOR);

    await ProjectManager.create({ projectId: erp.id, userId: manager.id }).fetch();
  });

  afterEach(async () => {
    await sails.sendNativeQuery('DELETE FROM card_relationship');
    await Task.destroy({});
    await TaskList.destroy({});
    await ProjectManager.destroy({});
    await BoardMembership.destroy({});
    await Card.destroy({});
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
  });

  describe('create', () => {
    it('stores dependsOn as is and presents it from the requesting card', async () => {
      const response = await relate(cardA, cardB, 'dependsOn');

      expect(response.status).to.equal(200);
      expect(response.body.item).to.deep.equal({
        id: response.body.item.id,
        type: 'dependsOn',
        relatedCardId: cardB.id,
        relatedCard: summaryOf(cardB, dev),
      });

      const stored = await CardRelationship.qm.getOneById(response.body.item.id);

      expect(stored).to.include({
        cardId: cardA.id,
        relatedCardId: cardB.id,
        type: 'depends_on',
        creatorUserId: editor.id,
      });
    });

    it('stores blocks swapped, as the other card depending on this one', async () => {
      const response = await relate(cardA, cardB, 'blocks');

      expect(response.status).to.equal(200);
      expect(response.body.item).to.include({ type: 'blocks', relatedCardId: cardB.id });

      const stored = await CardRelationship.qm.getOneById(response.body.item.id);

      expect(stored).to.include({
        cardId: cardB.id,
        relatedCardId: cardA.id,
        type: 'depends_on',
      });
    });

    it('stores related with the lower id first, whichever card asks', async () => {
      const [low, high] = BigInt(cardA.id) < BigInt(cardB.id) ? [cardA, cardB] : [cardB, cardA];

      const response = await relate(high, low, 'related');

      expect(response.status).to.equal(200);
      expect(response.body.item).to.include({ type: 'related', relatedCardId: low.id });

      const stored = await CardRelationship.qm.getOneById(response.body.item.id);

      expect(stored).to.include({ cardId: low.id, relatedCardId: high.id, type: 'related' });

      // The same pair from the other side is the same relationship
      const duplicateResponse = await relate(low, high, 'related');

      expect(duplicateResponse.status).to.equal(409);
    });

    it('returns the view type from each side', async () => {
      await relate(cardA, cardB, 'dependsOn');
      await relate(cardA, cardC, 'related');
      await relate(cardA, cardD, 'blocks');

      const fromA = await list(cardA);

      expect(fromA.status).to.equal(200);
      expect(
        _.sortBy(
          fromA.body.items.map(({ type, relatedCardId }) => ({ type, relatedCardId })),
          'type',
        ),
      ).to.deep.equal([
        { type: 'blocks', relatedCardId: cardD.id },
        { type: 'dependsOn', relatedCardId: cardB.id },
        { type: 'related', relatedCardId: cardC.id },
      ]);

      const fromB = await list(cardB);
      const fromC = await list(cardC);
      const fromD = await list(cardD);

      expect(
        fromB.body.items.map(({ type, relatedCardId }) => ({ type, relatedCardId })),
      ).to.deep.equal([{ type: 'blocks', relatedCardId: cardA.id }]);
      expect(
        fromC.body.items.map(({ type, relatedCardId }) => ({ type, relatedCardId })),
      ).to.deep.equal([{ type: 'related', relatedCardId: cardA.id }]);
      expect(
        fromD.body.items.map(({ type, relatedCardId }) => ({ type, relatedCardId })),
      ).to.deep.equal([{ type: 'dependsOn', relatedCardId: cardA.id }]);
    });

    it('relates cards across boards of the same project', async () => {
      const response = await relate(cardA, opsCard, 'dependsOn');

      expect(response.status).to.equal(200);
      expect(response.body.item.relatedCard).to.deep.equal(summaryOf(opsCard, ops));
    });

    it('rejects relating a card to itself with 422', async () => {
      const response = await relate(cardA, cardA, 'dependsOn');

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Card cannot be related to itself');
    });

    it('rejects a duplicate with 409, also when given from the other side', async () => {
      expect((await relate(cardA, cardB, 'dependsOn')).status).to.equal(200);

      const sameSide = await relate(cardA, cardB, 'dependsOn');
      const otherSide = await relate(cardB, cardA, 'blocks');

      [sameSide, otherSide].forEach((response) => {
        expect(response.status).to.equal(409);
        expect(response.body.message).to.equal('Card relationship already exists');
      });

      expect(await CardRelationship.find({})).to.have.length(1);
    });

    it('allows a dependency and a related link between the same cards', async () => {
      expect((await relate(cardA, cardB, 'dependsOn')).status).to.equal(200);
      expect((await relate(cardA, cardB, 'related')).status).to.equal(200);
    });

    describe('dependency cycles', () => {
      it('rejects a direct cycle', async () => {
        await relate(cardA, cardB, 'dependsOn');

        const response = await relate(cardB, cardA, 'dependsOn');

        expect(response.status).to.equal(422);
        expect(response.body.message).to.equal('Would create dependency cycle');
      });

      it('rejects a direct cycle expressed as blocks', async () => {
        await relate(cardA, cardB, 'dependsOn');

        const response = await relate(cardA, cardB, 'blocks');

        expect(response.status).to.equal(422);
      });

      it('rejects a transitive cycle', async () => {
        await relate(cardA, cardB, 'dependsOn');
        await relate(cardB, cardC, 'dependsOn');
        await relate(cardC, cardD, 'dependsOn');

        const response = await relate(cardD, cardA, 'dependsOn');

        expect(response.status).to.equal(422);
        expect(response.body.message).to.equal('Would create dependency cycle');
        expect(await CardRelationship.find({})).to.have.length(3);
      });

      it('does not treat a diamond as a cycle', async () => {
        // A -> B -> D and A -> C -> D
        await relate(cardA, cardB, 'dependsOn');
        await relate(cardA, cardC, 'dependsOn');
        await relate(cardB, cardD, 'dependsOn');

        const response = await relate(cardC, cardD, 'dependsOn');

        expect(response.status).to.equal(200);

        // A shortcut along the direction of the dependencies is fine too
        expect((await relate(cardA, cardD, 'dependsOn')).status).to.equal(200);
      });

      it('ignores related links when looking for cycles', async () => {
        await relate(cardA, cardB, 'related');

        expect((await relate(cardA, cardB, 'dependsOn')).status).to.equal(200);
        expect((await relate(cardB, cardC, 'related')).status).to.equal(200);
        expect((await relate(cardC, cardA, 'dependsOn')).status).to.equal(200);
      });
    });

    describe('permissions', () => {
      it('rejects unauthenticated requests with 401', async () => {
        const response = await relate(cardA, cardB, 'dependsOn', null);

        expect(response.status).to.equal(401);
      });

      it('hides the card from users who are not members of its board', async () => {
        const response = await relate(cardA, cardB, 'dependsOn', OUTSIDER_API_KEY);

        expect(response.status).to.equal(404);
        expect(response.body.message).to.equal('Card not found');
      });

      it('hides the related card from users who are not members of its board', async () => {
        const response = await relate(cardA, opsCard, 'dependsOn', DEV_ONLY_API_KEY);

        expect(response.status).to.equal(404);
        expect(response.body.message).to.equal('Related card not found');
      });

      it('hides a related card of another project the user cannot see', async () => {
        const response = await relate(cardA, otherCard, 'dependsOn', MIXED_API_KEY);

        expect(response.status).to.equal(404);
        expect(response.body.message).to.equal('Related card not found');
      });

      it('requires the editor role on the board of the related card', async () => {
        const response = await relate(cardA, opsCard, 'dependsOn', MIXED_API_KEY);

        expect(response.status).to.equal(403);
        expect(response.body.message).to.equal('Not enough rights');
      });

      it('requires the editor role on the board of the card', async () => {
        const response = await relate(opsCard, cardA, 'dependsOn', MIXED_API_KEY);

        expect(response.status).to.equal(403);
      });

      it('does not let project managers without board membership relate cards', async () => {
        const response = await relate(cardA, cardB, 'dependsOn', MANAGER_API_KEY);

        expect(response.status).to.equal(404);
      });

      it('rejects cards of different projects with 422 even for editors of both', async () => {
        const response = await relate(cardA, otherCard, 'dependsOn');

        expect(response.status).to.equal(422);
        expect(response.body.message).to.equal('Cards must belong to the same project');
        expect(await CardRelationship.find({})).to.have.length(0);
      });

      it('returns 404 for a related card that does not exist', async () => {
        const response = await api('post', `/api/cards/${cardA.id}/card-relationships`).send({
          relatedCardId: '1',
          type: 'dependsOn',
        });

        expect(response.status).to.equal(404);
        expect(response.body.message).to.equal('Related card not found');
      });

      it('rejects unknown types with 400', async () => {
        const response = await relate(cardA, cardB, 'depends_on');

        expect(response.status).to.equal(400);
      });
    });

    it('broadcasts a minimal payload to the boards of both cards', async () => {
      const broadcasts = captureBroadcasts();

      let sameBoardResponse;
      let crossBoardResponse;
      try {
        sameBoardResponse = await relate(cardA, cardB, 'blocks');
        crossBoardResponse = await relate(cardA, opsCard, 'related');
      } finally {
        broadcasts.restore();
      }

      const creates = broadcasts.filter(({ event }) => event === 'cardRelationshipCreate');

      expect(creates.map(({ room }) => room)).to.deep.equal([
        `board:${dev.board.id}`,
        `board:${dev.board.id}`,
        `board:${ops.board.id}`,
      ]);

      expect(creates[0].data).to.deep.equal({
        item: {
          id: sameBoardResponse.body.item.id,
          cardId: cardB.id,
          relatedCardId: cardA.id,
          type: 'depends_on',
        },
      });

      expect(creates[1].data.item.id).to.equal(crossBoardResponse.body.item.id);
      expect(Object.keys(creates[2].data.item).sort()).to.deep.equal([
        'cardId',
        'id',
        'relatedCardId',
        'type',
      ]);

      const serialized = JSON.stringify(
        creates.map(({ room, event, data }) => ({ room, event, data })),
      );

      [cardA, cardB, opsCard].forEach((card) => {
        expect(serialized).to.not.include(card.name);
      });
    });
  });

  describe('index', () => {
    it('hides related cards the user cannot read', async () => {
      await relate(cardA, cardB, 'dependsOn');
      await relate(cardA, opsCard, 'dependsOn');

      const response = await list(cardA, DEV_ONLY_API_KEY);

      expect(response.status).to.equal(200);

      const itemsByRelatedCardId = _.keyBy(response.body.items, 'relatedCardId');

      expect(itemsByRelatedCardId[cardB.id].relatedCard).to.deep.equal(summaryOf(cardB, dev));
      expect(itemsByRelatedCardId[opsCard.id]).to.deep.equal({
        id: itemsByRelatedCardId[opsCard.id].id,
        type: 'dependsOn',
        relatedCardId: opsCard.id,
        relatedCard: null,
      });

      expect(response.text).to.not.include(opsCard.name);
      expect(response.text).to.not.include(ops.board.name);
    });

    it('shows related cards to viewers and project managers who can read them', async () => {
      await relate(cardA, opsCard, 'dependsOn');

      const mixedResponse = await list(cardA, MIXED_API_KEY);
      const managerResponse = await list(cardA, MANAGER_API_KEY);

      [mixedResponse, managerResponse].forEach((response) => {
        expect(response.status).to.equal(200);
        expect(response.body.items[0].relatedCard).to.deep.equal(summaryOf(opsCard, ops));
      });
    });

    it('lists the cards this card is a subtask of, once each', async () => {
      await linkTask(cardB, cardA);
      await linkTask(cardB, cardA);
      await linkTask(opsCard, cardA);
      // Linked from a card to itself: not a parent
      await linkTask(cardA, cardA);
      // Unrelated link
      await linkTask(cardC, cardD);

      const response = await list(cardA, DEV_ONLY_API_KEY);

      expect(response.status).to.equal(200);
      expect(_.sortBy(response.body.included.parentCards, 'id')).to.deep.equal(
        _.sortBy([summaryOf(cardB, dev), { id: opsCard.id }], 'id'),
      );
      expect(response.text).to.not.include(opsCard.name);

      const fullResponse = await list(cardA);

      expect(_.sortBy(fullResponse.body.included.parentCards, 'id')).to.deep.equal(
        _.sortBy([summaryOf(cardB, dev), summaryOf(opsCard, ops)], 'id'),
      );
    });

    it('counts open blocking cards, including unreadable ones', async () => {
      await Card.updateOne({ id: cardC.id }).set({ isClosed: true });

      await relate(cardA, cardB, 'dependsOn');
      await relate(cardA, cardC, 'dependsOn');
      await relate(cardA, opsCard, 'dependsOn');
      // Neither counts: A blocks D, and related links do not block
      await relate(cardA, cardD, 'blocks');
      await relate(cardA, cardD, 'related');

      const response = await list(cardA, DEV_ONLY_API_KEY);

      expect(response.body.included.blockingOpenCount).to.equal(2);

      const fromD = await list(cardD, DEV_ONLY_API_KEY);

      expect(fromD.body.included.blockingOpenCount).to.equal(1);
    });

    it('returns empty results for a card without relationships', async () => {
      const response = await list(cardA);

      expect(response.status).to.equal(200);
      expect(response.body).to.deep.equal({
        items: [],
        included: {
          parentCards: [],
          blockingOpenCount: 0,
        },
      });
    });

    it('hides the card from users who cannot read it', async () => {
      const outsiderResponse = await list(cardA, OUTSIDER_API_KEY);
      const devOnlyResponse = await list(opsCard, DEV_ONLY_API_KEY);

      [outsiderResponse, devOnlyResponse].forEach((response) => {
        expect(response.status).to.equal(404);
        expect(response.body.message).to.equal('Card not found');
      });
    });
  });

  describe('delete', () => {
    it('lets an editor of either board remove the relationship', async () => {
      const created = await relate(cardA, opsCard, 'dependsOn');

      // devOnly is not a member of ops, but edits the board of card A
      const broadcasts = captureBroadcasts();

      let response;
      try {
        response = await api(
          'delete',
          `/api/card-relationships/${created.body.item.id}`,
          DEV_ONLY_API_KEY,
        );
      } finally {
        broadcasts.restore();
      }

      expect(response.status).to.equal(200);
      expect(response.body.item).to.deep.equal({
        id: created.body.item.id,
        cardId: cardA.id,
        relatedCardId: opsCard.id,
        type: 'depends_on',
      });

      expect(await CardRelationship.qm.getOneById(created.body.item.id)).to.equal(undefined);

      const deletes = broadcasts.filter(({ event }) => event === 'cardRelationshipDelete');

      expect(_.sortBy(deletes.map(({ room }) => room))).to.deep.equal(
        _.sortBy([`board:${dev.board.id}`, `board:${ops.board.id}`]),
      );
      deletes.forEach(({ data }) => {
        expect(data).to.deep.equal({ item: response.body.item });
      });
    });

    it('requires the editor role on one of the boards', async () => {
      const created = await relate(opsCard, cardA, 'related');

      // Make mixed a viewer of both boards
      await BoardMembership.updateOne({ boardId: dev.board.id, userId: mixed.id }).set({
        role: BoardMembership.Roles.VIEWER,
        canComment: false,
      });

      const response = await api(
        'delete',
        `/api/card-relationships/${created.body.item.id}`,
        MIXED_API_KEY,
      );

      expect(response.status).to.equal(403);
      expect(await CardRelationship.qm.getOneById(created.body.item.id)).to.not.equal(undefined);
    });

    it('hides the relationship from users who are not members of either board', async () => {
      const created = await relate(cardA, opsCard, 'dependsOn');

      const outsiderResponse = await api(
        'delete',
        `/api/card-relationships/${created.body.item.id}`,
        OUTSIDER_API_KEY,
      );
      const managerResponse = await api(
        'delete',
        `/api/card-relationships/${created.body.item.id}`,
        MANAGER_API_KEY,
      );

      [outsiderResponse, managerResponse].forEach((response) => {
        expect(response.status).to.equal(404);
        expect(response.body.message).to.equal('Card relationship not found');
      });
    });

    it('returns 404 for an unknown relationship', async () => {
      const response = await api('delete', '/api/card-relationships/1');

      expect(response.status).to.equal(404);
    });
  });

  describe('card deletion', () => {
    it('removes relationships when a card is deleted through the core helper', async () => {
      await relate(cardA, cardB, 'dependsOn');
      await relate(cardC, cardB, 'related');
      await relate(cardC, cardD, 'dependsOn');

      await sails.helpers.cards.deleteOne.with({
        record: cardB,
        project: erp,
        board: dev.board,
        list: dev.list,
        actorUser: editor,
      });

      const rows = await CardRelationship.find({});

      expect(rows).to.have.length(1);
      expect(rows[0]).to.include({ cardId: cardC.id, relatedCardId: cardD.id });
    });

    it('removes relationships when a list is cleared or a board deleted', async () => {
      await relate(cardA, opsCard, 'dependsOn');
      await relate(cardB, cardC, 'dependsOn');

      // Used when emptying the trash and when deleting boards and projects
      await sails.helpers.lists.deleteRelated(ops.list);

      const rows = await CardRelationship.find({});

      expect(rows).to.have.length(1);
      expect(rows[0]).to.include({ cardId: cardB.id, relatedCardId: cardC.id });

      await sails.helpers.boards.deleteRelated(dev.board);

      expect(await CardRelationship.find({})).to.have.length(0);
    });
  });
});
