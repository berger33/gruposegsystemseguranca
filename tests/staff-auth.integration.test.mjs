// L01 — Gate de identidade/autorização exercitado por HTTP real contra
// PostgreSQL real. Executado por scripts/qa-staff-auth-postgres.mjs, que sobe
// um cluster descartável e injeta DATABASE_URL.
//
// Nada aqui usa SQL para simular o que a API deveria fazer: todo veredito vem
// de uma resposta HTTP do servidor de verdade.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { hashPassword } from '../src/lib/client-auth-core.mjs';
import { randomBytes } from 'node:crypto';

// Chave MFA de 32 bytes, gerada para esta execução. Precisa ser a MESMA no
// processo de teste e no servidor, senão o teste cifra com chave diferente.
const MFA_KEY = randomBytes(32).toString('base64url');
process.env.CLIENT_MFA_ENCRYPTION_KEY = MFA_KEY;
// Limite de tentativas elevado só para a suíte; o teste de throttling abaixo
// verifica o mecanismo explicitamente.
const LOGIN_LIMIT = 200;

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool;

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/admin/session`, { headers: { accept: 'application/json' } });
      if (res.status === 401 || res.status === 200) return true;
    } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('server_did_not_start');
}

before(async () => {
  if (!RUN) return;
  const port = 3000 + Math.floor(Math.random() * 2000);
  baseUrl = `http://127.0.0.1:${port}`;
  // --dev evita depender de um build prévio em .next; as rotas /api são
  // tratadas pelo servidor Node antes do Next, então o teste não compila páginas.
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-staff-auth',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: MFA_KEY,
      ADMIN_LOGIN_MAX_ATTEMPTS: String(LOGIN_LIMIT),
      // Tokens compartilhados configurados de propósito: o teste prova que
      // mesmo configurados eles são recusados.
      SITE_ADMIN_TOKEN_MARCELO: 'x'.repeat(48),
      SITE_ADMIN_TOKEN_TI: 'y'.repeat(48),
      SITE_ADMIN_LEGACY_TOKENS: '',
      QA_PGLITE_ONLY: '',
      OLLAMA_ENABLED: 'false',
      MAIL_HOST: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  await waitForServer(baseUrl);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); server.kill('SIGKILL'); }
});

/** POST com Origin correto (o servidor exige same-origin em mutações). */
function post(pathname, body, cookie) {
  return fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
}

function get(pathname, cookie) {
  return fetch(`${baseUrl}${pathname}`, {
    headers: { accept: 'application/json', ...(cookie ? { cookie } : {}) },
    redirect: 'manual',
  });
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() || [];
  const found = raw.find(c => c.startsWith('seg_admin_session='));
  return found ? found.split(';')[0] : null;
}

