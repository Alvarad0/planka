import React, { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button, Form, Input } from 'semantic-ui-react';
import { Popup } from '../../../../lib/custom-ui';

import { useForm, useNestedRef } from '../../../../hooks';
import validateGitBranchName from '../../../../utils/validate-git-branch-name';

import styles from './CreateBranchStep.module.scss';

// An empty field is valid: the server then uses the suggested name or the default branch
const isFieldValid = (value) => value === '' || validateGitBranchName(value);

const CreateBranchStep = React.memo(({ defaultName, defaultRef, onCreate, onClose }) => {
  const [t] = useTranslation();

  const [data, handleFieldChange] = useForm(() => ({
    name: defaultName || '',
    ref: defaultRef || '',
  }));

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

  useEffect(() => {
    nameFieldRef.current.select();
  }, [nameFieldRef]);

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
            onChange={handleFieldChange}
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
            onChange={handleFieldChange}
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
