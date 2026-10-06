import React, { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Divider, Header, Icon, Loader, Message, Tab } from 'semantic-ui-react';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import { usePopupInClosableContext } from '../../../../hooks';
import ConfirmationStep from '../../../common/ConfirmationStep';
import LinkForm from './LinkForm';
import SettingsForm from './SettingsForm';
import WebhookSection from './WebhookSection';
import getGitlabErrorMessage from '../../../../utils/get-gitlab-error-message';

import styles from './GitLabPane.module.scss';

const GitLabPane = React.memo(() => {
  const gitlabIntegration = useSelector(selectors.selectGitlabIntegrationForCurrentProject);

  const {
    isFetched,
    fetchError,
    isConnectionTesting,
    connectionTestResult,
    isSyncing,
    syncResult,
    syncError,
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

  const handleSyncClick = useCallback(() => {
    dispatch(entryActions.syncGitlabIntegration(gitlabIntegration.id));
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
        <Message error content={getGitlabErrorMessage(fetchError, t)} />
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
      <Button
        type="button"
        icon={<Icon name="sync" loading={isSyncing} />}
        content={t('action.synchronizeAll')}
        disabled={isSyncing}
        onClick={handleSyncClick}
      />
      {connectionTestResult &&
        (connectionTestResult.error ? (
          <Message
            error
            content={getGitlabErrorMessage(connectionTestResult.error, t)}
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
      {syncResult && (
        <Message
          positive={syncResult.failedCount === 0}
          warning={syncResult.failedCount > 0}
          content={[
            t('common.cardsSynchronized', {
              count: syncResult.syncedCount,
            }),
            t('common.cardsFailedToSynchronize', {
              count: syncResult.failedCount,
            }),
          ].join(', ')}
          className={styles.message}
        />
      )}
      {syncError && (
        <Message error content={getGitlabErrorMessage(syncError, t)} className={styles.message} />
      )}
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
        <Message error content={getGitlabErrorMessage(deleteError, t)} className={styles.message} />
      )}
    </Tab.Pane>
  );
});

export default GitLabPane;
