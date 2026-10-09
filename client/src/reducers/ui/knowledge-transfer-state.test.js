import reducer from './knowledge-transfer-state';
import ActionTypes from '../../constants/ActionTypes';

// The router module pulls in JSX, which this Jest setup does not transform
jest.mock('../../lib/redux-router', () => ({
  LOCATION_CHANGE_HANDLE: 'LOCATION_CHANGE_HANDLE',
}));

const fetchState = (cardId = '10') => {
  const state = reducer(undefined, {
    type: ActionTypes.KNOWLEDGE_TRANSFERS_FETCH,
    payload: {
      cardId,
    },
  });

  return reducer(state, {
    type: ActionTypes.KNOWLEDGE_TRANSFERS_FETCH__SUCCESS,
    payload: {
      cardId,
      knowledgeTransfers: [],
      users: [],
    },
  });
};

describe('knowledge-transfer-state reducer', () => {
  it('marks the card as fetched', () => {
    const state = fetchState();

    expect(state).toMatchObject({
      cardId: '10',
      isFetching: false,
      isFetched: true,
      fetchError: null,
    });
  });

  it('resets when another card starts fetching', () => {
    let state = fetchState();

    state = reducer(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH__SUCCESS,
      payload: {
        cardId: '10',
        users: [{ id: '1' }],
      },
    });

    state = reducer(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFERS_FETCH,
      payload: {
        cardId: '20',
      },
    });

    expect(state).toMatchObject({
      cardId: '20',
      isFetching: true,
      isFetched: false,
      candidateUserIds: null,
    });
  });

  it('ignores responses for a card that is no longer open', () => {
    let state = fetchState('20');

    state = reducer(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFERS_FETCH__FAILURE,
      payload: {
        cardId: '10',
        error: new Error('Card not found'),
      },
    });

    state = reducer(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH__SUCCESS,
      payload: {
        cardId: '10',
        users: [{ id: '1' }],
      },
    });

    expect(state).toMatchObject({
      cardId: '20',
      fetchError: null,
      candidateUserIds: null,
    });
  });

  it('keeps the ids of the fetched candidates', () => {
    let state = reducer(fetchState(), {
      type: ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH,
      payload: {
        cardId: '10',
      },
    });

    expect(state.isFetchingCandidates).toBe(true);

    state = reducer(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_CANDIDATES_FETCH__SUCCESS,
      payload: {
        cardId: '10',
        users: [{ id: '1' }, { id: '2' }],
      },
    });

    expect(state).toMatchObject({
      isFetchingCandidates: false,
      candidateUserIds: ['1', '2'],
    });
  });

  it('tracks creation and its error, cleared by the next request', () => {
    const error = new Error('User already assigned');

    let state = reducer(fetchState(), {
      type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE,
      payload: {
        cardId: '10',
        data: { userId: '1' },
      },
    });

    expect(state.isCreating).toBe(true);

    state = reducer(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE__FAILURE,
      payload: {
        cardId: '10',
        error,
      },
    });

    expect(state).toMatchObject({
      isCreating: false,
      createError: error,
    });

    state = reducer(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_UPDATE,
      payload: {
        id: '100',
        data: { isExplained: true },
      },
    });

    expect(state).toMatchObject({
      createError: null,
      updatingIds: ['100'],
    });
  });

  it('tracks updates and deletions per item', () => {
    let state = reducer(fetchState(), {
      type: ActionTypes.KNOWLEDGE_TRANSFER_UPDATE,
      payload: {
        id: '100',
        data: { isExplained: true },
      },
    });

    state = reducer(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_DELETE,
      payload: {
        id: '200',
      },
    });

    expect(state).toMatchObject({
      updatingIds: ['100'],
      deletingIds: ['200'],
    });

    state = reducer(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_UPDATE__SUCCESS,
      payload: {
        knowledgeTransfer: { id: '100' },
        users: [],
      },
    });

    const error = new Error('Knowledge transfer not found');

    state = reducer(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_DELETE__FAILURE,
      payload: {
        id: '200',
        error,
      },
    });

    expect(state).toMatchObject({
      updatingIds: [],
      deletingIds: [],
      deleteError: error,
    });
  });

  it('resets on location change', () => {
    const state = reducer(fetchState(), {
      type: 'LOCATION_CHANGE_HANDLE',
      payload: {},
    });

    expect(state).toMatchObject({
      cardId: null,
      isFetched: false,
    });
  });
});
