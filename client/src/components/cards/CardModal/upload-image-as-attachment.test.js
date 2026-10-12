import uploadImageAsAttachment, { toRelativeUrl } from './upload-image-as-attachment';
import EntryActionTypes from '../../../constants/EntryActionTypes';
import { AttachmentTypes } from '../../../constants/Enums';

const file = { name: 'image.png', type: 'image/png' };

describe('uploadImageAsAttachment', () => {
  test('dispatches the regular attachment creation and resolves to the attachment url', async () => {
    const dispatch = jest.fn((action) => {
      action.payload.callbacks.onSuccess({
        id: '1',
        name: 'image.png',
        data: {
          url: 'https://planka/attachments/1/download/image.png',
        },
      });
    });

    await expect(uploadImageAsAttachment(dispatch, file)).resolves.toEqual({
      url: '/attachments/1/download/image.png',
      name: 'image.png',
    });

    const [[action]] = dispatch.mock.calls;
    expect(action.type).toBe(EntryActionTypes.ATTACHMENT_IN_CURRENT_CARD_CREATE);
    expect(action.payload.data).toEqual({
      file,
      type: AttachmentTypes.FILE,
      name: 'image.png',
    });
  });

  test('rejects with an Error when the upload fails', async () => {
    const dispatch = jest.fn((action) => {
      action.payload.callbacks.onFailure({
        code: 'E_UNPROCESSABLE_ENTITY',
        message: 'Upload limit reached',
      });
    });

    await expect(uploadImageAsAttachment(dispatch, file)).rejects.toThrow('Upload limit reached');
  });

  test('keeps Error instances (e.g. network errors) as they are', async () => {
    const error = new TypeError('Failed to fetch');
    const dispatch = jest.fn((action) => {
      action.payload.callbacks.onFailure(error);
    });

    await expect(uploadImageAsAttachment(dispatch, file)).rejects.toBe(error);
  });
});

describe('toRelativeUrl', () => {
  test('keeps the path and query exactly as encoded by the server', () => {
    expect(
      toRelativeUrl('http://192.168.1.10:1337/attachments/1/download/my%20image%20(1).png?v=2'),
    ).toBe('/attachments/1/download/my%20image%20(1).png?v=2');
  });

  test('keeps a sub-path base url prefix', () => {
    expect(toRelativeUrl('https://example.com/planka/attachments/1/download/a.png')).toBe(
      '/planka/attachments/1/download/a.png',
    );
  });
});
