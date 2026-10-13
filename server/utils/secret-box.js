// Encryption at rest for secrets stored in the database (e.g. the GitLab token).
//
// AES-256-GCM with a random 12-byte IV per value. The key is derived from SECRET_KEY with HKDF and
// a per-purpose context, so each kind of secret gets its own key. Values are versioned
// (`v1:<iv>:<tag>:<ciphertext>`, base64 parts) to allow changing the scheme later.
//
// Decryption fails (throws) when the value was tampered with or SECRET_KEY changed; callers decide
// how to degrade. Error messages never contain the secret.

const crypto = require('crypto');

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const deriveKey = (secret, context) => {
  if (!secret) {
    throw new Error('Secret key is not set');
  }

  if (!context) {
    throw new Error('Encryption context is not set');
  }

  return Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.alloc(0), context, KEY_LENGTH));
};

const encrypt = (plaintext, { secret, context }) => {
  const key = deriveKey(secret, context);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv, tag, ciphertext].map((part) => part.toString('base64')).join(':');
};

const decrypt = (payload, { secret, context }) => {
  const parts = typeof payload === 'string' ? payload.split(':') : [];

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported encrypted value format');
  }

  const [, iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error('Unsupported encrypted value format');
  }

  const key = deriveKey(secret, context);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (error) {
    throw new Error('Encrypted value could not be decrypted');
  }
};

module.exports = {
  encrypt,
  decrypt,
};