/** Cria identidade de staff sintética. Dados fictícios, domínio .invalid. */
async function makeStaff({ role, status = 'active', withProfile = true, password = 'Senha-Sintetica-9!' }) {
  const id = randomUUID();
  const email = `qa-${role || 'noprofile'}-${id.slice(0, 8)}@exemplo.invalid`;
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1,'staff',$2,$3,$4)`,
    [id, email, `QA ${role || 'sem perfil'}`, status],
  );
  await pool.query(
    `INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)`,
    [id, await hashPassword(password)],
  );
  if (withProfile) {
    await pool.query(
      `INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1,$2,'admin_system')`,
      [id, role],
    );
  }
  return { id, email, password };
}

test('SEC-04: identidade de staff SEM perfil não recebe sessão (nem papel admin)', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: null, withProfile: false });
  const res = await post('/api/admin/session', { email: staff.email, password: staff.password });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'staff_profile_missing');
  assert.equal(cookieFrom(res), null, 'nenhum cookie pode ser emitido');
});

test('SEC-04: identidade pending_email não autentica', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: 'ti', status: 'pending_email' });
  const res = await post('/api/admin/session', { email: staff.email, password: staff.password });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'identity_not_active');
  assert.equal(cookieFrom(res), null);
});

test('SEC-04: identidade suspensa não autentica', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: 'ti', status: 'suspended' });
  const res = await post('/api/admin/session', { email: staff.email, password: staff.password });
  assert.equal(res.status, 401);
  assert.equal(cookieFrom(res), null);
});

test('SEC-04: senha errada não autentica', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: 'ti' });
  const res = await post('/api/admin/session', { email: staff.email, password: 'errada' });
  assert.equal(res.status, 401);
  assert.equal(cookieFrom(res), null);
});

test('SEC-04: staff válido recebe sessão com o papel do banco e identidade auditável', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: 'rh' });
  const res = await post('/api/admin/session', { email: staff.email, password: staff.password });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.role, 'rh', 'o papel vem do perfil, não de fallback');
  assert.equal(payload.identityId, staff.id);
  const cookie = cookieFrom(res);
  assert.ok(cookie, 'sessão precisa emitir cookie');

  const me = await get('/api/admin/session', cookie);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).role, 'rh');

  const { rows } = await pool.query(
    `SELECT action, result FROM auth_access_audit WHERE actor_id = $1 AND action = 'staff_login'`, [staff.id]);
  assert.equal(rows.length, 1, 'login precisa identificar a pessoa na auditoria');
  assert.equal(rows[0].result, 'allowed');
});

test('SEC-04: suspender a identidade invalida IMEDIATAMENTE a sessão já emitida', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: 'ti' });
  const login = await post('/api/admin/session', { email: staff.email, password: staff.password });
  const cookie = cookieFrom(login);
  assert.equal((await get('/api/admin/session', cookie)).status, 200);

  await pool.query(`UPDATE auth_identities SET status = 'suspended' WHERE id = $1`, [staff.id]);

  const after = await get('/api/admin/session', cookie);
  assert.equal(after.status, 401, 'cookie assinado não pode sobreviver à suspensão');
});

test('SEC-04: rebaixar o papel invalida a sessão emitida com o papel anterior', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: 'admin' });
  const cookie = cookieFrom(await post('/api/admin/session', { email: staff.email, password: staff.password }));
  assert.equal((await get('/api/admin/session', cookie)).status, 200);

  await pool.query(`UPDATE auth_staff_profiles SET role = 'rh' WHERE identity_id = $1`, [staff.id]);

  assert.equal((await get('/api/admin/session', cookie)).status, 401,
    'sessão de admin não pode continuar valendo após rebaixamento');
});

test('SEC-04: remover o perfil invalida a sessão (sem virar admin)', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: 'ti' });
  const cookie = cookieFrom(await post('/api/admin/session', { email: staff.email, password: staff.password }));
  await pool.query(`DELETE FROM auth_staff_profiles WHERE identity_id = $1`, [staff.id]);
  assert.equal((await get('/api/admin/session', cookie)).status, 401);
});

test('SEC-04: bump de session_epoch derruba todas as sessões da identidade', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: 'ti' });
  const a = cookieFrom(await post('/api/admin/session', { email: staff.email, password: staff.password }));
  const b = cookieFrom(await post('/api/admin/session', { email: staff.email, password: staff.password }));
  assert.equal((await get('/api/admin/session', a)).status, 200);
  assert.equal((await get('/api/admin/session', b)).status, 200);

  await pool.query(`UPDATE auth_identities SET session_epoch = session_epoch + 1 WHERE id = $1`, [staff.id]);

  assert.equal((await get('/api/admin/session', a)).status, 401);
  assert.equal((await get('/api/admin/session', b)).status, 401);
});

test('logout revoga no servidor: o mesmo cookie não volta a valer', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: 'ti' });
  const cookie = cookieFrom(await post('/api/admin/session', { email: staff.email, password: staff.password }));
  const out = await fetch(`${baseUrl}/api/admin/session`, {
    method: 'DELETE', headers: { origin: baseUrl, cookie },
  });
  assert.equal(out.status, 200);
  assert.equal((await get('/api/admin/session', cookie)).status, 401,
    'cópia do cookie precisa morrer junto com o logout');
});

test('SEC-05: token compartilhado é recusado por padrão, mesmo configurado', { skip: !RUN }, async () => {
  const res = await post('/api/admin/session', { token: 'x'.repeat(48) });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'legacy_admin_tokens_disabled');
  assert.equal(cookieFrom(res), null);
});

test('SEC-02: cookie forjado/adulterado não concede sessão', { skip: !RUN }, async () => {
  for (const forged of [
    'seg_admin_session=abc.def',
    `seg_admin_session=${Buffer.from(JSON.stringify({ sid: randomUUID(), exp: Date.now() + 1e7 })).toString('base64url')}.assinaturafalsa`,
    `seg_admin_session=${Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 1e7 })).toString('base64url')}.x`,
  ]) {
    const res = await get('/api/admin/session', forged);
    assert.equal(res.status, 401, `cookie forjado aceito: ${forged.slice(0, 40)}`);
  }
});

test('SEC-02: sessão válida no formato antigo (sem linha no servidor) é negada', { skip: !RUN }, async () => {
  // Uma sessão emitida antes do L01 carregava apenas {role, identityId, exp}.
  // Mesmo que alguém consiga assinar, não há linha em auth_staff_sessions.
  const res = await get('/api/admin/session',
    `seg_admin_session=${Buffer.from(JSON.stringify({ sid: randomUUID(), exp: Date.now() + 1e7 })).toString('base64url')}.qualquer`);
  assert.equal(res.status, 401);
});

test('SEC-02: endpoints administrativos negam sem sessão (amostra ampla)', { skip: !RUN }, async () => {
  const endpoints = [
    '/api/admin/leads', '/api/admin/audit', '/api/admin/rbac/roles',
    '/api/admin/notifications', '/api/admin/backup/status', '/api/admin/ai-rag-documents',
    '/api/crm/companies', '/api/crm/opportunities', '/api/contracts',
    '/api/ops/job-roles', '/api/hr/employees', '/api/fin/receivables',
    '/api/adm/my-day', '/api/ast/stock-items', '/api/ext/fleet-vehicles',
  ];
  const leaked = [];
  for (const endpoint of endpoints) {
    const res = await get(endpoint);
    if (res.status === 200) leaked.push(`${endpoint} -> 200`);
  }
  assert.deepEqual(leaked, [], `endpoint administrativo respondeu sem sessão:\n${leaked.join('\n')}`);
});

test('SEC-06: com MFA ativo, a senha sozinha NÃO emite sessão', { skip: !RUN }, async () => {
  const staff = await makeStaff({ role: 'admin' });
  // Ativa MFA com segredo cifrado pela mesma chave do servidor.
  const { encryptMfaSecret, newMfaSetup } = await import('../src/lib/client-mfa.mjs');
  const setup = newMfaSetup(staff.email);
  await pool.query(
    `INSERT INTO auth_mfa (identity_id, totp_secret_encrypted, recovery_hashes, activated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (identity_id) DO UPDATE SET totp_secret_encrypted = EXCLUDED.totp_secret_encrypted, activated_at = NOW()`,
    [staff.id, encryptMfaSecret(setup.secret, staff.id), []],
  );

  const res = await post('/api/admin/session', { email: staff.email, password: staff.password });
  assert.equal(res.status, 202, 'login com MFA deve devolver desafio, não sessão');
  const payload = await res.json();
  assert.equal(payload.mfaRequired, true);
  assert.ok(payload.challenge, 'desafio precisa existir');
  assert.equal(cookieFrom(res), null, 'nenhum cookie pode ser emitido antes do segundo fator');

  // O desafio sozinho não vale como sessão.
  assert.equal((await get('/api/admin/session', `seg_admin_session=${payload.challenge}`)).status, 401);

  // Código errado é recusado.
  const bad = await post('/api/admin/session/mfa', { challenge: payload.challenge, code: '000000' });
  assert.equal(bad.status, 401);
  assert.equal(cookieFrom(bad), null);
});

test('SEC-06: desafio MFA inválido/inexistente é recusado', { skip: !RUN }, async () => {
  const res = await post('/api/admin/session/mfa', { challenge: 'inexistente', code: '123456' });
  assert.equal(res.status, 401);
  assert.equal(cookieFrom(res), null);
});

test('mutação sem Origin correto é recusada (CSRF)', { skip: !RUN }, async () => {
  const res = await fetch(`${baseUrl}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://evil.invalid' },
    body: JSON.stringify({ email: 'a@exemplo.invalid', password: 'x' }),
  });
  assert.equal(res.status, 403);
});

