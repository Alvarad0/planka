const { expect } = require('chai');

describe('CardKnowledgeTransfer (model)', () => {
  let user;
  let card;

  beforeEach(async () => {
    user = await User.create({
      name: 'Knowledge Model',
      role: User.Roles.BOARD_USER,
      email: 'knowledgemodel@planka.test',
    }).fetch();

    const project = await Project.create({ name: 'ERP', isHidden: false }).fetch();

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
      type: 'active',
      position: 65536,
      name: 'To Do',
    }).fetch();

    card = await Card.create({
      name: 'Billing module',
      boardId: board.id,
      listId: list.id,
      type: 'project',
      position: 65536,
    }).fetch();
  });

  afterEach(async () => {
    await sails.sendNativeQuery('DELETE FROM card_knowledge_transfer');
    await Card.destroy({});
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
    await User.destroy({ id: user.id });
  });

  it('defaults to not explained', async () => {
    const knowledgeTransfer = await CardKnowledgeTransfer.qm.createOne({
      cardId: card.id,
      userId: user.id,
    });

    expect(knowledgeTransfer).to.include({
      isExplained: false,
      explainedByUserId: null,
      explainedAt: null,
      creatorUserId: null,
    });
  });

  it('allows a user at most once per card', async () => {
    await CardKnowledgeTransfer.qm.createOne({ cardId: card.id, userId: user.id });

    let error;
    try {
      await CardKnowledgeTransfer.qm.createOne({ cardId: card.id, userId: user.id });
    } catch (e) {
      error = e;
    }

    expect(error).to.not.equal(undefined);
    expect(error.code).to.equal('E_UNIQUE');
  });

  it('indexes user_id for queries by user', async () => {
    const { rows } = await sails.sendNativeQuery(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'card_knowledge_transfer'",
    );

    expect(rows.map(({ indexdef }) => indexdef)).to.satisfy((indexdefs) =>
      indexdefs.some((indexdef) => /\(user_id\)$/.test(indexdef)),
    );
  });
});
