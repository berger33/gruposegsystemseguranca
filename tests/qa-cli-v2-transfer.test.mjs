import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { signQaManifest, publicKeyFingerprint } from '../scripts/qa-detached-manifest-signature.mjs';
import { inventoryQaCliV2Objects, restoreQaCliV2Transfer } from '../scripts/qa-cli-v2-transfer.mjs';

async function roots(t) {
  const destinationRoot = await mkdtemp(path.join(tmpdir(), 'seg-qa-cli-contract-'));
  const bundleDir = await mkdtemp(path.join(tmpdir(), 'qa-cli-transfer-bundle-'));
  const trustDir = await mkdtemp(path.join(tmpdir(), 'qa-cli-transfer-trust-'));
  t.after(async () => { await rm(destinationRoot, { recursive: true, force: true });
    await rm(bundleDir, { recursive: true, force: true }); await rm(trustDir, { recursive: true, force: true }); });
  const archiveDir = path.join(bundleDir, 'cli-v2-objects');
  await mkdir(archiveDir);
  return { destinationRoot, bundleDir, trustDir, archiveDir };
}

test('PLT-BAK-001: assinatura CLI substituída falha antes de consultar DB/escrever destino QA', async t => {
  const { destinationRoot, bundleDir, trustDir, archiveDir } = await roots(t);
  const original = generateKeyPairSync('ed25519');
  const forged = generateKeyPairSync('ed25519');
  const bytes = Buffer.from('{"format":"qa-cli-v2-objects-v1","entries":[]}');
  await writeFile(path.join(archiveDir, 'manifest.json'), bytes);
  await writeFile(path.join(archiveDir, 'manifest.sig.json'), JSON.stringify(signQaManifest({ bytes,
    privateKey: forged.privateKey, signerPublicKey: forged.publicKey })));
  await writeFile(path.join(archiveDir, 'rogue-public.pem'), forged.publicKey.export({ type: 'spki', format: 'pem' }));
  await writeFile(path.join(trustDir, 'cli-public.pem'), original.publicKey.export({ type: 'spki', format: 'pem' }));
  const pool = { query() { throw new Error('DB must not be queried before signature'); } };
  await assert.rejects(restoreQaCliV2Transfer({ pool, destinationRoot, bundleDir, trustDir,
    fixture: { fingerprint: publicKeyFingerprint(original.publicKey) } }), /qa_signature_untrusted_key/);
  assert.deepEqual(await readdir(path.join(destinationRoot, 'objects')), []);
});