test('SEC-06: TOTP correto emite sessão; o MESMO código não vale duas vezes', { skip: !RUN }, async () => {
  const { encryptMfaSecret, newMfaSetup } = await import('../src/lib/client-mfa.mjs');
  const { generate } = await import('otplib');
  const staff = await makeStaff({ role: 'admin' });
  const setup = newMfaSetup(staff.email);
  const recovery = 'a1b2c3d4e5f60718293a';
  const { createHash } = await import('node:crypto');
  await pool.query(
    `INSERT INTO auth_mfa (identity_id, totp_secret_encrypted, recovery_hashes, activated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (identity_id) DO UPDATE SET totp_secret_encrypted = EXCLUDED.totp_secret_encrypted,
       recovery_hashes = EXCLUDED.recovery_hashes, activated_at = NOW()`,
    [staff.id, encryptMfaSecret(setup.secret, staff.id), [createHash('sha256').update(recovery).digest('hex')]],
  );

  // 1) senha -> desafio (sem cookie)
  const first = await post('/api/admin/session', { email: staff.email, password: staff.password });
  assert.equal(first.status, 202);
  const { challenge } = await first.json();
  assert.equal(cookieFrom(first), null);

  // 2) TOTP correto -> sessão privilegiada
  const code = await generate({ secret: setup.secret });
  const okRes = await post('/api/admin/session/mfa', { challenge, code: String(code) });
  assert.equal(okRes.status, 200, 'TOTP válido precisa emitir sessão');
  const payload = await okRes.json();
  assert.equal(payload.role, 'admin');
  assert.equal(payload.mfaEnabled, true);
  const cookie = cookieFrom(okRes);
  assert.ok(cookie);
  assert.equal((await get('/api/admin/session', cookie)).status, 200);

  // 3) desafio é de uso único: replay do mesmo desafio é recusado
  const replayChallenge = await post('/api/admin/session/mfa', { challenge, code: String(code) });
  assert.equal(replayChallenge.status, 401, 'desafio já usado não pode ser reaproveitado');

  // 4) novo desafio + MESMO código TOTP -> recusado (proteção de replay por time step)
  const second = await post('/api/admin/session', { email: staff.email, password: staff.password });
  assert.equal(second.status, 202);
  const replay = await post('/api/admin/session/mfa', {
    challenge: (await second.json()).challenge, code: String(code),
  });
  assert.equal(replay.status, 401, 'o mesmo TOTP não pode autenticar duas vezes');
  assert.equal(cookieFrom(replay), null);
});

