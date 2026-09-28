// PLT-BAK-001 / CLI-04: pacote de 3 OBJETOS INVENTADOS para dois clusters QA.
// Não é backup geral, não lê file_url, não é API de produção nem KMS.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createQaCliV2LocalProvider } from './qa-cli-v2-local-provider.mjs';
import { publicKeyFingerprint, signQaManifest, verifyQaManifest } from './qa-detached-manifest-signature.mjs';

const KEY = /^[a-f0-9]{48}$/;
const sha256 = data => createHash('sha256').update(data).digest('hex');
const bundlePath = bundleDir => path.join(bundleDir, 'cli-v2-objects');
const fixtures = (docA, docB, accountA, accountB) => [
  { documentId: docA, accountId: accountA, version: 1, bytes: Buffer.from('QA CLI A v1: synthetic private bytes only.') },
  { documentId: docA, accountId: accountA, version: 2, bytes: Buffer.from('QA CLI A v2: synthetic private bytes only.') },
  { documentId: docB, accountId: accountB, version: 1, bytes: Buffer.from('QA CLI B v1: synthetic private bytes only.') },
];

async function scope(pool, identity, documentId, version) {
  const { rows } = await pool.query(`SELECT d.id, d.client_account_id, d.storage_key AS latest_key,
    v.document_id, v.version, v.storage_key
    FROM cli_client_documents_v2 d
    JOIN cli_document_versions v ON v.document_id=d.id
    JOIN client_accounts a ON a.id=d.client_account_id AND a.status='active'
    JOIN client_access_grants g ON g.client_account_id=a.id AND g.identity_id=$1 AND g.revoked_at IS NULL
    WHERE d.id=$2 AND v.version=$3`, [identity, documentId, version]);
  if (rows.length !== 1) return null;
  const row = rows[0];
  return { authorizedAccountId: row.client_account_id,
    document: { id: row.id, client_account_id: row.client_account_id },
    version: { document_id: row.document_id, version: row.version, storage_key: row.storage_key },
    latestKey: row.latest_key };
}

