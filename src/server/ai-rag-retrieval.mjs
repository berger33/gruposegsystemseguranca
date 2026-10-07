// RAG-01 — indexação vetorial idempotente e recuperação híbrida com escopo.
//
// Ordem obrigatória: ESCOPO PRIMEIRO. Toda consulta (lexical ou vetorial) já
// carrega o filtro de área, conta, vínculo, unidade e estado publicado antes de
// tocar em qualquer chunk. O modelo nunca vê conteúdo fora do escopo, e a
// existência de registros fora do escopo não é revelada por contagem, título ou
// ranking.
//
// Backends vetoriais: `pgvector` quando a extensão estiver instalada (ANN pelo
// índice/operador <=>), `exact` quando não estiver (cosseno exato sobre o
// conjunto JÁ filtrado e limitado). O backend usado é declarado na resposta e
// nunca é chamado de ANN quando não é.
//
// Indexação idempotente: o checksum do conteúdo do chunk decide o trabalho.
// Mesmo chunk + mesmo checksum + mesmo modelo/dimensão => nada é gravado.

import { chunkChecksum, cosineSimilarity, declaredDimensions } from './ai-rag-embeddings.mjs';

export const RRF_K = 60;
export const VECTOR_BACKENDS = Object.freeze(['pgvector', 'exact', 'none']);
export const RETRIEVAL_MODES = Object.freeze(['hybrid', 'lexical_only']);

export const DEFAULT_RETRIEVAL_CONFIG = Object.freeze({
  min_relevance: 0.5,
  max_chunks: 6,
  max_context_chars: 6000,
  lexical_candidates: 40,
  vector_candidates: 40,
  vector_scan_limit: 800,
  lexical_weight: 0.5,
  vector_weight: 0.5,
  retention_days: 90,
});

export const SCOPE_NOT_APPLICABLE = 'scope_not_applicable';

// Palavras sem carga de conteúdo em português. Existem para que o sinal lexical
// seja COBERTURA de termos úteis, não contagem de palavras funcionais. Lista
// curta e explícita; não é "stemming" nem heurística de similaridade.
export const PT_STOPWORDS = Object.freeze([
  'para', 'como', 'qual', 'quais', 'sobre', 'onde', 'quando', 'porque', 'pelo', 'pela', 'pelos', 'pelas',
  'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas', 'nosso', 'nossa', 'deles', 'delas',
  'essa', 'esse', 'isso', 'esta', 'este', 'isto', 'aquele', 'aquela', 'aquilo', 'uma', 'uns', 'umas',
  'que', 'com', 'sem', 'dos', 'das', 'por', 'tem', 'ter', 'foi', 'ser', 'sao', 'são', 'estou', 'está',
  'quero', 'pode', 'posso', 'preciso', 'fazer', 'muito', 'mais', 'menos', 'aqui', 'ali', 'ainda', 'depois',
  'antes', 'entao', 'então', 'tambem', 'também', 'apenas', 'todo', 'toda', 'todos', 'todas',
  // Moldura de pergunta: aparece em quase toda frase e não discrimina conteúdo.
  // Medição do gate: "Como funciona o gate X na admissão?" perdia cobertura por
  // causa de 'funciona', que não existe no documento relevante.
  'funciona', 'funcionam', 'existe', 'existem', 'gostaria', 'queria', 'saber', 'explica', 'explique',
  'mostra', 'mostre', 'informa', 'informar', 'diz', 'dizer', 'ajuda', 'servem', 'serve', 'devo',
]);

export function normalizeTerm(value, { foldAccents = true } = {}) {
  const text = String(value ?? '');
  return (foldAccents ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : text).toLowerCase();
}

/** Termos de conteúdo da pergunta: sem acento, sem duplicata, sem palavra funcional. */
export function contentTerms(question, { max = 12 } = {}) {
  const words = normalizeTerm(question).match(/[a-z0-9]{3,}/g) || [];
  const seen = new Set();
  const terms = [];
  for (const word of words) {
    if (PT_STOPWORDS.includes(word) || seen.has(word)) continue;
    seen.add(word);
    terms.push(word);
    if (terms.length >= max) break;
  }
  return terms;
}

