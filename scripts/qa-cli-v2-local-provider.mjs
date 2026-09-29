// PLT-BAK-001 / CLI-04: contrato experimental de OBJETOS SINTÉTICOS somente QA.
// Não é provedor do CLI v2 produtivo, autenticador de usuário nem backup.
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const KEY = /^[a-f0-9]{48}$/;
const HASH = /^[a-f0-9]{64}$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_QA_BYTES = 1024 * 1024;

function validateReceipt(receipt) {
  if (!receipt || !UUID.test(receipt.document_id) || !UUID.test(receipt.client_account_id) ||
      !KEY.test(receipt.storage_key) || !Number.isSafeInteger(receipt.version) || receipt.version < 1 ||
      !Number.isSafeInteger(receipt.size_bytes) || receipt.size_bytes < 1 || receipt.size_bytes > MAX_QA_BYTES ||
      !HASH.test(receipt.sha256)) throw new Error('qa_object_receipt_invalid');
}
function validateBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_QA_BYTES) throw new Error('qa_object_bytes_invalid');
}
export async function createQaCliV2LocalProvider(root) {
  const resolved = path.resolve(root || '');
  if (path.dirname(resolved) !== path.resolve(tmpdir()) ||
      !/^seg-qa-cli-contract-[A-Za-z0-9]+$/.test(path.basename(resolved))) {
    throw new Error('qa_object_external_dir_refused');
  }
  const info = await lstat(resolved);
  if (!info.isDirectory() || await realpath(resolved) !== resolved) throw new Error('qa_object_external_dir_refused');
  const objectsDir = path.join(resolved, 'objects');
  await mkdir(objectsDir, { mode: 0o700 }).catch(error => {
    if (error?.code !== 'EEXIST') throw error;
  });
  const obj = await lstat(objectsDir);
  if (!obj.isDirectory() || await realpath(objectsDir) !== objectsDir) throw new Error('qa_object_external_dir_refused');

  const insert = async ({ receipt, bytes }) => {
    validateReceipt(receipt);
    validateBytes(bytes);
    if (bytes.length !== receipt.size_bytes || sha256(bytes) !== receipt.sha256) throw new Error('qa_object_bytes_mismatch');
    await writeFile(path.join(objectsDir, receipt.storage_key), bytes, { flag: 'wx', mode: 0o600 });
    return { ...receipt };
  };
  return {
    async put({ documentId, accountId, version, bytes }) {
      if (!UUID.test(documentId) || !UUID.test(accountId) || !Number.isSafeInteger(version) || version < 1) {
        throw new Error('qa_object_metadata_invalid');
      }
      validateBytes(bytes);
      const receipt = { document_id: documentId, client_account_id: accountId, version,
        storage_key: randomBytes(24).toString('hex'), size_bytes: bytes.length, sha256: sha256(bytes) };
      return insert({ receipt, bytes });
    },
    importVerified: insert, // QA: receipt/hash não assinado; não usar como prova de autenticidade.
    async read({ authorizedAccountId, document, version, receipt }) {
      // A autorização de usuário deve vir de verificação no servidor/DB, não de
      // parâmetro vindo do cliente. Aqui só testamos binding, não login/grants.
      if (!UUID.test(authorizedAccountId) || !document || !version) throw new Error('qa_object_scope_invalid');
      validateReceipt(receipt);
      if (document.client_account_id !== authorizedAccountId) throw new Error('qa_object_account_denied');
      if (document.id !== receipt.document_id || document.client_account_id !== receipt.client_account_id ||
          version.document_id !== document.id || version.version !== receipt.version ||
          version.storage_key !== receipt.storage_key) throw new Error('qa_object_db_binding_invalid');
      const file = path.join(objectsDir, receipt.storage_key);
      let fileInfo;
      try { fileInfo = await lstat(file); } catch (error) {
        if (error?.code === 'ENOENT') throw new Error('qa_object_missing');
        throw error;
      }
      if (!fileInfo.isFile() || fileInfo.size !== receipt.size_bytes) throw new Error('qa_object_file_invalid');
      const bytes = await readFile(file);
      if (sha256(bytes) !== receipt.sha256) throw new Error('qa_object_sha256_mismatch');
      return bytes;
    },
  };
}
