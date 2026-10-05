import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Message } from 'semantic-ui-react';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import { usePopupInClosableContext } from '../../../../hooks';
import ConfirmationStep from '../../../common/ConfirmationStep';
import CopyableInput from './CopyableInput';
import getGitlabErrorMessage from '../../../../utils/get-gitlab-error-message';

import styles from './WebhookSection.module.scss';

const WebhookSection = React.memo(({ gitlabIntegration }) => {
  const { isWebhookSecretRotating, webhookSecretRotateError } = useSelector(
    selectors.selectGitlabIntegrationState,
  );

  const dispatch = useDispatch();
  const [t] = useTranslation();

  const handleRotateConfirm = useCallback(() => {
    dispatch(entryActions.rotateGitlabIntegrationWebhookSecret(gitlabIntegration.id));
  }, [gitlabIntegration.id, dispatch]);

  const ConfirmationPopup = usePopupInClosableContext(ConfirmationStep);

  return (
    <>
      <div className={styles.text}>{t('common.webhookUrl')}</div>
      <CopyableInput value={gitlabIntegration.webhookUrl} className={styles.field} />
      {gitlabIntegration.webhookSecret && (
        <Message warning className={styles.secretMessage}>
          <Message.Header>
            {t('common.newWebhookSecret', {
              context: 'title',
            })}
          </Message.Header>
          <p>{t('common.copyThisSecretNowItWillNotBeShownAgain')}</p>
          <CopyableInput value={gitlabIntegration.webhookSecret} />
        </Message>
      )}
      <ConfirmationPopup
        title="common.rotateWebhookSecret"
        content="common.areYouSureYouWantToRotateTheWebhookSecret"
        buttonContent="action.rotateWebhookSecret"
        onConfirm={handleRotateConfirm}
      >
        <Button
          type="button"
          content={t('action.rotateSecret')}
          loading={isWebhookSecretRotating}
          disabled={isWebhookSecretRotating}
        />
      </ConfirmationPopup>
      {webhookSecretRotateError && (
        <Message
          error
          content={getGitlabErrorMessage(webhookSecretRotateError, t)}
          className={styles.message}
        />
      )}
    </>
  );
});

WebhookSection.propTypes = {
  gitlabIntegration: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
};

export default WebhookSection;
