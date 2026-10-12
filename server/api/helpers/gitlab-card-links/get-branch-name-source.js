// Returns the text slugified into a card's suggested/default branch name (`<issue IID>-<slug>`).
//
// The text is the trimmed value of the card's custom field named "ID" (name compared trimmed and
// case-insensitively), falling back to the card name when there is no such field or its value is
// empty. The card's fields are resolved like the client does: the custom field groups of the card's
// board and of the card itself, where a group created from a base custom field group takes the
// fields of that base group, and its own fields otherwise. Values are keyed by
// (card, group, field).
//
// When several "ID" fields exist, the first one with a non-empty value wins, in this order: board
// groups before card groups, each by group position, then field position.
//
// Queries: up to 4 (groups by board and by card in parallel, fields by group and by base group in
// parallel), plus 1 for the values only when an "ID" field exists.

const BRANCH_NAME_SOURCE_FIELD_NAME = 'id';

const isSourceField = (customField) =>
  typeof customField.name === 'string' &&
  customField.name.trim().toLowerCase() === BRANCH_NAME_SOURCE_FIELD_NAME;

module.exports = {
  inputs: {
    card: {
      type: 'ref',
      required: true,
    },
  },

  async fn(inputs) {
    const { card } = inputs;

    const [boardCustomFieldGroups, cardCustomFieldGroups] = await Promise.all([
      CustomFieldGroup.qm.getByBoardId(card.boardId),
      CustomFieldGroup.qm.getByCardId(card.id),
    ]);

    const customFieldGroups = [...boardCustomFieldGroups, ...cardCustomFieldGroups];

    if (customFieldGroups.length === 0) {
      return card.name;
    }

    const ownCustomFieldGroupIds = [];
    const baseCustomFieldGroupIds = [];

    customFieldGroups.forEach((customFieldGroup) => {
      if (customFieldGroup.baseCustomFieldGroupId) {
        baseCustomFieldGroupIds.push(customFieldGroup.baseCustomFieldGroupId);
      } else {
        ownCustomFieldGroupIds.push(customFieldGroup.id);
      }
    });

    const [ownCustomFields, baseCustomFields] = await Promise.all([
      ownCustomFieldGroupIds.length > 0
        ? CustomField.qm.getByCustomFieldGroupIds(ownCustomFieldGroupIds)
        : [],
      baseCustomFieldGroupIds.length > 0
        ? CustomField.qm.getByBaseCustomFieldGroupIds(_.uniq(baseCustomFieldGroupIds))
        : [],
    ]);

    // Fields come sorted by position, so grouping keeps that order within each group
    const ownSourceFieldsByGroupId = _.groupBy(
      ownCustomFields.filter(isSourceField),
      'customFieldGroupId',
    );

    const baseSourceFieldsByBaseGroupId = _.groupBy(
      baseCustomFields.filter(isSourceField),
      'baseCustomFieldGroupId',
    );

    // Ordered (group, field) candidates
    const candidates = customFieldGroups.flatMap((customFieldGroup) => {
      const customFields = customFieldGroup.baseCustomFieldGroupId
        ? baseSourceFieldsByBaseGroupId[customFieldGroup.baseCustomFieldGroupId]
        : ownSourceFieldsByGroupId[customFieldGroup.id];

      return (customFields || []).map((customField) => ({
        customFieldGroupId: customFieldGroup.id,
        customFieldId: customField.id,
      }));
    });

    if (candidates.length === 0) {
      return card.name;
    }

    const customFieldValues = await CustomFieldValue.qm.getByCardId(card.id, {
      customFieldGroupIdOrIds: _.uniq(_.map(candidates, 'customFieldGroupId')),
    });

    const contentByKey = customFieldValues.reduce(
      (result, customFieldValue) => ({
        ...result,
        [`${customFieldValue.customFieldGroupId}:${customFieldValue.customFieldId}`]:
          customFieldValue.content,
      }),
      {},
    );

    for (let i = 0; i < candidates.length; i += 1) {
      const { customFieldGroupId, customFieldId } = candidates[i];
      const content = contentByKey[`${customFieldGroupId}:${customFieldId}`];

      if (typeof content === 'string' && content.trim()) {
        return content.trim();
      }
    }

    return card.name;
  },
};
