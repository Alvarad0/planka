// Maps known server error messages to translation keys, falling back to the raw message
const ERROR_MESSAGE_KEYS = {
  'User already assigned': 'common.userIsAlreadyAssignedToKnowledgeTransfer',
  'User deactivated': 'common.userIsDeactivated',
  'User not found': 'common.userNotFound',
  'Knowledge transfer is already explained': 'common.knowledgeTransferIsLocked',
  'Knowledge transfer not found': 'common.personWasAlreadyRemovedFromKnowledgeTransfer',
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
