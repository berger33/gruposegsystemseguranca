// Senhas com scrypt (sem dependências) e sessões em memória com validade.
import crypto from 'node:crypto';

const KEYLEN = 64;
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const candidate = crypto.scryptSync(String(password), record.salt, KEYLEN);
  const reference = Buffer.from(record.hash, 'hex');
  return reference.length === candidate.length && crypto.timingSafeEqual(candidate, reference);
}

export function createSessions({ now = () => Date.now(), ttl = SESSION_TTL_MS } = {}) {
  const map = new Map();
  return {
    create(userId) {
      const token = crypto.randomBytes(32).toString('hex');
      map.set(token, { userId, expiresAt: now() + ttl });
      return token;
    },
    get(token) {
      const entry = token && map.get(token);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        map.delete(token);
        return null;
      }
      return entry.userId;
    },
    drop(token) {
      if (token) map.delete(token);
    },
    size() {
      return map.size;
    },
  };
}
