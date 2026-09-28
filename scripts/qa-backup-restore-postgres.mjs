#!/usr/bin/env node
// PLT-MIG-001 / PLT-BAK-001: pg_dump/pg_restore em bancos novos QA.
// QA_RESTORE_SEPARATE_CLUSTERS=1 usa dois clusters efêmeros em loopback.
// Nunca aceita URL de operador ou banco externo.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveSyntheticFileBundle, restoreSyntheticFileBundle } from './qa-synthetic-file-bundle.mjs';
import { publicKeyFingerprint, signQaManifest, verifyQaManifest } from './qa-detached-manifest-signature.mjs';
import { inventoryQaFileCoverage } from './qa-backup-coverage-inventory.mjs';
import { prepareQaCliV2Transfer, createQaCliV2UnreferencedFixture, inventoryQaCliV2Objects,
  injectQaCliV2CoTamper, restoreQaCliV2Transfer } from './qa-cli-v2-transfer.mjs';
import { verifyRestoredDocumentHttp } from './qa-restored-document-http.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.ALLOW_REMOTE_MIGRATIONS === 'true' ||
    process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_RESTORE_REFUSED: unset operator database URLs and remote flags.');
  process.exit(2);
}
const includeSyntheticFile = process.env.QA_RESTORE_INCLUDE_SYNTHETIC_FILE === '1';
const verifyHttpDownload = process.env.QA_RESTORE_VERIFY_HTTP === '1';
const verifySignature = process.env.QA_RESTORE_VERIFY_SIGNATURE === '1';
const verifyInventory = process.env.QA_RESTORE_VERIFY_INVENTORY === '1';
const requireFullCoverage = process.env.QA_RESTORE_REQUIRE_FULL_COVERAGE === '1';
const includeCliObjects = process.env.QA_RESTORE_INCLUDE_CLI_V2_OBJECTS === '1';
const injectCliPartial = process.env.QA_RESTORE_INJECT_CLI_V2_PARTIAL === '1';
if ((includeSyntheticFile || includeCliObjects) && process.env.CLIENT_DOCS_DIR) {
  console.error('QA_RESTORE_REFUSED: unset operator CLIENT_DOCS_DIR for synthetic-file QA.');
  process.exit(2);
}
if (verifyHttpDownload && (process.env.QA_RESTORE_SEPARATE_CLUSTERS !== '1' || !includeSyntheticFile)) {
  console.error('QA_RESTORE_REFUSED: HTTP download requires synthetic file and two isolated clusters.');
  process.exit(2);
}
if (process.env.QA_RESTORE_INJECT_COTAMPER === '1' && (!includeSyntheticFile || process.env.QA_RESTORE_SEPARATE_CLUSTERS !== '1')) {
  console.error('QA_RESTORE_REFUSED: co-tamper injection requires synthetic file and two isolated clusters.');
  process.exit(2);
}
if ((verifySignature && (!includeSyntheticFile || process.env.QA_RESTORE_SEPARATE_CLUSTERS !== '1')) ||
    (process.env.QA_RESTORE_INJECT_SIGNED_COTAMPER === '1' && !verifySignature)) {
  console.error('QA_RESTORE_REFUSED: signed manifest QA requires synthetic file and two isolated clusters; signed injection requires signed mode.');
  process.exit(2);
}
if ((verifyInventory && (!verifySignature || !includeSyntheticFile || process.env.QA_RESTORE_SEPARATE_CLUSTERS !== '1')) ||
    (requireFullCoverage && !verifyInventory) ||
    (process.env.QA_RESTORE_INVENTORY_INJECT_MISSING === '1' && !verifyInventory)) {
  console.error('QA_RESTORE_REFUSED: inventory QA requires signed synthetic file and two isolated clusters; full/missing modes require inventory.');
  process.exit(2);
}
if ((includeCliObjects && (!verifyHttpDownload || !verifySignature || !includeSyntheticFile ||
      process.env.QA_RESTORE_SEPARATE_CLUSTERS !== '1')) ||
    (process.env.QA_RESTORE_INJECT_CLI_V2_COTAMPER === '1' && !includeCliObjects) ||
    (injectCliPartial && (!includeCliObjects || process.env.QA_RESTORE_INJECT_CLI_V2_COTAMPER === '1'))) {
  console.error('QA_RESTORE_REFUSED: CLI v2 objects require signed HTTP synthetic-file QA in two clusters; CLI injection requires objects and exclusive mode.');
  process.exit(2);
}

