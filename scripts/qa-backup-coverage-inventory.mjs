// PLT-BAK-001: inventário QA limitado a diretório temporário controlado.
// Não examina paths de operador; não é executor de backup nem garante cobertura
// integral do produto. Colunas não classificadas nunca são tratadas como bytes.
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { groupStorageContracts, storageContractFor } from './qa-storage-contracts.mjs';

const KEY = /^[a-f0-9]{48}$/;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const quoted = name => `"${name.replaceAll('"', '""')}"`;

export async function inventoryQaFileCoverage({ pool, qaRoot, docsDir, manifest, requireFull = false }) {
  if (!qaRoot || !docsDir || !path.resolve(docsDir).startsWith(`${path.resolve(qaRoot)}${path.sep}`)) {
    throw new Error('qa_inventory_external_dir_refused');
  }
  // Não seguir um link no diretório QA para fora da raiz (mesmo que seu path
  // lexical pareça seguro). Runner usa exclusivamente diretórios recém-criados.
  const rootReal = await realpath(qaRoot);
  const docsReal = await realpath(docsDir).catch(error => {
    if (error?.code === 'ENOENT') throw new Error('qa_inventory_legacy_file_missing');
    throw error;
  });
  if (!docsReal.startsWith(`${rootReal}${path.sep}`)) throw new Error('qa_inventory_external_dir_refused');
  if (manifest?.format !== 'qa-synthetic-document-v1' || !Array.isArray(manifest.entries) || manifest.entries.length !== 1) {
    throw new Error('qa_inventory_manifest_invalid');
  }
  // Mapear colunas por catálogo, sem buscar valores potencialmente pessoais de
  // tabelas desconhecidas. LIKE é deliberadamente amplo e não prova exaustão.
  const { rows: columns } = await pool.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND
      (column_name LIKE '%storage_key%' OR column_name LIKE '%file_url%' OR
       column_name LIKE '%receipt_url%' OR column_name LIKE '%proof_url%' OR
       column_name LIKE '%evidence_url%' OR column_name LIKE '%document_url%')
    ORDER BY table_name, column_name`);
  if (!Array.isArray(columns) || !columns.some(c => c.table_name === 'client_documents' && c.column_name === 'storage_key')) {
    throw new Error('qa_inventory_schema_missing');
  }
  const references = [];
  for (const { table_name: table, column_name: column } of columns) {
    if (typeof table !== 'string' || typeof column !== 'string') throw new Error('qa_inventory_schema_invalid');
    const { rows: [result] } = await pool.query(`SELECT count(*)::int AS n FROM public.${quoted(table)} WHERE ${quoted(column)} IS NOT NULL AND btrim(${quoted(column)}::text) <> ''`);
    if (!Number.isSafeInteger(result?.n) || result.n < 0) throw new Error('qa_inventory_count_invalid');
    const { contract } = storageContractFor(table, column);
    references.push({ table, column, n: result.n, category:
      contract === 'local-private-file-candidate' ? 'legacy-local-bytes' : 'unclassified-reference' });
  }
  const { rows: documents } = await pool.query('SELECT id, client_account_id, storage_key, size_bytes FROM client_documents ORDER BY id');
  const listed = await readdir(docsDir, { withFileTypes: true }).catch(error => {
    if (error?.code === 'ENOENT') throw new Error('qa_inventory_legacy_file_missing');
    throw error;
  });
  const keys = new Set();
  for (const row of documents) {
    if (!UUID.test(row.id) || !UUID.test(row.client_account_id) || !KEY.test(row.storage_key) ||
        !Number.isSafeInteger(row.size_bytes) || row.size_bytes < 1 || keys.has(row.storage_key)) {
      throw new Error('qa_inventory_legacy_metadata_invalid');
    }
    keys.add(row.storage_key);
    const entry = manifest.entries.find(e => e.document_id === row.id);
    if (!entry || entry.client_account_id !== row.client_account_id || entry.storage_key !== row.storage_key ||
        entry.size_bytes !== row.size_bytes || !HASH.test(entry.sha256)) throw new Error('qa_inventory_manifest_db_mismatch');
    const file = path.join(docsDir, row.storage_key);
    let info;
    try { info = await lstat(file); } catch (error) {
      if (error?.code === 'ENOENT') throw new Error('qa_inventory_legacy_file_missing');
      throw error;
    }
    if (!info.isFile() || info.size !== row.size_bytes || hash(await readFile(file)) !== entry.sha256) {
      throw new Error('qa_inventory_legacy_file_mismatch');
    }
  }
  if (manifest.entries.length !== documents.length ||
      references.find(r => r.category === 'legacy-local-bytes')?.n !== documents.length) {
    throw new Error('qa_inventory_manifest_db_mismatch');
  }
  if (listed.length !== keys.size || listed.some(file => !file.isFile() || !keys.has(file.name))) {
    throw new Error('qa_inventory_orphan_file');
  }
  const unresolved = references.filter(r => r.category === 'unclassified-reference' && r.n > 0);
  const result = { candidateColumns: references.length, legacyVerified: documents.length,
    families: groupStorageContracts(references),
    unmappedCandidates: references.filter(r => storageContractFor(r.table, r.column).family === 'unmapped')
      .map(({ table, column, n }) => ({ table, column, n })),
    unresolved: unresolved.map(({ table, column, n }) => ({ table, column, n,
      family: storageContractFor(table, column).family })),
    unresolvedRows: unresolved.reduce((total, r) => total + r.n, 0) };
  if (requireFull) {
    if (result.unresolvedRows > 0) throw new Error('qa_inventory_unresolved_references');
    // Regex do catálogo, arquivos externos, WAL e consistência concorrente não
    // foram comprovados. Mesmo sem colunas preenchidas, não certificar full.
    throw new Error('qa_inventory_full_scope_not_certified');
  }
  return result; // cobertura apenas do legado sintético, não do sistema inteiro
}
