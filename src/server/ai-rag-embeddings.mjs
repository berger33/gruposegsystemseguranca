// RAG-01 — embeddings reais por HTTP em loopback, sem provedor externo.
//
// Fronteiras deliberadas desta fatia:
//   - o destino é SEMPRE loopback (127.0.0.1/localhost/[::1]) e http; host de
//     banco, de usuário ou variável de ambiente não vira destino de rede;
//   - nenhum modelo é baixado, instalado ou "puxado" por este código: se o
//     modelo não existir em /api/tags, o resultado é indisponível, não uma
//     tentativa silenciosa de download;
//   - o conteúdo do chunk nunca é registrado em log, auditoria ou mensagem de
//     erro — só o checksum;
//   - falha é explícita: { ok:false, error_code } e nenhum vetor fabricado.
//
// Contrato de dimensionalidade: dimensão esperada explícita. Vetor com tamanho
// diferente do esperado é recusado (dimension_mismatch), nunca truncado.

import { createHash } from 'node:crypto';

export const DEFAULT_EMBED_MODEL = 'nomic-embed-text';
export const DEFAULT_EMBED_DIMENSIONS = 768;
export const EMBEDDING_ERROR_CODES = Object.freeze([
  'embedding_disabled',
  'embedding_configuration_invalid',
  'embedding_model_missing',
  'embedding_unavailable',
  'embedding_http_error',
  'embedding_empty_response',
  'embedding_dimension_mismatch',
  'embedding_invalid_vector',
]);

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const MAX_BATCH = 16;

export function chunkChecksum(content) {
  return createHash('sha256').update(String(content), 'utf8').digest('hex');
}

/** Extrai a dimensão declarada de um nome de modelo sem consultar a rede. */
export function declaredDimensions(modelName, fallback = DEFAULT_EMBED_DIMENSIONS) {
  const match = /(?:^|[^0-9])([0-9]{3,4})d?(?:[^0-9]|$)/.exec(String(modelName || ''));
  const value = match ? Number(match[1]) : NaN;
  return Number.isInteger(value) && value >= 16 && value <= 4096 ? value : fallback;
}

export function resolveEmbeddingConfig(env = process.env) {
  const enabled = String(env.OLLAMA_ENABLED || '').toLowerCase() === 'true';
  const model = String(env.OLLAMA_EMBED_MODEL || DEFAULT_EMBED_MODEL).trim();
  const host = String(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim();
  const fallbackDimensions = Number(env.OLLAMA_EMBED_DIMENSIONS || '') || DEFAULT_EMBED_DIMENSIONS;
  const dimensions = declaredDimensions(model, fallbackDimensions);
  let endpoint = null;
  try {
    const url = new URL('/api/embed', host);
    if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) endpoint = null;
    else endpoint = url;
  } catch { endpoint = null; }
  return {
    enabled,
    model,
    host,
    dimensions,
    endpoint,
    timeoutMs: Number(env.OLLAMA_EMBED_TIMEOUT_MS || '') > 0 ? Number(env.OLLAMA_EMBED_TIMEOUT_MS) : 20_000,
  };
}

/** Extrai um vetor numérico válido da resposta do Ollama, sem aceitar lixo. */
export function extractVector(payload, dimensions) {
  const raw = payload?.embeddings?.[0] ?? payload?.embedding;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error_code: 'embedding_empty_response' };
  const vector = [];
  for (const value of raw) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return { ok: false, error_code: 'embedding_invalid_vector' };
    vector.push(numeric);
  }
  if (vector.length !== dimensions) {
    return { ok: false, error_code: 'embedding_dimension_mismatch', detail: { expected: dimensions, received: vector.length } };
  }
  return { ok: true, vector };
}

/**
 * Serviço de embeddings. `fetchImpl` é injetável apenas para o teste unitário
 * isolar a rede; nenhum teste substitui o servidor real do gate HTTP.
 */
