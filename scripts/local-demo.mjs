#!/usr/bin/env node
// QA-HOM-008 / PLT-01: opt-in, loopback-only, persistent synthetic *preview*.
// This is NOT a production installer, backup, public server, or client handoff.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { access, lstat, mkdir, open, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedFreshDemo } from './local-demo-seed.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];
const qa = process.env.SEG_DEMO_TEST_MODE === '1';
// Ollama stays disabled by default. An operator may explicitly opt in to the
// local-only model already running on loopback; this never accepts a provider
// URL from the environment or forwards a model call to a remote host.
const localOllamaEnabled = process.env.SEG_LOCAL_DEMO_OLLAMA === '1';
const forbidden = ['DATABASE_URL','DATABASE_MIGRATION_URL','ALLOW_REMOTE_MIGRATIONS','QA_PGLITE_ONLY',
  'CLIENT_DOCS_DIR','PGLITE_DATA_DIR','PGHOST','PGSERVICE','MAIL_HOST','MAIL_USER','MAIL_PASSWORD',
  'SITE_ADMIN_SESSION_SECRET','EMPLOYEE_SESSION_SECRET','SITE_ADMIN_TOKEN_TI','SITE_ADMIN_TOKEN_MARCELO','CLIENT_MFA_ENCRYPTION_KEY',
  'OLLAMA_HOST','PUBLIC_BASE_URL','TRUST_PROXY'];
const base = process.platform === 'win32'
  ? process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'GrupoSEG')
  : path.join(homedir(), '.local', 'share', 'GrupoSEG');
const demoDir = qa ? process.env.SEG_DEMO_TEST_DIR : base && path.join(base, 'seg-system-demo-v1');
const requestedWebPort = qa ? Number(process.env.SEG_DEMO_WEB_PORT) : null;
let webPort = requestedWebPort;
const databaseName = 'seg_demo_local';
let engine, pool, web, lockFile, lockOwned = false, stopping = false, stopRequestTimer;

