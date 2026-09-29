import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { publicKeyFingerprint, signQaManifest, verifyQaManifest } from '../scripts/qa-detached-manifest-signature.mjs';

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const bytes = Buffer.from('{"format":"qa-synthetic-document-v1","entries":[]}');
  const envelope = signQaManifest({ bytes, privateKey, signerPublicKey: publicKey });
  return { bytes, envelope, publicKey, privateKey, pinnedFingerprint: publicKeyFingerprint(publicKey) };
}

test('PLT-BAK-001: manifesto QA só verifica com chave pública e fingerprint externos ao pacote', () => {
  const f = fixture();
  assert.equal(verifyQaManifest({ bytes: f.bytes, envelope: f.envelope,
    trustedPublicKey: f.publicKey, pinnedFingerprint: f.pinnedFingerprint }), true);
  assert.throws(() => verifyQaManifest({ bytes: f.bytes, envelope: f.envelope,
    trustedPublicKey: f.publicKey }), /qa_signature_trust_anchor_required/);
});

test('PLT-BAK-001: coadulteração não passa com assinatura destacada original', () => {
  const f = fixture();
  const altered = Buffer.from(f.bytes);
  altered[10] ^= 1;
  assert.throws(() => verifyQaManifest({ bytes: altered, envelope: f.envelope,
    trustedPublicKey: f.publicKey, pinnedFingerprint: f.pinnedFingerprint }), /qa_signature_invalid/);
});

test('PLT-BAK-001: substituição da chave e assinatura no pacote não altera âncora externa', () => {
  const f = fixture();
  const forged = fixture();
  // O atacante controla os bytes, a assinatura e uma chave pública embutida no bundle.
  assert.throws(() => verifyQaManifest({ bytes: forged.bytes, envelope: forged.envelope,
    trustedPublicKey: f.publicKey, pinnedFingerprint: f.pinnedFingerprint }), /qa_signature_untrusted_key/);
  assert.throws(() => verifyQaManifest({ bytes: forged.bytes, envelope: forged.envelope,
    trustedPublicKey: forged.publicKey, pinnedFingerprint: f.pinnedFingerprint }), /qa_signature_trust_anchor_mismatch/);
});

test('PLT-BAK-001: signer incompatível e envelope malformado são recusados', () => {
  const f = fixture();
  const other = fixture();
  assert.throws(() => signQaManifest({ bytes: f.bytes, privateKey: f.privateKey,
    signerPublicKey: other.publicKey }), /qa_signature_key_pair_mismatch/);
  assert.throws(() => verifyQaManifest({ bytes: f.bytes, envelope: { ...f.envelope, signature: '!' },
    trustedPublicKey: f.publicKey, pinnedFingerprint: f.pinnedFingerprint }), /qa_signature_envelope_invalid/);
  assert.throws(() => verifyQaManifest({ bytes: f.bytes, envelope: { ...f.envelope, public_key: 'embedded' },
    trustedPublicKey: f.publicKey, pinnedFingerprint: f.pinnedFingerprint }), /qa_signature_envelope_invalid/);
});
