// Maps known server error messages to translation keys, falling back to the raw message
const ERROR_MESSAGE_KEYS = {
  'GitLab is not configured': 'common.gitlabIsNotConfigured',
  'GitLab token is invalid or expired': 'common.gitlabTokenIsInvalidOrExpired',
  'GitLab token lacks permission': 'common.gitlabTokenLacksPermission',
  'GitLab project not found': 'common.gitlabProjectNotFound',
  'GitLab branch not found': 'common.gitlabBranchNotFound',
  'GitLab issue not found': 'common.gitlabIssueNotFound',
  'GitLab is unavailable': 'common.gitlabIsUnavailable',
  'GitLab request failed': 'common.gitlabRequestFailed',
  'GitLab integration already exists': 'common.gitlabIntegrationAlreadyExists',
  'Default branch must be present': 'common.defaultBranchMustBePresent',
  'Project is not linked to GitLab': 'common.projectIsNotLinkedToGitlab',
  'Card is already linked to a GitLab issue': 'common.cardIsAlreadyLinkedToGitlabIssue',
  'GitLab issue is already linked to another card':
    'common.gitlabIssueIsAlreadyLinkedToAnotherCard',
  'GitLab card link not found': 'common.cardIsNotLinkedToGitlabIssue',
  'Card is not linked to a GitLab issue': 'common.cardIsNotLinkedToGitlabIssue',
  'Card was moved to a project linked to another GitLab project':
    'common.cardWasMovedToProjectLinkedToAnotherGitlabProject',
  'Card already has a GitLab branch': 'common.cardAlreadyHasGitlabBranch',
  'Card has no GitLab branch': 'common.cardHasNoGitlabBranch',
  'GitLab branch is already linked to another card':
    'common.gitlabBranchIsAlreadyLinkedToAnotherCard',
  'Invalid branch name': 'common.invalidBranchName',
  'Invalid base branch name': 'common.invalidBaseBranchName',
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
