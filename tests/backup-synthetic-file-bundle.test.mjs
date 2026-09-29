import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveSyntheticFileBundle, restoreSyntheticFileBundle } from '../scripts/qa-synthetic-file-bundle.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'qa-bundle-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'source');
  const bundleDir = path.join(root, 'bundle');
  const destinationDir = path.join(root, 'destination');
  const bytes = Buffer.from('QA synthetic bytes only, account A.');
  const row = { id: randomUUID(), client_account_id: randomUUID(),
    storage_key: randomBytes(24).toString('hex'), size_bytes: bytes.length };
  const pool = { async query(sql, [id]) {
    assert.match(sql, /FROM client_documents WHERE id=\$1/);
    return { rows: id === row.id ? [row] : [] };
  } };
  await mkdir(sourceDir, { mode: 0o700 });
  await writeFile(path.join(sourceDir, row.storage_key), bytes, { mode: 0o600 });
  return { row, bytes, pool, sourceDir, bundleDir, destinationDir };
}

test('PLT-BAK-001: manifesto liga bytes sintéticos ao ID/conta/chave/tamanho do DB', async t => {
  const f = await fixture(t);
  const saved = await saveSyntheticFileBundle({ pool: f.pool, documentId: f.row.id,
    sourceDir: f.sourceDir, bundleDir: f.bundleDir });
  const restored = await restoreSyntheticFileBundle({ pool: f.pool, bundleDir: f.bundleDir, destinationDir: f.destinationDir, expectedManifestSha256: saved.manifest_sha256 });
  assert.deepEqual(restored, saved);
  assert.deepEqual(await readFile(path.join(f.destinationDir, f.row.storage_key)), f.bytes);
});

test('PLT-BAK-001: byte adulterado sem mudar tamanho impede restore', async t => {
  const f = await fixture(t);
  const saved = await saveSyntheticFileBundle({ pool: f.pool, documentId: f.row.id,
    sourceDir: f.sourceDir, bundleDir: f.bundleDir });
  const altered = Buffer.from(f.bytes);
  altered[0] ^= 0xff;
  await writeFile(path.join(f.bundleDir, f.row.storage_key), altered);
  await assert.rejects(restoreSyntheticFileBundle({ pool: f.pool, bundleDir: f.bundleDir, destinationDir: f.destinationDir, expectedManifestSha256: saved.manifest_sha256 }),
    /qa_file_archive_sha256_mismatch/);
  await assert.rejects(readFile(path.join(f.destinationDir, f.row.storage_key)), { code: 'ENOENT' });
});

test('PLT-BAK-001: adulterar manifesto e bytes juntos exige pin ORIGINAL externo ao pacote', async t => {
  const f = await fixture(t);
  const saved = await saveSyntheticFileBundle({ pool: f.pool, documentId: f.row.id,
    sourceDir: f.sourceDir, bundleDir: f.bundleDir });
  const altered = Buffer.from(f.bytes);
  altered[0] ^= 0xff; // mesmo tamanho; atacante atualiza também o sha256 do manifesto
  await writeFile(path.join(f.bundleDir, f.row.storage_key), altered);
  const manifestPath = path.join(f.bundleDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.entries[0].sha256 = createHash('sha256').update(altered).digest('hex');
  const alteredManifest = Buffer.from(JSON.stringify(manifest));
  await writeFile(manifestPath, alteredManifest);
  await assert.rejects(restoreSyntheticFileBundle({ pool: f.pool, bundleDir: f.bundleDir,
    destinationDir: f.destinationDir, expectedManifestSha256: saved.manifest_sha256 }),
  /qa_file_manifest_sha256_mismatch/);
  await assert.rejects(readFile(path.join(f.destinationDir, f.row.storage_key)), { code: 'ENOENT' });

  // Prova do limite: aceitar como pin o hash do próprio pacote alterado aprova
  // ambos os arquivos. Sem canal independente de confiança, SHA-256 não autentica.
  const attackerPin = createHash('sha256').update(alteredManifest).digest('hex');
  const result = await restoreSyntheticFileBundle({ pool: f.pool, bundleDir: f.bundleDir,
    destinationDir: f.destinationDir, expectedManifestSha256: attackerPin });
  assert.equal(result.manifest_sha256, attackerPin);
  assert.deepEqual(await readFile(path.join(f.destinationDir, f.row.storage_key)), altered);
});

test('PLT-BAK-001: sem pin independente o helper QA recusa restore', async t => {
  const f = await fixture(t);
  await saveSyntheticFileBundle({ pool: f.pool, documentId: f.row.id,
    sourceDir: f.sourceDir, bundleDir: f.bundleDir });
  await assert.rejects(restoreSyntheticFileBundle({ pool: f.pool, bundleDir: f.bundleDir,
    destinationDir: f.destinationDir }), /qa_file_manifest_pin_required/);
  await assert.rejects(readFile(path.join(f.destinationDir, f.row.storage_key)), { code: 'ENOENT' });
});

test('PLT-BAK-001: conta divergente no DB restaurado impede associação do arquivo', async t => {
  const f = await fixture(t);
  const saved = await saveSyntheticFileBundle({ pool: f.pool, documentId: f.row.id,
    sourceDir: f.sourceDir, bundleDir: f.bundleDir });
  f.row.client_account_id = randomUUID();
  await assert.rejects(restoreSyntheticFileBundle({ pool: f.pool, bundleDir: f.bundleDir, destinationDir: f.destinationDir, expectedManifestSha256: saved.manifest_sha256 }),
    /qa_file_manifest_db_mismatch/);
  await assert.rejects(readFile(path.join(f.destinationDir, f.row.storage_key)), { code: 'ENOENT' });
});

test('PLT-BAK-001: chave fora de hexadecimal não é tratada como caminho de backup', async t => {
  const f = await fixture(t);
  f.row.storage_key = '../arquivo-real';
  await assert.rejects(saveSyntheticFileBundle({ pool: f.pool, documentId: f.row.id,
    sourceDir: f.sourceDir, bundleDir: f.bundleDir }), /qa_file_metadata_invalid/);
});
