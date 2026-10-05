import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Form, Input, Message } from 'semantic-ui-react';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import { useForm, useNestedRef } from '../../../../hooks';
import getErrorMessage from './get-error-message';

import styles from './LinkForm.module.scss';

const LinkForm = React.memo(() => {
  const { isCreating, createError } = useSelector(selectors.selectGitlabIntegrationState);

  const dispatch = useDispatch();
  const [t] = useTranslation();

  const [data, handleFieldChange] = useForm({
    gitlabProject: '',
    defaultBranch: '',
  });

  const [gitlabProjectFieldRef, handleGitlabProjectFieldRef] = useNestedRef('inputRef');

  const handleSubmit = useCallback(() => {
    const gitlabProject = data.gitlabProject.trim();
    const defaultBranch = data.defaultBranch.trim();

    if (!gitlabProject) {
      gitlabProjectFieldRef.current.select();
      return;
    }

    dispatch(
      entryActions.createGitlabIntegrationInCurrentProject({
        gitlabProject,
        ...(defaultBranch && {
          defaultBranch,
        }),
      }),
    );
  }, [dispatch, data, gitlabProjectFieldRef]);

  return (
    <>
      <Form onSubmit={handleSubmit}>
        <div className={styles.text}>{t('common.gitlabProject')}</div>
        <Input
          fluid
          ref={handleGitlabProjectFieldRef}
          name="gitlabProject"
          value={data.gitlabProject}
          placeholder={t('common.groupProjectOrNumericId')}
          maxLength={255}
          readOnly={isCreating}
          className={styles.field}
          onChange={handleFieldChange}
        />
        <div className={styles.text}>
          {t('common.defaultBranch')} (
          {t('common.optional', {
            context: 'inline',
          })}
          )
        </div>
        <Input
          fluid
          name="defaultBranch"
          value={data.defaultBranch}
          placeholder={t('common.takenFromGitlabIfEmpty')}
          maxLength={255}
          readOnly={isCreating}
          className={styles.field}
          onChange={handleFieldChange}
        />
        <Button
          positive
          content={t('action.linkProject')}
          loading={isCreating}
          disabled={isCreating}
        />
      </Form>
      {createError && (
        <Message error content={getErrorMessage(createError, t)} className={styles.message} />
      )}
    </>
  );
});

export default LinkForm;
