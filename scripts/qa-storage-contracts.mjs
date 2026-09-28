// PLT-BAK-001: mapa de proveniência QA, conservador. NÃO é registry de storage
// operacional, nem atestado de bytes acessíveis. Somente client_documents legado
// tem writer/reader locais identificados e bytes verificados pelo inventário QA.
const known = new Map([
  ['client_documents.storage_key', {
    family: 'client-legacy', contract: 'local-private-file-candidate',
    producer: 'src/server/client-space-api.mjs:handleAdminDocuments',
    consumer: 'src/server/client-space-api.mjs:streamDocument',
  }],
  ...['cli_client_documents_v2', 'cli_document_versions'].flatMap(table =>
    ['file_url', 'storage_key'].map(column => [`${table}.${column}`, {
      family: 'cli-v2', contract: 'metadata-reference-no-owned-bytes-proven',
      producer: 'src/server/cli-api.mjs:handleClientDocumentsV2/handleDocumentVersions',
      consumer: 'src/server/cli-api.mjs:handleDocumentDownload (URL metadata only)',
    }])),
]);

const families = [
  [/^hr_/, 'hr'], [/^fin_/, 'finance'], [/^ops_/, 'operations'],
  [/^crm_/, 'crm'], [/^cli_/, 'cli-v2'], [/^emp_/, 'employee'],
  [/^ast_/, 'assets'], [/^ext_/, 'external'], [/^con_/, 'contracts'],
  [/^adm_/, 'administration'], [/^cms_/, 'cms'], [/^staff_/, 'staff'],
  [/^client_/, 'client-other'],
];

export function storageContractFor(table, column) {
  if (typeof table !== 'string' || typeof column !== 'string') throw new Error('qa_contract_column_invalid');
  const entry = known.get(`${table}.${column}`);
  if (entry) return { ...entry };
  return { family: families.find(([pattern]) => pattern.test(table))?.[1] || 'unmapped',
    contract: 'uninvestigated-reference', producer: null, consumer: null };
}

export function groupStorageContracts(references) {
  const buckets = new Map();
  for (const { table, column, n } of references) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('qa_contract_count_invalid');
    const { family, contract } = storageContractFor(table, column);
    const group = buckets.get(family) || { family, candidateColumns: 0, nonemptyReferences: 0,
      localCandidateReferences: 0, unprovenReferences: 0 };
    group.candidateColumns += 1;
    group.nonemptyReferences += n;
    // classificar fonte NÃO prova bytes: legacy só pode ser contado depois
    // da verificação DB/manifesto/arquivo em inventoryQaFileCoverage.
    if (contract === 'local-private-file-candidate') group.localCandidateReferences += n;
    else group.unprovenReferences += n;
    buckets.set(family, group);
  }
  return [...buckets.values()].sort((a, b) => a.family.localeCompare(b.family));
}