test('SEC-06: código de recuperação funciona uma única vez', { skip: !RUN }, async () => {
  const { encryptMfaSecret, newMfaSetup } = await import('../src/lib/client-mfa.mjs');
  const { createHash } = await import('node:crypto');
  const staff = await makeStaff({ role: 'ti' });
  const setup = newMfaSetup(staff.email);
  const recovery = '0f1e2d3c4b5a69788796';
  await pool.query(
    `INSERT INTO auth_mfa (identity_id, totp_secret_encrypted, recovery_hashes, activated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (identity_id) DO UPDATE SET totp_secret_encrypted = EXCLUDED.totp_secret_encrypted,
       recovery_hashes = EXCLUDED.recovery_hashes, activated_at = NOW()`,
    [staff.id, encryptMfaSecret(setup.secret, staff.id), [createHash('sha256').update(recovery).digest('hex')]],
  );

  const c1 = (await (await post('/api/admin/session', { email: staff.email, password: staff.password })).json()).challenge;
  const used = await post('/api/admin/session/mfa', { challenge: c1, code: recovery });
  assert.equal(used.status, 200, 'código de recuperação válido precisa autenticar');
  assert.ok(cookieFrom(used));

  const c2 = (await (await post('/api/admin/session', { email: staff.email, password: staff.password })).json()).challenge;
  const reused = await post('/api/admin/session/mfa', { challenge: c2, code: recovery });
  assert.equal(reused.status, 401, 'código de recuperação não pode ser reutilizado');
  assert.equal(cookieFrom(reused), null);
});

