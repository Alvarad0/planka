import orm from '../orm';
import { buildCustomFieldValueId } from '../models/CustomFieldValue';
import {
  buildUsedValues,
  findUsedValue,
  makeSelectUsedValuesByCustomFieldId,
} from './custom-field-values';

// The real ORM pulls in every model (and the router); the selector needs only these ones
jest.mock('../orm', () => {
  const { ORM, attr } = jest.requireActual('redux-orm');
  const BaseModel = jest.requireActual('../models/BaseModel').default;
  const CustomField = jest.requireActual('../models/CustomField').default;
  const CustomFieldValue = jest.requireActual('../models/CustomFieldValue').default;

  const buildStub = (modelName) =>
    class extends BaseModel {
      static modelName = modelName;

      static fields = {
        id: attr(),
      };
    };

  const mockOrm = new ORM({
    stateSelector: (state) => state.orm,
  });

  mockOrm.register(
    buildStub('Card'),
    buildStub('BaseCustomFieldGroup'),
    buildStub('CustomFieldGroup'),
    CustomField,
    CustomFieldValue,
  );

  return mockOrm;
});

const buildValue = (cardId, content, customFieldId = 'area') => ({
  cardId,
  content,
  customFieldId,
  customFieldGroupId: 'group',
});

describe('buildUsedValues', () => {
  it('returns distinct values sorted alphabetically', () => {
    expect(
      buildUsedValues(
        [
          buildValue('1', 'Ventas'),
          buildValue('2', 'Compras'),
          buildValue('3', 'Ventas'),
          buildValue('4', 'Almacén'),
        ],
        null,
      ),
    ).toEqual(['Almacén', 'Compras', 'Ventas']);
  });

  it('dedupes case-insensitively, keeping the first spelling seen', () => {
    expect(
      buildUsedValues(
        [buildValue('1', 'ventas'), buildValue('2', 'VENTAS'), buildValue('3', 'Ventas')],
        null,
      ),
    ).toEqual(['ventas']);
  });

  it('trims values and skips empty ones', () => {
    expect(
      buildUsedValues(
        [
          buildValue('1', '  Compras  '),
          buildValue('2', 'Compras'),
          buildValue('3', '   '),
          buildValue('4', ''),
          buildValue('5', null),
        ],
        null,
      ),
    ).toEqual(['Compras']);
  });

  it("excludes the current card's own value", () => {
    expect(buildUsedValues([buildValue('1', 'Ventas'), buildValue('2', 'Compras')], '1')).toEqual([
      'Compras',
    ]);
  });

  it('keeps a value used by the current card when another card also uses it', () => {
    expect(buildUsedValues([buildValue('1', 'Ventas'), buildValue('2', 'ventas')], '1')).toEqual([
      'ventas',
    ]);
  });
});

describe('findUsedValue', () => {
  const usedValues = ['Compras', 'Ventas'];

  it('returns the existing spelling of a value typed in another case', () => {
    expect(findUsedValue(usedValues, 'ventas')).toBe('Ventas');
    expect(findUsedValue(usedValues, 'COMPRAS')).toBe('Compras');
  });

  it('ignores surrounding whitespace', () => {
    expect(findUsedValue(usedValues, '  ventas ')).toBe('Ventas');
  });

  it('returns undefined for a new or partial value', () => {
    expect(findUsedValue(usedValues, 'Almacén')).toBeUndefined();
    expect(findUsedValue(usedValues, 'vent')).toBeUndefined();
  });

  it('returns undefined for an empty value', () => {
    expect(findUsedValue(usedValues, '   ')).toBeUndefined();
    expect(findUsedValue([], 'ventas')).toBeUndefined();
  });
});

describe('makeSelectUsedValuesByCustomFieldId', () => {
  const buildState = () => {
    const session = orm.session(orm.getEmptyState());

    session.CustomField.create({ id: 'area', name: 'Área' });
    session.CustomField.create({ id: 'code', name: 'ID' });

    [
      buildValue('1', 'Ventas'),
      buildValue('2', 'compras'),
      buildValue('3', 'Compras'),
      buildValue('4', ' '),
      buildValue('2', 'A-001', 'code'),
    ].forEach((customFieldValue) => {
      session.CustomFieldValue.create({
        ...customFieldValue,
        id: buildCustomFieldValueId(customFieldValue),
      });
    });

    return { orm: session.state };
  };

  it('selects the used values of the same custom field only', () => {
    const selectUsedValues = makeSelectUsedValuesByCustomFieldId();
    const state = buildState();

    expect(selectUsedValues(state, 'area', '1')).toEqual(['compras']);
    expect(selectUsedValues(state, 'area', '9')).toEqual(['compras', 'Ventas']);
    expect(selectUsedValues(state, 'code', '1')).toEqual(['A-001']);
  });

  it('returns an empty array for an unknown custom field', () => {
    const selectUsedValues = makeSelectUsedValuesByCustomFieldId();

    expect(selectUsedValues(buildState(), 'missing', '1')).toEqual([]);
  });

  it('memoizes the result while the state does not change', () => {
    const selectUsedValues = makeSelectUsedValuesByCustomFieldId();
    const state = buildState();

    expect(selectUsedValues(state, 'area', '1')).toBe(selectUsedValues(state, 'area', '1'));
  });
});
