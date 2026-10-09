import React, { useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Loader, Message } from 'semantic-ui-react';
import { Input, Popup } from '../../../../lib/custom-ui';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import { useField, useNestedRef } from '../../../../hooks';
import getKnowledgeTransferErrorMessage from '../../../../utils/get-knowledge-transfer-error-message';
import User from '../../../board-memberships/BoardMemberships/AddStep/User';

import styles from './AddPersonStep.module.scss';

// Picker of every active user not assigned yet. Non-admin users only have users sharing a board
// with them in the store, so the list is fetched from the server each time the popup opens.
const AddPersonStep = React.memo(({ onSelect, onClose }) => {
  const users = useSelector(selectors.selectKnowledgeTransferCandidatesForCurrentCard);

  const { isFetchingCandidates, candidatesError } = useSelector(
    selectors.selectKnowledgeTransferState,
  );

  const dispatch = useDispatch();
  const [t] = useTranslation();
  const [search, handleSearchChange] = useField('');
  const cleanSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const [searchFieldRef, handleSearchFieldRef] = useNestedRef('inputRef');

  useEffect(() => {
    dispatch(entryActions.fetchKnowledgeTransferCandidatesInCurrentCard());
  }, [dispatch]);

  useEffect(() => {
    searchFieldRef.current.focus({
      preventScroll: true,
    });
  }, [searchFieldRef]);

  const filteredUsers = useMemo(
    () =>
      (users || []).filter(
        (user) =>
          user.name.toLowerCase().includes(cleanSearch) ||
          (user.username && user.username.includes(cleanSearch)),
      ),
    [users, cleanSearch],
  );

  const handleUserSelect = useCallback(
    (userId) => {
      onSelect(userId);
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <>
      <Popup.Header>
        {t('common.addPerson', {
          context: 'title',
        })}
      </Popup.Header>
      <Popup.Content>
        <Input
          fluid
          ref={handleSearchFieldRef}
          value={search}
          placeholder={t('common.searchUsers')}
          maxLength={128}
          icon="search"
          onChange={handleSearchChange}
        />
        {candidatesError && (
          <Message
            error
            size="small"
            content={getKnowledgeTransferErrorMessage(candidatesError, t)}
            className={styles.message}
          />
        )}
        {!users && isFetchingCandidates && (
          <Loader active inline="centered" size="small" className={styles.loader} />
        )}
        {users && filteredUsers.length > 0 && (
          <div className={styles.users}>
            {filteredUsers.map((user) => (
              <User key={user.id} id={user.id} isActive={false} onSelect={handleUserSelect} />
            ))}
          </div>
        )}
        {users && users.length === 0 && <div className={styles.text}>{t('common.noOneToAdd')}</div>}
      </Popup.Content>
    </>
  );
});

AddPersonStep.propTypes = {
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default AddPersonStep;
