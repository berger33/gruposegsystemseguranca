#!/usr/bin/env node
// QA-HOM-009: COLD COPY for the synthetic, dedicated local demo ONLY.
// Not a full product backup or trusted/immutable archive. Never overwrite.
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, chmod, copyFile, lstat, mkdir, open, readFile, readdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { createServer, connect } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];
const qa = process.env.SEG_DEMO_TEST_MODE === '1';
const profileBase = process.platform === 'win32'
  ? process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'GrupoSEG')
  : path.join(homedir(), '.local', 'share', 'GrupoSEG');
const demoDir = qa ? process.env.SEG_DEMO_TEST_DIR : profileBase && path.join(profileBase, 'seg-system-demo-v1');
const forbidden = ['DATABASE_URL','DATABASE_MIGRATION_URL','ALLOW_REMOTE_MIGRATIONS','PGHOST','PGSERVICE',
  'MAIL_HOST','CLIENT_DOCS_DIR','PGLITE_DATA_DIR','SITE_ADMIN_SESSION_SECRET','CLIENT_MFA_ENCRYPTION_KEY'];
let lockFile, lockOwned = false;
const comparable = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const inside = (parent, child) => {
  const a = comparable(parent), b = comparable(child);
  return b === a || b.startsWith(a + path.sep);
};
function fail(code) { throw new Error(code); }
async function statOrNull(file) {
  try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function assertDir(dir, code = 'snapshot_directory_invalid') {
  const stat = await statOrNull(dir);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail(code);
}
async function assertFile(file, code = 'snapshot_file_invalid') {
  const stat = await statOrNull(file);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail(code);
  return stat;
}
async function newDestination(dest, excluded = []) {
  if (typeof dest !== 'string' || !dest || !path.isAbsolute(dest)) fail('snapshot_absolute_destination_required');
  const resolved = path.resolve(dest);
  if (await statOrNull(resolved)) fail('snapshot_destination_exists_no_overwrite');
  const parent = path.dirname(resolved);
  await assertDir(parent, 'snapshot_parent_missing_or_symlink');
  const actualParent = await realpath(parent);
  if (comparable(actualParent) !== comparable(parent) || inside(project, resolved) || inside(demoDir, resolved) ||
      excluded.some(other => inside(other, resolved) || inside(resolved, other))) fail('snapshot_destination_unsafe');
  return resolved;
}
async function allFiles(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) fail('snapshot_special_file_refused');
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await allFiles(root, relative));
    else result.push(relative);
  }
  return result.sort();
}
async function allDirs(root, prefix = '') {
  const dirs = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) fail('snapshot_special_file_refused');
    if (entry.isDirectory()) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      dirs.push(relative, ...await allDirs(root, relative));
    }
  }
  return dirs.sort();
}
async function sha(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function copyTree(from, to, files, dirs) {
  await mkdir(to, { mode: 0o700 });
  for (const rel of dirs) await mkdir(path.join(to, ...rel.split('/')), { recursive:true, mode:0o700 });
  for (const rel of files) {
    const dest = path.join(to, ...rel.split('/'));
    await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
    await copyFile(path.join(from, ...rel.split('/')), dest);
    if (process.platform !== 'win32') await chmod(dest, 0o600);
  }
}
function validManifest(m) {
  if (m?.format !== 'seg-demo-cold-copy-v1' || typeof m.installationId !== 'string' ||
      !Array.isArray(m.files) || m.files.length < 3 || m.files.length > 100_000 ||
      !Array.isArray(m.dirs) || m.dirs.length < 2 || m.dirs.length > 100_000) fail('snapshot_manifest_invalid');
  const dirSeen = new Set();
  for (const dir of m.dirs) {
    if (typeof dir !== 'string' || !/^(pgdata|documents)(\/.*)?$/.test(dir) ||
        dir.split('/').some(part => !part || part === '.' || part === '..' || /[\\:\u0000-\u001f]/.test(part)) ||
        dirSeen.has(dir)) fail('snapshot_manifest_invalid');
    dirSeen.add(dir);
  }
  if (!dirSeen.has('pgdata') || !dirSeen.has('documents')) fail('snapshot_manifest_missing_core');
  const seen = new Set();
  for (const item of m.files) {
    if (!item || typeof item.path !== 'string' || !/^(config\.json|pgdata\/.+|documents\/.+)$/.test(item.path) ||
        item.path.split('/').some(part => part === '..' || part === '.' || !part || /[\\:\u0000-\u001f]/.test(part)) ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 0 ||
        !/^[0-9a-f]{64}$/.test(item.sha256) || seen.has(item.path)) fail('snapshot_manifest_invalid');
    seen.add(item.path);
  }
  if (!seen.has('config.json') || !seen.has('pgdata/PG_VERSION')) fail('snapshot_manifest_missing_core');
}
async function verify(archive) {
  await assertDir(archive);
  const names = (await readdir(archive)).sort();
  if (names.join(',') !== 'content,manifest.json') fail('snapshot_archive_layout_invalid');
  const manifestFile = path.join(archive,'manifest.json');
  if ((await assertFile(manifestFile)).size > 10_000_000) fail('snapshot_manifest_too_large');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  validManifest(manifest);
  const content = path.join(archive,'content');
  await assertDir(content);
  const actual = await allFiles(content), listed = manifest.files.map(row => row.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(listed) ||
      JSON.stringify(await allDirs(content)) !== JSON.stringify([...manifest.dirs].sort())) {
    fail('snapshot_files_missing_or_extra');
  }
  for (const item of manifest.files) {
    const file = path.join(content, ...item.path.split('/'));
    const st = await assertFile(file);
    if (st.size !== item.bytes || await sha(file) !== item.sha256) fail('snapshot_checksum_mismatch');
  }
  const cfg = JSON.parse(await readFile(path.join(content,'config.json'),'utf8'));
  if (cfg.format !== 'seg-local-demo-v1' || cfg.installationId !== manifest.installationId ||
      (await readFile(path.join(content,'pgdata','PG_VERSION'),'utf8')).trim() !== '17') fail('snapshot_demo_identity_mismatch');
  return { manifest, cfg, content };
}
async function portInUse(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('snapshot_config_port_invalid');
  return new Promise(resolve => {
    const socket = connect({ host:'127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(1800, () => { socket.destroy(); resolve(true); });
  });
}
async function portFree() {
  return new Promise((resolve,reject) => {
    const probe = createServer(); probe.once('error',reject);
    probe.listen(0,'127.0.0.1',() => { const p=probe.address().port; probe.close(() => resolve(p)); });
  });
}
async function restoredDatabaseCheck(target, cfg) {
  const [{ default: EmbeddedPostgres }, { default: pg }] = await Promise.all([
    import('embedded-postgres'), import('pg'),
  ]);
  const port = await portFree();
  const engine = new EmbeddedPostgres({ databaseDir: path.join(target,'pgdata'), port, user:'seg_demo',
    password:cfg.pgPassword, persistent:true, postgresFlags:['-c','listen_addresses=127.0.0.1'],
    onLog:msg => { if (/FATAL|ERROR|could not|invalid|permission denied/i.test(msg)) {
      console.error('DEMO_RESTORE_PG_DIAG:', String(msg).slice(0,320));
    } }, onError:err => console.error('DEMO_RESTORE_PG_DIAG:', String(err?.message || err).slice(0,320)),
  });
  let pool, startTimer;
  try {
    // A pending Promise alone does not keep Node alive. Ensure a PostgreSQL
    // child that exits before readiness cannot turn this into a false exit 0.
    await Promise.race([engine.start(), new Promise((_, reject) => {
      startTimer = setTimeout(() => reject(new Error('snapshot_pg_start_timeout')), 20_000);
    })]);
    clearTimeout(startTimer);
    pool = new pg.Pool({ connectionString:`postgresql://seg_demo:${encodeURIComponent(cfg.pgPassword)}@127.0.0.1:${port}/seg_demo_local`, max:1 });
    const { rows:[record] } = await pool.query(`SELECT
      (SELECT count(*)::int FROM seg_demo_bootstrap WHERE installation_id=$1) AS marker,
      (SELECT count(*)::int FROM __migrations WHERE checksum IS NOT NULL) AS ledger`,[cfg.installationId]);
    // O ledger esperado vem do disco. Fixá-lo como literal (era 98) cria mais
    // um ponto de esquecimento a cada migração nova — e já estava defasado.
    const ledgerOnDisk = (await readdir(path.join(project,'db/migrations'))).filter(f => /^\d{3}-.*\.sql$/.test(f)).length;
    if (record.marker !== 1 || record.ledger !== ledgerOnDisk) {
      fail(`snapshot_restored_database_mismatch: marker=${record.marker} ledger=${record.ledger} esperado=${ledgerOnDisk}`);
    }
  } finally {
    if (startTimer) clearTimeout(startTimer);
    await pool?.end();
    if (engine.process?.exitCode === null) await engine.stop();
    else if (engine.process) engine.process = undefined; // child already exited; stop() would wait forever
  }
}
try {
  if (!['--backup','--verify','--restore-copy'].includes(action) ||
      process.argv.length !== (action === '--restore-copy' ? 5 : 4) || !demoDir ||
      (qa && (!path.basename(demoDir).startsWith('seg-demo-qa-') || path.dirname(path.resolve(demoDir)) !== path.resolve(tmpdir()))) ||
      (!qa && process.env.SEG_DEMO_TEST_DIR)) fail('snapshot_usage_refused');
  if (process.versions.node.split('.')[0] !== '22') fail('snapshot_requires_node_22');
  for (const key of forbidden) if (process.env[key]) fail(`snapshot_env_refused_${key}`);
  for (const name of await readdir(project)) if ((name === '.env' || name.startsWith('.env.')) && name !== '.env.example') {
    fail(`snapshot_env_file_refused_${name}`);
  }
  if (action === '--backup') {
    await assertDir(demoDir, 'snapshot_demo_missing');
    const destination = await newDestination(process.argv[3]);
    lockFile = path.join(demoDir,'run.lock');
    const lock = await open(lockFile, 'wx', 0o600); lockOwned = true; await lock.close();
    if ((await readdir(demoDir)).sort().join(',') !== 'config.json,documents,pgdata,run.lock') fail('snapshot_unknown_demo_content');
    const configStat = await assertFile(path.join(demoDir,'config.json'));
    if (process.platform !== 'win32' && (configStat.mode & 0o077)) fail('snapshot_insecure_config');
    const cfg = JSON.parse(await readFile(path.join(demoDir,'config.json'),'utf8'));
    if (cfg.format !== 'seg-local-demo-v1' || typeof cfg.installationId !== 'string' ||
        typeof cfg.pgPassword !== 'string' || cfg.pgPassword.length < 32) fail('snapshot_config_invalid');
    if (await statOrNull(path.join(demoDir,'pgdata','postmaster.pid')) || await portInUse(cfg.pgPort)) {
      fail('snapshot_database_must_be_stopped');
    }
    const paths = (await allFiles(demoDir)).filter(p => p !== 'run.lock');
    if (!paths.includes('pgdata/PG_VERSION') || (await readFile(path.join(demoDir,'pgdata','PG_VERSION'),'utf8')).trim() !== '17') fail('snapshot_pg17_required');
    const manifest = { format:'seg-demo-cold-copy-v1', installationId:cfg.installationId,
      dirs: await allDirs(demoDir),
      files: await Promise.all(paths.map(async p => ({ path:p, bytes:(await assertFile(path.join(demoDir,...p.split('/')))).size,
        sha256:await sha(path.join(demoDir,...p.split('/'))) }))) };
    validManifest(manifest);
    await mkdir(destination, { mode:0o700 });
    await copyTree(demoDir, path.join(destination,'content'), paths, manifest.dirs);
    await writeFile(path.join(destination,'manifest.json'), JSON.stringify(manifest), { flag:'wx', mode:0o600 });
    await verify(destination);
    console.log(`DEMO_SNAPSHOT_COLD_COPY_OK: ${manifest.files.length} files checked; manifest UNTRUSTED, copy NOT encrypted or independent.`);
  } else if (action === '--verify') {
    const { manifest } = await verify(process.argv[3]);
    console.log(`DEMO_SNAPSHOT_SELF_CHECK_OK: ${manifest.files.length} files; unsigned manifest does NOT prove authenticity.`);
  } else {
    const source = path.resolve(process.argv[3]);
    const target = await newDestination(process.argv[4], [source]);
    const { manifest, cfg, content } = await verify(source); // before ANY destination write
    if (await statOrNull(path.join(demoDir,'run.lock')) || await portInUse(cfg.pgPort)) {
      fail('snapshot_restore_requires_original_demo_stopped');
    }
    // Never overwrite or promote the default demo: a fresh, separate copy only.
    await copyTree(content, target, manifest.files.map(item => item.path), manifest.dirs);
    for (const item of manifest.files) {
      const file = path.join(target, ...item.path.split('/'));
      if ((await assertFile(file)).size !== item.bytes || await sha(file) !== item.sha256) fail('snapshot_restore_copy_mismatch');
    }
    await restoredDatabaseCheck(target, cfg);
    console.log('DEMO_RESTORE_ISOLATED_COPY_OK: marker and 98 checksums present; target left separate, not promoted or deleted.');
  }
} catch (error) {
  console.error('DEMO_SNAPSHOT_FAILED:', String(error?.message || error).slice(0,250));
  process.exitCode = 1;
} finally {
  if (lockOwned) await unlink(lockFile).catch(() => { process.exitCode = 1; });
}
