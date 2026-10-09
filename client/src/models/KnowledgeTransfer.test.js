/* eslint-disable max-classes-per-file */
import { ORM, attr } from 'redux-orm';

import BaseModel from './BaseModel';
import KnowledgeTransfer from './KnowledgeTransfer';
import ActionTypes from '../constants/ActionTypes';
import ErrorCodes from '../constants/ErrorCodes';

// Minimal stand-ins for the core models the reducer relies on
class Card extends BaseModel {
  static modelName = 'Card';

  static fields = {
    id: attr(),
  };
}

class User extends BaseModel {
  static modelName = 'User';

  static fields = {
    id: attr(),
    name: attr(),
    email: attr(),
  };
}

const orm = new ORM();
orm.register(Card, User, KnowledgeTransfer);

const buildKnowledgeTransfer = (overrides) => ({
  id: '100',
  cardId: '10',
  userId: '1',
  isExplained: false,
  explainedByUserId: null,
  explainedAt: null,
  creatorUserId: '2',
  ...overrides,
});

const reduce = (state, action) => {
  const session = orm.session(state);
  KnowledgeTransfer.reducer(action, session.KnowledgeTransfer, session);

  return session.state;
};

const buildState = () => {
  const session = orm.session(orm.getEmptyState());
  session.Card.create({ id: '10' });
  session.Card.create({ id: '20' });
  session.User.create({ id: '2', name: 'Daniel', email: 'daniel@example.com' });

  return session.state;
};

const read = (state) => {
  const session = orm.session(state);

  return {
    knowledgeTransfers: session.KnowledgeTransfer.all().toRefArray(),
    users: session.User.all().toRefArray(),
    cardKnowledgeTransferIds: (cardId) =>
      session.Card.withId(cardId)
        .knowledgeTransfers.toRefArray()
        .map(({ id }) => id),
  };
};

describe('KnowledgeTransfer model', () => {
  it('replaces the items of the card on fetch and upserts the included users', () => {
    let state = buildState();

    state = reduce(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE_HANDLE,
      payload: {
        knowledgeTransfer: buildKnowledgeTransfer({ id: 'stale' }),
        users: [],
      },
    });

    state = reduce(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE_HANDLE,
      payload: {
        knowledgeTransfer: buildKnowledgeTransfer({ id: 'other', cardId: '20' }),
        users: [],
      },
    });

    state = reduce(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFERS_FETCH__SUCCESS,
      payload: {
        cardId: '10',
        knowledgeTransfers: [buildKnowledgeTransfer()],
        users: [
          { id: '1', name: 'Ana' },
          { id: '2', name: 'Daniel R.' },
        ],
      },
    });

    const result = read(state);

    expect(result.cardKnowledgeTransferIds('10')).toEqual(['100']);
    expect(result.cardKnowledgeTransferIds('20')).toEqual(['other']);
    // Partial users are merged, so fields known from elsewhere are kept
    expect(result.users).toEqual([
      { id: '2', name: 'Daniel R.', email: 'daniel@example.com' },
      { id: '1', name: 'Ana' },
    ]);
  });

  it('applies socket updates with the explainer', () => {
    let state = reduce(buildState(), {
      type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE__SUCCESS,
      payload: {
        cardId: '10',
        knowledgeTransfer: buildKnowledgeTransfer(),
        users: [{ id: '1', name: 'Ana' }],
      },
    });

    const explainedAt = new Date('2026-10-09T12:00:00Z');

    state = reduce(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_UPDATE_HANDLE,
      payload: {
        knowledgeTransfer: buildKnowledgeTransfer({
          isExplained: true,
          explainedByUserId: '3',
          explainedAt,
        }),
        users: [{ id: '3', name: 'Luis' }],
      },
    });

    const result = read(state);

    expect(result.knowledgeTransfers).toEqual([
      expect.objectContaining({
        id: '100',
        isExplained: true,
        explainedByUserId: '3',
        explainedAt,
      }),
    ]);
    expect(result.users.map(({ id }) => id).sort()).toEqual(['1', '2', '3']);
  });

  it('removes items deleted here, through sockets or missing on the server', () => {
    let state = buildState();

    ['100', '200', '300'].forEach((id) => {
      state = reduce(state, {
        type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE_HANDLE,
        payload: {
          knowledgeTransfer: buildKnowledgeTransfer({ id, userId: id }),
          users: [],
        },
      });
    });

    state = reduce(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_DELETE__SUCCESS,
      payload: {
        knowledgeTransfer: { id: '100' },
      },
    });

    state = reduce(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_DELETE_HANDLE,
      payload: {
        knowledgeTransfer: { id: '200' },
      },
    });

    // Other errors keep the item
    state = reduce(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_UPDATE__FAILURE,
      payload: {
        id: '300',
        error: { code: 'E_FORBIDDEN' },
      },
    });

    expect(read(state).cardKnowledgeTransferIds('10')).toEqual(['300']);

    state = reduce(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFER_UPDATE__FAILURE,
      payload: {
        id: '300',
        error: { code: ErrorCodes.NOT_FOUND },
      },
    });

    expect(read(state).knowledgeTransfers).toEqual([]);
  });

  it('drops the items of a card that is no longer accessible', () => {
    let state = reduce(buildState(), {
      type: ActionTypes.KNOWLEDGE_TRANSFER_CREATE_HANDLE,
      payload: {
        knowledgeTransfer: buildKnowledgeTransfer(),
        users: [],
      },
    });

    state = reduce(state, {
      type: ActionTypes.KNOWLEDGE_TRANSFERS_FETCH__FAILURE,
      payload: {
        cardId: '10',
        error: { code: ErrorCodes.NOT_FOUND },
      },
    });

    expect(read(state).knowledgeTransfers).toEqual([]);
  });
});