/** Cobertura = fração dos termos de conteúdo presentes no texto. 0..1 */
export function termCoverage(terms, text) {
  if (!terms.length) return 0;
  const body = normalizeTerm(text);
  let hits = 0;
  for (const term of terms) if (body.includes(term)) hits += 1;
  return hits / terms.length;
}

/* ------------------------------------------------------------------ *
 * Fusão determinística (função pura, testável sem banco e sem rede)    *
 * ------------------------------------------------------------------ */

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Funde listas lexical e vetorial por Reciprocal Rank Fusion.
 *
 * `lexical` e `vector` são listas ORDENADAS de identificadores de chunk.
 * O RRF decide a ORDEM; a relevância declarada é a soma ponderada dos sinais
 * absolutos (ts_rank_cd limitado pelo teto e cosseno), normalizada pelos pesos
 * aplicáveis ao modo — em `lexical_only` não existe sinal vetorial e a
 * relevância é o próprio sinal lexical.
 */
export function reciprocalRankFusion({
  lexical = [],
  vector = [],
  details = {},
  lexicalWeight = 0.5,
  vectorWeight = 0.5,
  k = RRF_K,
} = {}) {
  const seen = new Set([...lexical, ...vector]);
  const rows = [];
  for (const key of seen) {
    const lexicalRank = lexical.indexOf(key) + 1;
    const vectorRank = vector.indexOf(key) + 1;
    const info = details[key] || {};
    const lexicalSignal = clamp01(info.lexical_signal ?? 0);
    const vectorSignal = clamp01(info.vector_similarity ?? 0);
    let fusion = 0;
    if (lexicalRank > 0) fusion += lexicalWeight / (k + lexicalRank);
    if (vectorRank > 0) fusion += vectorWeight / (k + vectorRank);
    const applicable = (lexicalRank > 0 ? lexicalWeight : 0) + (vectorRank > 0 ? vectorWeight : 0);
    const relevance = applicable > 0
      ? clamp01(((lexicalRank > 0 ? lexicalWeight * lexicalSignal : 0) + (vectorRank > 0 ? vectorWeight * vectorSignal : 0)) / applicable)
      : 0;
    rows.push({
      chunk_id: key,
      lexical_rank: lexicalRank > 0 ? lexicalRank : null,
      vector_rank: vectorRank > 0 ? vectorRank : null,
      lexical_signal: lexicalSignal,
      vector_similarity: info.vector_similarity ?? null,
      similarity: info.similarity ?? null,
      fusion: Number(fusion.toFixed(9)),
      relevance: Number(relevance.toFixed(4)),
    });
  }
  rows.sort((a, b) => (b.fusion - a.fusion) || (b.relevance - a.relevance) || String(a.chunk_id).localeCompare(String(b.chunk_id)));
  return rows;
}

/**
 * Ranqueia candidatos e aplica o limiar mínimo. Devolve os aceitos e os
 * rejeitados (usados apenas para métrica interna e explicação honesta).
 */
export function rankAndFilter({ lexical = [], vector = [], details = {}, mode = 'hybrid', config = {} } = {}) {
  const merged = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
  const sorted = reciprocalRankFusion({
    lexical,
    vector: mode === 'hybrid' ? vector : [],
    details,
    lexicalWeight: merged.lexical_weight,
    vectorWeight: merged.vector_weight,
  });
  const accepted = [];
  const rejected = [];
  for (const row of sorted) {
    const candidate = { ...row, ...(details[row.chunk_id] || {}) };
    if (row.relevance >= merged.min_relevance) accepted.push(candidate);
    else rejected.push(candidate);
  }
  return {
    ranked: accepted.slice(0, merged.max_chunks),
    accepted_count: accepted.length,
    rejected_count: rejected.length,
    best_relevance: sorted.length ? sorted[0].relevance : null,
    below_threshold: sorted.length > 0 && accepted.length === 0,
    min_relevance: merged.min_relevance,
  };
}

