/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

module.exports = {
  sync: true,

  inputs: {
    record: {
      type: 'ref',
      required: true,
    },
  },

  fn(inputs) {
    // The GitLab token (stored encrypted) is never presented, only whether it is set
    const isGitlabManagedByEnv = sails.helpers.gitlab.isManagedByEnv();

    const gitlabValues = isGitlabManagedByEnv
      ? {
          gitlabUrl: sails.config.custom.gitlabUrl,
          isGitlabTokenSet: true,
          isGitlabManagedByEnv,
        }
      : {
          gitlabUrl: inputs.record.gitlabUrl,
          isGitlabTokenSet: !!inputs.record.gitlabToken,
          isGitlabManagedByEnv,
        };

    const record = {
      ..._.omit(inputs.record, 'gitlabToken'),
      ...gitlabValues,
    };

    if (sails.config.custom.smtpHost) {
      return _.omit(record, Config.SMTP_FIELD_NAMES);
    }

    if (record.smtpPassword) {
      return _.omit(record, 'smtpPassword');
    }

    return record;
  },
};
