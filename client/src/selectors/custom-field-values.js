/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import { createSelector } from 'redux-orm';

import orm from '../orm';

export const makeSelectCustomFieldValueById = () =>
  createSelector(
    orm,
    (_, id) => id,
    ({ CustomFieldValue }, id) => {
      const customFieldValueModel = CustomFieldValue.withId(id);

      if (!customFieldValueModel) {
        return customFieldValueModel;
      }

      return customFieldValueModel.ref;
    },
  );

export const selectCustomFieldValueById = makeSelectCustomFieldValueById();

// Distinct values already used in a custom field, for its "suggest used values" option. The value
// of the card being edited is skipped. Case-insensitive dedupe keeps the first spelling seen.
export const buildUsedValues = (customFieldValues, excludedCardId) => {
  const valueByKey = new Map();

  customFieldValues.forEach(({ cardId, content }) => {
    if (cardId === excludedCardId || typeof content !== 'string') {
      return;
    }

    const value = content.trim();

    if (!value) {
      return;
    }

    const key = value.toLocaleLowerCase();

    if (!valueByKey.has(key)) {
      valueByKey.set(key, value);
    }
  });

  return [...valueByKey.values()].sort((value1, value2) => value1.localeCompare(value2));
};

// The used value matching a typed one case-insensitively (its existing spelling), if any
export const findUsedValue = (usedValues, value) => {
  const key = value.trim().toLocaleLowerCase();

  if (!key) {
    return undefined;
  }

  return usedValues.find((usedValue) => usedValue.toLocaleLowerCase() === key);
};

export const makeSelectUsedValuesByCustomFieldId = () =>
  createSelector(
    orm,
    (_, customFieldId) => customFieldId,
    (_, __, excludedCardId) => excludedCardId,
    ({ CustomField }, customFieldId, excludedCardId) => {
      const customFieldModel = CustomField.withId(customFieldId);

      if (!customFieldModel) {
        return [];
      }

      return buildUsedValues(customFieldModel.customFieldValues.toRefArray(), excludedCardId);
    },
  );

export const selectUsedValuesByCustomFieldId = makeSelectUsedValuesByCustomFieldId();

export default {
  makeSelectCustomFieldValueById,
  selectCustomFieldValueById,
  makeSelectUsedValuesByCustomFieldId,
  selectUsedValuesByCustomFieldId,
};
