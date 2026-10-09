#!/usr/bin/env node
// Operator-run credential reset for the isolated, synthetic Windows demo only.
// It refuses non-seed identities, redirected output, and every database other
// than this exact local instance. It can safely connect to the live local demo.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { hashPassword, verifyPassword } from '../src/lib/client-auth-core.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || '--apply';
const appData = process.env.LOCALAPPDATA;
const userProfile = process.env.USERPROFILE;
if (!['--apply', '--check'].includes(mode) || process.platform !== 'win32' || !appData || !userProfile || !stdin.isTTY || !stdout.isTTY) {
  throw new Error('reset_requires_interactive_windows_terminal');
}
const dataRoots = [...new Set([appData, path.join(userProfile, 'AppData', 'Local')].map(value => path.resolve(value)))];
const choices = dataRoots.flatMap(root => [
  { label: 'Demonstração do iniciador público', dataRoot: root, demoDir: path.join(root, 'GrupoSEG-PublicoBase', 'GrupoSEG', 'seg-system-demo-v1') },
  { label: 'Demonstração local padrão', dataRoot: root, demoDir: path.join(root, 'GrupoSEG', 'seg-system-demo-v1') },
]);
const expectedRoles = ['admin', 'ti', 'rh', 'marcelo', 'comercial', 'financeiro', 'supervisor'];
const expectedClients = ['cliente.a.demo@example.invalid', 'cliente.b.demo@example.invalid'];
const identitiesExpected = [
  ...expectedRoles.map(role => ({ kind: 'staff', email: `${role}.demo@example.invalid`, role })),
  { kind: 'employee', email: 'funcionario.demo@example.invalid', role: 'funcionario' },
  ...expectedClients.map((email, index) => ({ kind: 'client', email, role: index ? 'cliente-b' : 'cliente-a' })),
];
const refuse = message => { throw new Error(message); };
const statOrNull = async file => { try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
async function portIsFree(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
const existingChoices = [];
for (const choice of choices) {
  const directoryChain = [];
  for (let cursor = choice.demoDir; cursor !== choice.dataRoot; cursor = path.dirname(cursor)) directoryChain.push(cursor);
  directoryChain.push(choice.dataRoot);
  const directoryInfo = await Promise.all(directoryChain.map(statOrNull));
  const cfgInfo = await statOrNull(path.join(choice.demoDir, 'config.json'));
  if (directoryInfo.every(info => !info) && !cfgInfo) continue;
  if (directoryInfo.some(info => !info || !info.isDirectory() || info.isSymbolicLink()) || !cfgInfo?.isFile() || cfgInfo.isSymbolicLink()) {
    refuse(`demo_path_incomplete_or_not_regular: ${choice.label}`);
  }
  existingChoices.push(choice);
}
if (!existingChoices.length) {
  refuse(`no_prepared_demo_found; verificados: ${choices.map(choice => choice.demoDir).join(' | ')}`);
}
const rl = createInterface({ input: stdin, output: stdout });
let selected;
try {
  if (existingChoices.length === 1) {
    [selected] = existingChoices;
  } else {
    stdout.write('Encontrei mais de uma base fictícia. Selecione a usada para o teste:\n');
    existingChoices.forEach((choice, index) => stdout.write(`${index + 1}) ${choice.label}\n`));
    const answer = await rl.question('Número da base: ');
    if (!/^\d+$/.test(answer) || Number(answer) < 1 || Number(answer) > existingChoices.length) refuse('invalid_demo_choice_no_changes_made');
    selected = existingChoices[Number(answer) - 1];
  }
} finally {
  rl.close();
}
const { demoDir } = selected;
const lockPath = path.join(demoDir, 'run.lock');
const configPath = path.join(demoDir, 'config.json');
const lockInfo = await statOrNull(lockPath);
if (lockInfo && (!lockInfo.isFile() || lockInfo.isSymbolicLink())) refuse('demo_lock_not_a_regular_file');
const cfg = JSON.parse(await readFile(configPath, 'utf8'));
if (cfg.format !== 'seg-local-demo-v1' || !/^[0-9a-f-]{36}$/i.test(cfg.installationId) ||
    !Number.isInteger(cfg.pgPort) || cfg.pgPort < 1024 || cfg.pgPort > 65535 ||
    typeof cfg.pgPassword !== 'string' || cfg.pgPassword.length < 32) refuse('demo_config_identity_invalid');

let engine;
let pool;
try {
  const portFree = await portIsFree(cfg.pgPort);
  if (lockInfo && portFree) refuse('demo_lock_exists_but_database_is_stopped_or_starting; no changes made');
  if (portFree) {
    engine = new EmbeddedPostgres({
      databaseDir: path.join(demoDir, 'pgdata'), port: cfg.pgPort, user: 'seg_demo', password: cfg.pgPassword,
      persistent: true, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'], onLog: () => {}, onError: () => {},
    });
    await engine.start();
  }
  pool = new pg.Pool({
    connectionString: `postgresql://seg_demo:${encodeURIComponent(cfg.pgPassword)}@127.0.0.1:${cfg.pgPort}/seg_demo_local`,
    max: 1,
  });
  const client = await pool.connect();
  let credentials = [];
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('seg_demo_credential_reset_v1'))");
    const { rows: dbRows } = await client.query(`SELECT current_database() AS database,
      current_setting('server_encoding') AS encoding`);
    if (dbRows[0]?.database !== 'seg_demo_local' || dbRows[0]?.encoding !== 'UTF8') refuse('demo_database_identity_refused');
    const { rows: marker } = await client.query('SELECT installation_id, seed_version FROM seg_demo_bootstrap');
    if (marker.length !== 1 || marker[0].installation_id !== cfg.installationId || Number(marker[0].seed_version) !== 2) {
      refuse('demo_seed_marker_mismatch_no_changes_made');
    }

    const { rows } = await client.query(`SELECT i.id, i.kind, i.status, lower(i.email) AS email, p.role,
      EXISTS (SELECT 1 FROM auth_employee_access a WHERE a.identity_id=i.id) AS employee_access,
      EXISTS (SELECT 1 FROM client_access_grants cg WHERE cg.identity_id=i.id) AS client_access
      FROM auth_identities i
      LEFT JOIN auth_staff_profiles p ON p.identity_id=i.id
      WHERE lower(i.email) = ANY($1::text[])`, [identitiesExpected.map(item => item.email)]);
    if (rows.length !== identitiesExpected.length) refuse('expected_demo_identity_count_mismatch_no_changes_made');
    for (const expected of identitiesExpected) {
      const identity = rows.find(row => row.email === expected.email);
      if (!identity || identity.kind !== expected.kind || identity.status !== 'active') {
        refuse('expected_demo_identity_mismatch_no_changes_made');
      }
      if (expected.kind === 'staff' && identity.role !== expected.role) refuse('demo_staff_role_mismatch_no_changes_made');
      if (expected.kind === 'employee' && !identity.employee_access) refuse('demo_employee_link_mismatch_no_changes_made');
      if (expected.kind === 'client' && !identity.client_access) refuse('demo_client_link_mismatch_no_changes_made');
    }

    if (mode === '--check') {
      await client.query('ROLLBACK');
      stdout.write(`Base validada: ${selected.label}; ${rows.length} contas fictícias vinculadas e ativas.\n`);
      stdout.write('Nenhuma credencial foi alterada.\n');
    } else {
      const confirm = createInterface({ input: stdin, output: stdout });
      try {
        stdout.write('Redefinição somente das contas fictícias desta demonstração local.\n');
        stdout.write('A ação invalida as sessões atuais e exibirá as senhas uma única vez.\n');
        const answer = await confirm.question('Para confirmar, digite REDEFINIR CONTAS FICTICIAS: ');
        if (answer !== 'REDEFINIR CONTAS FICTICIAS') refuse('cancelled_no_changes_made');
      } finally {
        confirm.close();
      }

      credentials = identitiesExpected.map(expected => ({
        ...expected,
        password: randomBytes(24).toString('base64url'),
        id: rows.find(row => row.email === expected.email).id,
      }));
      for (const item of credentials) {
        const passwordHash = await hashPassword(item.password);
        if (!(await verifyPassword(item.password, passwordHash))) refuse('generated_credential_self_check_failed_no_changes_made');
        const result = await client.query(`UPDATE auth_credentials SET password_hash=$2, password_set_at=NOW(), updated_at=NOW()
          WHERE identity_id=$1`, [item.id, passwordHash]);
        if (result.rowCount !== 1) refuse('credential_identity_update_mismatch_no_changes_made');
      }
      const { rows: updated } = await client.query(`SELECT count(*)::int AS count FROM auth_credentials
        WHERE identity_id = ANY($1::uuid[])`, [credentials.map(item => item.id)]);
      if (updated[0]?.count !== credentials.length) refuse('credential_update_count_mismatch_no_changes_made');
      await client.query('DELETE FROM auth_login_throttle WHERE email = ANY($1::text[])',
        [identitiesExpected.map(item => item.email)]);
      await client.query('COMMIT');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (credentials.length) {
    stdout.write('\nNOVAS CREDENCIAIS — copie agora e guarde em local privado. Não serão salvas em arquivo.\n');
    for (const item of credentials) stdout.write(`${item.role.toUpperCase()} | ${item.email} | ${item.password}\n`);
    stdout.write('\nA senha de MARCELO é a única que você precisa encaminhar a ele.\n');
  }
} finally {
  await pool?.end().catch(() => {});
  if (engine?.process) await engine.stop();
}
