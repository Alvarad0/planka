// Parsing of the GitLab periodic sync settings (GITLAB_SYNC_INTERVAL,
// GITLAB_WEBHOOK_DELIVERY_RETENTION_DAYS).
//
// It runs while the config is loaded, before Sails logging is available, so invalid values are
// not logged here: they are returned as warnings, which the gitlab-sync hook logs on startup.

const DEFAULT_SYNC_INTERVAL = 10; // In minutes
const DEFAULT_WEBHOOK_DELIVERY_RETENTION_DAYS = 30;

// setTimeout fires immediately for delays above 2^31 - 1 ms (about 24.8 days)
const MAX_SYNC_INTERVAL = Math.floor((2 ** 31 - 1) / (60 * 1000));
const MAX_WEBHOOK_DELIVERY_RETENTION_DAYS = 36500;

const NON_NEGATIVE_INTEGER_REGEX = /^[0-9]+$/;

// Returns the default for an unset value; flags anything that is not a non-negative integer
// within `max` as invalid (and also returns the default for it)
const parseNonNegativeInteger = (rawValue, { defaultValue, max }) => {
  if (rawValue === undefined || rawValue === null || `${rawValue}`.trim() === '') {
    return { value: defaultValue, isValid: true };
  }

  const trimmedValue = `${rawValue}`.trim();

  if (!NON_NEGATIVE_INTEGER_REGEX.test(trimmedValue)) {
    return { value: defaultValue, isValid: false };
  }

  const value = parseInt(trimmedValue, 10);

  if (value > max) {
    return { value: defaultValue, isValid: false };
  }

  return { value, isValid: true };
};

const parseGitlabSyncConfig = (env) => {
  const warnings = [];

  const parse = (name, options) => {
    const { value, isValid } = parseNonNegativeInteger(env[name], options);

    if (!isValid) {
      // The raw value is not echoed: it is configuration, but keeping it out of logs is cheap
      warnings.push(
        `${name} must be an integer between 0 and ${options.max}, using the default (${options.defaultValue})`,
      );
    }

    return value;
  };

  return {
    // 0 disables the periodic sync
    gitlabSyncInterval: parse('GITLAB_SYNC_INTERVAL', {
      defaultValue: DEFAULT_SYNC_INTERVAL,
      max: MAX_SYNC_INTERVAL,
    }),
    // 0 disables pruning of webhook deliveries
    gitlabWebhookDeliveryRetentionDays: parse('GITLAB_WEBHOOK_DELIVERY_RETENTION_DAYS', {
      defaultValue: DEFAULT_WEBHOOK_DELIVERY_RETENTION_DAYS,
      max: MAX_WEBHOOK_DELIVERY_RETENTION_DAYS,
    }),
    warnings,
  };
};

module.exports = {
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_WEBHOOK_DELIVERY_RETENTION_DAYS,
  MAX_SYNC_INTERVAL,
  MAX_WEBHOOK_DELIVERY_RETENTION_DAYS,
  parseNonNegativeInteger,
  parseGitlabSyncConfig,
};
