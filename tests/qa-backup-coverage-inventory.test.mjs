import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inventoryQaFileCoverage } from '../scripts/qa-backup-coverage-inventory.mjs';

async function fixture(t, { unknown = 1 } = {}) {
  const qaRoot = await mkdtemp(path.join(tmpdir(), 'qa-coverage-unit-'));
  t.after(() => rm(qaRoot, { recursive: true, force: true }));
  const docsDir = path.join(qaRoot, 'restored-documents');
  await mkdir(docsDir, { mode: 0o700 });
  const bytes = Buffer.from('Only QA synthetic private bytes.');
  const row = { id: randomUUID(), client_account_id: randomUUID(),
    storage_key: randomBytes(24).toString('hex'), size_bytes: bytes.length };
  await writeFile(path.join(docsDir, row.storage_key), bytes);
  const manifest = { format: 'qa-synthetic-document-v1', entries: [{ document_id: row.id,
    client_account_id: row.client_account_id, storage_key: row.storage_key,
    size_bytes: row.size_bytes, sha256: createHash('sha256').update(bytes).digest('hex') }] };
  const columns = [{ table_name: 'cli_client_documents_v2', column_name: 'storage_key' },
    { table_name: 'client_documents', column_name: 'storage_key' }];
  const pool = { async query(sql) {
    if (sql.includes('information_schema.columns')) return { rows: columns };
    if (sql.startsWith('SELECT count(*)::int')) {
      return { rows: [{ n: sql.includes('public."client_documents"') ? 1 : unknown }] };
    }
    if (sql.startsWith('SELECT id, client_account_id')) return { rows: [row] };
    throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
  } };
  return { qaRoot, docsDir, bytes, row, manifest, pool };
}

test('PLT-BAK-001: prova bytes legados mas não converte storage_key v2 em arquivo', async t => {
  const f = await fixture(t);
  const result = await inventoryQaFileCoverage(f);
  assert.equal(result.legacyVerified, 1);
  assert.equal(result.candidateColumns, 2);
  assert.deepEqual(result.unresolved, [{ table: 'cli_client_documents_v2', column: 'storage_key', n: 1, family: 'cli-v2' }]);
  assert.deepEqual(result.families, [
    { family: 'cli-v2', candidateColumns: 1, nonemptyReferences: 1, localCandidateReferences: 0, unprovenReferences: 1 },
    { family: 'client-legacy', candidateColumns: 1, nonemptyReferences: 1, localCandidateReferences: 1, unprovenReferences: 0 },
  ]);
  await assert.rejects(inventoryQaFileCoverage({ ...f, requireFull: true }), /qa_inventory_unresolved_references/);
});

test('PLT-BAK-001: coluna vazia não basta para certificar cobertura integral do produto', async t => {
  const f = await fixture(t, { unknown: 0 });
  assert.equal((await inventoryQaFileCoverage(f)).unresolvedRows, 0);
  await assert.rejects(inventoryQaFileCoverage({ ...f, requireFull: true }), /qa_inventory_full_scope_not_certified/);
});

test('PLT-BAK-001: bytes ausentes, corrompidos ou órfãos negam até escopo legado', async t => {
  const f = await fixture(t);
  const file = path.join(f.docsDir, f.row.storage_key);
  await unlink(file);
  await assert.rejects(inventoryQaFileCoverage(f), /qa_inventory_legacy_file_missing/);
  await writeFile(file, Buffer.from('Tampered bytes of different size.'));
  await assert.rejects(inventoryQaFileCoverage(f), /qa_inventory_legacy_file_mismatch/);
  await writeFile(file, f.bytes);
  await writeFile(path.join(f.docsDir, randomBytes(24).toString('hex')), 'QA orphan');
  await assert.rejects(inventoryQaFileCoverage(f), /qa_inventory_orphan_file/);
});

test('PLT-BAK-001: não aceitar diretório fora da raiz QA antes de ler banco ou bytes', async t => {
  const f = await fixture(t);
  await assert.rejects(inventoryQaFileCoverage({ ...f, docsDir: path.join(tmpdir(), 'operator-private') }),
    /qa_inventory_external_dir_refused/);
  const link = path.join(f.qaRoot, 'outside-link');
  await symlink(tmpdir(), link);
  await assert.rejects(inventoryQaFileCoverage({ ...f, docsDir: link }),
    /qa_inventory_external_dir_refused/);
});
