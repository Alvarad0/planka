/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import { combineReducers } from 'redux';

import authenticateForm from './authenticate-form';
import userCreateForm from './user-create-form';
import projectCreateForm from './project-create-form';
import smtpTestState from './smtp-test-state';
import userTrustedDevicesState from './user-trusted-devices-state';
import gitlabIntegrationState from './gitlab-integration-state';
import gitlabCardLinkState from './gitlab-card-link-state';
import cardRelationshipState from './card-relationship-state';

export default combineReducers({
  authenticateForm,
  userCreateForm,
  projectCreateForm,
  smtpTestState,
  userTrustedDevicesState,
  gitlabIntegrationState,
  gitlabCardLinkState,
  cardRelationshipState,
});
