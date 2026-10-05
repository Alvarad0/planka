import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Commits from './Commits';
import CreateBranchStep from './CreateBranchStep';
import CreateIssueStep from './CreateIssueStep';
import LinkIssueStep from './LinkIssueStep';

import styles from './GitLab.module.scss';

const IssueStates = {
  OPENED: 'opened',
  CLOSED: 'closed',
};

const MergeRequestStates = {
  OPENED: 'opened',
  MERGED: 'merged',
  CLOSED: 'closed',
};

const MERGE_REQUEST_STATE_PROPS_BY_STATE = {
  [MergeRequestStates.OPENED]: {
    color: 'green',
    key: 'common.gitlabMergeRequestOpen',
  },
  [MergeRequestStates.MERGED]: {
    color: 'purple',
    key: 'common.gitlabMergeRequestMerged',
  },
  [MergeRequestStates.CLOSED]: {
    color: 'red',
    key: 'common.gitlabMergeRequestClosed',
  },
};

// Unknown statuses are shown as they come, without a colour
const PIPELINE_STATUS_PROPS_BY_STATUS = {
  success: {
    color: 'green',
    key: 'common.gitlabPipelineSuccess',
  },
  failed: {
    color: 'red',
    key: 'common.gitlabPipelineFailed',
  },
  running: {
    color: 'blue',
    key: 'common.gitlabPipelineRunning',
  },
  pending: {
    color: 'yellow',
    key: 'common.gitlabPipelinePending',
  },
  canceled: {
    color: 'grey',
    key: 'common.gitlabPipelineCanceled',
  },
  skipped: {
    color: 'grey',
    key: 'common.gitlabPipelineSkipped',
  },
};

const COPIED_STATE_DURATION = 1000;