/** Monta o contexto respeitando o teto de caracteres. Nunca corta no meio do nada. */
export function buildContext(chunks, maxChars = DEFAULT_RETRIEVAL_CONFIG.max_context_chars) {
  const parts = [];
  let used = 0;
  for (const [index, chunk] of chunks.entries()) {
    const header = `[${index + 1}] ${chunk.title}\n`;
    const separator = parts.length ? 2 : 0;
    const room = maxChars - used - separator - header.length;
    if (room <= 0) break;
    const body = String(chunk.content || '').slice(0, room);
    if (!body) break;
    parts.push(`${header}${body}`);
    used += separator + header.length + body.length;
    if (used >= maxChars) break;
  }
  return parts.join('\n\n');
}

/** Idade da publicação em dias; null quando não há data honesta disponível. */
export function ageInDays(value, now = Date.now()) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((now - time) / 86_400_000);
}

export function isStale(row, { staleAfterDays, now = Date.now() }) {
  const reference = row.published_at || row.updated_at || null;
  const age = ageInDays(reference, now);
  if (age === null) return { stale: false, age_days: null, reference: null };
  return { stale: age > staleAfterDays, age_days: age, reference };
}

/* ------------------------------------------------------------------ *
 * Serviço com banco                                                   *
 * ------------------------------------------------------------------ */

