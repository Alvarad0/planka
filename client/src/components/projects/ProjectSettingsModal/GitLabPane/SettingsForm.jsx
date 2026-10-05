import pickBy from 'lodash/pickBy';
import React, { useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Dropdown, Form, Input, Message } from 'semantic-ui-react';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import { useForm } from '../../../../hooks';
import { ListTypes } from '../../../../constants/Enums';
import getGitlabErrorMessage from '../../../../utils/get-gitlab-error-message';

import styles from './SettingsForm.module.scss';

const buildListDropdownOptions = (listOptions, type) =>
  listOptions
    .filter((listOption) => listOption.type === type)
    .map((listOption) => ({
      text: `${listOption.boardName} / ${listOption.name}`,
      value: listOption.id,
    }));

const SettingsForm = React.memo(({ gitlabIntegration }) => {
  const { listOptions, isUpdating, updateError } = useSelector(
    selectors.selectGitlabIntegrationState,
  );

  const dispatch = useDispatch();
  const [t] = useTranslation();

  const defaultData = useMemo(
    () => ({
      defaultBranch: gitlabIntegration.defaultBranch,
      reviewListId: gitlabIntegration.reviewListId,
      completedListId: gitlabIntegration.completedListId,
      autoMoveOnMrOpen: gitlabIntegration.autoMoveOnMrOpen,
      autoMoveOnMrMerge: gitlabIntegration.autoMoveOnMrMerge,
    }),
    [
      gitlabIntegration.defaultBranch,
      gitlabIntegration.reviewListId,
      gitlabIntegration.completedListId,
      gitlabIntegration.autoMoveOnMrOpen,
      gitlabIntegration.autoMoveOnMrMerge,
    ],
  );

  const [data, handleFieldChange] = useForm(() => ({
    ...defaultData,
    reviewListId: defaultData.reviewListId || '',
    completedListId: defaultData.completedListId || '',
  }));

  const reviewListOptions = useMemo(
    () => buildListDropdownOptions(listOptions, ListTypes.ACTIVE),
    [listOptions],
  );

  const completedListOptions = useMemo(
    () => buildListDropdownOptions(listOptions, ListTypes.CLOSED),
    [listOptions],
  );

  const cleanData = useMemo(() => {
    const reviewListId = data.reviewListId || null;
    const completedListId = data.completedListId || null;

    return {
      // An empty branch is not allowed, so it is treated as unchanged
      defaultBranch: data.defaultBranch.trim() || defaultData.defaultBranch,
      reviewListId,
      completedListId,
      autoMoveOnMrOpen: !!reviewListId && data.autoMoveOnMrOpen,
      autoMoveOnMrMerge: !!completedListId && data.autoMoveOnMrMerge,
    };
  }, [data, defaultData.defaultBranch]);

  const changedData = useMemo(
    () => pickBy(cleanData, (value, fieldName) => value !== defaultData[fieldName]),
    [cleanData, defaultData],
  );

  const isModified = Object.keys(changedData).length > 0;

  const handleSubmit = useCallback(() => {
    if (!isModified) {
      return;
    }

    dispatch(entryActions.updateGitlabIntegration(gitlabIntegration.id, changedData));
  }, [gitlabIntegration.id, dispatch, changedData, isModified]);

  return (
    <>
      <Form onSubmit={handleSubmit}>
        <div className={styles.text}>{t('common.defaultBranch')}</div>
        <Input
          fluid
          name="defaultBranch"
          value={data.defaultBranch}
          maxLength={255}
          readOnly={isUpdating}
          className={styles.field}
          onChange={handleFieldChange}
        />
        <div className={styles.text}>{t('common.reviewList')}</div>
        <Dropdown
          fluid
          selection
          clearable
          name="reviewListId"
          options={reviewListOptions}
          value={data.reviewListId}
          placeholder={t('common.notSet')}
          disabled={isUpdating}
          className={styles.field}
          onChange={handleFieldChange}
        />
        <div className={styles.text}>{t('common.completedList')}</div>
        <Dropdown
          fluid
          selection
          clearable
          name="completedListId"
          options={completedListOptions}
          value={data.completedListId}
          placeholder={t('common.notSet')}
          disabled={isUpdating}
          className={styles.field}
          onChange={handleFieldChange}
        />
        <Checkbox
          name="autoMoveOnMrOpen"
          checked={cleanData.autoMoveOnMrOpen}
          label={t('common.moveCardToReviewListWhenMergeRequestIsOpened')}
          disabled={!cleanData.reviewListId || isUpdating}
          className={styles.checkbox}
          onChange={handleFieldChange}
        />
        <Checkbox
          name="autoMoveOnMrMerge"
          checked={cleanData.autoMoveOnMrMerge}
          label={t('common.moveCardToCompletedListWhenMergeRequestIsMerged')}
          disabled={!cleanData.completedListId || isUpdating}
          className={styles.checkbox}
          onChange={handleFieldChange}
        />
        <Button
          positive
          content={t('action.save')}
          loading={isUpdating}
          disabled={!isModified || isUpdating}
          className={styles.submitButton}
        />
      </Form>
      {updateError && (
        <Message error content={getGitlabErrorMessage(updateError, t)} className={styles.message} />
      )}
    </>
  );
});

SettingsForm.propTypes = {
  gitlabIntegration: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
};

export default SettingsForm;
