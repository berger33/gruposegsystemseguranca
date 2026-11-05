// Supervisor POSIX para gates LOCAIS descartáveis. Nunca é executor de produção.
// O worker tem grupo próprio; somente esse grupo e o mkdtemp deste supervisor
// podem ser encerrados/removidos. A biblioteca embutida fica fora deste processo.
import { fork } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const PG_PHASE_LIMITS = Object.freeze({
  boot: 30_000, initialise: 60_000, start: 30_000, create: 15_000, migrate: 90_000,
  test: 180_000, stop: 10_000, done: 5_000,
});

export async function superviseLocalPg({ entry, args = [], env = process.env,
  limits = PG_PHASE_LIMITS, graceMs = 2_000, cleanupMs = 10_000, log = console.log, cwd = process.cwd() }) {
  if (process.platform === 'win32') throw new Error('pg_supervisor_requires_posix');
  if (env.DATABASE_URL || env.DATABASE_MIGRATION_URL || env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
    return { code: 2, reason: 'remote-or-inherited-url-refused', cleaned: false };
  }
  for (const name of Object.keys(PG_PHASE_LIMITS)) {
    if (!Number.isSafeInteger(limits[name]) || limits[name] < 1) throw new Error('invalid_pg_phase_limit');
  }
  if (!Number.isSafeInteger(graceMs) || graceMs < 1) throw new Error('invalid_pg_grace');
  if (!Number.isSafeInteger(cleanupMs) || cleanupMs < 1) throw new Error('invalid_pg_cleanup_limit');
  const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-pg-supervised-'));
  let child;
  let phase = 'boot';
  let complete = null;
  let phaseTimer, totalTimer;
  let settle;
  let settled = false;
  const outcome = new Promise(resolve => { settle = result => {
    if (!settled) { settled = true; resolve(result); }
  }; });
  const onInt = () => settle({ code: 130, reason: 'signal-SIGINT' });
  const onTerm = () => settle({ code: 143, reason: 'signal-SIGTERM' });
  function arm() {
    clearTimeout(phaseTimer);
    phaseTimer = setTimeout(() => settle({ code: 1, reason: `timeout-${phase}` }), limits[phase]);
  }
  function groupAlive() {
    if (!child?.pid) return false;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  }
  function signalGroup(signal) {
    if (!child?.pid) return;
    try { process.kill(-child.pid, signal); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  async function waitGroup(milliseconds) {
    const deadline = performance.now() + milliseconds;
    while (groupAlive() && performance.now() < deadline) await delay(20);
    return !groupAlive();
  }
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  let result;
  try {
    // O fonts.conf distribuído por @sparticuz/chromium fixa /tmp/fonts,
    // mas o binário e as fontes são extraídos no TMPDIR exclusivo deste worker.
    // Não depender de resíduos de outros gates nem compartilhar cache/fontes.
    const fontConfig = path.join(directory, 'fontconfig');
    await mkdir(fontConfig, { mode: 0o700 });
    const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
    await writeFile(path.join(fontConfig, 'fonts.conf'),
      `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${xml(path.join(directory, 'fonts'))}</dir><cachedir>${xml(path.join(directory, 'fontcache'))}</cachedir></fontconfig>`, { mode: 0o600 });
    child = fork(entry, args, {
      cwd, detached: true,
      env: { ...env, FONTCONFIG_PATH: fontConfig, QA_PG_SUPERVISED: '1', QA_PG_DIRECTORY: directory,
        // initdb também cria arquivo temporário de senha; ele deve ficar no
        // sandbox sob nossa custódia, inclusive em timeout de initialise().
        TMPDIR: directory, TMP: directory, TEMP: directory },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    child.on('message', message => {
      const phases = Object.keys(PG_PHASE_LIMITS);
      if (message?.type === 'phase' && phases.includes(message.name)
          && phases.indexOf(message.name) > phases.indexOf(phase)) {
        phase = message.name; arm();
      }
      if (message?.type === 'complete' && Number.isInteger(message.code) && message.code >= 0 && message.code <= 255) complete = message.code;
    });
    child.once('error', () => settle({ code: 1, reason: 'worker-spawn-error' }));
    child.once('exit', (code, signal) => settle({
      code: code === 0 && complete === 0 && phase === 'done' ? 0 : Number.isInteger(code) && code > 0 ? code : 1,
      reason: code === 0 && complete === 0 && phase === 'done' ? 'complete' : signal ? 'worker-signal' : 'worker-failed',
    }));
    arm();
    // Não permitir que mensagens de progresso adiem indefinidamente o limite.
    totalTimer = setTimeout(() => settle({ code: 1, reason: 'timeout-total' }),
      Object.values(limits).reduce((a, b) => a + b, 0));
    result = await outcome;
  } catch { result = { code: 1, reason: 'supervisor-failed' }; }
  finally {
    clearTimeout(phaseTimer); clearTimeout(totalTimer);
    try {
      if (groupAlive()) {
        signalGroup('SIGTERM');
        if (!await waitGroup(graceMs)) {
          signalGroup('SIGKILL');
          if (!await waitGroup(graceMs)) throw new Error('owned_group_still_alive');
        }
      }
      let cleanupTimer;
      try {
        await Promise.race([
          rm(directory, { recursive: true, force: true, maxRetries: 2 }),
          new Promise((_, reject) => { cleanupTimer = setTimeout(() => reject(new Error('cleanup_timeout')), cleanupMs); }),
        ]);
      } finally { clearTimeout(cleanupTimer); }
      result = { ...result, cleaned: true };
      log('QA_PG_TEMP_CLEANED: true');
    } catch {
      result = { ...result, code: result?.code || 1, reason: 'cleanup-failed', cleaned: false };
      log('QA_PG_CLEANUP_FAILED: cleanup unverified; no success claimed');
    }
    process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
    if (child?.connected) child.disconnect();
  }
  log(`QA_PG_SUPERVISOR: ${result.reason}; phase=${phase}; exit=${result.code}`);
  return { ...result, phase };
}

// Criação de banco exclusivo do QA, sem host/URL configurável e sem hooks de
// embedded-postgres. O supervisor continua sendo o teto externo para end().
export async function createLocalQaDatabase({ port, user, password, database }) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || !/^seg_qa_[a-z0-9_]+$/.test(database)) {
    throw new Error('invalid_local_qa_database');
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({ host: '127.0.0.1', port, user, password, database: 'postgres',
    connectionTimeoutMillis: 5_000, query_timeout: 5_000, statement_timeout: 5_000 });
  let clientError = false;
  client.on('error', () => { clientError = true; });
  try { await client.connect(); await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)}`); }
  finally { await client.end(); }
  if (clientError) throw new Error('qa_pg_create_client_error');
}
