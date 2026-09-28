// PLT-BAK-001 — contrato PURO de classificação QA; não é WAL/PITR ou GC real.
// Apenas snapshots de referências INVENTADAS assinados fora do pacote podem
// informar quais versões antigas conservar. Nunca retorna lista de exclusão.
import { verifyQaManifest } from './qa-detached-manifest-signature.mjs';

const KEY = /^[a-f0-9]{48}$/;
const POINT = /^[a-z0-9][a-z0-9-]{1,39}$/;
const FORMAT = 'qa-cli-v2-restore-point-references-v1';

function uniqueSorted(values, pattern, label, max) {
  if (!Array.isArray(values) || values.length > max ||
      values.some(item => typeof item !== 'string' || !pattern.test(item)) ||
      new Set(values).size !== values.length || values.some((item, index) => index && values[index - 1] >= item)) {
    throw new Error(`qa_reconcile_${label}_invalid`);
  }
  return values;
}

// Todos os pontos obrigatórios, fingerprints e chave pública vêm de fora do
// pacote. Assinatura não prova que snapshot contém TODOS os objetos de um PITR:
// isso depende de um mecanismo operacional ainda inexistente.
export function reconcileQaRestorePoints({ diskKeys, currentDbKeys, requiredPointIds, points,
  trustedPublicKey, pinnedFingerprint }) {
  uniqueSorted(diskKeys, KEY, 'disk', 32);
  uniqueSorted(currentDbKeys, KEY, 'db', 32);
  uniqueSorted(requiredPointIds, POINT, 'required_points', 8);
  if (!requiredPointIds.length || !Array.isArray(points) || points.length !== requiredPointIds.length) {
    throw new Error('qa_reconcile_required_point_missing');
  }
  const historical = new Set();
  const seen = new Set();
  for (const point of points) {
    // Autenticar bytes exatos ANTES de ler as referências do ponto.
    verifyQaManifest({ bytes: point?.bytes, envelope: point?.envelope,
      trustedPublicKey, pinnedFingerprint });
    let manifest;
    try { manifest = JSON.parse(point.bytes.toString('utf8')); }
    catch { throw new Error('qa_reconcile_point_invalid'); }
    if (!manifest || Array.isArray(manifest) || Object.keys(manifest).sort().join(',') !==
        'format,point_id,storage_keys' || manifest.format !== FORMAT ||
        !requiredPointIds.includes(manifest.point_id) || seen.has(manifest.point_id)) {
      throw new Error('qa_reconcile_point_invalid');
    }
    uniqueSorted(manifest.storage_keys, KEY, 'point_keys', 32);
    seen.add(manifest.point_id);
    for (const key of manifest.storage_keys) historical.add(key);
  }
  if (seen.size !== requiredPointIds.length) throw new Error('qa_reconcile_required_point_missing');
  const disk = new Set(diskKeys), current = new Set(currentDbKeys);
  const missing = [...new Set([...current, ...historical])].filter(key => !disk.has(key));
  if (missing.length) throw new Error('qa_reconcile_required_bytes_missing');
  return Object.freeze({ current: diskKeys.filter(key => current.has(key)).length,
    historicalOnly: diskKeys.filter(key => !current.has(key) && historical.has(key)).length,
    unresolved: diskKeys.filter(key => !current.has(key) && !historical.has(key)).length,
    missing: 0, checkedPoints: seen.size,
    // NUNCA autoriza GC, mesmo sem referência atual/histórica: podem faltar
    // pontos de restauração, legal hold e histórico externo ao recorte QA.
    deletionAuthorized: false });
}

export const qaRestorePointFormat = FORMAT;
