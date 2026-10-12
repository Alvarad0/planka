/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import entryActions from '../../../entry-actions';
import { AttachmentTypes } from '../../../constants/Enums';

// Keeps only the path (+ query) of the server-provided URL, exactly as encoded by the server, so
// the inserted markdown does not depend on BASE_URL and stays same-origin (the attachment route is
// authenticated by a sameSite=strict cookie)
export const toRelativeUrl = (url) => {
  const { pathname, search } = new URL(url);
  return `${pathname}${search}`;
};

// Uploads an image from the markdown editor as an attachment of the current card, through the
// regular attachment flow (store, error toasts, socket dedup), and resolves to what the editor
// inserts. Rejects (so nothing is inserted) when the upload fails.
const uploadImageAsAttachment = (dispatch, file) =>
  new Promise((resolve, reject) => {
    dispatch(
      entryActions.createAttachmentInCurrentCard(
        {
          file,
          type: AttachmentTypes.FILE,
          name: file.name,
        },
        {
          onSuccess: resolve,
          onFailure: (error) => {
            reject(
              error instanceof Error
                ? error
                : new Error((error && error.message) || 'Upload failed'),
            );
          },
        },
      ),
    );
  }).then((attachment) => ({
    url: toRelativeUrl(attachment.data.url),
    name: attachment.name,
  }));

export default uploadImageAsAttachment;
