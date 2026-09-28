import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { publicKeyFingerprint, signQaManifest } from '../scripts/qa-detached-manifest-signature.mjs';
import { qaRestorePointFormat, reconcileQaRestorePoints } from '../scripts/qa-cli-v2-restore-point-reconcile.mjs';

const [oldA, currentA, currentB, unknown] = ['a', 'b', 'c', 'd'].map(char => char.repeat(48));
function setup() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const trust = { trustedPublicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    pinnedFingerprint: publicKeyFingerprint(publicKey) };
  function point(point_id, storage_keys, signer = { publicKey, privateKey }) {
    const bytes = Buffer.from(JSON.stringify({ format: qaRestorePointFormat, point_id, storage_keys }));
    return { bytes, envelope: signQaManifest({ bytes, signerPublicKey: signer.publicKey,
      privateKey: signer.privateKey }) };
  }
  const inputs = { diskKeys: [oldA, currentA, currentB, unknown],
    currentDbKeys: [currentA, currentB], requiredPointIds: ['point-001', 'point-002'],
    points: [point('point-001', [oldA, currentB]), point('point-002', [currentA, currentB])], ...trust };
  return { inputs, point };
}

test('PLT-BAK-001: snapshot QA assinado retém versão antiga e classifica desconhecido sem autorizar deleção', () => {
  const { inputs } = setup();
  assert.deepEqual(reconcileQaRestorePoints(inputs), { current: 2, historicalOnly: 1,
    unresolved: 1, missing: 0, checkedPoints: 2, deletionAuthorized: false });
  assert.ok(Object.isFrozen(reconcileQaRestorePoints(inputs)));
});

test('PLT-BAK-001: snapshot falso, ponto faltante e chave pública ausente falham fechados', () => {
  const { inputs, point } = setup();
  const attacker = generateKeyPairSync('ed25519');
  assert.throws(() => reconcileQaRestorePoints({ ...inputs,
    points: [point('point-001', [oldA, currentB], attacker), inputs.points[1]] }),
  /qa_signature_untrusted_key/);
  assert.throws(() => reconcileQaRestorePoints({ ...inputs, trustedPublicKey: undefined }),
    /qa_signature_public_key_invalid/);
  assert.throws(() => reconcileQaRestorePoints({ ...inputs,
    points: [inputs.points[0], inputs.points[0]] }), /qa_reconcile_point_invalid/);
  assert.throws(() => reconcileQaRestorePoints({ ...inputs, points: [inputs.points[0]] }),
    /qa_reconcile_required_point_missing/);
});

test('PLT-BAK-001: bytes históricos ausentes, chaves repetidas ou entrada fora de ordem bloqueiam classificação', () => {
  const { inputs, point } = setup();
  assert.throws(() => reconcileQaRestorePoints({ ...inputs,
    diskKeys: [currentA, currentB, unknown] }), /qa_reconcile_required_bytes_missing/);
  assert.throws(() => reconcileQaRestorePoints({ ...inputs,
    points: [point('point-001', [oldA, oldA]), inputs.points[1]] }), /qa_reconcile_point_keys_invalid/);
  assert.throws(() => reconcileQaRestorePoints({ ...inputs,
    diskKeys: [unknown, oldA, currentA, currentB] }), /qa_reconcile_disk_invalid/);
  assert.throws(() => reconcileQaRestorePoints({ ...inputs,
    requiredPointIds: ['point-001', 'point-001'] }), /qa_reconcile_required_points_invalid/);
});
