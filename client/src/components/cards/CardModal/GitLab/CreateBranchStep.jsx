import React, { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Form, Input } from 'semantic-ui-react';
import { Popup } from '../../../../lib/custom-ui';

import entryActions from '../../../../entry-actions';
import { useForm, useNestedRef } from '../../../../hooks';
import validateGitBranchName from '../../../../utils/validate-git-branch-name';

import styles from './CreateBranchStep.module.scss';

// An empty field is valid: the server then uses the suggested name or the default branch
const isFieldValid = (value) => value === '' || validateGitBranchName(value);

const CreateBranchStep = React.memo(({ defaultName, defaultRef, onCreate, onClose }) => {
  const dispatch = useDispatch();
  const [t] = useTranslation();

  const [data, handleFieldChange, setData] = useForm(() => ({
    name: defaultName || '',
    ref: defaultRef || '',
  }));

  // Fields edited by the user, which a refreshed suggestion must not overwrite
  const editedFieldNamesRef = useRef(new Set());

  const [nameFieldRef, handleNameFieldRef] = useNestedRef('inputRef');

  const name = data.name.trim();
  const ref = data.ref.trim();

  const isNameValid = isFieldValid(name);
  const isRefValid = isFieldValid(ref);

  const handleSubmit = useCallback(() => {
    if (!isNameValid || !isRefValid) {
      return;
    }

    onCreate({
      ...(name && { name }),
      ...(ref && { ref }),
    });

    onClose();
  }, [onCreate, onClose, name, ref, isNameValid, isRefValid]);

  const handleEditableFieldChange = useCallback(
    (event, field) => {
      editedFieldNamesRef.current.add(field.name);
      handleFieldChange(event, field);
    },
    [handleFieldChange],
  );

  useEffect(() => {
    nameFieldRef.current.select();
  }, [nameFieldRef]);

  // The suggestion depends on card data that may have changed since the GitLab section was
  // fetched (e.g. the "ID" custom field), so it is refreshed from the server on open. Meanwhile
  // the form shows the previous suggestion; on failure it just keeps it.
  useEffect(() => {
    dispatch(entryActions.fetchGitlabBranchSuggestionInCurrentCard());
  }, [dispatch]);

  useEffect(() => {
    const isNameUpdated = !!defaultName && !editedFieldNamesRef.current.has('name');
    const isRefUpdated = !!defaultRef && !editedFieldNamesRef.current.has('ref');

    if (!isNameUpdated && !isRefUpdated) {
      return;
    }

    setData((prevData) => ({
      ...prevData,
      ...(isNameUpdated && { name: defaultName }),
      ...(isRefUpdated && { ref: defaultRef }),
    }));
  }, [defaultName, defaultRef, setData]);

  // Keeps the untouched suggestion selected, so typing still replaces it
  useEffect(() => {
    const input = nameFieldRef.current;

    if (!editedFieldNamesRef.current.has('name') && input && document.activeElement === input) {
      input.select();
    }
  }, [data.name, nameFieldRef]);

  return (
    <>
      <Popup.Header>
        {t('common.createGitlabBranch', {
          context: 'title',
        })}
      </Popup.Header>
      <Popup.Content>
        <Form onSubmit={handleSubmit}>
          <div className={styles.text}>{t('common.branchName')}</div>
          <Input
            fluid
            ref={handleNameFieldRef}
            name="name"
            value={data.name}
            maxLength={255}
            autoComplete="off"
            spellCheck={false}
            error={!isNameValid}
            className={styles.field}
            onChange={handleEditableFieldChange}
          />
          {!isNameValid && <div className={styles.error}>{t('common.invalidBranchName')}</div>}
          <div className={styles.text}>{t('common.baseBranch')}</div>
          <Input
            fluid
            name="ref"
            value={data.ref}
            maxLength={255}
            autoComplete="off"
            spellCheck={false}
            error={!isRefValid}
            className={styles.field}
            onChange={handleEditableFieldChange}
          />
          {!isRefValid && <div className={styles.error}>{t('common.invalidBranchName')}</div>}
          <Button
            positive
            content={t('action.createBranch')}
            disabled={!isNameValid || !isRefValid}
          />
        </Form>
      </Popup.Content>
    </>
  );
});

CreateBranchStep.propTypes = {
  defaultName: PropTypes.string,
  defaultRef: PropTypes.string,
  onCreate: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

CreateBranchStep.defaultProps = {
  defaultName: undefined,
  defaultRef: undefined,
};

export default CreateBranchStep;
