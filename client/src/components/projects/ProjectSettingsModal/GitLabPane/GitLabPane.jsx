import React, { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Divider, Header, Loader, Message, Tab } from 'semantic-ui-react';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import { usePopupInClosableContext } from '../../../../hooks';
import ConfirmationStep from '../../../common/ConfirmationStep';
import LinkForm from './LinkForm';
import SettingsForm from './SettingsForm';
import WebhookSection from './WebhookSection';
import getErrorMessage from './get-error-message';

import styles from './GitLabPane.module.scss';

const GitLabPane = React.memo(() => {
  const gitlabIntegration = useSelector(selectors.selectGitlabIntegrationForCurrentProject);

  const {
    isFetched,
    fetchError,
    isConnectionTesting,
    connectionTestResult,
    isDeleting,
    deleteError,
  } = useSelector(selectors.selectGitlabIntegrationState);

  const dispatch = useDispatch();
  const [t] = useTranslation();

  useEffect(() => {
    dispatch(entryActions.fetchGitlabIntegrationInCurrentProject());
  }, [dispatch]);

  const handleTestConnectionClick = useCallback(() => {
    dispatch(entryActions.testGitlabIntegrationConnection(gitlabIntegration.id));
  }, [gitlabIntegration, dispatch]);

  const handleUnlinkConfirm = useCallback(() => {
    dispatch(entryActions.deleteGitlabIntegration(gitlabIntegration.id));
  }, [gitlabIntegration, dispatch]);

  const ConfirmationPopup = usePopupInClosableContext(ConfirmationStep);

  if (!isFetched) {
    return (
      <Tab.Pane attached={false} className={styles.wrapper}>
        <Loader active inline="centered" size="small" />
      </Tab.Pane>
    );
  }

  if (fetchError) {
    return (
      <Tab.Pane attached={false} className={styles.wrapper}>
        <Message error content={getErrorMessage(fetchError, t)} />
      </Tab.Pane>
    );
  }

  if (!gitlabIntegration) {
    return (
      <Tab.Pane attached={false} className={styles.wrapper}>
        <LinkForm />
      </Tab.Pane>
    );
  }

  const testedGitlabProject = connectionTestResult && connectionTestResult.gitlabProject;

  return (
    <Tab.Pane attached={false} className={styles.wrapper}>
      <div className={styles.text}>{t('common.linkedGitlabProject')}</div>
      <div className={styles.projectPath}>
        {testedGitlabProject && testedGitlabProject.webUrl ? (
          <a href={testedGitlabProject.webUrl} target="_blank" rel="noopener noreferrer">
            {gitlabIntegration.gitlabProjectPath}
          </a>
        ) : (
          gitlabIntegration.gitlabProjectPath
        )}
      </div>
      <Button
        type="button"
        content={t('action.testConnection')}
        loading={isConnectionTesting}
        disabled={isConnectionTesting}
        onClick={handleTestConnectionClick}
      />
      {connectionTestResult &&
        (connectionTestResult.error ? (
          <Message
            error
            content={getErrorMessage(connectionTestResult.error, t)}
            className={styles.message}
          />
        ) : (
          <Message
            positive
            content={t('common.connectionOk', {
              project: testedGitlabProject.pathWithNamespace,
            })}
            className={styles.message}
          />
        ))}
      {gitlabIntegration.lastSyncedAt && (
        <div className={styles.lastSynchronization}>
          {t('common.lastSynchronization', {
            date: t('format:dateTime', {
              value: gitlabIntegration.lastSyncedAt,
              postProcess: 'formatDate',
            }),
          })}
        </div>
      )}
      <Divider section />
      <SettingsForm key={gitlabIntegration.id} gitlabIntegration={gitlabIntegration} />
      <Divider horizontal section>
        <Header as="h4">
          {t('common.webhook', {
            context: 'title',
          })}
        </Header>
      </Divider>
      <WebhookSection gitlabIntegration={gitlabIntegration} />
      <Divider horizontal section>
        <Header as="h4">
          {t('common.dangerZone', {
            context: 'title',
          })}
        </Header>
      </Divider>
      <div className={styles.action}>
        <ConfirmationPopup
          title="common.unlinkGitlabProject"
          content="common.areYouSureYouWantToUnlinkThisGitlabProject"
          buttonContent="action.unlinkGitlabProject"
          onConfirm={handleUnlinkConfirm}
        >
          <Button disabled={isDeleting} className={styles.actionButton}>
            {t('action.unlinkGitlabProject', {
              context: 'title',
            })}
          </Button>
        </ConfirmationPopup>
      </div>
      {deleteError && (
        <Message error content={getErrorMessage(deleteError, t)} className={styles.message} />
      )}
    </Tab.Pane>
  );
});

export default GitLabPane;
