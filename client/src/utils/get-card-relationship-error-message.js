// Maps known server error messages to translation keys, falling back to the raw message
const ERROR_MESSAGE_KEYS = {
  'Card not found': 'common.cardNotFound_title',
  'Related card not found': 'common.relatedCardNotFound',
  'Not enough rights': 'common.notEnoughRightsToRelateCards',
  'Card relationship already exists': 'common.cardRelationshipAlreadyExists',
  'Card cannot be related to itself': 'common.cardCannotBeRelatedToItself',
  'Cards must belong to the same project': 'common.cardsMustBelongToSameProject',
  'Would create dependency cycle': 'common.relationshipWouldCreateDependencyCycle',
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
