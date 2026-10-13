/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import EntryActionTypes from '../constants/EntryActionTypes';

const updateConfig = (data) => ({
  type: EntryActionTypes.CONFIG_UPDATE,
  payload: {
    data,
  },
});

const handleConfigUpdate = (config) => ({
  type: EntryActionTypes.CONFIG_UPDATE_HANDLE,
  payload: {
    config,
  },
});

const testSmtpConfig = () => ({
  type: EntryActionTypes.SMTP_CONFIG_TEST,
  payload: {},
});

const testGitlabConfig = (data) => ({
  type: EntryActionTypes.GITLAB_CONFIG_TEST,
  payload: {
    data,
  },
});

export default {
  updateConfig,
  handleConfigUpdate,
  testSmtpConfig,
  testGitlabConfig,
};
