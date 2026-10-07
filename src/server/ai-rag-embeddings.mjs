// Provider de embeddings. Loopback-only, sem download automático, com
// identificação honesta do que foi gerado e erro explícito quando não dá.
//
// O caminho é deliberadamente estreito:
//   - só conecta em 127.0.0.1 / localhost / [::1] (rejeita qualquer
//     configuração remota — vetor nunca sai do operador local);
//   - exige OLLAMA_ENABLED=true, OLLAMA_EMBED_MODEL definido e presente
//     em /api/tags (configuração inválida não é corrigida automaticamente);
//   - tenta /api/embed (novo) e cai para /api/embeddings (antigo);
//   - recusa vetor com dimensão divergente do declarado pelo modelo.
//
// O que NÃO faz:
//   - não baixa modelos (a operadora faz ollama pull nomic-embed-text);
//   - não loga conteúdo da pergunta nem do vetor;
//   - não mede custo — o registro de tokens só é informativo.
//
// Decisões calibradas (ver docs/RAG-PR1-FUNDACAO-SEMANTICA-2026-10-06.md):
//   - model default nomic-embed-text, dimensões 768;
//   - timeout 30s por chamada (consulta única) / por lote (batch);
import { createHash } from 'node:crypto';

const DEFAULT_EMBED_MODEL = 'nomic-embed-text';
const DEFAULT_EMBED_DIMENSIONS = 768;
const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);
const ALLOWED_PROTOCOL = 'http:';

// Soma SHA-256 do conteúdo textual. É o que o indexador compara para
// invalidar embeddings sem reprocessar tudo. Determinístico por design.
export function contentChecksum(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function parseDimensions(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 16 && n <= 4096 ? n : null;
}

function parseTimeout(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1000 && n <= 120000 ? n : fallback;
}

export function resolveEmbeddingConfig(env = process.env) {
  const enabled = String(env.OLLAMA_ENABLED || '').toLowerCase() === 'true';
  const model = String(env.OLLAMA_EMBED_MODEL || DEFAULT_EMBED_MODEL).trim();
  const dimensions = parseDimensions(env.OLLAMA_EMBED_DIMENSIONS) || DEFAULT_EMBED_DIMENSIONS;
  const host = String(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim();
  const timeoutMs = parseTimeout(env.OLLAMA_EMBED_TIMEOUT_MS, 30000);
  return { enabled, model, dimensions, host, timeoutMs };
}

function ensureLoopbackHost(urlString) {
  let endpoint;
  try { endpoint = new URL(urlString); } catch { return null; }
  if (endpoint.protocol !== ALLOWED_PROTOCOL) return null;
  if (!ALLOWED_HOSTNAMES.has(endpoint.hostname)) return null;
  return endpoint;
}

function normalizeVector(raw) {
  if (!Array.isArray(raw)) return null;
  const out = new Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    const value = Number(raw[i]);
    if (!Number.isFinite(value)) return null;
    out[i] = value;
  }
  return out;
}

// Faz um único request ao Ollama e devolve a forma normalizada. Sem retry
// silencioso: o caller decide o que fazer com o erro (a rota canônica vai
// devolver ai_unavailable explícito).
async function callOllamaOnce({ endpoint, body, timeoutMs, fetchImpl }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return { ok: false, code: 'embedding_configuration_invalid', message: 'fetch indisponível no runtime' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, code: 'embedding_http_error', message: `ollama respondeu ${response.status}` };
    }
    const data = await response.json();
    return { ok: true, data };
  } catch (error) {
    const aborted = error && (error.name === 'AbortError' || error.code === 'ABORT_ERR');
    return { ok: false, code: aborted ? 'embedding_unavailable' : 'embedding_unavailable', message: error?.message || 'falha de rede' };
  } finally {
    clearTimeout(timer);
  }
}

function extractVectorFromResponse(data, expectedDimensions) {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data.embedding)) {
    return normalizeVector(data.embedding);
  }
  if (Array.isArray(data.embeddings) && data.embeddings.length) {
    return normalizeVector(data.embeddings[0]);
  }
  const vec = normalizeVector(data);
  if (vec && vec.length === expectedDimensions) return vec;
  return null;
}

function extractBatchFromResponse(data) {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data.embeddings)) {
    return data.embeddings.map(normalizeVector);
  }
  if (Array.isArray(data.embedding)) {
    return [normalizeVector(data.embedding)];
  }
  return null;
}

