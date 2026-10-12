import { createFileUploadHandler, isImageFile } from './file-upload';

class FileReaderMock {
  readAsDataURL(file) {
    this.result = `data:${file.type};base64,BASE64`;
    setTimeout(() => this.onload());
  }
}

const makeFile = (type) => ({ name: `file.${type.split('/')[1]}`, type });

describe('isImageFile', () => {
  test('detects image mime types', () => {
    expect(isImageFile(makeFile('image/png'))).toBe(true);
    expect(isImageFile(makeFile('application/pdf'))).toBe(false);
    expect(isImageFile({ name: 'unknown', type: '' })).toBe(false);
  });
});

describe('createFileUploadHandler', () => {
  beforeEach(() => {
    global.FileReader = FileReaderMock;
  });

  afterEach(() => {
    delete global.FileReader;
  });

  test('uploads images through the image uploader when available', async () => {
    const uploadImage = jest
      .fn()
      .mockResolvedValue({ url: 'https://planka/attachments/1/download/a.png' });
    const handler = createFileUploadHandler(() => uploadImage);
    const file = makeFile('image/png');

    await expect(handler(file)).resolves.toEqual({
      url: 'https://planka/attachments/1/download/a.png',
    });
    expect(uploadImage).toHaveBeenCalledWith(file);
  });

  test('falls back to base64 for images when there is no image uploader', async () => {
    const handler = createFileUploadHandler(() => undefined);

    await expect(handler(makeFile('image/png'))).resolves.toEqual({
      url: 'data:image/png;base64,BASE64',
    });
  });

  test('keeps base64 for non-image files even with an image uploader', async () => {
    const uploadImage = jest.fn();
    const handler = createFileUploadHandler(() => uploadImage);

    await expect(handler(makeFile('application/pdf'))).resolves.toEqual({
      url: 'data:application/pdf;base64,BASE64',
    });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  test('propagates upload failures so nothing is inserted', async () => {
    const handler = createFileUploadHandler(() => () => Promise.reject(new Error('Upload failed')));

    await expect(handler(makeFile('image/png'))).rejects.toThrow('Upload failed');
  });

  test('reads the current image uploader on every call', async () => {
    let uploadImage;
    const handler = createFileUploadHandler(() => uploadImage);

    await expect(handler(makeFile('image/png'))).resolves.toEqual({
      url: 'data:image/png;base64,BASE64',
    });

    uploadImage = jest.fn().mockResolvedValue({ url: 'https://planka/a.png' });

    await expect(handler(makeFile('image/png'))).resolves.toEqual({ url: 'https://planka/a.png' });
  });
});
