import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createQaCliV2LocalProvider } from '../scripts/qa-cli-v2-local-provider.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'seg-qa-cli-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const provider = await createQaCliV2LocalProvider(root);
  const [accountA, accountB, documentId] = Array.from({ length: 3 }, () => randomUUID());
  const document = { id: documentId, client_account_id: accountA };
  return { root, provider, accountA, accountB, documentId, document };
}

const query = (f, receipt, overrides = {}) => ({ authorizedAccountId: f.accountA,
  document: f.document, version: { document_id: f.documentId,
    version: receipt.version, storage_key: receipt.storage_key,
    file_url: 'https://example.invalid/metadata-is-not-storage' }, receipt, ...overrides });

test('PLT-BAK-001 / CLI-04: objeto QA v1/v2 imutável e export/import de bytes sintéticos', async t => {
  const f = await fixture(t);
  const one = Buffer.from('QA A version one - only synthetic.');
  const two = Buffer.from('QA A version two - only synthetic.');
  const r1 = await f.provider.put({ documentId: f.documentId, accountId: f.accountA, version: 1, bytes: one });
  const r2 = await f.provider.put({ documentId: f.documentId, accountId: f.accountA, version: 2, bytes: two });
  assert.notEqual(r1.storage_key, r2.storage_key);
  assert.deepEqual(await f.provider.read(query(f, r1)), one);
  assert.deepEqual(await f.provider.read(query(f, r2)), two);
  const dest = await fixture(t); // diretório separado, sem compartilhar objetos
  await assert.rejects(dest.provider.read(query(f, r1)), /qa_object_missing/);
  await dest.provider.importVerified({ receipt: r1, bytes: one });
  assert.deepEqual(await dest.provider.read(query(f, r1)), one);
  await assert.rejects(dest.provider.importVerified({ receipt: r1, bytes: one }), { code: 'EEXIST' });
});

test('PLT-BAK-001 / CLI-04: outra conta, outro ID/versão/chave e URL não liberam bytes', async t => {
  const f = await fixture(t);
  const receipt = await f.provider.put({ documentId: f.documentId, accountId: f.accountA,
    version: 1, bytes: Buffer.from('QA private A only') });
  await assert.rejects(f.provider.read(query(f, receipt, { authorizedAccountId: f.accountB })), /qa_object_account_denied/);
  await assert.rejects(f.provider.read(query(f, receipt, { document: { ...f.document, id: randomUUID() } })), /qa_object_db_binding_invalid/);
  await assert.rejects(f.provider.read(query(f, receipt, { version: { document_id: f.documentId, version: 2, storage_key: receipt.storage_key } })), /qa_object_db_binding_invalid/);
  await assert.rejects(f.provider.read(query(f, receipt, { version: { document_id: f.documentId, version: 1, storage_key: 'a'.repeat(48) } })), /qa_object_db_binding_invalid/);
  await assert.rejects(f.provider.read(query(f, { ...receipt, storage_key: '../operator' })), /qa_object_receipt_invalid/);
});

test('PLT-BAK-001 / CLI-04: byte alterado ou ausente falha e não é importado', async t => {
  const f = await fixture(t);
  const bytes = Buffer.from('QA immutable fixture');
  const receipt = await f.provider.put({ documentId: f.documentId, accountId: f.accountA, version: 1, bytes });
  const tampered = Buffer.from(bytes);
  tampered[0] ^= 0xff; // mesmo tamanho
  await writeFile(path.join(f.root, 'objects', receipt.storage_key), tampered); // falha injetada somente em /tmp QA
  await assert.rejects(f.provider.read(query(f, receipt)), /qa_object_sha256_mismatch/);
  const dest = await fixture(t);
  await assert.rejects(dest.provider.importVerified({ receipt, bytes: tampered }), /qa_object_bytes_mismatch/);
  await assert.rejects(readFile(path.join(dest.root, 'objects', receipt.storage_key)), { code: 'ENOENT' });
});

test('PLT-BAK-001 / CLI-04: diretório operador e symlink fora do QA são recusados', async t => {
  await assert.rejects(createQaCliV2LocalProvider('/operator/private-docs'), /qa_object_external_dir_refused/);
  const root = await mkdtemp(path.join(tmpdir(), 'seg-qa-cli-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await symlink(tmpdir(), path.join(root, 'objects'));
  await assert.rejects(createQaCliV2LocalProvider(root), /qa_object_external_dir_refused/);
});