// PGHOST/PGSERVICE/PGOPTIONS/PGDATABASE/PGPASSFILE e afins nunca são herdados
// por filhos. Cada utilitário recebe host, porta, usuário e DB explícitos.
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k) &&
  !['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'ALLOW_REMOTE_MIGRATIONS', 'RUN_DATABASE_INTEGRATION_REMOTE'].includes(k)));
async function command(bin, args, env = {}, stdout = 'ignore') {
  const output = [];
  const child = spawn(bin, args, { cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...cleanEnv, ...env }, stdio: ['ignore', stdout === 'inherit' ? 'inherit' : 'pipe', 'pipe'] });
  if (stdout !== 'inherit') child.stdout.on('data', bytes => { if (output.join('').length < 2048) output.push(String(bytes).slice(0, 2048)); });
  const errors = [];
  child.stderr.on('data', bytes => { if (errors.join('').length < 2048) errors.push(String(bytes).slice(0, 2048)); });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', n => resolve(n ?? 1)); });
  return { code, text: output.join(''), error: errors.join('') };
}
const dumpBin = process.env.QA_PG_DUMP_BIN || 'pg_dump';
const restoreBin = process.env.QA_PG_RESTORE_BIN || 'pg_restore';
let dumpVersion, restoreVersion;
try {
  const dump = await command(dumpBin, ['--version']);
  const restore = await command(restoreBin, ['--version']);
  dumpVersion = dump.text.match(/pg_dump \(PostgreSQL\) (\d+)\./)?.[1];
  restoreVersion = restore.text.match(/pg_restore \(PostgreSQL\) (\d+)\./)?.[1];
  if (dump.code || restore.code || dumpVersion !== '17' || restoreVersion !== '17') throw new Error('version_mismatch');
} catch {
  console.error('QA_RESTORE_CLIENT_MISSING_OR_INCOMPATIBLE: requires pg_dump and pg_restore version 17 for PostgreSQL 17.9; no database created.');
  process.exit(2);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
const separateClusters = process.env.QA_RESTORE_SEPARATE_CLUSTERS === '1';
if (includeSyntheticFile && !separateClusters) {
  console.error('QA_RESTORE_REFUSED: synthetic file bundle requires two isolated clusters.');
  process.exit(2);
}
const port = await freePort();
let restorePort = port;
if (separateClusters) {
  do { restorePort = await freePort(); } while (restorePort === port);
}
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-backup-pg-'));
const archive = path.join(directory, 'synthetic-only.dump');
// Diretórios próprios da execução: nunca ler CLIENT_DOCS_DIR ou um path de operador.
const sourceDocs = path.join(directory, 'source-private-docs');
const fileBundle = path.join(directory, 'qa-file-bundle');
const trustDir = path.join(directory, 'qa-trust-anchor'); // fora do pacote, apenas nesta execução QA
const restoredDocs = path.join(directory, 'restored-private-docs');
const password = randomBytes(24).toString('hex');
const restorePassword = separateClusters ? randomBytes(24).toString('hex') : password;
const source = 'seg_qa_backup_source', destination = 'seg_qa_backup_restored';
const redact = value => String(value).replaceAll(password, '[redacted]').replaceAll(restorePassword, '[redacted]');
const connection = (name, restored = false) =>
  `postgresql://seg_qa:${restored ? restorePassword : password}@127.0.0.1:${restored ? restorePort : port}/${name}`;
function makePostgres(dataDir, pgPort, secret) {
  return new EmbeddedPostgres({
    databaseDir: path.join(directory, dataDir), port: pgPort, user: 'seg_qa', password: secret,
    persistent: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
    onLog: () => {}, onError: e => console.error('QA_RESTORE_PG_ERROR', redact(e?.message || e).slice(0, 250)),
  });
}
const postgres = makePostgres('source-data', port, password);
const restorePostgres = separateClusters ? makePostgres('destination-data', restorePort, restorePassword) : postgres;
const pgEnv = (restored = false) => ({ PGPASSWORD: restored ? restorePassword : password,
  PGHOST: '127.0.0.1', PGPORT: String(restored ? restorePort : port), PGUSER: 'seg_qa',
  PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable' });
const check = (result, label) => { if (result.code) throw new Error(`${label}_exit_${result.code}: ${redact(result.error).slice(0, 250)}`); };
const clientArgs = (db, restored = false) => ['--host=127.0.0.1', `--port=${restored ? restorePort : port}`, '--username=seg_qa', `--dbname=${db}`];
async function migrate(db, restored = false) {
  const migrated = await command(process.execPath, ['scripts/migrate-site-visual.mjs'],
    { DATABASE_URL: '', DATABASE_MIGRATION_URL: connection(db, restored), QA_MIGRATION_ONLY: 'true',
      ALLOW_REMOTE_MIGRATIONS: '', OLLAMA_ENABLED: 'false', MAIL_HOST: '' }, 'inherit');
  check(migrated, 'migration');
}
async function snapshot(pool, idA, idB, docA, docB, legacyDocId = null, expectedHttp = false, expectedCli = false) {
  const { rows: ledger } = await pool.query('SELECT filename, checksum FROM __migrations ORDER BY filename');
  const { rows: [values] } = await pool.query(`SELECT
    (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables,
    (SELECT count(*)::int FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace) AS foreign_keys,
    (SELECT count(*)::int FROM client_accounts WHERE id IN ($1,$2)) AS accounts,
    (SELECT count(*)::int FROM client_access_grants WHERE client_account_id=$1) AS grants_a,
    (SELECT count(*)::int FROM client_access_grants WHERE client_account_id=$2) AS grants_b,
    (SELECT count(*)::int FROM auth_sessions s JOIN client_access_grants g ON g.identity_id=s.identity_id WHERE g.client_account_id IN ($1,$2)) AS sessions,
    (SELECT count(*)::int FROM cli_client_documents_v2 WHERE id IN ($3,$4)) AS docs,
    (SELECT count(*)::int FROM cli_document_versions WHERE document_id IN ($3,$4)) AS versions,
    (SELECT count(*)::int FROM client_documents WHERE id=$5) AS legacy_files,
    (SELECT count(*)::int FROM audit_log WHERE action='qa_restore_source') AS operational_audit,
    (SELECT count(*)::int FROM auth_access_audit WHERE actor_id='qa_restore_source') AS access_audit`, [idA, idB, docA, docB, legacyDocId]);
  if (ledger.length !== 96 || ledger.some(x => !x.checksum) || values.tables < 400 || values.foreign_keys < 1 ||
      values.accounts !== 2 || values.grants_a !== 1 || values.grants_b !== (expectedHttp ? 1 : 0) ||
      values.sessions !== (expectedHttp ? 2 : 0) || values.docs !== 2 || values.versions !== (expectedCli ? 3 : 1) || values.legacy_files !== (legacyDocId ? 1 : 0) ||
      values.operational_audit !== 1 || values.access_audit !== 1) throw new Error('qa_restore_snapshot_invalid');
  const { rows: accounts } = await pool.query('SELECT id, display_name FROM client_accounts WHERE id IN ($1,$2) ORDER BY id', [idA, idB]);
  const { rows: docs } = await pool.query('SELECT id, client_account_id, title, file_name, file_url, storage_key, status FROM cli_client_documents_v2 WHERE id IN ($1,$2) ORDER BY id', [docA, docB]);
  const { rows: versions } = await pool.query('SELECT document_id, version, storage_key, file_url FROM cli_document_versions WHERE document_id IN ($1,$2) ORDER BY document_id,version', [docA, docB]);
  const { rows: grants } = await pool.query('SELECT identity_id, client_account_id, reason FROM client_access_grants WHERE client_account_id IN ($1,$2) ORDER BY client_account_id', [idA, idB]);
  const { rows: sessions } = await pool.query('SELECT s.identity_id, s.token_hash, s.revoked_at FROM auth_sessions s JOIN client_access_grants g ON g.identity_id=s.identity_id WHERE g.client_account_id IN ($1,$2) ORDER BY s.identity_id', [idA, idB]);
  const { rows: audit } = await pool.query("SELECT action, actor, target FROM audit_log WHERE action='qa_restore_source'");
  const { rows: legacy } = await pool.query('SELECT id, client_account_id, storage_key, size_bytes FROM client_documents WHERE id=$1', [legacyDocId]);
  const digest = createHash('sha256').update(JSON.stringify({ ledger, accounts, docs, versions, grants, sessions, audit, legacy })).digest('hex');
  return { values, digest };
}
let sourcePool, restoredPool, cliSourceRoot, cliDestRoot, result = 1, poolHadError = false;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(source);
  if (separateClusters) {
    await restorePostgres.initialise();
    await restorePostgres.start();
  }
  await restorePostgres.createDatabase(destination); // base NOVA, não clone TEMPLATE
  console.log(`QA_RESTORE_READY: PostgreSQL 17.9 loopback ${port}/${restorePort}; ${separateClusters ? 'two independent clusters' : 'two DBs in one cluster'}; no operator URL.`);
  await migrate(source);
  sourcePool = new pg.Pool({ connectionString: connection(source), max: 1 });
  // pg.Pool emite erro assíncrono ao parar o cluster com conexão idle; sem
  // listener, o processo aborta antes do finally remover os dois diretórios.
  sourcePool.on('error', error => { poolHadError = true; result = 1; console.error('QA_RESTORE_SOURCE_POOL_ERROR', redact(error?.message || error).slice(0, 180)); });
  const [accountA, accountB, identityA, grantA, docA, docB] = Array.from({ length: 6 }, () => randomUUID());
  await sourcePool.query("INSERT INTO auth_identities(id,kind,email,status) VALUES ($1,'client','qa-backup-a@exemplo.invalid','active')", [identityA]);
  await sourcePool.query("INSERT INTO client_accounts(id,display_name,created_by) VALUES ($1,'QA Backup A','ti'),($2,'QA Backup B','ti')", [accountA, accountB]);
  await sourcePool.query("INSERT INTO client_access_grants(id,identity_id,client_account_id,reason,granted_by) VALUES ($1,$2,$3,'QA synthetic only','ti')", [grantA, identityA, accountA]);
  let identityB, tokenA, tokenB;
  if (verifyHttpDownload) {
    identityB = randomUUID();
    tokenA = randomBytes(32).toString('hex');
    tokenB = randomBytes(32).toString('hex');
    await sourcePool.query("INSERT INTO auth_identities(id,kind,email,status) VALUES ($1,'client','qa-backup-b@exemplo.invalid','active')", [identityB]);
    await sourcePool.query("INSERT INTO client_access_grants(id,identity_id,client_account_id,reason,granted_by) VALUES ($1,$2,$3,'QA synthetic B only','ti')", [randomUUID(), identityB, accountB]);
    for (const [identity, token] of [[identityA, tokenA], [identityB, tokenB]]) {
      await sourcePool.query("INSERT INTO auth_sessions(id,identity_id,token_hash,expires_at) VALUES ($1,$2,$3,NOW() + INTERVAL '1 hour')",
        [randomUUID(), identity, createHash('sha256').update(token).digest('hex')]);
    }
  }
  let cliFixture;
  if (includeCliObjects) {
    cliSourceRoot = await mkdtemp(path.join(tmpdir(), 'seg-qa-cli-contract-'));
    cliDestRoot = await mkdtemp(path.join(tmpdir(), 'seg-qa-cli-contract-'));
    cliFixture = await prepareQaCliV2Transfer({ pool: sourcePool, sourceRoot: cliSourceRoot,
      bundleDir: fileBundle, trustDir, docA, docB, accountA, accountB, identityA, identityB });
    if (injectCliPartial) {
      await createQaCliV2UnreferencedFixture({ sourceRoot: cliSourceRoot, fixture: cliFixture });
      const classified = await inventoryQaCliV2Objects({ pool: sourcePool, root: cliSourceRoot });
      if (classified.referenced !== 3 || classified.unreferenced !== 1 || classified.missing !== 0 ||
          classified.dbKeys !== 3) throw new Error('qa_cli_source_inventory_invalid');
      console.log('QA_RESTORE_CLI_SOURCE_UNREFERENCED: 3 referenced, 1 without current DB reference; retained, not safe to delete from live storage');
    }
    console.log('QA_RESTORE_CLI_SOURCE: 3 versioned synthetic objects, A v1/v2 and B v1; detached signature, no operator storage');
  } else {
    for (const [doc, account, suffix] of [[docA, accountA, 'a'], [docB, accountB, 'b']]) {
      await sourcePool.query("INSERT INTO cli_client_documents_v2(id,client_account_id,title,file_name,file_url,storage_key,status) VALUES ($1,$2,$3,$4,$5,$6,'publicado')",
        [doc, account, `QA backup ${suffix}`, `qa-${suffix}.pdf`, `/qa/backup-${suffix}`, `qa-backup-${suffix}`]);
    }
    await sourcePool.query("INSERT INTO cli_document_versions(document_id,version,file_name,file_url,storage_key) VALUES ($1,1,'qa-a.pdf','/qa/backup-a','qa-backup-a')", [docA]);
  }
  await sourcePool.query("INSERT INTO audit_log(action,actor,target) VALUES ('qa_restore_source','qa_synthetic',$1)", [docA]);
  await sourcePool.query("INSERT INTO auth_access_audit(actor_kind,actor_id,action,result) VALUES ('system','qa_restore_source','login','allowed')");
  let legacyDocId = null;
  let bundle, trustedFingerprint;
  if (includeSyntheticFile) {
    legacyDocId = randomUUID();
    const storageKey = randomBytes(24).toString('hex');
    const bytes = Buffer.from('QA private document A: synthetic bytes only, no PII.\\n');
    await mkdir(sourceDocs, { recursive: true, mode: 0o700 });
    await writeFile(path.join(sourceDocs, storageKey), bytes, { flag: 'wx', mode: 0o600 });
    await sourcePool.query(`INSERT INTO client_documents
      (id,client_account_id,title,category,original_filename,content_type,size_bytes,storage_key,uploaded_by)
      VALUES ($1,$2,'QA arquivo A','qa','qa-sintetico.txt','text/plain',$3,$4,'ti')`,
    [legacyDocId, accountA, bytes.length, storageKey]);
    bundle = await saveSyntheticFileBundle({ pool: sourcePool, documentId: legacyDocId, sourceDir: sourceDocs, bundleDir: fileBundle });
    if (verifySignature) {
      // Prova estrutural QA: a chave privada nunca entra no bundle; a âncora
      // pública fica fora dele. Ela ainda NÃO é KMS nem confiança persistente.
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      trustedFingerprint = publicKeyFingerprint(publicKey);
      const envelope = signQaManifest({ bytes: await readFile(path.join(fileBundle, 'manifest.json')),
        privateKey, signerPublicKey: publicKey });
      await mkdir(trustDir, { recursive: true, mode: 0o700 });
      await writeFile(path.join(trustDir, 'public.pem'), publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx', mode: 0o600 });
      await writeFile(path.join(fileBundle, 'manifest.sig.json'), JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
      console.log('QA_RESTORE_SIGNATURE_SOURCE: ephemeral QA Ed25519; detached signature, public anchor outside bundle; no KMS');
    }
    console.log(`QA_RESTORE_FILE_BUNDLE: 1 synthetic file, ${bytes.length} bytes, manifest SHA256 ${bundle.manifest_sha256.slice(0,16)}; no operator path`);
  }
  const before = await snapshot(sourcePool, accountA, accountB, docA, docB, legacyDocId, verifyHttpDownload, includeCliObjects);
  console.log(`QA_RESTORE_SOURCE: ${before.values.tables} tables; ledger ${before.digest.slice(0, 16)}; A/B/grants/documents/audit checked`);
  check(await command(dumpBin, [...clientArgs(source), '--format=custom', '--compress=none', '--no-owner', '--no-acl', `--file=${archive}`], pgEnv()), 'pg_dump');
  const { size } = await stat(archive);
  if (size < 1024) throw new Error('qa_empty_archive');
  // Falha negativa opcional APENAS no arquivo do próprio cluster QA efêmero.
  if (process.env.QA_RESTORE_INJECT_CORRUPT_ARCHIVE === '1') await writeFile(archive, 'QA synthetic corrupted archive');
  check(await command(restoreBin, ['--list', archive]), 'pg_restore_list');
  console.log(`QA_RESTORE_ARCHIVE: custom format, ${size} bytes, pg_restore --list ok (temporary only)`);
  check(await command(restoreBin, [...clientArgs(destination, true), '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', archive], pgEnv(true)), 'pg_restore');
  restoredPool = new pg.Pool({ connectionString: connection(destination, true), max: 1 });
  restoredPool.on('error', error => { poolHadError = true; result = 1; console.error('QA_RESTORE_DEST_POOL_ERROR', redact(error?.message || error).slice(0, 180)); });
  const after = await snapshot(restoredPool, accountA, accountB, docA, docB, legacyDocId, verifyHttpDownload, includeCliObjects);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('qa_restore_comparison_mismatch');
  if (includeSyntheticFile) {
    if (process.env.QA_RESTORE_INJECT_CORRUPT_FILE === '1') {
      const filePath = path.join(fileBundle, bundle.entry.storage_key);
      const tampered = await readFile(filePath);
      tampered[0] ^= 0xff; // mesmo tamanho; manifesto não deve aprovar bytes alterados
      await writeFile(filePath, tampered);
    }
    if (process.env.QA_RESTORE_INJECT_COTAMPER === '1' || process.env.QA_RESTORE_INJECT_SIGNED_COTAMPER === '1') {
      // Dois componentes do pacote QA são alterados de maneira coerente.
      // No modo assinado, o atacante também substitui a assinatura e coloca
      // sua própria chave pública DENTRO do pacote (não vira âncora confiável).
      const filePath = path.join(fileBundle, bundle.entry.storage_key);
      const tampered = await readFile(filePath);
      tampered[0] ^= 0xff;
      await writeFile(filePath, tampered);
      const manifestPath = path.join(fileBundle, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.entries[0].sha256 = createHash('sha256').update(tampered).digest('hex');
      await writeFile(manifestPath, JSON.stringify(manifest));
      if (process.env.QA_RESTORE_INJECT_SIGNED_COTAMPER === '1') {
        const { publicKey: roguePublic, privateKey: roguePrivate } = generateKeyPairSync('ed25519');
        const forged = signQaManifest({ bytes: await readFile(manifestPath),
          privateKey: roguePrivate, signerPublicKey: roguePublic });
        await writeFile(path.join(fileBundle, 'manifest.sig.json'), JSON.stringify(forged));
        await writeFile(path.join(fileBundle, 'rogue-public.pem'), roguePublic.export({ type: 'spki', format: 'pem' }));
      }
    }
    let expectedManifestSha256 = bundle.manifest_sha256;
    if (verifySignature) {
      const manifestBytes = await readFile(path.join(fileBundle, 'manifest.json'));
      verifyQaManifest({ bytes: manifestBytes,
        envelope: JSON.parse(await readFile(path.join(fileBundle, 'manifest.sig.json'), 'utf8')),
        trustedPublicKey: await readFile(path.join(trustDir, 'public.pem')),
        pinnedFingerprint: trustedFingerprint });
      console.log('QA_RESTORE_SIGNATURE_VERIFIED: detached manifest signature with public anchor outside bundle');
      // O pin exigido pelo helper vem do manifesto JÁ autenticado pela chave externa,
      // e não da origem ainda presente em memória no caso deste ensaio.
      expectedManifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
    }
    const restoredFile = await restoreSyntheticFileBundle({
      pool: restoredPool, bundleDir: fileBundle, destinationDir: restoredDocs,
      expectedManifestSha256,
    });
    if (restoredFile.manifest_sha256 !== bundle.manifest_sha256 || restoredFile.entry.sha256 !== bundle.entry.sha256) {
      throw new Error('qa_file_restored_manifest_mismatch');
    }
    console.log(`QA_RESTORE_FILE_VERIFIED: 1 synthetic file, ${restoredFile.entry.size_bytes} bytes, DB metadata and SHA256 match; separate destination directory`);
    if (verifyInventory) {
      if (process.env.QA_RESTORE_INVENTORY_INJECT_MISSING === '1') {
        await rm(path.join(restoredDocs, bundle.entry.storage_key)); // somente destino QA desta execução
      }
      const inventoryArgs = { pool: restoredPool, qaRoot: directory, docsDir: restoredDocs,
        manifest: JSON.parse(await readFile(path.join(fileBundle, 'manifest.json'), 'utf8')) };
      const coverage = await inventoryQaFileCoverage(inventoryArgs);
      console.log(`QA_RESTORE_INVENTORY_LEGACY_VERIFIED: ${coverage.legacyVerified} file(s), ${coverage.candidateColumns} candidate columns, ${coverage.unresolvedRows} unclassified nonempty references; families: ${JSON.stringify(coverage.families)}; unmapped schema: ${JSON.stringify(coverage.unmappedCandidates)}; nonempty candidates (not file bytes): ${JSON.stringify(coverage.unresolved.slice(0, 12))}`);
      if (requireFullCoverage) await inventoryQaFileCoverage({ ...inventoryArgs, requireFull: true });
    }
  }
  let cliRestored;
  if (includeCliObjects) {
    if (process.env.QA_RESTORE_INJECT_CLI_V2_COTAMPER === '1') {
      await injectQaCliV2CoTamper({ bundleDir: fileBundle });
    }
    try {
      cliRestored = await restoreQaCliV2Transfer({ pool: restoredPool, destinationRoot: cliDestRoot,
        bundleDir: fileBundle, trustDir, fixture: cliFixture, injectPartialFailure: injectCliPartial });
    } catch (error) {
      if (process.env.QA_RESTORE_INJECT_CLI_V2_COTAMPER === '1') {
        const objects = await readdir(path.join(cliDestRoot, 'objects'));
        if (error?.message !== 'qa_signature_untrusted_key' || objects.length !== 0) {
          throw new Error('qa_cli_cotamper_not_rejected_before_write');
        }
        console.log('QA_RESTORE_CLI_COTAMPER_REJECTED: untrusted key; zero destination objects before cleanup');
      }
      if (injectCliPartial) {
        const remaining = await inventoryQaCliV2Objects({ pool: restoredPool, root: cliDestRoot });
        const sourceInventory = await inventoryQaCliV2Objects({ pool: sourcePool, root: cliSourceRoot });
        const destinationAgain = await snapshot(restoredPool, accountA, accountB, docA, docB,
          legacyDocId, verifyHttpDownload, includeCliObjects);
        if (error?.message !== 'qa_cli_injected_partial_import_rolled_back' ||
            remaining.referenced !== 0 || remaining.unreferenced !== 0 || remaining.missing !== 3 ||
            sourceInventory.referenced !== 3 || sourceInventory.unreferenced !== 1 ||
            JSON.stringify(after) !== JSON.stringify(destinationAgain)) {
          throw new Error('qa_cli_partial_failure_not_compensated');
        }
        console.log('QA_RESTORE_CLI_PARTIAL_COMPENSATED: 1/3 imported then scoped removal; 0 destination objects, DB unchanged; source unreferenced object retained until QA cleanup');
      }
      throw error;
    }
    console.log(`QA_RESTORE_CLI_OBJECTS_VERIFIED: ${cliRestored.count} synthetic versioned objects; signed manifest and DB/bytes/tenant compared before destination write`);
  }
  await migrate(destination, true); // ledger restaurado tem de passar verificação idempotente
  await restoredPool.query("INSERT INTO audit_log(action,actor,target) VALUES ('qa_restore_destination_only','qa_synthetic','isolated')");
  const { rows: [isolated] } = await sourcePool.query("SELECT count(*)::int AS count FROM audit_log WHERE action='qa_restore_destination_only'");
  const sourceAgain = await snapshot(sourcePool, accountA, accountB, docA, docB, legacyDocId, verifyHttpDownload, includeCliObjects);
  if (isolated.count !== 0 || JSON.stringify(sourceAgain) !== JSON.stringify(before)) throw new Error('qa_source_mutated_by_restore');
  if (verifyHttpDownload) {
    await verifyRestoredDocumentHttp({
      pool: restoredPool, sourcePool, databaseUrl: connection(destination, true),
      docsDir: restoredDocs, documentId: legacyDocId, accountA, accountB,
      identityA, identityB, tokenA, tokenB, expectedBytes: await readFile(path.join(sourceDocs, bundle.entry.storage_key)),
    });
  }
  if (includeCliObjects) {
    if (await cliRestored.scope(identityA, docA, 2)) throw new Error('qa_cli_revocation_not_applied');
    const bScope = await cliRestored.scope(identityB, docB, 1);
    if (!bScope || !(await cliRestored.provider.read({ ...bScope, receipt: cliFixture.receipts[2] })).equals(cliFixture.bytes[2])) {
      throw new Error('qa_cli_account_b_not_preserved');
    }
    console.log('QA_RESTORE_CLI_SCOPE_VERIFIED: A grant revoked after HTTP, B object remains accessible in destination QA');
  }
  if (poolHadError) throw new Error('qa_restore_pool_unavailable');
  console.log(`QA_RESTORE_VERIFIED: ${separateClusters ? 'two independent clusters' : 'two separate DBs'}, ${after.values.tables} tables, 96/96 checksums, A/B grants, documents, versions, both audit catalogs, source unchanged; restored migrator exit 0`);
  result = 0;
} catch (error) {
  console.error('QA_RESTORE_FAILED', redact(error?.message || error).slice(0, 350));
} finally {
  try { await restoredPool?.end(); await sourcePool?.end(); } catch { result = 1; }
  if (separateClusters) {
    try { await restorePostgres.stop(); } catch (error) {
      console.error('QA_RESTORE_DEST_STOP_FAILED', redact(error?.message || error).slice(0, 250));
      result = 1;
    }
  }
  try { await postgres.stop(); } catch (error) {
    console.error('QA_RESTORE_STOP_FAILED', redact(error?.message || error).slice(0, 250));
    result = 1;
  }
  const cleanups = await Promise.allSettled([directory, cliSourceRoot, cliDestRoot].filter(Boolean)
    .map(root => rm(root, { recursive: true, force: true })));
  if (cleanups.some(item => item.status === 'rejected')) {
    result = 1;
    console.error('QA_RESTORE_TEMP_CLEANED: false (QA directories require inspection)');
  } else {
    console.log('QA_RESTORE_TEMP_CLEANED: true (cluster(s), archive and synthetic data)');
  }
}
process.exit(result);
