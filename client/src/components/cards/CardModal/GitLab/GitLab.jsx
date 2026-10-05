import React, { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Label, Message } from 'semantic-ui-react';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import { usePopupInClosableContext } from '../../../../hooks';
import { isListArchiveOrTrash } from '../../../../utils/record-helpers';
import getGitlabErrorMessage from '../../../../utils/get-gitlab-error-message';
import { BoardMembershipRoles } from '../../../../constants/Enums';
import ConfirmationStep from '../../../common/ConfirmationStep';
import CreateIssueStep from './CreateIssueStep';
import LinkIssueStep from './LinkIssueStep';

import styles from './GitLab.module.scss';

const IssueStates = {
  OPENED: 'opened',
  CLOSED: 'closed',
};

// Issue URLs look like <base>/<project path>/-/issues/<iid>
const getProjectPathFromIssueUrl = (issueUrl) => {
  try {
    const [projectPath] = new URL(issueUrl).pathname.split('/-/');
    return projectPath.replace(/^\/+/, '') || null;
  } catch {
    return null;
  }
};

const GitLab = React.memo(() => {
  const selectListById = useMemo(() => selectors.makeSelectListById(), []);

  const card = useSelector(selectors.selectCurrentCard);
  const gitlabCardLink = useSelector(selectors.selectGitlabCardLinkForCurrentCard);

  const {
    cardId,
    gitlabIntegration,
    gitlabIssue,
    isStale,
    isProjectMismatch,
    isFetched,
    fetchError,
    isCreating,
    createError,
    isLinking,
    linkError,
    isUnlinking,
    unlinkError,
  } = useSelector(selectors.selectGitlabCardLinkState);

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
    dispatch(entryActions.fetchGitlabCardLinkInCurrentCard());
  }, [card.id, dispatch]);

  const handleCreateIssueConfirm = useCallback(() => {
    dispatch(entryActions.createGitlabIssueForCurrentCard());
  }, [dispatch]);

  const handleLinkIssue = useCallback(
    (data) => {
      dispatch(entryActions.linkGitlabIssueToCurrentCard(data));
    },
    [dispatch],
  );

  const handleUnlinkConfirm = useCallback(() => {
    dispatch(entryActions.unlinkGitlabIssueFromCurrentCard());
  }, [dispatch]);

  const CreateIssuePopup = usePopupInClosableContext(CreateIssueStep);
  const LinkIssuePopup = usePopupInClosableContext(LinkIssueStep);
  const ConfirmationPopup = usePopupInClosableContext(ConfirmationStep);

  // Nothing is rendered until the first fetch for this card completes, to avoid layout flicker
  if (cardId !== card.id || !isFetched) {
    return null;
  }

  if (!gitlabIntegration && !gitlabCardLink && !fetchError) {
    return null;
  }

  const isSubmitting = isCreating || isLinking || isUnlinking;
  const requestError = createError || linkError || unlinkError;

  let issue = null;
  if (gitlabCardLink) {
    // Without a live issue (e.g. linked from another session) the link's snapshot is shown
    issue =
      gitlabIssue && gitlabIssue.iid === gitlabCardLink.issueIid
        ? gitlabIssue
        : {
            iid: gitlabCardLink.issueIid,
            ...(gitlabCardLink.snapshot && {
              title: gitlabCardLink.snapshot.title,
              state: gitlabCardLink.snapshot.state,
            }),
          };
  }

  const issueUrl = (issue && issue.webUrl) || (gitlabCardLink && gitlabCardLink.issueUrl);
  const linkedProjectPath = gitlabCardLink && getProjectPathFromIssueUrl(gitlabCardLink.issueUrl);

  return (
    <div className={styles.contentModule}>
      <div className={styles.moduleWrapper}>
        <Icon name="gitlab" className={styles.moduleIcon} />
        <div className={styles.moduleHeader}>
          {t('common.gitlab', {
            context: 'title',
          })}
        </div>
        {fetchError && (
          <Message error size="small" content={getGitlabErrorMessage(fetchError, t)} />
        )}
        {issue && (
          <>
            <div className={styles.issue}>
              <a
                href={issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.issueLink}
              >
                <span className={styles.issueNumber}>
                  {t('common.issueNumberWithIid', {
                    iid: issue.iid,
                  })}
                </span>
                {issue.title && <span className={styles.issueTitle}>{issue.title}</span>}
              </a>
              {issue.state && (
                <Label
                  size="tiny"
                  color={issue.state === IssueStates.CLOSED ? 'blue' : 'green'}
                  className={styles.issueState}
                >
                  {issue.state === IssueStates.CLOSED
                    ? t('common.gitlabIssueClosed')
                    : t('common.gitlabIssueOpen')}
                </Label>
              )}
            </div>
            {isStale && (
              <div className={styles.warning}>
                <Icon name="warning sign" />
                {t('common.gitlabIsUnavailable')}
                {gitlabCardLink.lastSyncedAt &&
                  ` · ${t('common.lastSynchronization', {
                    date: t('format:dateTime', {
                      value: gitlabCardLink.lastSyncedAt,
                      postProcess: 'formatDate',
                    }),
                  })}`}
              </div>
            )}
            {isProjectMismatch && (
              <div className={styles.warning}>
                <Icon name="warning sign" />
                {linkedProjectPath
                  ? t('common.cardWasMovedFromProjectLinkedToGitlabProject', {
                      project: linkedProjectPath,
                    })
                  : t('common.cardWasMovedFromProjectLinkedToAnotherGitlabProject')}
              </div>
            )}
            <div className={styles.actions}>
              {issueUrl && (
                <a
                  href={issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.actionLink}
                >
                  <Icon name="external alternate" />
                  {t('action.openInGitlab')}
                </a>
              )}
              {canEdit && (
                <ConfirmationPopup
                  title="common.unlinkGitlabIssue"
                  content="common.areYouSureYouWantToUnlinkThisCardFromGitlabIssue"
                  buttonContent="action.unlinkGitlabIssue"
                  onConfirm={handleUnlinkConfirm}
                >
                  <Button
                    content={t('action.unlink')}
                    loading={isUnlinking}
                    disabled={isSubmitting}
                    className={styles.actionButton}
                  />
                </ConfirmationPopup>
              )}
            </div>
          </>
        )}
        {!gitlabCardLink &&
          gitlabIntegration &&
          (canEdit ? (
            <div className={styles.actions}>
              <CreateIssuePopup
                gitlabProjectPath={gitlabIntegration.gitlabProjectPath}
                onConfirm={handleCreateIssueConfirm}
              >
                <Button
                  icon="plus"
                  content={t('action.createIssue')}
                  loading={isCreating}
                  disabled={isSubmitting}
                  className={styles.actionButton}
                />
              </CreateIssuePopup>
              <LinkIssuePopup onLink={handleLinkIssue}>
                <Button
                  icon="linkify"
                  content={t('action.linkIssue')}
                  loading={isLinking}
                  disabled={isSubmitting}
                  className={styles.actionButton}
                />
              </LinkIssuePopup>
            </div>
          ) : (
            <div className={styles.text}>{t('common.notLinkedToGitlabIssue')}</div>
          ))}
        {requestError && (
          <Message
            error
            size="small"
            content={getGitlabErrorMessage(requestError, t)}
            className={styles.message}
          />
        )}
      </div>
    </div>
  );
});

export default GitLab;
