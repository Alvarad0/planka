const { expect } = require('chai');

describe('CardRelationship (model)', () => {
  let project;
  let board;
  let list;
  let user;
  let cardA;
  let cardB;
  let cardC;

  const createCard = (name) =>
    Card.create({
      name,
      boardId: board.id,
      listId: list.id,
      type: 'project',
      position: 65536,
    }).fetch();

  const insert = (cardId, relatedCardId, type) =>
    sails.sendNativeQuery(
      'INSERT INTO card_relationship (card_id, related_card_id, type) VALUES ($1, $2, $3)',
      [cardId, relatedCardId, type],
    );

  const expectQueryError = async (promise) => {
    let error;
    try {
      await promise;
    } catch (e) {
      error = e;
    }

    expect(error, 'expected the query to fail').to.not.equal(undefined);
  };

  // Ids ordered so that "low" < "high" numerically
  const ordered = (first, second) =>
    BigInt(first.id) < BigInt(second.id) ? [first, second] : [second, first];

  beforeEach(async () => {
    project = await Project.create({ name: 'ERP', isHidden: false }).fetch();

    board = await Board.create({
      projectId: project.id,
      position: 65536,
      name: 'Development',
      defaultView: 'kanban',
      defaultCardType: 'project',
      limitCardTypesToDefaultOne: false,
      alwaysDisplayCardCreator: false,
    }).fetch();

    list = await List.create({
      boardId: board.id,
      type: 'active',
      position: 65536,
      name: 'To Do',
    }).fetch();

    user = await User.create({
      name: 'relationshipsmodeluser',
      role: User.Roles.BOARD_USER,
      email: 'relationshipsmodeluser@planka.test',
    }).fetch();

    cardA = await createCard('A');
    cardB = await createCard('B');
    cardC = await createCard('C');
  });

  afterEach(async () => {
    await sails.sendNativeQuery('DELETE FROM card_relationship');
    await Card.destroy({});
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
    await User.destroy({ id: user.id });
  });

  describe('constraints', () => {
    it('rejects unknown types', async () => {
      await expectQueryError(insert(cardA.id, cardB.id, 'blocks'));
    });

    it('rejects relating a card to itself', async () => {
      await expectQueryError(insert(cardA.id, cardA.id, 'depends_on'));
    });

    it('stores related pairs only with the lower id first', async () => {
      const [low, high] = ordered(cardA, cardB);

      await expectQueryError(insert(high.id, low.id, 'related'));
      await insert(low.id, high.id, 'related');
    });

    it('allows depends_on in both id orders', async () => {
      const [low, high] = ordered(cardA, cardB);

      await insert(high.id, low.id, 'depends_on');
      await insert(cardC.id, cardA.id, 'depends_on');
    });

    it('rejects duplicates', async () => {
      await insert(cardA.id, cardB.id, 'depends_on');

      await expectQueryError(insert(cardA.id, cardB.id, 'depends_on'));
    });

    it('rejects cards that do not exist', async () => {
      await expectQueryError(insert(cardA.id, '1', 'depends_on'));
    });
  });

  describe('foreign keys', () => {
    it('is deleted with either card', async () => {
      await insert(cardA.id, cardB.id, 'depends_on');
      await insert(cardC.id, cardB.id, 'depends_on');
      await insert(cardA.id, cardC.id, 'depends_on');

      await Card.destroyOne(cardB.id);

      const rows = await CardRelationship.find({});

      expect(rows).to.have.length(1);
      expect(rows[0]).to.include({ cardId: cardA.id, relatedCardId: cardC.id });
    });

    it('keeps the relationship and clears the creator when the user is deleted', async () => {
      const { cardRelationship } = await CardRelationship.qm.createOne({
        cardId: cardA.id,
        relatedCardId: cardB.id,
        type: CardRelationship.Types.DEPENDS_ON,
        creatorUserId: user.id,
      });

      expect(cardRelationship.creatorUserId).to.equal(user.id);

      await User.qm.deleteOne(user.id);

      const reloaded = await CardRelationship.qm.getOneById(cardRelationship.id);

      expect(reloaded.creatorUserId).to.equal(null);
    });
  });

  describe('qm.createOne', () => {
    it('reports duplicates, cycles and missing cards instead of throwing', async () => {
      const created = await CardRelationship.qm.createOne({
        cardId: cardA.id,
        relatedCardId: cardB.id,
        type: CardRelationship.Types.DEPENDS_ON,
      });

      expect(created.cardRelationship).to.include({
        cardId: cardA.id,
        relatedCardId: cardB.id,
        type: 'depends_on',
      });
      expect(created.cardRelationship.createdAt).to.not.equal(null);

      expect(
        await CardRelationship.qm.createOne({
          cardId: cardA.id,
          relatedCardId: cardB.id,
          type: CardRelationship.Types.DEPENDS_ON,
        }),
      ).to.deep.equal({ isDuplicate: true });

      expect(
        await CardRelationship.qm.createOne({
          cardId: cardB.id,
          relatedCardId: cardA.id,
          type: CardRelationship.Types.DEPENDS_ON,
        }),
      ).to.deep.equal({ wouldCreateCycle: true });

      expect(
        await CardRelationship.qm.createOne({
          cardId: cardA.id,
          relatedCardId: '1',
          type: CardRelationship.Types.DEPENDS_ON,
        }),
      ).to.deep.equal({ isCardMissing: true });
    });

    it('waits for a concurrent dependency insert before looking for cycles', async () => {
      // Simulates another request in the middle of inserting "A depends on B": it holds the lock
      // and its row is not committed yet
      let release;
      const released = new Promise((resolve) => {
        release = resolve;
      });

      let isLocked;
      const locked = new Promise((resolve) => {
        isLocked = resolve;
      });

      // Datastore deferreds are lazy: toPromise() starts the transaction right away
      const concurrentInsert = sails
        .getDatastore()
        .transaction(async (db) => {
          await sails
            .sendNativeQuery('SELECT pg_advisory_xact_lock($1)', [
              CardRelationship.DEPENDENCY_LOCK_KEY,
            ])
            .usingConnection(db);

          await sails
            .sendNativeQuery(
              "INSERT INTO card_relationship (card_id, related_card_id, type) VALUES ($1, $2, 'depends_on')",
              [cardA.id, cardB.id],
            )
            .usingConnection(db);

          isLocked();
          await released;
        })
        .toPromise();

      await locked;

      // "B depends on A" must wait for the lock, then see "A depends on B"
      const pendingResult = CardRelationship.qm.createOne({
        cardId: cardB.id,
        relatedCardId: cardA.id,
        type: CardRelationship.Types.DEPENDS_ON,
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });

      release();
      await concurrentInsert;

      expect(await pendingResult).to.deep.equal({ wouldCreateCycle: true });
      expect(await CardRelationship.find({})).to.have.length(1);
    });
  });
});