export function createRagRetrieval({ pool, embeddings, env = process.env, now = () => new Date() }) {
  const staleAfterDays = Number(env.RAG_STALE_AFTER_DAYS || '') > 0 ? Number(env.RAG_STALE_AFTER_DAYS) : 180;
  const configuredBackend = String(env.RAG_VECTOR_BACKEND || 'auto').toLowerCase();
  let probeCache = null;

  async function probe() {
    if (probeCache) return probeCache;
    const available = { fts: false, trigram: false, unaccent: false, pgvector: false };
    const probes = [
      ['fts', "SELECT 1 FROM (SELECT to_tsvector('portuguese','teste') @@ websearch_to_tsquery('portuguese','teste') AS ok) t WHERE t.ok"],
      ['trigram', "SELECT 1 FROM (SELECT similarity('teste','teste') AS s) t WHERE t.s >= 0"],
      ['unaccent', "SELECT 1 FROM (SELECT unaccent('teste') AS u) t WHERE t.u = 'teste'"],
      ['pgvector', "SELECT 1 FROM pg_extension WHERE extname = 'vector' LIMIT 1"],
    ];
    for (const [name, sql] of probes) {
      try { available[name] = (await pool.query(sql)).rows.length > 0; }
      catch { available[name] = false; }
    }
    let backend = 'none';
    if (configuredBackend === 'exact') backend = 'exact';
    else if (available.pgvector) backend = 'pgvector';
    else backend = 'exact';
    probeCache = { ...available, backend, configured: configuredBackend };
    return probeCache;
  }

  async function loadConfig(ragKey) {
    try {
      const { rows } = await pool.query('SELECT * FROM ai_rag_retrieval_config WHERE rag_key=$1 AND is_active=true LIMIT 1', [ragKey]);
      if (!rows.length) return { ...DEFAULT_RETRIEVAL_CONFIG };
      const row = rows[0];
      const merged = {};
      for (const key of Object.keys(DEFAULT_RETRIEVAL_CONFIG)) merged[key] = row[key] === null || row[key] === undefined ? DEFAULT_RETRIEVAL_CONFIG[key] : Number(row[key]);
      return merged;
    } catch { return { ...DEFAULT_RETRIEVAL_CONFIG }; }
  }

  /**
   * Cláusula de escopo aplicada ANTES de qualquer busca. Idêntica à que já era
   * validada na rota canônica; extraída aqui para ser testável e reutilizada.
   */
  function scopeClause(ragKey, actor, params) {
    if (ragKey !== 'cliente') return 'AND d.client_account_id IS NULL';
    if (actor?.kind !== 'client' || !actor.identityId) return null;
    params.push(actor.identityId);
    return `AND d.client_account_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM client_access_grants g JOIN client_accounts a ON a.id=g.client_account_id
      WHERE g.identity_id=$${params.length} AND g.client_account_id=d.client_account_id
        AND g.revoked_at IS NULL AND a.status='active'
        AND (g.unit_account_id IS NULL OR g.unit_account_id=a.id)
    )`;
  }

  const BASE_FROM = `FROM ai_rag_chunks c
    JOIN ai_rag_documents d ON d.id=c.document_id
    JOIN ai_rag_indexes i ON i.id=d.rag_index_id`;
  const PUBLISHED = `d.rag_key=$1 AND c.rag_key=$1 AND i.rag_key=$1
    AND d.is_approved=true AND d.is_published=true
    AND i.is_approved=true AND i.is_published=true AND i.is_active=true`;

  /**
   * Busca lexical. O sinal é COBERTURA dos termos de conteúdo (fração presente
   * no chunk); o ts_rank_cd serve apenas como desempate. Medição em PostgreSQL
   * real mostrou que AND estrito do websearch_to_tsquery derruba a revogação
   * (pergunta e documento usam sinônimos/variações) e que ts_rank_cd absoluto é
   * pequeno demais (0,03) para servir de limiar confiável. A cobertura é
   * comparável entre caminhos (FTS e fallback) e não depende de escala de rank.
   */
  async function lexicalSearch({ ragKey, actor, question, config }) {
    const params = [ragKey];
    const scope = scopeClause(ragKey, actor, params);
    if (scope === null) return { rows: [], strategy: 'denied' };
    const probeInfo = await probe();
    const terms = contentTerms(question);
    if (!terms.length) return { rows: [], strategy: 'empty' };
    // Acento dobrado nos DOIS lados: sem isso 'admissao' vira 'admissa' na consulta
    // enquanto 'admissão' no conteúdo vira 'admiss' — o termo se perde e a cobertura
    // cai (medido: 2 de 3 termos → 1 de 3, abaixo do limiar). `unaccent` é a via
    // preferida; `translate` é o recurso embutido do PostgreSQL para o mesmo papel.
    const fold = expression => probeInfo.unaccent
      ? `unaccent(lower(${expression}))`
      : `translate(lower(${expression}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')`;

    // Caminho FTS só com dicionário de português E acento dobrado disponíveis.
    if (probeInfo.fts && probeInfo.unaccent) {
      const bodyVector = `to_tsvector('portuguese', unaccent(lower(c.content)))`;
      const termQuery = expression => `to_tsquery('portuguese', unaccent(lower(${expression})))`;
      params.push(terms);
      const termsParam = `$${params.length}`;
      params.push(terms.join(' | '));
      const queryParam = `$${params.length}`;
      params.push(config.lexical_candidates);
      const limitParam = `$${params.length}`;
      const sql = `SELECT c.id AS chunk_id, c.content, c.chunk_index,
          d.id AS document_id, d.title, d.source, d.version, d.published_at, d.updated_at, d.client_account_id,
          ((SELECT COUNT(*) FROM unnest(${termsParam}::text[]) AS term
             WHERE ${bodyVector} @@ ${termQuery('term')})::numeric
            / array_length(${termsParam}::text[], 1))::float AS lexical_signal,
          ts_rank_cd(${bodyVector}, ${termQuery(queryParam)}) AS lexical_rank
        ${BASE_FROM}
        WHERE ${PUBLISHED} ${scope}
          AND ${bodyVector} @@ ${termQuery(queryParam)}
        ORDER BY lexical_signal DESC, lexical_rank DESC, c.id ASC LIMIT ${limitParam}`;
      const { rows } = await pool.query(sql, params);
      return { rows, strategy: 'fts' };
    }
    // Fallback declarado (sem dicionário de português): candidatos por termo, com o
    // mesmo acento dobrado dos dois lados, e cobertura calculada em JS com a MESMA
    // semântica de limiar.
    const patterns = terms.map(term => `%${term}%`);
    params.push(patterns);
    const patternParam = `$${params.length}`;
    params.push(config.lexical_candidates);
    const limitParam = `$${params.length}`;
    const order = probeInfo.trigram ? `similarity(${patternParam}::text, c.content) DESC` : 'd.updated_at DESC';
    const sql = `SELECT c.id AS chunk_id, c.content, c.chunk_index,
        d.id AS document_id, d.title, d.source, d.version, d.published_at, d.updated_at, d.client_account_id
      ${BASE_FROM}
      WHERE ${PUBLISHED} ${scope} AND ${fold('c.content')} ILIKE ANY(${patternParam}::text[])
      ORDER BY ${order}, c.id ASC LIMIT ${limitParam}`;
    const { rows } = await pool.query(sql, params);
    const scored = rows
      .map(row => ({ ...row, lexical_signal: termCoverage(terms, row.content), lexical_rank: termCoverage(terms, row.content) }))
      .filter(row => row.lexical_signal > 0)
      .sort((a, b) => (b.lexical_signal - a.lexical_signal) || String(a.chunk_id).localeCompare(String(b.chunk_id)));
    return { rows: scored, strategy: 'term_match' };
  }

  async function vectorSearch({ ragKey, actor, question, config, backend, queryVector }) {
    const params = [ragKey];
    // Dimensão como parâmetro desde o início: comparar vetor de uma dimensão com
    // embedding de outra nunca pode entrar na conta (era um $2 apontando para outro valor).
    const dimensionsParam = `$${params.push(queryVector.length)}`;
    const scope = scopeClause(ragKey, actor, params);
    if (scope === null) return { rows: [], backend: 'none' };
    if (backend === 'pgvector') {
      params.push(`[${queryVector.join(',')}]`);
      const vectorParam = `$${params.length}`;
      params.push(config.vector_candidates);
      const limitParam = `$${params.length}`;
      const sql = `SELECT c.id AS chunk_id, c.content, c.chunk_index,
          d.id AS document_id, d.title, d.source, d.version, d.published_at, d.updated_at, d.client_account_id,
          1 - (e.embedding::vector <=> ${vectorParam}::vector) AS vector_similarity
        FROM ai_rag_chunk_embeddings e
        JOIN ai_rag_chunks c ON c.id=e.chunk_id
        JOIN ai_rag_documents d ON d.id=c.document_id
        JOIN ai_rag_indexes i ON i.id=d.rag_index_id
        WHERE ${PUBLISHED} ${scope} AND e.status='gerado' AND e.dimensions=${dimensionsParam}
        ORDER BY e.embedding::vector <=> ${vectorParam}::vector ASC LIMIT ${limitParam}`;
      const { rows } = await pool.query(sql, params);
      return { rows, backend: 'pgvector' };
    }
    params.push(config.vector_scan_limit);
    const scanParam = `$${params.length}`;
    const sql = `SELECT e.embedding, c.id AS chunk_id, c.content, c.chunk_index,
        d.id AS document_id, d.title, d.source, d.version, d.published_at, d.updated_at, d.client_account_id
      FROM ai_rag_chunk_embeddings e
      JOIN ai_rag_chunks c ON c.id=e.chunk_id
      JOIN ai_rag_documents d ON d.id=c.document_id
      JOIN ai_rag_indexes i ON i.id=d.rag_index_id
      WHERE ${PUBLISHED} ${scope} AND e.status='gerado' AND e.dimensions=${dimensionsParam}
      ORDER BY d.updated_at DESC, c.id ASC LIMIT ${scanParam}`;
    const { rows } = await pool.query(sql, params);
    const scored = [];
    for (const row of rows) {
      const similarity = cosineSimilarity(queryVector, Array.isArray(row.embedding) ? row.embedding.map(Number) : []);
      if (similarity === null) continue;
      const { embedding: _ignored, ...rest } = row;
      scored.push({ ...rest, vector_similarity: similarity });
    }
    scored.sort((a, b) => (b.vector_similarity - a.vector_similarity) || String(a.chunk_id).localeCompare(String(b.chunk_id)));
    return { rows: scored.slice(0, config.vector_candidates), backend: 'exact' };
  }

  /**
   * Recuperação com escopo aplicado antes da busca. Se `includeVector` for
   * falso (ou os embeddings estiverem indisponíveis), devolve explicitamente
   * modo `lexical_only` e o motivo — nunca semântica presumida.
   */
  async function retrieve({ ragKey, actor, question, includeVector = true } = {}) {
    const config = await loadConfig(ragKey);
    const probeInfo = await probe();
    const lexical = await lexicalSearch({ ragKey, actor, question, config });

    let vector = { rows: [], backend: 'none' };
    let vectorError = null;
    let mode = 'lexical_only';
    if (includeVector) {
      if (!probeInfo.pgvector && probeInfo.backend === 'none') vectorError = 'embedding_unavailable';
      const queryEmbedding = await embeddings.embedOne(question);
      if (!queryEmbedding.ok) vectorError = queryEmbedding.error_code;
      else {
        try {
          vector = await vectorSearch({ ragKey, actor, question, config, backend: probeInfo.backend, queryVector: queryEmbedding.vector });
          if (vector.rows.length > 0) mode = 'hybrid';
        } catch { vectorError = 'vector_search_failed'; }
      }
    }

    const details = {};
    for (const row of lexical.rows) {
      details[row.chunk_id] = { ...(details[row.chunk_id] || {}), ...row, lexical_signal: Number(row.lexical_signal) };
    }
    for (const row of vector.rows) {
      details[row.chunk_id] = { ...(details[row.chunk_id] || {}), ...row, vector_similarity: Number(row.vector_similarity) };
    }
    const ranked = rankAndFilter({
      lexical: lexical.rows.map(row => row.chunk_id),
      vector: vector.rows.map(row => row.chunk_id),
      details,
      mode,
      config,
    });

    const chunks = ranked.ranked.map(row => {
      const detail = details[row.chunk_id] || {};
      const staleness = isStale(detail, { staleAfterDays });
      return {
        chunk_id: row.chunk_id,
        document_id: detail.document_id,
        title: detail.title,
        source: detail.source,
        version: detail.version,
        chunk_index: detail.chunk_index,
        published_at: detail.published_at || null,
        updated_at: detail.updated_at || null,
        client_account_id: detail.client_account_id || null,
        content: detail.content,
        relevance: row.relevance,
        lexical_signal: Math.min(1, row.lexical_signal || 0),
        lexical_rank_score: Number(detail.lexical_rank || 0),
        vector_similarity: row.vector_similarity,
        rank_lexical: row.lexical_rank,
        rank_vector: row.vector_rank,
        stale: staleness.stale,
        age_days: staleness.age_days,
      };
    });
    return {
      mode,
      vector_backend: mode === 'hybrid' ? vector.backend : 'none',
      vector_error: vectorError,
      lexical_strategy: lexical.strategy,
      pgvector_extension: probeInfo.pgvector,
      config,
      chunks,
      stats: {
        lexical_candidates: lexical.rows.length,
        vector_candidates: vector.rows.length,
        accepted: ranked.accepted_count,
        rejected: ranked.rejected_count,
        best_relevance: ranked.best_relevance,
        below_threshold: ranked.below_threshold,
        min_relevance: ranked.min_relevance,
      },
      context: buildContext(chunks, config.max_context_chars),
    };
  }

  /* --------------------------- Indexação ---------------------------- */

  async function documentChunks(documentId) {
    const { rows } = await pool.query(
      'SELECT id, rag_key, content, chunk_index FROM ai_rag_chunks WHERE document_id=$1 ORDER BY chunk_index ASC',
      [documentId],
    );
    return rows;
  }

  async function existingEmbeddings(chunkIds) {
    if (!chunkIds.length) return new Map();
    const { rows } = await pool.query(
      'SELECT chunk_id, content_checksum, status, dimensions, model_name, error_code FROM ai_rag_chunk_embeddings WHERE chunk_id = ANY($1::uuid[])',
      [chunkIds],
    );
    return new Map(rows.map(row => [row.chunk_id, row]));
  }

  function needsWork(chunk, current, model, dimensions) {
    if (!current) return { needed: true, reason: 'ausente' };
    if (current.content_checksum !== chunkChecksum(chunk.content)) return { needed: true, reason: 'conteudo_alterado' };
    if (current.model_name !== model || Number(current.dimensions) !== dimensions) return { needed: true, reason: 'modelo_ou_dimensao' };
    if (current.status !== 'gerado') return { needed: true, reason: current.status === 'erro' ? 'erro_anterior' : 'incompleto' };
    return { needed: false, reason: 'atual' };
  }

  async function registerPending(chunk, model, dimensions) {
    await pool.query(
      `INSERT INTO ai_rag_chunk_embeddings (chunk_id, rag_key, model_name, dimensions, content_checksum, status)
       VALUES ($1,$2,$3,$4,$5,'pendente')
       ON CONFLICT (chunk_id) DO UPDATE SET model_name=$3, dimensions=$4, content_checksum=$5,
         status=CASE WHEN ai_rag_chunk_embeddings.status='gerado' AND ai_rag_chunk_embeddings.content_checksum=$5 THEN 'gerado' ELSE 'pendente' END,
         error_code=CASE WHEN ai_rag_chunk_embeddings.content_checksum=$5 THEN ai_rag_chunk_embeddings.error_code ELSE NULL END,
         updated_at=NOW()`,
      [chunk.id, chunk.rag_key, model, dimensions, chunkChecksum(chunk.content)],
    );
  }

  async function storeVector(chunk, vector, model, dimensions, digest) {
    await pool.query(
      `UPDATE ai_rag_chunk_embeddings
         SET embedding=$2::real[], status='gerado', error_code=NULL, generated_at=NOW(),
             model_digest=$3, model_name=$4, dimensions=$5, content_checksum=$6, updated_at=NOW()
       WHERE chunk_id=$1`,
      [chunk.id, vector, digest, model, dimensions, chunkChecksum(chunk.content)],
    );
  }

  async function storeError(chunk, errorCode, model, dimensions) {
    await pool.query(
      `INSERT INTO ai_rag_chunk_embeddings (chunk_id, rag_key, model_name, dimensions, content_checksum, status, error_code)
       VALUES ($1,$2,$3,$4,$5,'erro',$6)
       ON CONFLICT (chunk_id) DO UPDATE SET status='erro', error_code=$6, embedding=NULL,
         generated_at=NULL, model_name=$3, dimensions=$4, content_checksum=$5, updated_at=NOW()`,
      [chunk.id, chunk.rag_key, model, dimensions, chunkChecksum(chunk.content), errorCode],
    );
  }

  /**
   * Indexa os chunks de UM documento. Idempotente: chunk já gerado com o mesmo
   * checksum, modelo e dimensão não é reenviado ao provedor. Falha de um chunk
   * não marca o documento como indexado — o estado fica em `erro` por chunk.
   */
  async function indexDocument(documentId, { force = false } = {}) {
    const info = embeddings.config;
    const chunks = await documentChunks(documentId);
    if (!chunks.length) return { document_id: documentId, chunks: 0, generated: 0, skipped: 0, errored: 0, error_code: null };
    const current = await existingEmbeddings(chunks.map(chunk => chunk.id));
    const result = { document_id: documentId, chunks: chunks.length, generated: 0, skipped: 0, errored: 0, error_code: null };
    const pending = [];
    for (const chunk of chunks) {
      const decision = force ? { needed: true, reason: 'forcado' } : needsWork(chunk, current.get(chunk.id), info.model, info.dimensions);
      if (!decision.needed) { result.skipped += 1; continue; }
      await registerPending(chunk, info.model, info.dimensions);
      pending.push(chunk);
    }
    for (let offset = 0; offset < pending.length; offset += 16) {
      const batch = pending.slice(offset, offset + 16);
      const response = await embeddings.embedMany(batch.map(chunk => chunk.content));
      if (!response.ok) {
        for (const chunk of batch) await storeError(chunk, response.error_code || 'embedding_unavailable', info.model, info.dimensions);
        result.errored += batch.length;
        result.error_code = response.error_code || 'embedding_unavailable';
        continue;
      }
      for (const [index, chunk] of batch.entries()) {
        await storeVector(chunk, response.vectors[index], info.model, info.dimensions, response.digest || null);
        result.generated += 1;
      }
    }
    return result;
  }

  /** Indexa tudo que está publicado e pendente, em lotes. */
  async function indexPending({ ragKey = null, limit = 200 } = {}) {
    const params = [];
    let filter = '';
    if (ragKey) { params.push(ragKey); filter = `AND d.rag_key=$${params.length}`; }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT d.id AS document_id, COUNT(c.id)::int AS chunks
         FROM ai_rag_documents d JOIN ai_rag_chunks c ON c.document_id=d.id
        WHERE d.is_approved=true AND d.is_published=true ${filter}
        GROUP BY d.id, d.updated_at
        ORDER BY d.updated_at ASC LIMIT $${params.length}`,
      params,
    );
    const summary = { documents: rows.length, chunks: 0, generated: 0, skipped: 0, errored: 0, error_code: null };
    for (const row of rows) {
      const result = await indexDocument(row.document_id);
      summary.chunks += result.chunks;
      summary.generated += result.generated;
      summary.skipped += result.skipped;
      summary.errored += result.errored;
      if (result.error_code) summary.error_code = result.error_code;
      if (result.error_code === 'embedding_disabled' || result.error_code === 'embedding_model_missing' || result.error_code === 'embedding_unavailable') break;
    }
    return summary;
  }

  /**
   * Remove embeddings que não podem mais ser recuperados (documento
   * despublicado, arquivado, rejeitado ou índice inativo). A recuperação já os
   * ignora pelo filtro de escopo; esta limpeza evita guardar vetor de conteúdo
   * que saiu de circulação.
   */
  async function purgeUnpublishedEmbeddings() {
    const { rowCount } = await pool.query(
      `DELETE FROM ai_rag_chunk_embeddings e
        WHERE EXISTS (
          SELECT 1 FROM ai_rag_chunks c JOIN ai_rag_documents d ON d.id=c.document_id
           WHERE c.id=e.chunk_id AND (d.is_approved=false OR d.is_published=false)
        )`,
    );
    return { removed: rowCount || 0 };
  }

  /** Estado real da indexação por área — o que o painel mostra. */
  async function indexStatus({ ragKey = null } = {}) {
    const params = [];
    let filter = '';
    if (ragKey) { params.push(ragKey); filter = `WHERE d.rag_key=$${params.length}`; }
    const { rows } = await pool.query(
      `SELECT d.rag_key,
              COUNT(DISTINCT d.id)::int AS documents,
              COUNT(c.id)::int AS chunks,
              COUNT(e.chunk_id) FILTER (WHERE e.status='gerado')::int AS indexed,
              COUNT(e.chunk_id) FILTER (WHERE e.status='pendente' OR e.chunk_id IS NULL)::int AS pending,
              COUNT(e.chunk_id) FILTER (WHERE e.status='erro')::int AS errored,
              MAX(e.generated_at) AS last_generated_at,
              MAX(e.model_name) AS model_name,
              MAX(e.dimensions)::int AS dimensions,
              (ARRAY_AGG(DISTINCT e.error_code) FILTER (WHERE e.status='erro'))[1:3] AS error_codes
         FROM ai_rag_documents d
         JOIN ai_rag_chunks c ON c.document_id=d.id
         LEFT JOIN ai_rag_chunk_embeddings e ON e.chunk_id=c.id
         ${filter}
        GROUP BY d.rag_key ORDER BY d.rag_key`,
      params,
    );
    return rows;
  }

  return {
    retrieve,
    indexDocument,
    indexPending,
    indexStatus,
    purgeUnpublishedEmbeddings,
    loadConfig,
    probe,
    staleAfterDays,
    resetProbeCache() { probeCache = null; },
  };
}

export { declaredDimensions };
