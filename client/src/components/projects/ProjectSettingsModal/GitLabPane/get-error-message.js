// Maps known server error messages to translation keys, falling back to the raw message
const ERROR_MESSAGE_KEYS = {
  'GitLab is not configured': 'common.gitlabIsNotConfigured',
  'GitLab token is invalid or expired': 'common.gitlabTokenIsInvalidOrExpired',
  'GitLab token lacks permission': 'common.gitlabTokenLacksPermission',
  'GitLab project not found': 'common.gitlabProjectNotFound',
  'GitLab branch not found': 'common.gitlabBranchNotFound',
  'GitLab is unavailable': 'common.gitlabIsUnavailable',
  'GitLab request failed': 'common.gitlabRequestFailed',
  'GitLab integration already exists': 'common.gitlabIntegrationAlreadyExists',
  'Default branch must be present': 'common.defaultBranchMustBePresent',
  'Failed to fetch': 'common.noInternetConnection',
  'Network request failed': 'common.noInternetConnection',
};

export default (error, t) => {
  if (!error) {
    return null;
  }

  const key = ERROR_MESSAGE_KEYS[error.message];

  if (key) {
    return t(key);
  }

  return error.message || t('common.unknownError');
};
