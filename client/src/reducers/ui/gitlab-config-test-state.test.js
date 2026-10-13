import reducer from './gitlab-config-test-state';
import ActionTypes from '../../constants/ActionTypes';

describe('gitlab-config-test-state reducer', () => {
  const testState = () =>
    reducer(undefined, {
      type: ActionTypes.GITLAB_CONFIG_TEST,
      payload: {
        data: {},
      },
    });

  test('is loading while testing', () => {
    expect(testState()).toEqual({
      isLoading: true,
      gitlabUser: null,
      error: null,
    });
  });

  test('stores the GitLab user on success', () => {
    const state = reducer(testState(), {
      type: ActionTypes.GITLAB_CONFIG_TEST__SUCCESS,
      payload: {
        gitlabUser: {
          username: 'planka_bot',
          name: 'Planka Bot',
        },
      },
    });

    expect(state).toEqual({
      isLoading: false,
      gitlabUser: {
        username: 'planka_bot',
        name: 'Planka Bot',
      },
      error: null,
    });
  });

  test('stores the error on failure', () => {
    const error = new Error('GitLab token is invalid or expired');

    const state = reducer(testState(), {
      type: ActionTypes.GITLAB_CONFIG_TEST__FAILURE,
      payload: {
        error,
      },
    });

    expect(state).toEqual({
      isLoading: false,
      gitlabUser: null,
      error,
    });
  });

  test('clears the result when the settings are saved', () => {
    const state = reducer(
      reducer(testState(), {
        type: ActionTypes.GITLAB_CONFIG_TEST__SUCCESS,
        payload: {
          gitlabUser: {
            username: 'planka_bot',
            name: null,
          },
        },
      }),
      {
        type: ActionTypes.CONFIG_UPDATE,
        payload: {
          data: {
            gitlabUrl: 'https://gitlab.example.com',
          },
        },
      },
    );

    expect(state.gitlabUser).toBeNull();
  });
});