function fail(code) { throw new Error(code); }
function redact(message, config) {
  let text = String(message);
  for (const secret of [config?.pgPassword, config?.sessionSecret, config?.employeeSessionSecret, config?.mfaKey]) {
    if (secret) text = text.replaceAll(secret, '[redacted]');
  }
  return text.slice(0, 450);
}
async function statOrNull(file) {
  try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function ensureRegular(file) {
  const stat = await statOrNull(file);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail('demo_marker_missing_or_not_regular');
}
async function checkPort(port, label) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail(`demo_invalid_${label}_port`);
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`demo_${label}_port_in_use`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer(); probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address(); probe.close(() => resolve(port));
    });
  });
}
function uuid(value) { return typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
async function preflight() {
  if (!['--init', '--start'].includes(action) || process.argv.length !== 3 || !demoDir ||
      (qa && (!path.basename(demoDir).startsWith('seg-demo-qa-') ||
        path.dirname(path.resolve(demoDir)) !== path.resolve(tmpdir()))) ||
      (!qa && process.env.SEG_DEMO_TEST_DIR) ||
      (qa && (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535))) fail('demo_usage_refused');
  if (process.versions.node.split('.')[0] !== '22') fail('demo_requires_node_22');
  for (const key of forbidden) if (process.env[key]) fail(`demo_env_refused_${key}`);
  for (const name of await readdir(project)) if ((name === '.env' || name.startsWith('.env.')) && name !== '.env.example') {
    fail(`demo_env_file_refused_${name}`);
  }
  await access(path.join(project, 'db/migrations/098-client-manual-verification.sql'));
  if (qa) await checkPort(webPort, 'web');
  if (action === '--init' && await statOrNull(demoDir)) fail('demo_directory_exists_use_start_or_stop_and_investigate');
  if (action === '--start') {
    const stat = await statOrNull(demoDir);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) fail('demo_directory_missing_or_symlink');
  }
  console.log('DEMO_PREFLIGHT_OK: localhost only, SMTP/IA/proxy disabled; no operator DB or .env.');
}
async function initialiseDirectory() {
  if (!qa) {
    // A new dedicated folder in the current user's profile, not the checkout.
    await mkdir(base, { recursive: true, mode: 0o700 });
    const parent = await lstat(base);
    if (!parent.isDirectory() || parent.isSymbolicLink()) fail('demo_parent_not_regular_directory');
  }
  await mkdir(demoDir, { mode: 0o700 }); // exclusive: refuse an existing path
  const config = {
    format: 'seg-local-demo-v1', installationId: randomUUID(), pgPort: await freePort(),
    pgPassword: randomBytes(32).toString('base64url'),
    sessionSecret: randomBytes(32).toString('base64url'),
    employeeSessionSecret: randomBytes(32).toString('base64url'),
    mfaKey: randomBytes(32).toString('base64url'),
  };
  await writeFile(path.join(demoDir, 'config.json'), JSON.stringify(config), { flag: 'wx', mode: 0o600 });
  await mkdir(path.join(demoDir, 'documents'), { mode: 0o700 });
  return config;
}
async function loadDirectory() {
  const configPath = path.join(demoDir, 'config.json');
  await ensureRegular(configPath);
  if (process.platform !== 'win32') {
    const file = await lstat(configPath), directory = await lstat(demoDir);
    if ((file.mode & 0o077) || (directory.mode & 0o077)) fail('demo_insecure_data_permissions');
  }
  const cfg = JSON.parse(await readFile(configPath, 'utf8'));
  if (cfg.format !== 'seg-local-demo-v1' || !uuid(cfg.installationId) ||
      !Number.isInteger(cfg.pgPort) || cfg.pgPort < 1024 || cfg.pgPort > 65535 ||
      [cfg.pgPassword,cfg.sessionSecret,cfg.employeeSessionSecret,cfg.mfaKey]
        .some(v => typeof v !== 'string' || v.length < 32)) {
    fail('demo_config_invalid');
  }
  for (const folder of ['pgdata', 'documents']) {
    const stat = await statOrNull(path.join(demoDir, folder));
    if (!stat?.isDirectory() || stat.isSymbolicLink()) fail('demo_data_directory_missing_or_symlink');
  }
  return cfg;
}
async function createUtf8Database() {
  const admin = engine.getPgClient('postgres', '127.0.0.1');
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${databaseName} WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`);
  } finally { await admin.end().catch(() => {}); }
}
function environment(cfg) {
  const url = `postgresql://seg_demo:${encodeURIComponent(cfg.pgPassword)}@127.0.0.1:${cfg.pgPort}/${databaseName}`;
  // Explicit allowlist: env files and service/provider vars are refused above.
  return { PATH: process.env.PATH || process.env.Path || '', SystemRoot: process.env.SystemRoot || '',
    HOME: process.env.HOME || '', USERPROFILE: process.env.USERPROFILE || '',
    TEMP: process.env.TEMP || '', TMP: process.env.TMP || '', TMPDIR: process.env.TMPDIR || '',
    DATABASE_URL: url, DATABASE_MIGRATION_URL: '', QA_MIGRATION_ONLY: '', ALLOW_REMOTE_MIGRATIONS: '',
    QA_PGLITE_ONLY: '', BIND_HOST: '127.0.0.1', PORT: String(webPort),
    PUBLIC_BASE_URL: `http://127.0.0.1:${webPort}`, NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_ALLOW_INDEX: 'false', NEXT_PUBLIC_ENV: 'beta',
    QA_HOMOLOGATION_MODE: 'true', SEG_LOCAL_DEMO_ONLY: 'true', SITE_ADMIN_SESSION_SECRET: cfg.sessionSecret,
    EMPLOYEE_SESSION_SECRET: cfg.employeeSessionSecret,
    SITE_ADMIN_TOKEN_TI: '', SITE_ADMIN_TOKEN_MARCELO: '', CLIENT_MFA_ENCRYPTION_KEY: cfg.mfaKey,
    OLLAMA_ENABLED: localOllamaEnabled ? 'true' : 'false',
    OLLAMA_BASE_URL: localOllamaEnabled ? 'http://127.0.0.1:11434' : '',
    OLLAMA_MODEL: localOllamaEnabled ? 'qwen3:1.7b' : '',
    MAIL_HOST: '', CLIENT_DOCS_DIR: path.join(demoDir, 'documents'),
    NEXT_DISABLE_HTTPS: 'true', TRUST_PROXY: 'false' };
}
function childProcess(args, env, config) {
  const child = spawn(process.execPath, args, { cwd: project, env, stdio: ['ignore','pipe','pipe'] });
  child.stdout.on('data', chunk => process.stdout.write(redact(chunk, config)));
  child.stderr.on('data', chunk => process.stderr.write(redact(chunk, config)));
  return child;
}
async function exitOf(child) {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
}
async function ledgerIsCurrent(db, installationId) {
  const { rows: [encoding] } = await db.query(`SELECT current_setting('server_encoding') AS encoding,
    $1::text AS probe`, ['DEMO → UTF-8']);
  if (encoding.encoding !== 'UTF8' || encoding.probe !== 'DEMO → UTF-8') fail('demo_utf8_required');
  const { rows: marker } = await db.query('SELECT installation_id FROM seg_demo_bootstrap');
  if (marker.length !== 1 || marker[0].installation_id !== installationId) fail('demo_installation_marker_mismatch');
  const files = (await readdir(path.join(project, 'db/migrations'))).filter(f => /^\d{3}-.*\.sql$/.test(f));
  const { rows } = await db.query('SELECT filename, checksum FROM __migrations');
  // O gate real do upgrade é "o que está aplicado NESTA instalação difere do
  // que está no disco" — verificado pela contagem abaixo e, item a item, pelos
  // checksums logo adiante. Havia também um literal `files.length !== 98`:
  // uma segunda cópia do tamanho do ledger que ninguém atualiza ao adicionar
  // migração. Ele ficou para trás em 099 e passou a reprovar toda execução,
  // inclusive em instalação íntegra. Removido: o disco é a fonte de verdade e
  // scripts/migrate-site-visual.mjs já falha fechado se disco ≠ manifesto.
  if (rows.length !== files.length) fail('demo_schema_upgrade_requires_separate_backup_review');
  for (const file of files) {
    const value = rows.find(row => row.filename === file)?.checksum;
    const expected = createHash('sha256').update(await readFile(path.join(project, 'db/migrations', file))).digest('hex');
    if (value !== expected) fail('demo_migration_checksum_mismatch_or_upgrade_required');
  }
}
async function waitForHealth(child) {
  const end = Date.now() + 120_000;
  while (Date.now() < end) {
    if (child.exitCode !== null) fail('demo_web_exited');
    try {
      const response = await fetch(`http://127.0.0.1:${webPort}/api/health/live`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  fail('demo_web_health_timeout');
}
function requestStop() {
  stopping = true;
  if (qa) process.stdin.pause();
  if (web?.exitCode === null) web.kill('SIGTERM');
}
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, requestStop);
// The Windows QA harness cannot reliably deliver console Ctrl+C to a child
// without a TTY. Its private stdin pipe provides an explicit graceful stop.
if (qa) {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (String(chunk).split(/\r?\n/).some(line => line.trim() === 'STOP')) {
      stopping = true;
      process.stdin.pause();
      if (web?.exitCode === null) web.kill('SIGTERM');
    }
  });
}
let config;
try {
  await preflight();
  // A preview port is chosen for each run so unrelated software already on
  // common development ports is left untouched. The exact URL is printed.
  if (!qa) webPort = await freePort();
  await checkPort(webPort, 'web');
  config = action === '--init' ? await initialiseDirectory() : await loadDirectory();
  await checkPort(config.pgPort, 'database');
  lockFile = path.join(demoDir, 'run.lock');
  const lock = await open(lockFile, 'wx', 0o600); lockOwned = true;
  try { await lock.writeFile(String(process.pid)); } finally { await lock.close(); }
  // Windows one-click launcher requests a graceful shutdown by creating this
  // marker in the isolated demo directory. No network control endpoint exists.
  if (!qa) {
    const stopRequest = path.join(demoDir, 'stop.request');
    stopRequestTimer = setInterval(async () => {
      try {
        const stat = await statOrNull(stopRequest);
        if (!stat) return;
        if (!stat.isFile() || stat.isSymbolicLink()) return;
        await unlink(stopRequest);
        requestStop();
      } catch (error) {
        if (error.code !== 'ENOENT') console.error('DEMO_STOP_REQUEST_FAILED');
      }
    }, 750);
    stopRequestTimer.unref();
  }
  const ownedSignalListeners = new Map(['SIGINT','SIGTERM'].map(signal => [signal, process.listeners(signal)]));
  const [{ default: EmbeddedPostgres }, { default: pg }] = await Promise.all([
    import('embedded-postgres'), import('pg'),
  ]);
  // embedded-postgres installs async-exit-hook which calls process.exit(130)
  // immediately after stopping PG on Ctrl+C. That skips our web shutdown and
  // run.lock cleanup. This runner owns both services; keep its pre-import
  // handlers and remove only signal listeners newly installed by that import.
  for (const [signal, originals] of ownedSignalListeners) {
    for (const listener of process.listeners(signal)) {
      if (!originals.includes(listener)) process.removeListener(signal, listener);
    }
  }
  engine = new EmbeddedPostgres({ databaseDir: path.join(demoDir, 'pgdata'),
    port: config.pgPort, user: 'seg_demo', password: config.pgPassword, persistent: true,
    postgresFlags: ['-c','listen_addresses=127.0.0.1'],
    onLog: () => {}, onError: error => console.error('DEMO_PG_ERROR', redact(error?.message, config)),
  });
  if (action === '--init') await engine.initialise();
  await engine.start();
  if (action === '--init') await createUtf8Database();
  const env = environment(config);
  pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
  let staff;
  if (action === '--init') {
    const migrator = childProcess(['scripts/migrate-site-visual.mjs'], { ...env, QA_MIGRATION_ONLY: '' }, config);
    if (await exitOf(migrator) !== 0) fail('demo_migrations_failed_no_automatic_repair');
    const seeded = await seedFreshDemo(pool, config.installationId, {
      mode: 'isolated-local-demo', databaseName,
    });
    staff = seeded.credentials;
    if (seeded.showcase) console.log(`DEMO_SHOWCASE_V2: ${JSON.stringify(seeded.showcase)}`);
  }
  await ledgerIsCurrent(pool, config.installationId);
  web = childProcess(['server.mjs','--dev'], env, config);
  if (stopping && web.exitCode === null) web.kill('SIGTERM');
  await waitForHealth(web);
  console.log(`\nDEMO_LOCAL_READY: http://127.0.0.1:${webPort}/admin/entrar`);
  console.log('Somente massa fictícia. Sem SMTP, Funnel, dados reais ou backup operacional.');
  if (staff) {
    console.log('CREDENCIAIS APENAS NESTA PRIMEIRA INICIALIZAÇÃO. Anote em local privado:');
    for (const item of staff) console.log(`${item.role.toUpperCase()}: ${item.email} / ${item.password}`);
    console.log('Cliente: emita convite para conta fictícia pelo TI, aceite e revise manualmente; não há posse de e-mail confirmada.');
  }
  console.log('Parar: Ctrl+C. Para reabrir: --start; não reinicialize nem apague a pasta de dados.\n');
  const code = await exitOf(web);
  if (!stopping) fail('demo_web_exited_unexpectedly');
} catch (error) {
  console.error('DEMO_LOCAL_FAILED:', redact(error?.message || error, config));
  process.exitCode = 1;
} finally {
  if (web?.exitCode === null) {
    web.kill('SIGTERM');
    await Promise.race([exitOf(web), new Promise(resolve => setTimeout(resolve, 10_000))]);
    if (web.exitCode === null) web.kill('SIGKILL');
  }
  await pool?.end().catch(() => { process.exitCode = 1; });
  if (engine?.process) try { await engine.stop(); } catch (error) {
    console.error('DEMO_PG_STOP_FAILED:', redact(error?.message, config)); process.exitCode = 1;
  }
  if (lockOwned) await unlink(lockFile).catch(() => { process.exitCode = 1; });
  if (stopRequestTimer) clearInterval(stopRequestTimer);
  if (config && demoDir) console.log('DEMO_LOCAL_DATA_PRESERVED: true (no backup, no remote access)');
  // No modo QA o listener de stdin é instalado de propósito e mantém o event
  // loop vivo, para que a prévia só pare com a linha "STOP". No caminho de erro
  // isso virava travamento permanente: o processo imprimia DEMO_LOCAL_FAILED,
  // marcava exitCode=1 e nunca encerrava, deixando o chamador (o gate
  // QA-HOM-008) esperando para sempre. Liberar o stdin aqui devolve o exit code
  // nos dois caminhos; nada mais neste script roda depois do finally.
  process.stdin.pause();
  process.stdin.unref?.();
}
