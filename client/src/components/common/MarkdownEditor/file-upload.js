/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

export const fileToBase64Data = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });

export const isImageFile = (file) => !!file.type && file.type.startsWith('image/');

// Builds the editor `uploadFile` handler. `getImageUploader` returns the current image uploader
// (a function resolving to `{ url, name? }`) or a falsy value when there is none (no card context
// or no rights to add attachments). Images go through the uploader when available; everything
// else keeps the inline base64 behaviour.
export const createFileUploadHandler = (getImageUploader) => async (file) => {
  const uploadImage = getImageUploader();

  if (uploadImage && isImageFile(file)) {
    return uploadImage(file);
  }

  const base64Data = await fileToBase64Data(file);
  return { url: base64Data };
};
