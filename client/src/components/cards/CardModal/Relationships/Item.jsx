import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button, Label } from 'semantic-ui-react';

import Paths from '../../../../constants/Paths';
import { usePopupInClosableContext } from '../../../../hooks';
import ConfirmationStep from '../../../common/ConfirmationStep';

import styles from './Relationships.module.scss';

// A related card; null when the current user cannot read it, which shows no detail at all
const Item = React.memo(({ id, card, isRemovable, isRemoving, onRemove }) => {
  const [t] = useTranslation();

  const handleRemoveConfirm = useCallback(() => {
    onRemove(id);
  }, [id, onRemove]);

  const ConfirmationPopup = usePopupInClosableContext(ConfirmationStep);

  return (
    <li className={styles.item}>
      {card ? (
        <>
          <Link to={Paths.CARDS.replace(':id', card.id)} className={styles.itemLink}>
            {card.name}
          </Link>
          <span className={styles.itemLocation}>
            {card.listName ? `${card.boardName} · ${card.listName}` : card.boardName}
          </span>
          {card.isClosed && (
            <Label size="tiny" className={styles.itemClosed}>
              {t('common.closed')}
            </Label>
          )}
        </>
      ) : (
        <span className={styles.itemWithoutAccess}>{t('common.cardWithoutAccess')}</span>
      )}
      {isRemovable && (
        <ConfirmationPopup
          title="common.removeRelationship"
          content="common.areYouSureYouWantToRemoveThisRelationship"
          buttonContent="action.removeRelationship"
          onConfirm={handleRemoveConfirm}
        >
          <Button
            type="button"
            icon="close"
            title={t('action.removeRelationship')}
            aria-label={t('action.removeRelationship')}
            loading={isRemoving}
            disabled={isRemoving}
            className={styles.removeButton}
          />
        </ConfirmationPopup>
      )}
    </li>
  );
});

Item.propTypes = {
  id: PropTypes.string.isRequired,
  card: PropTypes.object, // eslint-disable-line react/forbid-prop-types
  isRemovable: PropTypes.bool,
  isRemoving: PropTypes.bool,
  onRemove: PropTypes.func,
};

Item.defaultProps = {
  card: null,
  isRemovable: false,
  isRemoving: false,
  onRemove: undefined,
};

export default Item;
