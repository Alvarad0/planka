const { expect } = require('chai');
const { encrypt, decrypt } = require('../../utils/secret-box');

const SECRET = 'test-secret-key';
const CONTEXT = 'planka:test';
const PLAINTEXT = 'glpat-secret-box-token';

const options = { secret: SECRET, context: CONTEXT };

// Flips one bit of a base64 part of an encrypted value
const tamper = (payload, index) => {
  const parts = payload.split(':');
  const buffer = Buffer.from(parts[index], 'base64');
  buffer[0] ^= 1; // eslint-disable-line no-bitwise
  parts[index] = buffer.toString('base64');

  return parts.join(':');
};

describe('secret box', () => {
  it('round-trips a value', () => {
    expect(decrypt(encrypt(PLAINTEXT, options), options)).to.equal(PLAINTEXT);
  });

  it('produces a versioned value without the plaintext', () => {
    const payload = encrypt(PLAINTEXT, options);

    expect(payload).to.match(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(payload).to.not.include(PLAINTEXT);
  });

  it('uses a random IV, so equal values encrypt differently', () => {
    expect(encrypt(PLAINTEXT, options)).to.not.equal(encrypt(PLAINTEXT, options));
  });

  it('rejects a tampered ciphertext, tag or IV', () => {
    const payload = encrypt(PLAINTEXT, options);

    [1, 2, 3].forEach((index) => {
      expect(() => decrypt(tamper(payload, index), options)).to.throw('could not be decrypted');
    });
  });

  it('rejects a value encrypted with another key or context', () => {
    const payload = encrypt(PLAINTEXT, options);

    expect(() => decrypt(payload, { ...options, secret: 'other-secret' })).to.throw(
      'could not be decrypted',
    );
    expect(() => decrypt(payload, { ...options, context: 'planka:other' })).to.throw(
      'could not be decrypted',
    );
  });

  it('rejects malformed values without exposing them', () => {
    ['', 'plaintext', 'v2:a:b:c', 'v1:a:b', null].forEach((payload) => {
      expect(() => decrypt(payload, options)).to.throw('Unsupported encrypted value format');
    });
  });

  it('requires a secret and a context', () => {
    expect(() => encrypt(PLAINTEXT, { context: CONTEXT })).to.throw('Secret key is not set');
    expect(() => encrypt(PLAINTEXT, { secret: SECRET })).to.throw('context is not set');
  });
});
