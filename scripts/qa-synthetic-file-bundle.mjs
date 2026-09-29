// PLT-BAK-001: protótipo QA SOMENTE para uma fixture sintética de documento
// do portal legado. Não é backup operacional, não criptografa nem aceita diretórios
// de operador. Os caminhos recebidos são criados pelo runner em mkdtemp.
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = /^[a-f0-9]{48}$/;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function validateRow(row) {
  if (!row || !UUID.test(row.id) || !UUID.test(row.client_account_id) ||
      !KEY.test(row.storage_key) || !Number.isSafeInteger(row.size_bytes) || row.size_bytes < 1) {
    throw new Error('qa_file_metadata_invalid');
  }
}

export async function saveSyntheticFileBundle({ pool, documentId, sourceDir, bundleDir }) {
  if (!UUID.test(documentId)) throw new Error('qa_file_document_id_invalid');
  const { rows } = await pool.query(
    'SELECT id, client_account_id, storage_key, size_bytes FROM client_documents WHERE id=$1', [documentId]);
  if (rows.length !== 1) throw new Error('qa_file_document_not_found');
  const row = rows[0];
  validateRow(row);
  const source = path.join(sourceDir, row.storage_key);
  const fileInfo = await lstat(source);
  if (!fileInfo.isFile() || fileInfo.size !== row.size_bytes) throw new Error('qa_file_source_size_mismatch');
  const bytes = await readFile(source);
  const entry = { document_id: row.id, client_account_id: row.client_account_id,
    storage_key: row.storage_key, size_bytes: bytes.length, sha256: hash(bytes) };
  const manifest = { format: 'qa-synthetic-document-v1', entries: [entry] };
  await mkdir(bundleDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(bundleDir, row.storage_key), bytes, { flag: 'wx', mode: 0o600 });
  await writeFile(path.join(bundleDir, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 });
  return { entry, manifest_sha256: hash(Buffer.from(JSON.stringify(manifest))) };
}

export async function restoreSyntheticFileBundle({ pool, bundleDir, destinationDir, expectedManifestSha256 }) {
  // Pin fornecido pelo criador QA nesta mesma execução, NÃO por manifest.json.
  // Não é uma solução de custódia/distribuição de chave ou backup operacional.
  if (!/^[a-f0-9]{64}$/.test(expectedManifestSha256)) throw new Error('qa_file_manifest_pin_required');
  const manifestBytes = await readFile(path.join(bundleDir, 'manifest.json'));
  if (hash(manifestBytes) !== expectedManifestSha256) throw new Error('qa_file_manifest_sha256_mismatch');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest?.format !== 'qa-synthetic-document-v1' || manifest.entries?.length !== 1) throw new Error('qa_file_manifest_invalid');
  const entry = manifest.entries[0];
  if (!UUID.test(entry.document_id) || !UUID.test(entry.client_account_id) ||
      !KEY.test(entry.storage_key) || !Number.isSafeInteger(entry.size_bytes) || entry.size_bytes < 1 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('qa_file_manifest_invalid');
  const { rows } = await pool.query(
    'SELECT id, client_account_id, storage_key, size_bytes FROM client_documents WHERE id=$1', [entry.document_id]);
  if (rows.length !== 1) throw new Error('qa_file_restored_metadata_missing');
  const row = rows[0];
  validateRow(row);
  if (entry.document_id !== row.id || entry.client_account_id !== row.client_account_id ||
      entry.storage_key !== row.storage_key || entry.size_bytes !== row.size_bytes) throw new Error('qa_file_manifest_db_mismatch');
  const source = path.join(bundleDir, entry.storage_key);
  const fileInfo = await lstat(source);
  if (!fileInfo.isFile() || fileInfo.size !== entry.size_bytes) throw new Error('qa_file_archive_size_mismatch');
  const bytes = await readFile(source);
  if (hash(bytes) !== entry.sha256) throw new Error('qa_file_archive_sha256_mismatch');
  await mkdir(destinationDir, { recursive: true, mode: 0o700 });
  const dest = path.join(destinationDir, entry.storage_key);
  await writeFile(dest, bytes, { flag: 'wx', mode: 0o600 });
  if (hash(await readFile(dest)) !== entry.sha256) throw new Error('qa_file_restored_sha256_mismatch');
  return { entry, manifest_sha256: hash(manifestBytes) };
}
