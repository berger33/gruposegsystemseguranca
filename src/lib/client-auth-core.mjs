// Núcleo de autenticação do portal do cliente: funções puras, sem acesso a banco
// ou rede, para permitir testes unitários rápidos. As regras temporais refletem as
// decisões confirmadas em docs/portal-acesso-e-seguranca.md.

import { createHash, randomBytes, scrypt as scryptAsync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptAsync);

// Senha do cliente: mínimo de 12 caracteres, frases-senha aceitas, sem composição
// artificial. Rejeita senhas comuns; validação deve ocorrer no servidor.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

// Parâmetros do scrypt. O formato persistido embute os parâmetros ("s1$N$r$p$len$...")
// para permitir re-hash futuro sem migração de esquema.
export const SCRYPT_FORMAT = "s1";
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 64;
export const SCRYPT_SALT_BYTES = 16;

// Tokens aleatórios de alta entropia; no banco vai somente o hash SHA-256.
export const TOKEN_BYTES = 32;

// Validades e limites confirmados nas decisões.
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CONFIRM_EMAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const RESEND_MAX_PER_ADDRESS_24H = 5;
export const RESEND_MIN_INTERVAL_MS = 2 * 60 * 1000;
export const LOGIN_FREE_ATTEMPTS = 5;
export const LOGIN_DELAY_TIERS_SECONDS = [60, 300, 900];
export const LOGIN_FAILURE_RESET_MS = 24 * 60 * 60 * 1000;

// Lista enxuta de senhas comuns com 12+ caracteres; complementada por padrões
// (somente dígitos, caractere repetido, sequências óbvias).
export const COMMON_PASSWORDS = Object.freeze([
  "123456789012",
  "1234567890123",
  "111111111111",
  "000000000000",
  "abcdefghijkl",
  "abcd12345678",
  "password1234",
  "password12345",
  "qwerty123456",
  "qwertyuiop12",
  "asdfghjkl123",
  "iloveyou1234",
  "senhasenha12",
  "minhasenha12",
  "batatafrita1",
]);

function isSequentialRun(text, step) {
  for (let index = 1; index < text.length; index += 1) {
    if (text.charCodeAt(index) - text.charCodeAt(index - 1) !== step) return false;
  }
  return true;
}

export function validatePasswordPolicy(password) {
  if (typeof password !== "string") return { ok: false, error: "password_required" };
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, error: "password_too_short" };
  if (password.length > PASSWORD_MAX_LENGTH) return { ok: false, error: "password_too_long" };
  if (/\s/.test(password) && password.trim().length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: "password_too_short" };
  }
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.includes(lowered)) return { ok: false, error: "password_common" };
  if (/^\d+$/.test(password)) return { ok: false, error: "password_common" };
  if (/^(.)\1+$/.test(password)) return { ok: false, error: "password_common" };
  if (lowered.length >= 6 && (isSequentialRun(lowered, 1) || isSequentialRun(lowered, -1))) {
    return { ok: false, error: "password_common" };
  }
  return { ok: true };
}

export function normalizeEmail(candidate) {
  if (typeof candidate !== "string") return { error: "invalid_email" };
  const value = candidate.trim().toLowerCase();
  if (!value || value.length > 254) return { error: "invalid_email" };
  const atIndex = value.indexOf("@");
  if (atIndex <= 0 || atIndex !== value.lastIndexOf("@")) return { error: "invalid_email" };
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (local.length > 64 || !domain || domain.length > 253) return { error: "invalid_email" };
  if (!domain.includes(".")) return { error: "invalid_email" };
  if (/[\s<>()[\]\\,;:"']/.test(value)) return { error: "invalid_email" };
  return { value };
}

export function generateToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

export function hashOrigin(ip) {
  return createHash("sha256").update(String(ip || "unknown"), "utf8").digest("hex");
}

export async function hashPassword(password) {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = await scrypt(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [SCRYPT_FORMAT, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEYLEN, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 7 || parts[0] !== SCRYPT_FORMAT) return false;
  const [, nValue, rValue, pValue, keylenValue, salt, expected] = parts;
  const params = { N: Number(nValue), r: Number(rValue), p: Number(pValue) };
  const keylen = Number(keylenValue);
  if (!Number.isSafeInteger(params.N) || !Number.isSafeInteger(params.r) || !Number.isSafeInteger(params.p) || !Number.isSafeInteger(keylen)) {
    return false;
  }
  if (params.N < 2 || params.N > 2 ** 22 || (params.N & (params.N - 1)) !== 0) return false;
  if (keylen < 16 || keylen > 256) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(salt) || !/^[A-Za-z0-9_-]+$/.test(expected)) return false;
  const expectedBuffer = Buffer.from(expected, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), keylen, params);
  if (key.length !== expectedBuffer.length) return false;
  return timingSafeEqual(key, expectedBuffer);
}

// Espera progressiva após a 5ª falha consecutiva: 1, 5 e 15 minutos nas faixas
// seguintes (decisão do portal). failures já inclui a falha atual.
export function loginThrottleDelaySeconds(consecutiveFailures) {
  if (!Number.isFinite(consecutiveFailures) || consecutiveFailures <= LOGIN_FREE_ATTEMPTS) return 0;
  const tierIndex = Math.min(consecutiveFailures - LOGIN_FREE_ATTEMPTS - 1, LOGIN_DELAY_TIERS_SECONDS.length - 1);
  return LOGIN_DELAY_TIERS_SECONDS[tierIndex];
}

// A contagem zera após login bem-sucedido ou 24 horas sem novas falhas.
export function throttleShouldReset(lastFailureAt, now) {
  if (!lastFailureAt) return true;
  return now - lastFailureAt >= LOGIN_FAILURE_RESET_MS;
}

// Reenvio de links (confirmação e recuperação): até 5 por endereço em 24 horas,
// com intervalo mínimo de 2 minutos; cada novo link invalida o anterior.
export function resendPolicyAllows(recentTimestamps, now) {
  const within24h = recentTimestamps
    .map(value => (value instanceof Date ? value.getTime() : Number(value)))
    .filter(timestamp => Number.isFinite(timestamp) && now - timestamp < 24 * 60 * 60 * 1000);
  if (within24h.length >= RESEND_MAX_PER_ADDRESS_24H) return false;
  const newest = Math.max(...within24h, 0);
  if (newest && now - newest < RESEND_MIN_INTERVAL_MS) return false;
  return true;
}
