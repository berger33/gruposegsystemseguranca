// PLT-BAK-001: prova QA de assinatura destacada de UM manifesto sintético.
// Chaves geradas apenas no runner descartável; NÃO é KMS, custódia ou backup real.
import { createHash, createPrivateKey, createPublicKey, KeyObject, sign, verify } from 'node:crypto';

const FORMAT = 'seg-qa-manifest-ed25519-v1';
const CONTEXT = Buffer.from(`${FORMAT}\n`, 'utf8');
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64_SIGNATURE = /^[A-Za-z0-9+/]{86}==$/; // 64-byte Ed25519 signature

function manifestBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 65536) throw new Error('qa_signature_manifest_invalid');
  return Buffer.concat([CONTEXT, bytes]);
}
function publicKey(input) {
  try {
    const key = input instanceof KeyObject ? input : createPublicKey(input);
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new Error('algorithm');
    return key;
  } catch { throw new Error('qa_signature_public_key_invalid'); }
}
export function publicKeyFingerprint(key) {
  const canonical = publicKey(key).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(canonical).digest('hex');
}
export function signQaManifest({ bytes, privateKey, signerPublicKey }) {
  const key = privateKey instanceof KeyObject ? privateKey : createPrivateKey(privateKey);
  if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') throw new Error('qa_signature_private_key_invalid');
  const trusted = publicKey(signerPublicKey);
  if (!createPublicKey(key).export({ type: 'spki', format: 'der' }).equals(
    trusted.export({ type: 'spki', format: 'der' }))) throw new Error('qa_signature_key_pair_mismatch');
  return { format: FORMAT, key_fingerprint: publicKeyFingerprint(trusted),
    signature: sign(null, manifestBytes(bytes), key).toString('base64') };
}
export function verifyQaManifest({ bytes, envelope, trustedPublicKey, pinnedFingerprint }) {
  // Fingerprint e chave são fornecidos FORA do pacote. Nunca carregar a chave
  // de dentro do bundle nem inferir confiança da assinatura por si só.
  if (typeof pinnedFingerprint !== 'string' || !SHA256.test(pinnedFingerprint)) throw new Error('qa_signature_trust_anchor_required');
  const trusted = publicKey(trustedPublicKey);
  if (publicKeyFingerprint(trusted) !== pinnedFingerprint) throw new Error('qa_signature_trust_anchor_mismatch');
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.keys(envelope).sort().join(',') !== 'format,key_fingerprint,signature' ||
      envelope.format !== FORMAT || !SHA256.test(envelope.key_fingerprint) ||
      !BASE64_SIGNATURE.test(envelope.signature)) throw new Error('qa_signature_envelope_invalid');
  if (envelope.key_fingerprint !== pinnedFingerprint) throw new Error('qa_signature_untrusted_key');
  const signature = Buffer.from(envelope.signature, 'base64');
  if (signature.toString('base64') !== envelope.signature ||
      !verify(null, manifestBytes(bytes), trusted, signature)) throw new Error('qa_signature_invalid');
  return true;
}
