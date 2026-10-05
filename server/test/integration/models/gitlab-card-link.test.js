const { expect } = require('chai');

const createCardWithIntegration = async () => {
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

  const createCard = (name) =>
    Card.create({
      name,
      boardId: board.id,
      listId: list.id,
      type: 'project',
      position: 65536,
    }).fetch();

  const card = await createCard('Implement login');

  const integration = await GitlabIntegration.qm.createOne({
    projectId: project.id,
    gitlabProjectId: 7,
    gitlabProjectPath: 'group/project',
    defaultBranch: 'main',
    webhookSecretHash: 'a'.repeat(64),
  });

  return { project, board, list, card, integration, createCard };
};

const buildValues = (cardId, gitlabIntegrationId, values = {}) => ({
  cardId,
  gitlabIntegrationId,
  issueId: 9001,
  issueIid: 12,
  issueUrl: 'https://gitlab.test/group/project/-/issues/12',
  ...values,
});

const expectUniqueError = async (promise) => {
  let error;
  try {
    await promise;
  } catch (e) {
    error = e;
  }

  expect(error).to.not.equal(undefined);
  expect(error.code).to.equal('E_UNIQUE');
};

describe('GitlabCardLink', () => {
  afterEach(async () => {
    await sails.sendNativeQuery('DELETE FROM gitlab_card_link');
    await sails.sendNativeQuery('DELETE FROM gitlab_integration');
    await Card.destroy({});
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
  });

  it('creates a link with empty optional fields', async () => {
    const { card, integration } = await createCardWithIntegration();

    const link = await GitlabCardLink.qm.createOne(buildValues(card.id, integration.id));

    expect(link.cardId).to.equal(card.id);
    expect(link.gitlabIntegrationId).to.equal(integration.id);
    expect(link.issueId).to.equal(9001);
    expect(link.issueIid).to.equal(12);
    expect(link.branchName).to.equal(null);
    expect(link.branchUrl).to.equal(null);
    expect(link.snapshot).to.equal(null);
    expect(link.lastSyncedAt).to.equal(null);
    expect(link.createdAt).to.not.equal(null);
  });

  it('stores the snapshot as JSON', async () => {
    const { card, integration } = await createCardWithIntegration();
    const snapshot = {
      title: 'Implement login',
      state: 'opened',
      updatedAt: '2026-10-05T12:00:00Z',
    };

    const created = await GitlabCardLink.qm.createOne(
      buildValues(card.id, integration.id, { snapshot }),
    );

    const found = await GitlabCardLink.qm.getOneById(created.id);

    expect(found.snapshot).to.deep.equal(snapshot);
  });

  it('stores the branch name and URL', async () => {
    const { card, integration } = await createCardWithIntegration();
    const created = await GitlabCardLink.qm.createOne(buildValues(card.id, integration.id));

    await GitlabCardLink.qm.updateOne(created.id, {
      branchName: '12-implement-login',
      branchUrl: 'https://gitlab.test/group/project/-/tree/12-implement-login',
    });

    const found = await GitlabCardLink.qm.getOneById(created.id);

    expect(found.branchName).to.equal('12-implement-login');
    expect(found.branchUrl).to.equal('https://gitlab.test/group/project/-/tree/12-implement-login');
  });

  it('finds links by card and by integration and issue IID', async () => {
    const { card, integration } = await createCardWithIntegration();
    const created = await GitlabCardLink.qm.createOne(buildValues(card.id, integration.id));

    expect((await GitlabCardLink.qm.getOneByCardId(card.id)).id).to.equal(created.id);
    expect(
      (await GitlabCardLink.qm.getOneByIntegrationIdAndIssueIid(integration.id, 12)).id,
    ).to.equal(created.id);
    expect(await GitlabCardLink.qm.getOneByIntegrationIdAndIssueIid(integration.id, 13)).to.equal(
      undefined,
    );
  });

  it('allows only one link per card', async () => {
    const { card, integration } = await createCardWithIntegration();

    await GitlabCardLink.qm.createOne(buildValues(card.id, integration.id));

    await expectUniqueError(
      GitlabCardLink.qm.createOne(
        buildValues(card.id, integration.id, { issueId: 9002, issueIid: 13 }),
      ),
    );
  });

  it('allows only one card per issue of an integration', async () => {
    const { card, integration, createCard } = await createCardWithIntegration();
    const otherCard = await createCard('Other');

    await GitlabCardLink.qm.createOne(buildValues(card.id, integration.id));

    await expectUniqueError(GitlabCardLink.qm.createOne(buildValues(otherCard.id, integration.id)));
  });

  it('is deleted when its card is deleted', async () => {
    const { card, integration } = await createCardWithIntegration();
    const created = await GitlabCardLink.qm.createOne(buildValues(card.id, integration.id));

    await Card.destroyOne(card.id);

    expect(await GitlabCardLink.qm.getOneById(created.id)).to.equal(undefined);
  });

  it('is deleted when its integration is deleted', async () => {
    const { card, integration } = await createCardWithIntegration();
    const created = await GitlabCardLink.qm.createOne(buildValues(card.id, integration.id));

    await GitlabIntegration.qm.deleteOne(integration.id);

    expect(await GitlabCardLink.qm.getOneById(created.id)).to.equal(undefined);
    expect(await Card.findOne(card.id)).to.not.equal(undefined);
  });
});
