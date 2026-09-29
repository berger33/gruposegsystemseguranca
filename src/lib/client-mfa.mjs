import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';

// A separate durable key, never the session secret. Loss of this key means
// authenticators must be reset by a verified recovery procedure, not bypassed.
export function mfaKey() {
  const text = process.env.CLIENT_MFA_ENCRYPTION_KEY || '';
  const key = Buffer.from(text, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== text) throw new Error('MFA_KEY_NOT_CONFIGURED');
  return key;
}

export function encryptMfaSecret(secret, identityId) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mfaKey(), nonce);
  cipher.setAAD(Buffer.from(identityId));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1:${nonce.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptMfaSecret(encoded, identityId) {
  const [version, iv, tag, data, extra] = String(encoded).split(':');
  if (version !== 'v1' || extra || !iv || !tag || !data) throw new Error('MFA_CIPHERTEXT_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', mfaKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(identityId));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export function newMfaSetup(email) {
  const secret = generateSecret();
  return { secret, uri: generateURI({ issuer: 'Grupo SEG System', label: email, secret }) };
}

export async function verifyMfaCode(encrypted, identityId, code, afterTimeStep = null) {
  if (!/^\d{6}$/.test(code)) return { valid: false };
  const secret = decryptMfaSecret(encrypted, identityId);
  return verify({ secret, token: code, epochTolerance: 30,
    ...(afterTimeStep == null ? {} : { afterTimeStep: Number(afterTimeStep) }) });
}

export function newRecoveryCodes() {
  const codes = Array.from({ length: 8 }, () => randomBytes(10).toString('hex'));
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code) {
  if (!/^[a-f0-9]{20}$/.test(code)) return null;
  return createHash('sha256').update(code).digest('hex');
}
