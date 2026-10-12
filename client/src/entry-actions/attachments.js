/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import EntryActionTypes from '../constants/EntryActionTypes';

// `callbacks` ({ onSuccess(attachment), onFailure(error) }) is optional and lets
// non-redux consumers (e.g. the markdown editor image upload) await the result
const createAttachmentInCurrentCard = (data, callbacks) => ({
  type: EntryActionTypes.ATTACHMENT_IN_CURRENT_CARD_CREATE,
  payload: {
    data,
    callbacks,
  },
});

const handleAttachmentCreate = (attachment, requestId) => ({
  type: EntryActionTypes.ATTACHMENT_CREATE_HANDLE,
  payload: {
    attachment,
    requestId,
  },
});

const updateAttachment = (id, data) => ({
  type: EntryActionTypes.ATTACHMENT_UPDATE,
  payload: {
    id,
    data,
  },
});

const handleAttachmentUpdate = (attachment) => ({
  type: EntryActionTypes.ATTACHMENT_UPDATE_HANDLE,
  payload: {
    attachment,
  },
});

const deleteAttachment = (id) => ({
  type: EntryActionTypes.ATTACHMENT_DELETE,
  payload: {
    id,
  },
});

const handleAttachmentDelete = (attachment) => ({
  type: EntryActionTypes.ATTACHMENT_DELETE_HANDLE,
  payload: {
    attachment,
  },
});

export default {
  createAttachmentInCurrentCard,
  handleAttachmentCreate,
  updateAttachment,
  handleAttachmentUpdate,
  deleteAttachment,
  handleAttachmentDelete,
};
