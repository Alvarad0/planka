import React, { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Form, Message, Tab } from 'semantic-ui-react';
import { Input } from '../../../lib/custom-ui';

import selectors from '../../../selectors';
import entryActions from '../../../entry-actions';
import { useForm, useNestedRef } from '../../../hooks';
import getGitlabErrorMessage from '../../../utils/get-gitlab-error-message';

import styles from './GitLabPane.module.scss';

// Same rules as the server (http or https, no credentials, query or fragment), which normalizes
// and validates it again
const isGitlabUrlValid = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    ['http:', 'https:'].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
};

const GitLabPane = React.memo(() => {
  const config = useSelector(selectors.selectConfig);
  const gitlabConfigTestState = useSelector(selectors.selectGitlabConfigTestState);

  const dispatch = useDispatch();
  const [t] = useTranslation();

  const [tokenFieldRef, handleTokenFieldRef] = useNestedRef('inputRef');

  const isManagedByEnv = !!config.isGitlabManagedByEnv;
  const isTokenSet = !!config.isGitlabTokenSet;
  const defaultUrl = config.gitlabUrl || null;

  // The token is write-only: the field stays empty and typing a value replaces the saved one
  const [data, handleFieldChange, setData] = useForm(() => ({
    gitlabUrl: defaultUrl || '',
    gitlabToken: '',
  }));

  // Picks up the URL as normalized by the server after saving
  useEffect(() => {
    setData((prevData) => ({
      ...prevData,
      gitlabUrl: defaultUrl || '',
    }));
  }, [defaultUrl, setData]);

  const cleanData = useMemo(
    () => ({
      gitlabUrl: data.gitlabUrl.trim() || null,
      gitlabToken: data.gitlabToken.trim() || undefined,
    }),
    [data],
  );

  const isUrlValid = !cleanData.gitlabUrl || isGitlabUrlValid(cleanData.gitlabUrl);

  const isModified = cleanData.gitlabUrl !== defaultUrl || cleanData.gitlabToken !== undefined;

  const isTestable =
    isManagedByEnv ||
    (!!cleanData.gitlabUrl && isUrlValid && (!!cleanData.gitlabToken || isTokenSet));

  const handleSubmit = useCallback(() => {
    if (isManagedByEnv || !isModified || !isUrlValid) {
      return;
    }

    dispatch(entryActions.updateConfig(cleanData));

    setData((prevData) => ({
      ...prevData,
      gitlabToken: '',
    }));
  }, [isManagedByEnv, isModified, isUrlValid, cleanData, dispatch, setData]);

  const handleTokenClear = useCallback(() => {
    dispatch(
      entryActions.updateConfig({
        gitlabToken: null,
      }),
    );

    tokenFieldRef.current.focus();
  }, [dispatch, tokenFieldRef]);

  // Tests the values in the form, so they can be checked before saving; the server falls back to
  // the saved token when none is typed
  const handleTestClick = useCallback(() => {
    dispatch(
      entryActions.testGitlabConfig(
        isManagedByEnv
          ? {}
          : {
              gitlabUrl: cleanData.gitlabUrl,
              gitlabToken: cleanData.gitlabToken,
            },
      ),
    );
  }, [isManagedByEnv, cleanData, dispatch]);

  return (
    <Tab.Pane attached={false} className={styles.wrapper}>
      {isManagedByEnv && (
        <Message info content={t('common.gitlabIsConfiguredViaEnvironmentVariables')} />
      )}
      <Form onSubmit={handleSubmit}>
        <div className={styles.text}>{t('common.gitlabUrl')}</div>
        <Input
          fluid
          name="gitlabUrl"
          value={data.gitlabUrl}
          placeholder="https://gitlab.example.com"
          maxLength={2048}
          readOnly={isManagedByEnv}
          error={!isUrlValid}
          className={styles.field}
          onChange={handleFieldChange}
        />
        {!isUrlValid && <div className={styles.error}>{t('common.invalidGitlabUrl')}</div>}
        <div className={styles.text}>{t('common.accessToken')}</div>
        <Input.Password
          fluid
          ref={handleTokenFieldRef}
          name="gitlabToken"
          value={data.gitlabToken}
          placeholder={isTokenSet ? t('common.tokenIsSet') : undefined}
          maxLength={1024}
          disabled={isManagedByEnv}
          className={styles.field}
          onClear={
            !isManagedByEnv && !data.gitlabToken && isTokenSet ? handleTokenClear : undefined
          }
          onChange={handleFieldChange}
        />
        <div className={styles.hint}>{t('common.gitlabAccessTokenHint')}</div>
        <div className={styles.controls}>
          {!isManagedByEnv && (
            <Button positive disabled={!isModified || !isUrlValid} content={t('action.save')} />
          )}
          <Button
            type="button"
            content={t('action.testConnection')}
            loading={gitlabConfigTestState.isLoading}
            disabled={!isTestable || gitlabConfigTestState.isLoading}
            onClick={handleTestClick}
          />
        </div>
      </Form>
      {gitlabConfigTestState.gitlabUser && (
        <Message
          positive
          content={t('common.connectedToGitlabAs', {
            username: gitlabConfigTestState.gitlabUser.username,
          })}
          className={styles.message}
        />
      )}
      {gitlabConfigTestState.error && (
        <Message
          error
          content={getGitlabErrorMessage(gitlabConfigTestState.error, t)}
          className={styles.message}
        />
      )}
    </Tab.Pane>
  );
});

export default GitLabPane;