export function createEmbeddingService({ fetchImpl = fetch, env = process.env, modelOverride = null } = {}) {
  const config = resolveEmbeddingConfig(env);
  const model = modelOverride || config.model;
  const dimensions = modelOverride ? declaredDimensions(modelOverride, config.dimensions) : config.dimensions;

  function describe() {
    return {
      model,
      dimensions,
      host: config.host,
      enabled: config.enabled,
      endpoint_configured: config.endpoint !== null,
    };
  }

  /** Estado verificável: configurado, acessível e com o modelo presente. */
  async function status() {
    if (!config.enabled) return { ok: false, error_code: 'embedding_disabled', ...describe() };
    if (!config.endpoint) return { ok: false, error_code: 'embedding_configuration_invalid', ...describe() };
    try {
      const response = await fetchImpl(new URL('/api/tags', config.host), { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return { ok: false, error_code: 'embedding_unavailable', ...describe() };
      const payload = await response.json().catch(() => null);
      const names = Array.isArray(payload?.models) ? payload.models.map(entry => String(entry?.name || '').split(':')[0]) : [];
      const base = String(model).split(':')[0];
      const present = names.includes(base) || names.includes(String(model));
      return { ok: present, error_code: present ? null : 'embedding_model_missing', installed: names.slice(0, 20), ...describe() };
    } catch {
      return { ok: false, error_code: 'embedding_unavailable', ...describe() };
    }
  }

  /** Gera o embedding de UM texto. Nunca lança: devolve contrato explícito. */
  async function embedOne(text) {
    const batch = await embedMany([text]);
    if (!batch.ok) return batch;
    return { ok: true, vector: batch.vectors[0], model: batch.model, dimensions: batch.dimensions };
  }

  async function embedMany(texts) {
    const list = Array.isArray(texts) ? texts : [];
    if (!config.enabled) return { ok: false, error_code: 'embedding_disabled', ...describe() };
    if (!config.endpoint) return { ok: false, error_code: 'embedding_configuration_invalid', ...describe() };
    if (list.length === 0) return { ok: false, error_code: 'embedding_empty_response', ...describe() };
    if (list.length > MAX_BATCH) return { ok: false, error_code: 'embedding_http_error', detail: { max_batch: MAX_BATCH }, ...describe() };
    const body = { model, input: list.map(value => String(value)), truncate: true };
    let response;
    try {
      response = await fetchImpl(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify(body),
      });
    } catch {
      // Sem detalhe de rede: a mensagem do erro pode conter o corpo enviado.
      return { ok: false, error_code: 'embedding_unavailable', ...describe() };
    }
    if (!response.ok) return { ok: false, error_code: 'embedding_http_error', detail: { status: response.status }, ...describe() };
    const payload = await response.json().catch(() => null);
    const raw = payload?.embeddings;
    if (!Array.isArray(raw) || raw.length !== list.length) {
      const single = list.length === 1 ? extractVector(payload, dimensions) : { ok: false, error_code: 'embedding_empty_response' };
      if (!single.ok) return { ok: false, ...single, ...describe() };
      return { ok: true, vectors: [single.vector], model: payload?.model || model, dimensions, ...describe() };
    }
    const vectors = [];
    for (const entry of raw) {
      const parsed = extractVector({ embedding: entry }, dimensions);
      if (!parsed.ok) return { ok: false, ...parsed, ...describe() };
      vectors.push(parsed.vector);
    }
    return { ok: true, vectors, model: payload?.model || model, dimensions, ...describe() };
  }

  return { config: describe(), status, embedOne, embedMany, chunkChecksum };
}

/** Cosseno exato — usado quando pgvector não está disponível. Sem ANN. */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return null;
  let dot = 0; let normA = 0; let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]; const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    dot += x * y; normA += x * x; normB += y * y;
  }
  if (normA === 0 || normB === 0) return null;
  const value = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(-1, Math.min(1, value));
}
