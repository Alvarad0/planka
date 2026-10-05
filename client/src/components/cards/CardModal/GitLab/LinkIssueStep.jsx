import React, { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button, Form, Input } from 'semantic-ui-react';
import { Popup } from '../../../../lib/custom-ui';

import { useForm, useNestedRef } from '../../../../hooks';

import styles from './LinkIssueStep.module.scss';

// Upper bound of the IID accepted by the server
const MAX_ISSUE_IID = 2147483647;

// Accepts "8" or "#8"
const parseIssueIid = (value) => {
  const match = value.trim().match(/^#?(\d+)$/);

  if (!match) {
    return null;
  }

  const issueIid = parseInt(match[1], 10);

  if (issueIid < 1 || issueIid > MAX_ISSUE_IID) {
    return null;
  }

  return issueIid;
};

const LinkIssueStep = React.memo(({ onLink, onClose }) => {
  const [t] = useTranslation();

  const [data, handleFieldChange] = useForm({
    issueIid: '',
  });

  const [issueIidFieldRef, handleIssueIidFieldRef] = useNestedRef('inputRef');

  const handleSubmit = useCallback(() => {
    const issueIid = parseIssueIid(data.issueIid);

    if (!issueIid) {
      issueIidFieldRef.current.select();
      return;
    }

    onLink({
      issueIid,
    });

    onClose();
  }, [onLink, onClose, data, issueIidFieldRef]);

  useEffect(() => {
    issueIidFieldRef.current.focus({
      preventScroll: true,
    });
  }, [issueIidFieldRef]);

  return (
    <>
      <Popup.Header>
        {t('common.linkGitlabIssue', {
          context: 'title',
        })}
      </Popup.Header>
      <Popup.Content>
        <Form onSubmit={handleSubmit}>
          <div className={styles.text}>{t('common.issueNumber')}</div>
          <Input
            fluid
            ref={handleIssueIidFieldRef}
            name="issueIid"
            value={data.issueIid}
            placeholder="#8"
            maxLength={11}
            inputMode="numeric"
            autoComplete="off"
            className={styles.field}
            onChange={handleFieldChange}
          />
          <Button positive content={t('action.link')} />
        </Form>
      </Popup.Content>
    </>
  );
});

LinkIssueStep.propTypes = {
  onLink: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default LinkIssueStep;
