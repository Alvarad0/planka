const crypto = require('crypto');
const { expect } = require('chai');
const request = require('supertest');

const EDITOR_API_KEY = 'test-custom-fields-editor-api-key';
const MANAGER_API_KEY = 'test-custom-fields-manager-api-key';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const createUser = (name, values = {}) =>
  User.create({
    name,
    role: User.Roles.BOARD_USER,
    email: `${name}@planka.test`,
    username: name,
    ...values,
  }).fetch();

describe('Custom fields: suggestValues (controllers)', () => {
  let editor;
  let manager;

  let project;
  let board;
  let list;
  let card;
  let baseCustomFieldGroup;
  let customFieldGroup;

  const api = (method, url, apiKey) =>
    request(sails.hooks.http.app)[method](url).set('X-Api-Key', apiKey);

  const createInBaseGroup = (body) =>
    api(
      'post',
      `/api/base-custom-field-groups/${baseCustomFieldGroup.id}/custom-fields`,
      MANAGER_API_KEY,
    ).send({ position: 65536, name: 'Area', ...body });

  const createInGroup = (body) =>
    api(
      'post',
      `/api/custom-field-groups/${customFieldGroup.id}/custom-fields`,
      EDITOR_API_KEY,
    ).send({ position: 65536, name: 'Area', ...body });

  const update = (id, body, apiKey = EDITOR_API_KEY) =>
    api('patch', `/api/custom-fields/${id}`, apiKey).send(body);

  before(async () => {
    editor = await createUser('customfieldseditor', { apiKeyHash: sha256(EDITOR_API_KEY) });
    manager = await createUser('customfieldsmanager', { apiKeyHash: sha256(MANAGER_API_KEY) });
  });

  after(async () => {
    await User.destroy({ id: [editor.id, manager.id] });
  });

  beforeEach(async () => {
    project = await Project.create({ name: 'Custom fields', isHidden: false }).fetch();

    board = await Board.create({
      projectId: project.id,
      position: 65536,
      name: 'Custom fields board',
      defaultView: 'kanban',
      defaultCardType: 'project',
      limitCardTypesToDefaultOne: false,
      alwaysDisplayCardCreator: false,
    }).fetch();

    list = await List.create({
      boardId: board.id,
      type: List.Types.ACTIVE,
      position: 65536,
      name: 'To Do',
    }).fetch();

    card = await Card.create({
      boardId: board.id,
      listId: list.id,
      type: 'project',
      position: 65536,
      name: 'Card',
    }).fetch();

    await BoardMembership.create({
      role: BoardMembership.Roles.EDITOR,
      projectId: project.id,
      boardId: board.id,
      userId: editor.id,
    }).fetch();

    await ProjectManager.create({ projectId: project.id, userId: manager.id }).fetch();

    baseCustomFieldGroup = await BaseCustomFieldGroup.create({
      projectId: project.id,
      name: 'Base',
    }).fetch();

    customFieldGroup = await CustomFieldGroup.create({
      boardId: board.id,
      position: 65536,
      name: 'Properties',
    }).fetch();
  });

  afterEach(async () => {
    const boardIds = [board.id];
    const cards = await Card.find({ boardId: boardIds });
    const cardIds = sails.helpers.utils.mapRecords(cards);
    const customFieldGroups = await CustomFieldGroup.find({
      or: [{ boardId: boardIds }, { cardId: cardIds }],
    });
    const customFieldGroupIds = sails.helpers.utils.mapRecords(customFieldGroups);

    await CustomFieldValue.destroy({ cardId: cardIds });
    await CustomField.destroy({
      or: [
        { customFieldGroupId: customFieldGroupIds },
        { baseCustomFieldGroupId: baseCustomFieldGroup.id },
      ],
    });
    await CustomFieldGroup.destroy({ id: customFieldGroupIds });
    await BaseCustomFieldGroup.destroy({ id: baseCustomFieldGroup.id });
    await ProjectManager.destroy({ projectId: project.id });
    await BoardMembership.destroy({ boardId: board.id });
    await Card.destroy({ id: cardIds });
    await List.destroy({ boardId: board.id });
    await Board.destroy({ id: board.id });
    await Project.destroy({ id: project.id });
  });

  it('defaults to false at the database level', async () => {
    const customField = await CustomField.create({
      customFieldGroupId: customFieldGroup.id,
      position: 65536,
      name: 'ID',
    }).fetch();

    expect(customField.suggestValues).to.equal(false);

    const {
      rows: [row],
    } = await sails.sendNativeQuery('SELECT suggest_values FROM custom_field WHERE id = $1', [
      customField.id,
    ]);

    expect(row.suggest_values).to.equal(false);
  });

  describe('create in base custom field group', () => {
    it('defaults suggestValues to false', async () => {
      const response = await createInBaseGroup({}).expect(200);

      expect(response.body.item.suggestValues).to.equal(false);
    });

    it('accepts suggestValues', async () => {
      const response = await createInBaseGroup({ suggestValues: true }).expect(200);

      expect(response.body.item.suggestValues).to.equal(true);

      const customField = await CustomField.findOne(response.body.item.id);
      expect(customField.suggestValues).to.equal(true);
    });

    it('rejects a non-boolean suggestValues', async () => {
      await createInBaseGroup({ suggestValues: 'sometimes' }).expect(400);
    });
  });

  describe('create in custom field group', () => {
    it('defaults suggestValues to false', async () => {
      const response = await createInGroup({}).expect(200);

      expect(response.body.item.suggestValues).to.equal(false);
    });

    it('accepts suggestValues', async () => {
      const response = await createInGroup({ suggestValues: true }).expect(200);

      expect(response.body.item.suggestValues).to.equal(true);
    });
  });

  describe('update', () => {
    it('toggles suggestValues in a custom field group without touching other fields', async () => {
      const { body } = await createInGroup({ showOnFrontOfCard: true }).expect(200);

      const enabled = await update(body.item.id, { suggestValues: true }).expect(200);

      expect(enabled.body.item.suggestValues).to.equal(true);
      expect(enabled.body.item.showOnFrontOfCard).to.equal(true);
      expect(enabled.body.item.name).to.equal('Area');

      const disabled = await update(body.item.id, { suggestValues: false }).expect(200);

      expect(disabled.body.item.suggestValues).to.equal(false);
    });

    it('toggles suggestValues in a base custom field group', async () => {
      const { body } = await createInBaseGroup({}).expect(200);

      const response = await update(body.item.id, { suggestValues: true }, MANAGER_API_KEY).expect(
        200,
      );

      expect(response.body.item.suggestValues).to.equal(true);
    });

    it('rejects a non-boolean suggestValues', async () => {
      const { body } = await createInGroup({}).expect(200);

      await update(body.item.id, { suggestValues: 'yes' }).expect(400);
    });
  });

  it('keeps suggestValues when a card with its own fields is duplicated', async () => {
    // Within the same board only card-level groups are copied
    const cardCustomFieldGroup = await CustomFieldGroup.create({
      cardId: card.id,
      position: 65536,
      name: 'Card properties',
    }).fetch();

    const addField = (body) =>
      api(
        'post',
        `/api/custom-field-groups/${cardCustomFieldGroup.id}/custom-fields`,
        EDITOR_API_KEY,
      ).send({ position: 65536, ...body });

    await addField({ name: 'Area', suggestValues: true }).expect(200);
    await addField({ name: 'ID', position: 131072 }).expect(200);

    await api('post', `/api/cards/${card.id}/duplicate`, EDITOR_API_KEY)
      .send({ position: 131072, name: 'Copy' })
      .expect(200);

    const copiedCard = await Card.findOne({ boardId: board.id, name: 'Copy' });
    const copiedGroups = await CustomFieldGroup.find({ cardId: copiedCard.id });
    const copiedFields = await CustomField.find({
      customFieldGroupId: sails.helpers.utils.mapRecords(copiedGroups),
    });

    const suggestValuesByName = _.mapValues(_.keyBy(copiedFields, 'name'), 'suggestValues');

    expect(suggestValuesByName).to.deep.equal({ Area: true, ID: false });
  });
});
