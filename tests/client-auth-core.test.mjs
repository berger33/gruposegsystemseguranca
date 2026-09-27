import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMON_PASSWORDS,
  CONFIRM_EMAIL_TTL_MS,
  INVITE_TTL_MS,
  LOGIN_DELAY_TIERS_SECONDS,
  LOGIN_FAILURE_RESET_MS,
  LOGIN_FREE_ATTEMPTS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_TTL_MS,
  RESEND_MAX_PER_ADDRESS_24H,
  RESEND_MIN_INTERVAL_MS,
  generateToken,
  hashOrigin,
  hashPassword,
  hashToken,
  loginThrottleDelaySeconds,
  normalizeEmail,
  resendPolicyAllows,
  throttleShouldReset,
  validatePasswordPolicy,
  verifyPassword,
} from "../src/lib/client-auth-core.mjs";

test("password policy requires at least 12 characters without artificial composition rules", () => {
  assert.deepEqual(validatePasswordPolicy("curta123"), { ok: false, error: "password_too_short" });
  assert.deepEqual(validatePasswordPolicy(undefined), { ok: false, error: "password_required" });
  const passphrase = "amarelo janela tecido pedra";
  assert.equal(validatePasswordPolicy(passphrase).ok, true);
  assert.equal("a".repeat(PASSWORD_MIN_LENGTH).length, 12);
  assert.deepEqual(validatePasswordPolicy("x".repeat(PASSWORD_MAX_LENGTH + 1)), { ok: false, error: "password_too_long" });
});

test("password policy rejects common passwords, digit-only, repeated chars and sequences", () => {
  for (const common of COMMON_PASSWORDS) {
    assert.equal(validatePasswordPolicy(common).ok, false, `common password accepted: ${common}`);
    assert.equal(validatePasswordPolicy(common).error, "password_common");
  }
  assert.deepEqual(validatePasswordPolicy("98765432109876"), { ok: false, error: "password_common" });
  assert.deepEqual(validatePasswordPolicy("aaaaaaaaaaaa"), { ok: false, error: "password_common" });
  assert.deepEqual(validatePasswordPolicy("abcdefghijklm"), { ok: false, error: "password_common" });
  assert.equal(validatePasswordPolicy("Aro! vento 42 subida").ok, true);
});

test("email normalization trims, lowercases and rejects malformed addresses", () => {
  assert.deepEqual(normalizeEmail("  Ana.SILVA@exemplo.COM "), { value: "ana.silva@exemplo.com" });
  assert.equal(normalizeEmail("sem-arroba").error, "invalid_email");
  assert.equal(normalizeEmail("dois@@exemplo.com").error, "invalid_email");
  assert.equal(normalizeEmail("sem@dominio").error, "invalid_email");
  assert.equal(normalizeEmail("").error, "invalid_email");
  assert.equal(normalizeEmail(42).error, "invalid_email");
  assert.equal(normalizeEmail(`${"a".repeat(250)}@x.co`).error, "invalid_email");
  assert.deepEqual(normalizeEmail("demo.cliente+teste@exemplo.invalid"), { value: "demo.cliente+teste@exemplo.invalid" });
});

test("tokens are high entropy and only the sha256 hash is storable", () => {
  const first = generateToken();
  const second = generateToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 40);
  const digest = hashToken(first);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.notEqual(digest, first);
  assert.equal(hashToken(first), digest);
  assert.equal(hashOrigin("10.0.0.8").length, 64);
  assert.notEqual(hashOrigin("10.0.0.8"), hashOrigin("10.0.0.9"));
});

test("scrypt hash embeds parameters and verifies only the right password", async () => {
  const stored = await hashPassword("Semente azul 77 trilha");
  const [format, n, r, p, keylen, salt, key] = stored.split("$");
  assert.equal(format, "s1");
  assert.equal(Number(n), 16384);
  assert.equal(Number(r), 8);
  assert.equal(Number(p), 1);
  assert.equal(Number(keylen), 64);
  assert.ok(salt.length > 10);
  assert.ok(key.length > 40);
  assert.equal(await verifyPassword("Semente azul 77 trilha", stored), true);
  assert.equal(await verifyPassword("senha errada aqui", stored), false);
});

test("verifyPassword refuses malformed stored hashes instead of throwing", async () => {
  assert.equal(await verifyPassword("qualquer senha aqui", "formato-desconhecido"), false);
  assert.equal(await verifyPassword("qualquer senha aqui", null), false);
  assert.equal(await verifyPassword("qualquer senha aqui", "s1$0$8$1$64$c2FsdA$a2V5"), false);
  assert.equal(await verifyPassword("qualquer senha aqui", "s1$16384$8$1$64$%%%$a2V5"), false);
});

test("login throttling keeps five free attempts then applies progressive delays", () => {
  assert.equal(LOGIN_FREE_ATTEMPTS, 5);
  for (let failures = 1; failures <= 5; failures += 1) {
    assert.equal(loginThrottleDelaySeconds(failures), 0);
  }
  assert.equal(loginThrottleDelaySeconds(6), 60);
  assert.equal(loginThrottleDelaySeconds(7), 300);
  assert.equal(loginThrottleDelaySeconds(8), 900);
  assert.equal(loginThrottleDelaySeconds(25), 900);
  assert.deepEqual([...LOGIN_DELAY_TIERS_SECONDS], [60, 300, 900]);
});

test("login attempt counter resets after 24 hours without failures", () => {
  const now = Date.now();
  assert.equal(throttleShouldReset(now - LOGIN_FAILURE_RESET_MS + 1000, now), false);
  assert.equal(throttleShouldReset(now - LOGIN_FAILURE_RESET_MS - 1000, now), true);
  assert.equal(throttleShouldReset(null, now), true);
  assert.equal(throttleShouldReset(undefined, now), true);
});

test("link resend policy caps five per address per 24h with a two minute interval", () => {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  assert.equal(resendPolicyAllows([], now), true);
  assert.equal(resendPolicyAllows([now - RESEND_MIN_INTERVAL_MS - 1000], now), true);
  assert.equal(resendPolicyAllows([now - 30 * 1000, now - hour], now), false, "must respect the 2 minute interval");
  const five = [0.5, 2, 5, 9, 20].map(hours => now - hours * hour);
  assert.equal(resendPolicyAllows(five, now), false, "must cap at five per 24h");
  assert.equal(RESEND_MAX_PER_ADDRESS_24H, 5);
  const four = [2, 5, 9, 20].map(hours => now - hours * hour);
  assert.equal(resendPolicyAllows(four, now), true);
  const oldOnly = [now - 26 * hour];
  assert.equal(resendPolicyAllows(oldOnly, now), true, "entries older than 24h do not count");
});

test("decision-derived validity windows stay aligned with the portal document", () => {
  assert.equal(INVITE_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(CONFIRM_EMAIL_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(PASSWORD_RESET_TTL_MS, 60 * 60 * 1000);
});
