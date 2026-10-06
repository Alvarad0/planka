import reducer from './card-relationship-state';
import ActionTypes from '../../constants/ActionTypes';
import ErrorCodes from '../../constants/ErrorCodes';
import isCardRelationshipOfCard from '../../utils/is-card-relationship-of-card';

// The router module pulls in JSX, which this Jest setup does not transform
jest.mock('../../lib/redux-router', () => ({
  LOCATION_CHANGE_HANDLE: 'LOCATION_CHANGE_HANDLE',
}));

const buildItem = (overrides) => ({
  id: '1',
  type: 'dependsOn',
  relatedCardId: '20',
  relatedCard: {
    id: '20',
    name: 'Other card',
    isClosed: false,
    boardId: '2',
    boardName: 'Board',
    listName: 'To Do',
  },
  ...overrides,
});

const startFetch = (state, cardId = '10') =>
  reducer(state, {
    type: ActionTypes.CARD_RELATIONSHIPS_FETCH,
    payload: {
      cardId,
    },
  });

const fetchSuccess = (state, included = {}, cardId = '10') =>
  reducer(state, {
    type: ActionTypes.CARD_RELATIONSHIPS_FETCH__SUCCESS,
    payload: {
      cardId,
      cardRelationships: [buildItem()],
      parentCards: [{ id: '30' }],
      blockingOpenCount: 1,
      ...included,
    },
  });

const fetchState = (included) => fetchSuccess(startFetch(undefined), included);

describe('card relationship state', () => {
  test('stores fetched relationships of the open card', () => {
    const state = fetchState();

    expect(state.cardId).toBe('10');
    expect(state.isFetched).toBe(true);
    expect(state.isFetching).toBe(false);
    expect(state.items).toEqual([buildItem()]);
    expect(state.parentCards).toEqual([{ id: '30' }]);
    expect(state.blockingOpenCount).toBe(1);
  });

  test('keeps shown data while refetching the same card', () => {
    const state = startFetch(fetchState());

    expect(state.isFetching).toBe(true);
    expect(state.isFetched).toBe(true);
    expect(state.items).toEqual([buildItem()]);

    const nextState = fetchSuccess(state, {
      cardRelationships: [],
      parentCards: [],
      blockingOpenCount: 0,
    });

    expect(nextState.items).toEqual([]);
    expect(nextState.blockingOpenCount).toBe(0);
  });

  test('starts over when another card is fetched', () => {
    const state = startFetch(fetchState(), '11');

    expect(state.cardId).toBe('11');
    expect(state.isFetched).toBe(false);
    expect(state.items).toEqual([]);
    expect(state.parentCards).toEqual([]);
    expect(state.blockingOpenCount).toBe(0);
  });

  test('ignores responses for a card that is no longer open', () => {
    const state = startFetch(fetchState(), '11');

    expect(fetchSuccess(state)).toBe(state);
  });

  test('resets on location change', () => {
    const state = reducer(fetchState(), {
      type: 'LOCATION_CHANGE_HANDLE',
    });

    expect(state).toEqual(reducer(undefined, { type: 'INIT' }));
  });

  test('shows nothing when the card is not found', () => {
    const state = reducer(startFetch(fetchState()), {
      type: ActionTypes.CARD_RELATIONSHIPS_FETCH__FAILURE,
      payload: {
        cardId: '10',
        error: { code: ErrorCodes.NOT_FOUND },
      },
    });

    expect(state.isFetched).toBe(true);
    expect(state.items).toEqual([]);
    expect(state.fetchError).toBeNull();
  });

  test('adds a created relationship once and keeps create errors', () => {
    let state = reducer(fetchState(), {
      type: ActionTypes.CARD_RELATIONSHIP_CREATE,
      payload: { cardId: '10', data: {} },
    });

    expect(state.isCreating).toBe(true);

    const item = buildItem({ id: '2', type: 'related' });

    state = reducer(state, {
      type: ActionTypes.CARD_RELATIONSHIP_CREATE__SUCCESS,
      payload: { cardId: '10', cardRelationship: item },
    });
    state = reducer(state, {
      type: ActionTypes.CARD_RELATIONSHIP_CREATE__SUCCESS,
      payload: { cardId: '10', cardRelationship: item },
    });

    expect(state.isCreating).toBe(false);
    expect(state.items.map(({ id }) => id)).toEqual(['1', '2']);

    const error = { code: 'E_UNPROCESSABLE_ENTITY', message: 'Would create dependency cycle' };

    state = reducer(state, {
      type: ActionTypes.CARD_RELATIONSHIP_CREATE__FAILURE,
      payload: { cardId: '10', error },
    });

    expect(state.createError).toBe(error);
  });

  test('removes a deleted relationship, also when it was already gone', () => {
    const state = reducer(fetchState(), {
      type: ActionTypes.CARD_RELATIONSHIP_DELETE,
      payload: { cardId: '10', id: '1' },
    });

    expect(state.deletingIds).toEqual(['1']);

    const deletedState = reducer(state, {
      type: ActionTypes.CARD_RELATIONSHIP_DELETE__SUCCESS,
      payload: { cardId: '10', id: '1' },
    });

    expect(deletedState.items).toEqual([]);
    expect(deletedState.deletingIds).toEqual([]);

    const goneState = reducer(state, {
      type: ActionTypes.CARD_RELATIONSHIP_DELETE__FAILURE,
      payload: { cardId: '10', id: '1', error: { code: ErrorCodes.NOT_FOUND } },
    });

    expect(goneState.items).toEqual([]);
    expect(goneState.deleteError).toBeNull();
  });
});

describe('isCardRelationshipOfCard', () => {
  const cardRelationship = { id: '1', cardId: '10', relatedCardId: '20', type: 'depends_on' };

  test('matches either card of the relationship', () => {
    expect(isCardRelationshipOfCard(cardRelationship, '10')).toBe(true);
    expect(isCardRelationshipOfCard(cardRelationship, '20')).toBe(true);
  });

  test('does not match other or no cards', () => {
    expect(isCardRelationshipOfCard(cardRelationship, '30')).toBe(false);
    expect(isCardRelationshipOfCard(cardRelationship, null)).toBe(false);
  });
});