test('PLT-BAK-001: pacote assinado mas sem vínculo no DB falha sem escrever nenhum objeto', async t => {
  const { destinationRoot, bundleDir, trustDir, archiveDir } = await roots(t);
  const original = generateKeyPairSync('ed25519');
  const docA = randomUUID(), docB = randomUUID(), accountA = randomUUID(), accountB = randomUUID();
  const receipts = [];
  for (const [document_id, client_account_id, version] of [[docA, accountA, 1], [docA, accountA, 2], [docB, accountB, 1]]) {
    const data = Buffer.from(`QA-only-${document_id}-${version}`);
    const storage_key = createHash('sha256').update(data).digest('hex').slice(0, 48);
    receipts.push({ document_id, client_account_id, version, storage_key,
      size_bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    await writeFile(path.join(archiveDir, storage_key), data);
  }
  const bytes = Buffer.from(JSON.stringify({ format: 'qa-cli-v2-objects-v1', entries: receipts }));
  await writeFile(path.join(archiveDir, 'manifest.json'), bytes);
  await writeFile(path.join(archiveDir, 'manifest.sig.json'), JSON.stringify(signQaManifest({ bytes,
    privateKey: original.privateKey, signerPublicKey: original.publicKey })));
  await writeFile(path.join(trustDir, 'cli-public.pem'), original.publicKey.export({ type: 'spki', format: 'pem' }));
  const pool = { async query() { return { rows: [] }; } };
  await assert.rejects(restoreQaCliV2Transfer({ pool, destinationRoot, bundleDir, trustDir,
    fixture: { fingerprint: publicKeyFingerprint(original.publicKey), receipts, accountA, accountB,
      identityA: randomUUID(), identityB: randomUUID(), docA, docB } }), /qa_cli_restored_db_binding_invalid/);
  assert.deepEqual(await readdir(path.join(destinationRoot, 'objects')), []);
});

test('PLT-BAK-001: falha após 1/3 importa, remove só arquivo criado; desconhecido permanece e permite retry', async t => {
  const { destinationRoot, bundleDir, trustDir, archiveDir } = await roots(t);
  const signer = generateKeyPairSync('ed25519');
  const docA = randomUUID(), docB = randomUUID(), accountA = randomUUID(), accountB = randomUUID();
  const identityA = randomUUID(), identityB = randomUUID();
  const entries = [];
  for (const [document_id, client_account_id, version] of [[docA, accountA, 1], [docA, accountA, 2], [docB, accountB, 1]]) {
    const data = Buffer.from(`QA-unit-${document_id}-${version}`);
    const storage_key = createHash('sha256').update(data).digest('hex').slice(0, 48);
    entries.push({ document_id, client_account_id, version, storage_key,
      size_bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    await writeFile(path.join(archiveDir, storage_key), data);
  }
  const bytes = Buffer.from(JSON.stringify({ format: 'qa-cli-v2-objects-v1', entries }));
  await writeFile(path.join(archiveDir, 'manifest.json'), bytes);
  await writeFile(path.join(archiveDir, 'manifest.sig.json'), JSON.stringify(signQaManifest({ bytes,
    privateKey: signer.privateKey, signerPublicKey: signer.publicKey })));
  await writeFile(path.join(trustDir, 'cli-public.pem'), signer.publicKey.export({ type: 'spki', format: 'pem' }));
  const fixture = { fingerprint: publicKeyFingerprint(signer.publicKey), receipts: entries,
    docA, docB, accountA, accountB, identityA, identityB };
  const pool = { async query(sql, args) {
    if (sql.includes('UNION SELECT storage_key')) return { rows: entries.map(x => ({ storage_key: x.storage_key })) };
    const [actor, doc, version] = args;
    const found = entries.find(e => e.document_id === doc && e.version === version);
    if (!found || actor !== (found.client_account_id === accountA ? identityA : identityB)) return { rows: [] };
    return { rows: [{ id: doc, client_account_id: found.client_account_id, document_id: doc,
      version, storage_key: found.storage_key,
      latest_key: entries.findLast(e => e.document_id === doc).storage_key }] };
  } };
  const canary = 'b'.repeat(48), canaryBytes = Buffer.from('Unknown QA canary, retain');
  await mkdir(path.join(destinationRoot, 'objects'));
  await writeFile(path.join(destinationRoot, 'objects', canary), canaryBytes);
  await assert.rejects(restoreQaCliV2Transfer({ pool, destinationRoot, bundleDir, trustDir, fixture,
    injectPartialFailure: true }), /qa_cli_injected_partial_import_rolled_back/);
  assert.deepEqual(await inventoryQaCliV2Objects({ pool, root: destinationRoot }),
    { referenced: 0, unreferenced: 1, missing: 3, dbKeys: 3, diskKeys: 1 });
  assert.deepEqual(await readFile(path.join(destinationRoot, 'objects', canary)), canaryBytes);
  const done = await restoreQaCliV2Transfer({ pool, destinationRoot, bundleDir, trustDir, fixture });
  assert.equal(done.count, 3);
  assert.deepEqual(await inventoryQaCliV2Objects({ pool, root: destinationRoot }),
    { referenced: 3, unreferenced: 1, missing: 0, dbKeys: 3, diskKeys: 4 });
  const unsafe = path.join(destinationRoot, 'objects', 'a'.repeat(48));
  await symlink(path.join(destinationRoot, 'objects', canary), unsafe);
  await assert.rejects(inventoryQaCliV2Objects({ pool, root: destinationRoot }), /qa_cli_inventory_file_unsafe/);
  assert.deepEqual(await readFile(path.join(destinationRoot, 'objects', canary)), canaryBytes);
});
