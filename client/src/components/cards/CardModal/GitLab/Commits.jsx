import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Loader, Message } from 'semantic-ui-react';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import getGitlabErrorMessage from '../../../../utils/get-gitlab-error-message';
import TimeAgo from '../../../common/TimeAgo';

import styles from './Commits.module.scss';

const Commits = React.memo(({ count, hasMore, isExpandable }) => {
  const { gitlabCommits, isFetchingCommits, commitsError } = useSelector(
    selectors.selectGitlabCardLinkState,
  );

  const dispatch = useDispatch();
  const [t] = useTranslation();

  const [isOpened, setIsOpened] = useState(false);

  const handleToggleClick = useCallback(() => {
    // The list is fetched when first opened, and again after a failed fetch
    if (!isOpened && !gitlabCommits && !isFetchingCommits) {
      dispatch(entryActions.fetchGitlabCommitsInCurrentCard());
    }

    setIsOpened(!isOpened);
  }, [isOpened, gitlabCommits, isFetchingCommits, dispatch]);

  const countContent = hasMore
    ? t('common.moreThanCommits', {
        count,
      })
    : t('common.commitsWithCount', {
        count,
      });

  return (
    <>
      <div className={styles.row}>
        <Icon name="history" className={styles.icon} />
        {isExpandable ? (
          <Button
            type="button"
            aria-expanded={isOpened}
            className={styles.toggleButton}
            onClick={handleToggleClick}
          >
            {countContent}
            <Icon name={isOpened ? 'angle up' : 'angle down'} className={styles.toggleIcon} />
          </Button>
        ) : (
          <span className={styles.text}>{countContent}</span>
        )}
      </div>
      {isExpandable && isOpened && (
        <div className={styles.list}>
          {isFetchingCommits && <Loader active inline="centered" size="small" />}
          {!isFetchingCommits && commitsError && (
            <Message error size="small" content={getGitlabErrorMessage(commitsError, t)} />
          )}
          {!isFetchingCommits &&
            !commitsError &&
            gitlabCommits &&
            (gitlabCommits.length > 0 ? (
              gitlabCommits.map((commit) => (
                <div key={commit.id} className={styles.commit}>
                  {commit.webUrl ? (
                    <a
                      href={commit.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.shortId}
                    >
                      {commit.shortId}
                    </a>
                  ) : (
                    <code className={styles.shortId}>{commit.shortId}</code>
                  )}
                  <div className={styles.content}>
                    <div className={styles.title}>{commit.title}</div>
                    <div className={styles.meta}>
                      {commit.authorName}
                      {commit.createdAt instanceof Date && (
                        <>
                          {' · '}
                          <TimeAgo date={commit.createdAt} />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.text}>{t('common.noCommits')}</div>
            ))}
        </div>
      )}
    </>
  );
});

Commits.propTypes = {
  count: PropTypes.number.isRequired,
  hasMore: PropTypes.bool.isRequired,
  isExpandable: PropTypes.bool.isRequired,
};

export default Commits;
