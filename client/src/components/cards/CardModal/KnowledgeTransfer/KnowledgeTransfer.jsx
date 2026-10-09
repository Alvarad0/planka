import React, { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Message } from 'semantic-ui-react';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import { usePopupInClosableContext } from '../../../../hooks';
import { isListArchiveOrTrash } from '../../../../utils/record-helpers';
import getKnowledgeTransferErrorMessage from '../../../../utils/get-knowledge-transfer-error-message';
import { BoardMembershipRoles, UserRoles } from '../../../../constants/Enums';
import AddPersonStep from './AddPersonStep';
import Item from './Item';

import styles from './KnowledgeTransfer.module.scss';

// Users who must learn what the card is about, and whether it was explained to them
const KnowledgeTransfer = React.memo(() => {
  const selectListById = useMemo(() => selectors.makeSelectListById(), []);

  const card = useSelector(selectors.selectCurrentCard);
  const knowledgeTransfers = useSelector(selectors.selectKnowledgeTransfersForCurrentCard);

  const {
    cardId,
    isFetched,
    fetchError,
    isCreating,
    createError,
    updatingIds,
    updateError,
    deletingIds,
    deleteError,
  } = useSelector(selectors.selectKnowledgeTransferState);

  // Same rule as the GitLab section (and the server): board editors, while the card is not
  // archived or trashed
  const canEdit = useSelector((state) => {
    const list = selectListById(state, card.listId);

    if (isListArchiveOrTrash(list)) {
      return false;
    }

    const boardMembership = selectors.selectCurrentUserMembershipForCurrentBoard(state);
    return !!boardMembership && boardMembership.role === BoardMembershipRoles.EDITOR;
  });

  // Explained items are locked for everyone but admins (enforced by the server too)
  const isAdmin = useSelector((state) => {
    const currentUser = selectors.selectCurrentUser(state);
    return !!currentUser && currentUser.role === UserRoles.ADMIN;
  });

  const dispatch = useDispatch();
  const [t] = useTranslation();

  useEffect(() => {
    dispatch(entryActions.fetchKnowledgeTransfersInCurrentCard());
  }, [card.id, dispatch]);

  const handleUserSelect = useCallback(
    (userId) => {
      dispatch(
        entryActions.createKnowledgeTransferInCurrentCard({
          userId,
        }),
      );
    },
    [dispatch],
  );

  const handleExplainedToggle = useCallback(
    (id, isExplained) => {
      dispatch(
        entryActions.updateKnowledgeTransfer(id, {
          isExplained,
        }),
      );
    },
    [dispatch],
  );

  const handleRemove = useCallback(
    (id) => {
      dispatch(entryActions.deleteKnowledgeTransfer(id));
    },
    [dispatch],
  );

  const AddPersonPopup = usePopupInClosableContext(AddPersonStep);

  // Nothing is rendered until the first fetch for this card completes, to avoid layout flicker
  if (cardId !== card.id || !isFetched) {
    return null;
  }

  const items = knowledgeTransfers || [];

  if (items.length === 0 && !canEdit) {
    return null;
  }

  const requestError = createError || updateError || deleteError;

  return (
    <div className={styles.contentModule}>
      <div className={styles.moduleWrapper}>
        <Icon name="graduation cap" className={styles.moduleIcon} />
        <div className={styles.moduleHeader}>
          {t('common.knowledgeTransfer', {
            context: 'title',
          })}
        </div>
        {fetchError && (
          <Message error size="small" content={getKnowledgeTransferErrorMessage(fetchError, t)} />
        )}
        {items.length > 0 ? (
          <ul className={styles.items}>
            {items.map((knowledgeTransfer) => (
              <Item
                key={knowledgeTransfer.id}
                id={knowledgeTransfer.id}
                userId={knowledgeTransfer.userId}
                isExplained={knowledgeTransfer.isExplained}
                explainedByUserId={knowledgeTransfer.explainedByUserId}
                explainedAt={knowledgeTransfer.explainedAt}
                canEdit={canEdit}
                canEditExplained={canEdit && isAdmin}
                isUpdating={updatingIds.includes(knowledgeTransfer.id)}
                isDeleting={deletingIds.includes(knowledgeTransfer.id)}
                onExplainedToggle={handleExplainedToggle}
                onRemove={handleRemove}
              />
            ))}
          </ul>
        ) : (
          !fetchError && <div className={styles.text}>{t('common.noOneMustLearnThisYet')}</div>
        )}
        {canEdit && (
          <div className={styles.actions}>
            <AddPersonPopup onSelect={handleUserSelect}>
              <Button
                icon="user plus"
                content={t('action.addPerson')}
                loading={isCreating}
                disabled={isCreating}
                className={styles.actionButton}
              />
            </AddPersonPopup>
          </div>
        )}
        {requestError && (
          <Message
            error
            size="small"
            content={getKnowledgeTransferErrorMessage(requestError, t)}
            className={styles.message}
          />
        )}
      </div>
    </div>
  );
});

export default KnowledgeTransfer;