const buildCheckoutCommand = (branchName) => `git fetch origin && git checkout ${branchName}`;

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
    gitlabMergeRequest,
    gitlabPipeline,
    commitsCount,
    hasMoreCommits,
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
    suggestedBranchName,
    defaultBranch,
    isCreatingBranch,
    createBranchError,
    isCreatingMergeRequest,
    createMergeRequestError,
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

  const [isCheckoutCommandCopied, setIsCheckoutCommandCopied] = useState(false);
  const copiedTimeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(copiedTimeoutRef.current), []);

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

  const handleCreateBranch = useCallback(
    (data) => {
      dispatch(entryActions.createGitlabBranchForCurrentCard(data));
    },
    [dispatch],
  );

  const handleCreateMergeRequestClick = useCallback(() => {
    dispatch(entryActions.createGitlabMergeRequestForCurrentCard());
  }, [dispatch]);

  const branchName = gitlabCardLink ? gitlabCardLink.branchName : null;

  const handleCopyCheckoutCommandClick = useCallback(() => {
    navigator.clipboard.writeText(buildCheckoutCommand(branchName));
    setIsCheckoutCommandCopied(true);

    clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(
      () => setIsCheckoutCommandCopied(false),
      COPIED_STATE_DURATION,
    );
  }, [branchName]);

  const CreateIssuePopup = usePopupInClosableContext(CreateIssueStep);
  const LinkIssuePopup = usePopupInClosableContext(LinkIssueStep);
  const CreateBranchPopup = usePopupInClosableContext(CreateBranchStep);
  const ConfirmationPopup = usePopupInClosableContext(ConfirmationStep);

  // Nothing is rendered until the first fetch for this card completes, to avoid layout flicker
  if (cardId !== card.id || !isFetched) {
    return null;
  }

  if (!gitlabIntegration && !gitlabCardLink && !fetchError) {
    return null;
  }

  const isSubmitting =
    isCreating || isLinking || isUnlinking || isCreatingBranch || isCreatingMergeRequest;
  const requestError =
    createError || linkError || unlinkError || createBranchError || createMergeRequestError;

  // Actions that call GitLab are offered only for the link's own project and while it is reachable
  const canUseGitlab = canEdit && !isProjectMismatch && !isStale;

  let issue = null;
  let mergeRequest = null;
  if (gitlabCardLink) {
    // The snapshot is normalized by the API layer, legacy links included
    const { snapshot } = gitlabCardLink;

    // Without a live issue (e.g. linked from another session) the link's snapshot is shown
    issue =
      gitlabIssue && gitlabIssue.iid === gitlabCardLink.issueIid
        ? gitlabIssue
        : {
            iid: gitlabCardLink.issueIid,
            ...(snapshot && {
              title: snapshot.issue.title,
              state: snapshot.issue.state,
            }),
          };

    // Same for a merge request opened from another session, which only updates the snapshot
    if (branchName) {
      mergeRequest = gitlabMergeRequest || (snapshot && snapshot.mergeRequest);
    }
  }

  const mergeRequestStateProps =
    mergeRequest && MERGE_REQUEST_STATE_PROPS_BY_STATE[mergeRequest.state];
  const pipelineStatusProps =
    gitlabPipeline && PIPELINE_STATUS_PROPS_BY_STATUS[gitlabPipeline.status];

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
                {' · '}
                {gitlabCardLink.lastSyncedAt
                  ? t('common.lastSynchronization', {
                      date: t('format:dateTime', {
                        value: gitlabCardLink.lastSyncedAt,
                        postProcess: 'formatDate',
                      }),
                    })
                  : t('common.neverSynchronized')}
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
            <div className={styles.branch}>
              <Icon name="code branch" className={styles.branchIcon} />
              {branchName && (
                <>
                  <code className={styles.branchName}>{branchName}</code>
                  <Button
                    type="button"
                    icon={isCheckoutCommandCopied ? 'check' : 'copy'}
                    title={t('action.copyCheckoutCommand')}
                    aria-label={t('action.copyCheckoutCommand')}
                    className={styles.copyButton}
                    onClick={handleCopyCheckoutCommandClick}
                  />
                  {gitlabCardLink.branchUrl && (
                    <a
                      href={gitlabCardLink.branchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.actionLink}
                    >
                      <Icon name="external alternate" />
                      {t('action.openBranch')}
                    </a>
                  )}
                </>
              )}
              {!branchName && canUseGitlab && (
                <CreateBranchPopup
                  defaultName={suggestedBranchName}
                  defaultRef={defaultBranch}
                  onCreate={handleCreateBranch}
                >
                  <Button
                    icon="code branch"
                    content={t('action.createBranch')}
                    loading={isCreatingBranch}
                    disabled={isSubmitting}
                    className={styles.actionButton}
                  />
                </CreateBranchPopup>
              )}
              {!branchName && !canUseGitlab && (
                <span className={styles.text}>{t('common.noBranchYet')}</span>
              )}
            </div>
            {branchName && (mergeRequest || canUseGitlab) && (
              <div className={styles.row}>
                <Icon name="exchange" className={styles.rowIcon} />
                {mergeRequest ? (
                  <>
                    <a
                      href={mergeRequest.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.issueLink}
                    >
                      <span className={styles.issueNumber}>
                        {t('common.mergeRequestNumberWithIid', {
                          iid: mergeRequest.iid,
                        })}
                      </span>
                      {mergeRequest.title && (
                        <span className={styles.issueTitle}>{mergeRequest.title}</span>
                      )}
                    </a>
                    {mergeRequest.draft && (
                      <Label size="tiny" className={styles.issueState}>
                        {t('common.gitlabMergeRequestDraft')}
                      </Label>
                    )}
                    {mergeRequestStateProps && (
                      <Label
                        size="tiny"
                        color={mergeRequestStateProps.color}
                        className={styles.issueState}
                      >
                        {t(mergeRequestStateProps.key)}
                      </Label>
                    )}
                  </>
                ) : (
                  <Button
                    icon="exchange"
                    content={t('action.createMergeRequest')}
                    loading={isCreatingMergeRequest}
                    disabled={isSubmitting}
                    className={styles.actionButton}
                    onClick={handleCreateMergeRequestClick}
                  />
                )}
              </div>
            )}
            {branchName && gitlabPipeline && (
              <div className={styles.row}>
                <Icon name="rocket" className={styles.rowIcon} />
                <span className={styles.text}>{t('common.pipeline')}</span>
                <Label
                  as={gitlabPipeline.webUrl ? 'a' : undefined}
                  href={gitlabPipeline.webUrl || undefined}
                  target={gitlabPipeline.webUrl ? '_blank' : undefined}
                  rel={gitlabPipeline.webUrl ? 'noopener noreferrer' : undefined}
                  size="tiny"
                  color={pipelineStatusProps ? pipelineStatusProps.color : undefined}
                  className={styles.issueState}
                >
                  {pipelineStatusProps
                    ? t(pipelineStatusProps.key)
                    : String(gitlabPipeline.status || '').replace(/_/g, ' ')}
                </Label>
              </div>
            )}
            {branchName && commitsCount !== null && (
              <Commits count={commitsCount} hasMore={hasMoreCommits} isExpandable={!isStale} />
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
