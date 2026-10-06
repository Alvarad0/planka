import reducer from './gitlab-card-link-state';
import ActionTypes from '../../constants/ActionTypes';

// The router module pulls in JSX, which this Jest setup does not transform
jest.mock('../../lib/redux-router', () => ({
  LOCATION_CHANGE_HANDLE: 'LOCATION_CHANGE_HANDLE',
}));

const buildLink = (overrides) => ({
  id: '1',
  cardId: '10',
  issueId: 100,
  issueIid: 7,
  issueUrl: 'https://gitlab.example.com/group/project/-/issues/7',
  branchName: 'feature/7-x',
  lastSyncedAt: new Date('2026-10-06T10:00:00Z'),
  snapshot: {
    issue: {
      title: 'Old title',
      state: 'opened',
    },
    mergeRequest: null,
    pipeline: null,
    commitsCount: 1,
    hasMoreCommits: false,
  },
  ...overrides,
});

const fetchState = (gitlabCardLink, included = {}) => {
  let state = reducer(undefined, {
    type: ActionTypes.GITLAB_CARD_LINK_FETCH,
    payload: {
      cardId: '10',
    },
  });

  state = reducer(state, {
    type: ActionTypes.GITLAB_CARD_LINK_FETCH__SUCCESS,
    payload: {
      cardId: '10',
      gitlabCardLink,
      gitlabIntegration: null,
      gitlabIssue: {
        iid: 7,
        title: 'Old title',
        state: 'opened',
      },
      gitlabMergeRequest: null,
      gitlabPipeline: null,
      commitsCount: 1,
      hasMoreCommits: false,
      isStale: true,
      isProjectMismatch: false,
      suggestedBranchName: null,
      defaultBranch: 'main',
      ...included,
    },
  });

  return {
    ...state,
    gitlabCommits: [{ id: 'a' }],
  };
};

const handleUpdate = (state, gitlabCardLink) =>
  reducer(state, {
    type: ActionTypes.GITLAB_CARD_LINK_UPDATE_HANDLE,
    payload: {
      gitlabCardLink,
    },
  });

describe('gitlab card link state', () => {
  test('applies a link update with a newer sync time', () => {
    const state = fetchState(buildLink());

    const nextState = handleUpdate(
      state,
      buildLink({
        lastSyncedAt: new Date('2026-10-06T10:05:00Z'),
        snapshot: {
          issue: {
            title: 'New title',
            state: 'closed',
          },
          mergeRequest: {
            iid: 3,
            state: 'merged',
          },
          pipeline: {
            status: 'success',
          },
          commitsCount: 4,
          hasMoreCommits: true,
        },
      }),
    );

    expect(nextState.gitlabIssue).toMatchObject({
      id: 100,
      iid: 7,
      title: 'New title',
      state: 'closed',
      webUrl: 'https://gitlab.example.com/group/project/-/issues/7',
    });
    expect(nextState.gitlabMergeRequest).toEqual({ iid: 3, state: 'merged' });
    expect(nextState.gitlabPipeline).toEqual({ status: 'success' });
    expect(nextState.commitsCount).toBe(4);
    expect(nextState.hasMoreCommits).toBe(true);
    expect(nextState.isStale).toBe(false);
    expect(nextState.gitlabCommits).toBeNull();
    expect(nextState.lastSyncedAt).toEqual(new Date('2026-10-06T10:05:00Z'));
  });

  test('ignores a link update with an older or equal sync time', () => {
    const state = fetchState(buildLink());

    expect(handleUpdate(state, buildLink())).toBe(state);
    expect(handleUpdate(state, buildLink({ lastSyncedAt: new Date('2026-10-06T09:00:00Z') }))).toBe(
      state,
    );
  });

  test('ignores a link update of another card', () => {
    const state = fetchState(buildLink());

    expect(
      handleUpdate(
        state,
        buildLink({ cardId: '11', lastSyncedAt: new Date('2026-10-06T11:00:00Z') }),
      ),
    ).toBe(state);
  });

  test('resets branch data when the branch changed without a newer sync', () => {
    const state = fetchState(buildLink({ branchName: null }), {
      commitsCount: null,
    });

    const nextState = handleUpdate(state, buildLink());

    expect(nextState.branchName).toBe('feature/7-x');
    expect(nextState.gitlabCommits).toBeNull();
    expect(nextState.gitlabIssue).toBe(state.gitlabIssue);
    expect(nextState.isStale).toBe(true);
  });

  test('handles a sync success like a fetch success', () => {
    const state = fetchState(buildLink());

    const nextState = reducer(
      reducer(state, {
        type: ActionTypes.GITLAB_CARD_LINK_SYNC,
        payload: {
          cardId: '10',
        },
      }),
      {
        type: ActionTypes.GITLAB_CARD_LINK_SYNC__SUCCESS,
        payload: {
          cardId: '10',
          gitlabCardLink: buildLink({ lastSyncedAt: new Date('2026-10-06T10:05:00Z') }),
          gitlabIntegration: null,
          gitlabIssue: {
            iid: 7,
            title: 'Synced',
          },
          gitlabMergeRequest: null,
          gitlabPipeline: null,
          commitsCount: 2,
          hasMoreCommits: false,
          isStale: false,
          isProjectMismatch: false,
          suggestedBranchName: null,
          defaultBranch: 'main',
        },
      },
    );

    expect(nextState.isSyncing).toBe(false);
    expect(nextState.isStale).toBe(false);
    expect(nextState.gitlabIssue.title).toBe('Synced');
    expect(nextState.commitsCount).toBe(2);
    expect(nextState.gitlabCommits).toBeNull();
    expect(nextState.lastSyncedAt).toEqual(new Date('2026-10-06T10:05:00Z'));
  });
});
