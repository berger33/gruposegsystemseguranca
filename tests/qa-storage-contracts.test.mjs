import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { groupStorageContracts, storageContractFor } from '../scripts/qa-storage-contracts.mjs';

const source = name => readFile(new URL(`../src/server/${name}`, import.meta.url), 'utf8');

test('PLT-BAK-001: contrato legado aponta escrita/leitura local mas só inventário certifica bytes', async () => {
  const legacy = storageContractFor('client_documents', 'storage_key');
  assert.equal(legacy.contract, 'local-private-file-candidate');
  const code = await source('client-space-api.mjs');
  assert.match(code, /storedPath = path\.join\(ctx\.docsDir, storageKey\)/);
  assert.match(code, /writeFile\(storedPath, content, \{ flag: "wx" \}\)/);
  assert.match(code, /if \(storedPath\) await unlink\(storedPath\)/);
  assert.match(code, /contents.*await Promise\.all\(\[stat\(filePath\), readFile\(filePath\)\]\)/s);
  assert.match(code, /await auditOr503[\s\S]*res\.writeHead\(200/);
  assert.match(code, /res\.end\(contents\)/);
  assert.match(code, /INSERT INTO client_documents/);
});

test('PLT-BAK-001: CLI v2 armazena URL/chave como metadados, sem prova de bytes no módulo', async () => {
  const code = await source('cli-api.mjs');
  assert.match(code, /INSERT INTO cli_client_documents_v2/);
  assert.match(code, /INSERT INTO cli_document_versions/);
  assert.match(code, /download_url: doc\.file_url/);
  assert.match(code, /URL não é streaming privado nem comprovante/);
  assert.doesNotMatch(code, /\b(writeFile|createWriteStream|createReadStream|fetch)\s*\(/);
  for (const table of ['cli_client_documents_v2', 'cli_document_versions']) {
    for (const column of ['file_url', 'storage_key']) {
      assert.equal(storageContractFor(table, column).contract, 'metadata-reference-no-owned-bytes-proven');
    }
  }
});

test('PLT-BAK-001: URLs plausíveis e chaves de RH/OPS/FIN não viram bytes verificados por nome', () => {
  const entries = [
    { table: 'cli_client_documents_v2', column: 'file_url', n: 1 },
    { table: 'hr_occupational_documents', column: 'storage_key', n: 1 },
    { table: 'ops_occurrence_evidences', column: 'file_url', n: 1 },
    { table: 'fin_expenses', column: 'evidence_storage_key', n: 1 },
    { table: 'mystery_uploads', column: 'proof_url', n: 1 },
  ];
  const groups = groupStorageContracts(entries);
  assert.deepEqual(groups.map(g => [g.family, g.unprovenReferences]), [
    ['cli-v2', 1], ['finance', 1], ['hr', 1], ['operations', 1], ['unmapped', 1],
  ]);
  assert.equal(groups.reduce((n, g) => n + g.localCandidateReferences, 0), 0);
  assert.equal(storageContractFor('client_documents', 'file_url').contract, 'uninvestigated-reference');
  assert.equal(storageContractFor('adm_reports', 'file_url').family, 'administration');
  assert.equal(storageContractFor('cms_contents', 'storage_key').family, 'cms');
  assert.equal(storageContractFor('staff_time_entries', 'evidence_storage_key').family, 'staff');
  assert.equal(storageContractFor('staff_time_entries', 'evidence_storage_key').contract, 'uninvestigated-reference');
});