export async function prepareQaCliV2Transfer({ pool, sourceRoot, bundleDir, trustDir,
  docA, docB, accountA, accountB, identityA, identityB }) {
  const provider = await createQaCliV2LocalProvider(sourceRoot);
  const list = fixtures(docA, docB, accountA, accountB);
  const receipts = [];
  for (const item of list) receipts.push(await provider.put(item));
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    for (const [doc, account, key, suffix, latestVersion] of [
      [docA, accountA, receipts[1].storage_key, 'a', 2],
      [docB, accountB, receipts[2].storage_key, 'b', 1],
    ]) {
      await tx.query(`INSERT INTO cli_client_documents_v2
        (id,client_account_id,title,file_name,file_url,storage_key,version,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'publicado')`,
      [doc, account, `QA backup ${suffix}`, `qa-${suffix}.txt`, `/qa/metadata-${suffix}`, key, latestVersion]);
    }
    for (const receipt of receipts) {
      await tx.query(`INSERT INTO cli_document_versions(document_id,version,file_name,file_url,storage_key)
        VALUES ($1,$2,'qa-synthetic.txt','/qa/metadata-only',$3)`,
      [receipt.document_id, receipt.version, receipt.storage_key]);
    }
    await tx.query('COMMIT');
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally { tx.release(); }

  const archiveDir = bundlePath(bundleDir);
  await mkdir(bundleDir, { recursive: true, mode: 0o700 });
  await mkdir(archiveDir, { mode: 0o700 });
  for (const receipt of receipts) {
    const actor = receipt.client_account_id === accountA ? identityA : identityB;
    const checked = await scope(pool, actor, receipt.document_id, receipt.version);
    if (!checked || checked.version.storage_key !== receipt.storage_key ||
        checked.document.client_account_id !== receipt.client_account_id) throw new Error('qa_cli_source_db_binding_invalid');
    const data = await provider.read({ ...checked, receipt });
    await writeFile(path.join(archiveDir, receipt.storage_key), data, { flag: 'wx', mode: 0o600 });
  }
  const manifest = { format: 'qa-cli-v2-objects-v1', entries: receipts };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const fingerprint = publicKeyFingerprint(publicKey);
  await writeFile(path.join(archiveDir, 'manifest.json'), manifestBytes, { flag: 'wx', mode: 0o600 });
  await writeFile(path.join(archiveDir, 'manifest.sig.json'),
    JSON.stringify(signQaManifest({ bytes: manifestBytes, privateKey, signerPublicKey: publicKey })),
    { flag: 'wx', mode: 0o600 });
  await mkdir(trustDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(trustDir, 'cli-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }),
    { flag: 'wx', mode: 0o600 });
  return { fingerprint, receipts, bytes: list.map(x => x.bytes), docA, docB, accountA, accountB, identityA, identityB };
}

export async function injectQaCliV2CoTamper({ bundleDir }) {
  // Altera SOMENTE o próprio pacote sintético: bytes, manifesto e assinatura.
  // Chave pública falsa dentro do pacote não é âncora confiável.
  const archiveDir = bundlePath(bundleDir);
  const manifestPath = path.join(archiveDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const entry = manifest.entries[1];
  if (!KEY.test(entry?.storage_key)) throw new Error('qa_cli_manifest_invalid');
  const objectPath = path.join(archiveDir, entry.storage_key);
  const changed = await readFile(objectPath);
  changed[0] ^= 0xff;
  await writeFile(objectPath, changed);
  entry.sha256 = sha256(changed);
  const bytes = Buffer.from(JSON.stringify(manifest));
  await writeFile(manifestPath, bytes);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  await writeFile(path.join(archiveDir, 'manifest.sig.json'),
    JSON.stringify(signQaManifest({ bytes, privateKey, signerPublicKey: publicKey })));
  await writeFile(path.join(archiveDir, 'rogue-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
}

// Classificação somente leitura: 'unreferenced' significa SEM referência na DB QA
// atual, não órfão deletável. Pode existir versão válida em snapshot/PITR antigo.
export async function inventoryQaCliV2Objects({ pool, root }) {
  await createQaCliV2LocalProvider(root); // guard de raiz QA + subdiretório não-symlink
  const { rows } = await pool.query(`SELECT storage_key FROM cli_document_versions
    UNION SELECT storage_key FROM cli_client_documents_v2`);
  const references = new Set();
  for (const row of rows) {
    if (!KEY.test(row.storage_key)) throw new Error('qa_cli_inventory_db_key_invalid');
    references.add(row.storage_key);
  }
  const disk = new Set();
  for (const item of await readdir(path.join(root, 'objects'), { withFileTypes: true })) {
    if (!KEY.test(item.name) || !item.isFile()) throw new Error('qa_cli_inventory_file_unsafe');
    disk.add(item.name);
  }
  return { referenced: [...disk].filter(key => references.has(key)).length,
    unreferenced: [...disk].filter(key => !references.has(key)).length,
    missing: [...references].filter(key => !disk.has(key)).length,
    dbKeys: references.size, diskKeys: disk.size };
}

export async function createQaCliV2UnreferencedFixture({ sourceRoot, fixture }) {
  // Somente no runner descartável: simular objeto criado antes de rollback DB.
  const provider = await createQaCliV2LocalProvider(sourceRoot);
  return provider.put({ documentId: fixture.docA, accountId: fixture.accountA, version: 3,
    bytes: Buffer.from('QA CLI A pending v3: synthetic, no committed DB reference.') });
}

export async function restoreQaCliV2Transfer({ pool, destinationRoot, bundleDir, trustDir, fixture,
  injectPartialFailure = false }) {
  if (typeof injectPartialFailure !== 'boolean') throw new Error('qa_cli_injection_invalid');
  const archiveDir = bundlePath(bundleDir);
  const provider = await createQaCliV2LocalProvider(destinationRoot);
  const manifestBytes = await readFile(path.join(archiveDir, 'manifest.json'));
  verifyQaManifest({ bytes: manifestBytes,
    envelope: JSON.parse(await readFile(path.join(archiveDir, 'manifest.sig.json'), 'utf8')),
    trustedPublicKey: await readFile(path.join(trustDir, 'cli-public.pem')),
    pinnedFingerprint: fixture.fingerprint });
  // Antes de gravar qualquer byte: conferir esquema de todos os recibos,
  // vínculos DB/conta/versão/chave e bytes do pacote. Nem URL nem chave isolada
  // equivale a objeto recuperável. Isto NÃO protege contra alteração da DB.
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.format !== 'qa-cli-v2-objects-v1' || manifest.entries?.length !== 3) throw new Error('qa_cli_manifest_invalid');
  const keys = new Set();
  const planned = [];
  for (let index = 0; index < 3; index++) {
    const entry = manifest.entries[index];
    const original = fixture.receipts[index];
    if (!KEY.test(entry?.storage_key) || keys.has(entry.storage_key) ||
        entry.document_id !== original.document_id || entry.client_account_id !== original.client_account_id ||
        entry.version !== original.version || entry.storage_key !== original.storage_key ||
        entry.size_bytes !== original.size_bytes || entry.sha256 !== original.sha256) {
      throw new Error('qa_cli_manifest_source_mismatch');
    }
    keys.add(entry.storage_key);
    const actor = entry.client_account_id === fixture.accountA ? fixture.identityA : fixture.identityB;
    const checked = await scope(pool, actor, entry.document_id, entry.version);
    if (!checked || checked.version.storage_key !== entry.storage_key ||
        checked.document.client_account_id !== entry.client_account_id ||
        ((entry.document_id === fixture.docA && entry.version === 2) || entry.document_id === fixture.docB) &&
        checked.latestKey !== entry.storage_key) throw new Error('qa_cli_restored_db_binding_invalid');
    const data = await readFile(path.join(archiveDir, entry.storage_key));
    if (data.length !== entry.size_bytes || sha256(data) !== entry.sha256) throw new Error('qa_cli_archive_bytes_invalid');
    planned.push({ entry, data, checked });
  }
  const archiveNames = await readdir(archiveDir);
  if (archiveNames.filter(name => KEY.test(name)).length !== 3) throw new Error('qa_cli_archive_inventory_invalid');
  if (await scope(pool, fixture.identityB, fixture.docA, 1) ||
      await scope(pool, fixture.identityA, fixture.docB, 1)) throw new Error('qa_cli_cross_account_scope_failed');
  for (const { entry, data, checked } of planned) {
    await provider.importVerified({ receipt: entry, bytes: data });
    if (!(await provider.read({ ...checked, receipt: entry })).equals(data)) throw new Error('qa_cli_restored_bytes_invalid');
    if (injectPartialFailure) {
      // Injeção APÓS primeiro objeto completo, não uma política de rollback
      // geral para falha de disco, concorrência ou crash. Nunca apagar arquivo
      // preexistente: a escrita acima usa 'wx' e esta raiz é descartável.
      const file = path.join(destinationRoot, 'objects', entry.storage_key);
      const created = await lstat(file);
      const partial = await inventoryQaCliV2Objects({ pool, root: destinationRoot });
      if (!created.isFile() || created.nlink !== 1 || partial.referenced !== 1 || partial.missing !== 2 ||
          partial.dbKeys !== 3) throw new Error('qa_cli_partial_state_invalid');
      const current = await lstat(file);
      if (!current.isFile() || current.dev !== created.dev || current.ino !== created.ino ||
          current.nlink !== 1 || !(await readFile(file)).equals(data)) {
        throw new Error('qa_cli_partial_rollback_unsafe');
      }
      await unlink(file); // somente chave de objeto que o importVerified desta chamada criou
      const recovered = await inventoryQaCliV2Objects({ pool, root: destinationRoot });
      if (recovered.referenced !== 0 || recovered.missing !== 3 ||
          recovered.unreferenced !== partial.unreferenced) throw new Error('qa_cli_partial_rollback_incomplete');
      throw new Error('qa_cli_injected_partial_import_rolled_back');
    }
  }
  return { count: planned.length, provider, scope: (identity, document, version) => scope(pool, identity, document, version) };
}
