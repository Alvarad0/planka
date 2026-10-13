import ActionTypes from '../../constants/ActionTypes';

const initialState = {
  isLoading: false,
  gitlabUser: null,
  error: null,
};

// eslint-disable-next-line default-param-last
export default (state = initialState, { type, payload }) => {
  switch (type) {
    case ActionTypes.GITLAB_CONFIG_TEST:
      return {
        ...initialState,
        isLoading: true,
      };
    case ActionTypes.GITLAB_CONFIG_TEST__SUCCESS:
      return {
        ...initialState,
        gitlabUser: payload.gitlabUser,
      };
    case ActionTypes.GITLAB_CONFIG_TEST__FAILURE:
      return {
        ...initialState,
        error: payload.error,
      };
    // A result is only meaningful for the settings it was obtained with
    case ActionTypes.CONFIG_UPDATE:
      return initialState;
    default:
      return state;
  }
};
