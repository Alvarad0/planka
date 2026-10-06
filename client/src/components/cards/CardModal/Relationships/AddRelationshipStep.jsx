import React, { useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Dropdown, Form } from 'semantic-ui-react';
import { Popup } from '../../../../lib/custom-ui';

import selectors from '../../../../selectors';
import { useForm } from '../../../../hooks';
import RelationshipTypes from './RelationshipTypes';

import styles from './AddRelationshipStep.module.scss';

const TYPE_KEYS = {
  [RelationshipTypes.DEPENDS_ON]: 'common.dependsOn',
  [RelationshipTypes.BLOCKS]: 'common.blocks',
  [RelationshipTypes.RELATED]: 'common.relatedTo',
};

const AddRelationshipStep = React.memo(({ onCreate, onClose }) => {
  const cards = useSelector(selectors.selectCardsForCardRelationshipInCurrentCard);

  const [t] = useTranslation();

  const [data, handleFieldChange] = useForm({
    type: RelationshipTypes.DEPENDS_ON,
    relatedCardId: null,
  });

  const typeOptions = useMemo(
    () =>
      Object.values(RelationshipTypes).map((type) => ({
        key: type,
        value: type,
        text: t(TYPE_KEYS[type]),
      })),
    [t],
  );

  // Same search as when linking a task to a card, extended to the project's boards
  const cardOptions = useMemo(
    () =>
      cards.map((card) => ({
        key: card.id,
        value: card.id,
        text: card.name,
        description: card.boardName,
      })),
    [cards],
  );

  const handleSubmit = useCallback(() => {
    if (!data.relatedCardId) {
      return;
    }

    onCreate({
      type: data.type,
      relatedCardId: data.relatedCardId,
    });

    onClose();
  }, [onCreate, onClose, data]);

  return (
    <>
      <Popup.Header>
        {t('common.addRelationship', {
          context: 'title',
        })}
      </Popup.Header>
      <Popup.Content>
        <Form onSubmit={handleSubmit}>
          <div className={styles.text}>{t('common.relationshipType')}</div>
          <Dropdown
            fluid
            selection
            name="type"
            options={typeOptions}
            value={data.type}
            className={styles.field}
            onChange={handleFieldChange}
          />
          <div className={styles.text}>{t('common.card')}</div>
          <Dropdown
            fluid
            selection
            search
            name="relatedCardId"
            options={cardOptions}
            value={data.relatedCardId}
            placeholder={t('common.searchCards')}
            noResultsMessage={t('common.noCardsFound')}
            className={styles.field}
            onChange={handleFieldChange}
          />
          <Button positive disabled={!data.relatedCardId} content={t('action.addRelationship')} />
        </Form>
      </Popup.Content>
    </>
  );
});

AddRelationshipStep.propTypes = {
  onCreate: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default AddRelationshipStep;
