const { expect } = require('chai');

const createProjectWithLists = async () => {
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

  const reviewList = await List.create({
    boardId: board.id,
    type: 'active',
    position: 65536,
    name: 'Code Review',
  }).fetch();

  const completedList = await List.create({
    boardId: board.id,
    type: 'closed',
    position: 131072,
    name: 'Done',
  }).fetch();

  return { project, board, reviewList, completedList };
};

const buildValues = (projectId, values = {}) => ({
  projectId,
  gitlabProjectId: 7,
  gitlabProjectPath: 'group/project',
  defaultBranch: 'main',
  webhookSecretHash: 'a'.repeat(64),
  ...values,
});

describe('GitlabIntegration', () => {
  afterEach(async () => {
    await sails.sendNativeQuery('DELETE FROM gitlab_integration');
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
  });

  it('creates an integration with safe defaults', async () => {
    const { project } = await createProjectWithLists();

    const integration = await GitlabIntegration.qm.createOne(buildValues(project.id));

    expect(integration.projectId).to.equal(project.id);
    expect(integration.gitlabProjectId).to.equal(7);
    expect(integration.autoMoveOnMrOpen).to.equal(false);
    expect(integration.autoMoveOnMrMerge).to.equal(false);
    expect(integration.reviewListId).to.equal(null);
    expect(integration.completedListId).to.equal(null);
  });

  it('allows only one integration per project', async () => {
    const { project } = await createProjectWithLists();

    await GitlabIntegration.qm.createOne(buildValues(project.id));

    let error;
    try {
      await GitlabIntegration.qm.createOne(buildValues(project.id, { gitlabProjectId: 8 }));
    } catch (e) {
      error = e;
    }

    expect(error).to.not.equal(undefined);
    expect(error.code).to.equal('E_UNIQUE');
  });

  it('finds the integration by project', async () => {
    const { project } = await createProjectWithLists();
    const created = await GitlabIntegration.qm.createOne(buildValues(project.id));

    const found = await GitlabIntegration.qm.getOneByProjectId(project.id);

    expect(found.id).to.equal(created.id);
  });

  it('is deleted when its project is deleted', async () => {
    const { project, board } = await createProjectWithLists();
    const created = await GitlabIntegration.qm.createOne(buildValues(project.id));

    await List.destroy({ boardId: board.id });
    await Board.destroy({ id: board.id });
    await Project.destroyOne(project.id);

    expect(await GitlabIntegration.qm.getOneById(created.id)).to.equal(undefined);
  });

  it('clears target lists when they are deleted', async () => {
    const { project, reviewList, completedList } = await createProjectWithLists();
    const created = await GitlabIntegration.qm.createOne(
      buildValues(project.id, {
        reviewListId: reviewList.id,
        completedListId: completedList.id,
      }),
    );

    await List.destroyOne(completedList.id);

    const integration = await GitlabIntegration.qm.getOneById(created.id);

    expect(integration.reviewListId).to.equal(reviewList.id);
    expect(integration.completedListId).to.equal(null);
  });

  it('never presents the webhook secret hash', async () => {
    const { project } = await createProjectWithLists();
    const integration = await GitlabIntegration.qm.createOne(buildValues(project.id));

    const presented = sails.helpers.gitlabIntegrations.presentOne(integration);

    expect(presented).to.not.have.property('webhookSecretHash');
    expect(presented.gitlabProjectPath).to.equal('group/project');
  });
});
