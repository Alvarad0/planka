import React, { useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox } from 'semantic-ui-react';

import selectors from '../../../../selectors';
import { usePopupInClosableContext } from '../../../../hooks';
import ConfirmationStep from '../../../common/ConfirmationStep';
import UserAvatar from '../../../users/UserAvatar';

import styles from './KnowledgeTransfer.module.scss';

const Item = React.memo(
  ({
    id,
    userId,
    isExplained,
    explainedByUserId,
    explainedAt,
    canEdit,
    canEditExplained,
    isUpdating,
    isDeleting,
    onExplainedToggle,
    onRemove,
  }) => {
    const selectUserById = useMemo(() => selectors.makeSelectUserById(), []);
    const selectExplainedByUserById = useMemo(() => selectors.makeSelectUserById(), []);

    const user = useSelector((state) => selectUserById(state, userId));

    const explainedByUser = useSelector(
      (state) => explainedByUserId && selectExplainedByUserById(state, explainedByUserId),
    );

    const [t] = useTranslation();

    const handleExplainedChange = useCallback(() => {
      onExplainedToggle(id, !isExplained);
    }, [id, isExplained, onExplainedToggle]);

    const handleRemoveConfirm = useCallback(() => {
      onRemove(id);
    }, [id, onRemove]);

    const ConfirmationPopup = usePopupInClosableContext(ConfirmationStep);

    // Once explained, only admins can untick or remove it
    const isEditable = canEdit && (!isExplained || canEditExplained);

    // Users come with the knowledge transfers, so a missing one is only transient
    if (!user) {
      return null;
    }

    let explanation = null;
    if (isExplained && explainedAt) {
      const date = t('format:longDate', {
        value: explainedAt,
        postProcess: 'formatDate',
      });

      // The explainer may have been deleted since
      explanation = explainedByUser
        ? t('common.explainedByUserOnDate', {
            date,
            name: explainedByUser.name,
          })
        : t('common.explainedOnDate', {
            date,
          });
    }

    return (
      <li className={styles.item}>
        <UserAvatar id={userId} size="small" className={styles.itemAvatar} />
        <div className={styles.itemContent}>
          <span className={styles.itemName}>{user.name}</span>
          {explanation && <span className={styles.itemExplanation}>✔ {explanation}</span>}
        </div>
        {/* Read-only for viewers, so the state stays easy to read; disabled when locked */}
        <Checkbox
          checked={isExplained}
          label={t('common.explained')}
          readOnly={!isEditable}
          disabled={(canEdit && !isEditable) || (isEditable && (isUpdating || isDeleting))}
          className={styles.itemCheckbox}
          onChange={handleExplainedChange}
        />
        {isEditable && (
          <ConfirmationPopup
            title="common.removePerson"
            content="common.areYouSureYouWantToRemoveThisPerson"
            buttonContent="action.removePerson"
            onConfirm={handleRemoveConfirm}
          >
            <Button
              type="button"
              icon="close"
              title={t('action.removePerson')}
              aria-label={t('action.removePerson')}
              loading={isDeleting}
              disabled={isDeleting}
              className={styles.removeButton}
            />
          </ConfirmationPopup>
        )}
      </li>
    );
  },
);

Item.propTypes = {
  id: PropTypes.string.isRequired,
  userId: PropTypes.string.isRequired,
  isExplained: PropTypes.bool.isRequired,
  explainedByUserId: PropTypes.string,
  explainedAt: PropTypes.instanceOf(Date),
  canEdit: PropTypes.bool.isRequired,
  canEditExplained: PropTypes.bool.isRequired,
  isUpdating: PropTypes.bool.isRequired,
  isDeleting: PropTypes.bool.isRequired,
  onExplainedToggle: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

Item.defaultProps = {
  explainedByUserId: null,
  explainedAt: null,
};

export default Item;