export function createEmbeddingService({ env = process.env, fetchImpl, httpClient } = {}) {
  const config = resolveEmbeddingConfig(env);
  const http = httpClient || null; // janela para os testes injetarem o cliente
  const fetchFn = fetchImpl || (http ? http.fetch : globalThis.fetch);
  const probe = async () => {
    if (!config.enabled) return { ok: false, code: 'embedding_disabled', message: 'OLLAMA_ENABLED não é true' };
    const base = ensureLoopbackHost(config.host);
    if (!base) return { ok: false, code: 'embedding_configuration_invalid', message: 'host fora do loopback' };
    return { ok: true };
  };

  async function status() {
    if (!config.enabled) return { ok: true, enabled: false, model: config.model, dimensions: config.dimensions };
    const base = ensureLoopbackHost(config.host);
    if (!base) return { ok: false, code: 'embedding_configuration_invalid' };
    return { ok: true, enabled: true, model: config.model, dimensions: config.dimensions };
  }

  async function fetchModelDigest() {
    const probeResult = await probe();
    if (!probeResult.ok) return null;
    const base = ensureLoopbackHost(config.host);
    if (!base) return null;
    const result = await callOllamaOnce({
      endpoint: new URL('/api/tags', base),
      body: {},
      timeoutMs: 5000,
      fetchImpl: fetchFn,
    });
    if (!result.ok) return null;
    const models = Array.isArray(result.data?.models) ? result.data.models : [];
    const match = models.find((entry) => entry?.name === config.model || entry?.model === config.model);
    return match?.digest || null;
  }

  async function embedOne(text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: false, code: 'embedding_invalid_vector', message: 'texto vazio' };
    }
    const probeResult = await probe();
    if (!probeResult.ok) return probeResult;
    const base = ensureLoopbackHost(config.host);
    if (!base) return { ok: false, code: 'embedding_configuration_invalid', message: 'host fora do loopback' };
    // Tenta /api/embed (novo) primeiro; cai para /api/embeddings (antigo).
    const modern = await callOllamaOnce({
      endpoint: new URL('/api/embed', base),
      body: { model: config.model, input: text },
      timeoutMs: config.timeoutMs,
      fetchImpl: fetchFn,
    });
    let data = null;
    if (modern.ok) {
      data = modern.data;
    } else if (modern.code === 'embedding_http_error') {
      const legacy = await callOllamaOnce({
        endpoint: new URL('/api/embeddings', base),
        body: { model: config.model, prompt: text },
        timeoutMs: config.timeoutMs,
        fetchImpl: fetchFn,
      });
      if (!legacy.ok) return legacy;
      data = legacy.data;
    } else {
      return modern;
    }
    const vector = extractVectorFromResponse(data, config.dimensions);
    if (!vector) return { ok: false, code: 'embedding_empty_response', message: 'Ollama devolveu sem vetor' };
    if (vector.length !== config.dimensions) {
      return { ok: false, code: 'embedding_dimension_mismatch', message: `esperado ${config.dimensions}, veio ${vector.length}` };
    }
    return { ok: true, vector, model: config.model, dimensions: config.dimensions };
  }

  async function embedMany(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return { ok: false, code: 'embedding_invalid_vector', message: 'lote vazio' };
    }
    const probeResult = await probe();
    if (!probeResult.ok) return probeResult;
    const base = ensureLoopbackHost(config.host);
    if (!base) return { ok: false, code: 'embedding_configuration_invalid', message: 'host fora do loopback' };
    const modern = await callOllamaOnce({
      endpoint: new URL('/api/embed', base),
      body: { model: config.model, input: texts },
      timeoutMs: config.timeoutMs,
      fetchImpl: fetchFn,
    });
    let vectors = null;
    if (modern.ok) {
      vectors = extractBatchFromResponse(modern.data);
    } else if (modern.code === 'embedding_http_error') {
      // Sem endpoint batch legado confiável: cai para N chamadas
      // sequenciais. Mais lento, mas não há contrato de batch no /api/embeddings.
      const collected = [];
      for (const text of texts) {
        const result = await embedOne(text);
        if (!result.ok) return result;
        collected.push(result.vector);
      }
      vectors = collected;
    } else {
      return modern;
    }
    if (!vectors || vectors.length !== texts.length) {
      return { ok: false, code: 'embedding_empty_response', message: 'Ollama devolveu lote incompleto' };
    }
    for (const vector of vectors) {
      if (!vector || vector.length !== config.dimensions) {
        return { ok: false, code: 'embedding_dimension_mismatch', message: `dimensão inconsistente no lote` };
      }
    }
    return { ok: true, vectors, model: config.model, dimensions: config.dimensions };
  }

  return {
    config,
    status,
    embedOne,
    embedMany,
    fetchModelDigest,
    contentChecksum,
  };
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0; let normA = 0; let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]; const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