test('SEC-06: desafio MFA expira e limita tentativas', { skip: !RUN }, async () => {
  const { encryptMfaSecret, newMfaSetup } = await import('../src/lib/client-mfa.mjs');
  const staff = await makeStaff({ role: 'ti' });
  const setup = newMfaSetup(staff.email);
  await pool.query(
    `INSERT INTO auth_mfa (identity_id, totp_secret_encrypted, recovery_hashes, activated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (identity_id) DO UPDATE SET totp_secret_encrypted = EXCLUDED.totp_secret_encrypted, activated_at = NOW()`,
    [staff.id, encryptMfaSecret(setup.secret, staff.id), []],
  );

  // Limite de tentativas: 5 erros invalidam o desafio.
  const challenge = (await (await post('/api/admin/session', { email: staff.email, password: staff.password })).json()).challenge;
  for (let i = 0; i < 5; i += 1) {
    await post('/api/admin/session/mfa', { challenge, code: '000000' });
  }
  const exhausted = await post('/api/admin/session/mfa', { challenge, code: '000000' });
  assert.equal(exhausted.status, 401);
  assert.equal((await exhausted.json()).error, 'mfa_challenge_invalid', 'desafio deve morrer após 5 tentativas');

  // Expiração: força o vencimento e confirma recusa.
  const fresh = (await (await post('/api/admin/session', { email: staff.email, password: staff.password })).json()).challenge;
  await pool.query(
    `UPDATE auth_mfa_challenges SET expires_at = NOW() - INTERVAL '1 minute' WHERE identity_id = $1 AND used_at IS NULL`,
    [staff.id],
  );
  const expired = await post('/api/admin/session/mfa', { challenge: fresh, code: '123456' });
  assert.equal(expired.status, 401);
  assert.equal(cookieFrom(expired), null);
});

test('rate limiting: excesso de tentativas de login devolve 429 com Retry-After', { skip: !RUN }, async () => {
  // Executado por último de propósito: esgota a janela do IP.
  let throttled = null;
  for (let i = 0; i < LOGIN_LIMIT + 20; i += 1) {
    const res = await post('/api/admin/session', { email: 'inexistente@exemplo.invalid', password: 'x' });
    if (res.status === 429) { throttled = res; break; }
  }
  assert.ok(throttled, `login deveria ser limitado antes de ${LOGIN_LIMIT + 20} tentativas`);
  assert.equal(throttled.headers.get('retry-after'), '900');

  // Com o IP bloqueado, nem credencial válida emite sessão.
  const staff = await makeStaff({ role: 'ti' });
  const blocked = await post('/api/admin/session', { email: staff.email, password: staff.password });
  assert.equal(blocked.status, 429);
  assert.equal(cookieFrom(blocked), null);
});
