import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button } from 'semantic-ui-react';
import { Popup } from '../../../../lib/custom-ui';

import styles from './CreateIssueStep.module.scss';

// ConfirmationStep only takes a translation key, while this content needs the project path
const CreateIssueStep = React.memo(({ gitlabProjectPath, onConfirm, onClose }) => {
  const [t] = useTranslation();

  const handleConfirmClick = useCallback(() => {
    onConfirm();
    onClose();
  }, [onConfirm, onClose]);

  return (
    <>
      <Popup.Header>
        {t('common.createGitlabIssue', {
          context: 'title',
        })}
      </Popup.Header>
      <Popup.Content>
        <div className={styles.content}>
          {t('common.thisWillCreateIssueInGitlabProjectWithCardNameAndDescription', {
            project: gitlabProjectPath,
          })}
        </div>
        <Button positive fluid content={t('action.createIssue')} onClick={handleConfirmClick} />
      </Popup.Content>
    </>
  );
});

CreateIssueStep.propTypes = {
  gitlabProjectPath: PropTypes.string.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default CreateIssueStep;
