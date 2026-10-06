import React, { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Message } from 'semantic-ui-react';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import { usePopupInClosableContext } from '../../../../hooks';
import { isListArchiveOrTrash } from '../../../../utils/record-helpers';
import getCardRelationshipErrorMessage from '../../../../utils/get-card-relationship-error-message';
import { BoardMembershipRoles } from '../../../../constants/Enums';
import RelationshipTypes from './RelationshipTypes';
import AddRelationshipStep from './AddRelationshipStep';
import Item from './Item';

import styles from './Relationships.module.scss';

const GROUPS = [
  {
    type: RelationshipTypes.DEPENDS_ON,
    key: 'common.dependsOn',
  },
  {
    type: RelationshipTypes.BLOCKS,
    key: 'common.blocks',
  },
  {
    type: RelationshipTypes.RELATED,
    key: 'common.relatedTo',
  },
];

const Relationships = React.memo(() => {
  const selectListById = useMemo(() => selectors.makeSelectListById(), []);

  const card = useSelector(selectors.selectCurrentCard);

  const {
    cardId,
    items,
    parentCards,
    blockingOpenCount,
    isFetched,
    fetchError,
    isCreating,
    createError,
    deletingIds,
    deleteError,
  } = useSelector(selectors.selectCardRelationshipState);

  // Same rule as the GitLab section
  const canEdit = useSelector((state) => {
    const list = selectListById(state, card.listId);

    if (isListArchiveOrTrash(list)) {
      return false;
    }

    const boardMembership = selectors.selectCurrentUserMembershipForCurrentBoard(state);
    return !!boardMembership && boardMembership.role === BoardMembershipRoles.EDITOR;
  });

  const dispatch = useDispatch();
  const [t] = useTranslation();

  useEffect(() => {
    dispatch(entryActions.fetchCardRelationshipsInCurrentCard());
  }, [card.id, dispatch]);

  const handleCreate = useCallback(
    (data) => {
      dispatch(entryActions.createCardRelationshipInCurrentCard(data));
    },
    [dispatch],
  );

  const handleRemove = useCallback(
    (id) => {
      dispatch(entryActions.deleteCardRelationship(id));
    },
    [dispatch],
  );

  const AddRelationshipPopup = usePopupInClosableContext(AddRelationshipStep);

  // Nothing is rendered until the first fetch for this card completes, to avoid layout flicker
  if (cardId !== card.id || !isFetched) {
    return null;
  }

  const groups = GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.type === group.type),
  })).filter((group) => group.items.length > 0);

  const hasContent = groups.length > 0 || parentCards.length > 0 || blockingOpenCount > 0;

  if (!hasContent && !canEdit && !fetchError) {
    return null;
  }

  const requestError = createError || deleteError;

  return (
    <div className={styles.contentModule}>
      <div className={styles.moduleWrapper}>
        <Icon name="sitemap" className={styles.moduleIcon} />
        <div className={styles.moduleHeader}>
          {t('common.relationships', {
            context: 'title',
          })}
        </div>
        {fetchError && (
          <Message error size="small" content={getCardRelationshipErrorMessage(fetchError, t)} />
        )}
        {blockingOpenCount > 0 && (
          <div className={styles.warning}>
            <Icon name="warning sign" />
            {t('common.blockedByOpenCards', {
              count: blockingOpenCount,
            })}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.type} className={styles.group}>
            <div className={styles.groupTitle}>{t(group.key)}</div>
            <ul className={styles.items}>
              {group.items.map((item) => (
                <Item
                  key={item.id}
                  id={item.id}
                  card={item.relatedCard}
                  isRemovable={canEdit}
                  isRemoving={deletingIds.includes(item.id)}
                  onRemove={handleRemove}
                />
              ))}
            </ul>
          </div>
        ))}
        {parentCards.length > 0 && (
          <div className={styles.group}>
            <div className={styles.groupTitle}>{t('common.subtaskOf')}</div>
            <ul className={styles.items}>
              {parentCards.map((parentCard) => (
                <Item
                  key={parentCard.id}
                  id={parentCard.id}
                  // Unreadable cards come with their id only
                  card={parentCard.name === undefined ? null : parentCard}
                />
              ))}
            </ul>
          </div>
        )}
        {canEdit && (
          <div className={styles.actions}>
            <AddRelationshipPopup onCreate={handleCreate}>
              <Button
                icon="plus"
                content={t('action.addRelationship')}
                loading={isCreating}
                disabled={isCreating}
                className={styles.actionButton}
              />
            </AddRelationshipPopup>
          </div>
        )}
        {requestError && (
          <Message
            error
            size="small"
            content={getCardRelationshipErrorMessage(requestError, t)}
            className={styles.message}
          />
        )}
      </div>
    </div>
  );
});

export default Relationships;
