// Recuperação híbrida do RAG. Aqui ficam:
//   1) o predicado de escopo (cliente/RH/Marcelo/público), aplicado ANTES
//      da busca — não tem como uma pergunta "ver" o que o escopo dela já
//      excluiu;
//   2) a indexação idempotente (checksum do conteúdo invalida só os chunks
//      alterados, status 'erro' não marca o documento como pronto, doc
//      despublicado tem o vetor purgado);
//   3) a recuperação (lexical + vetorial + fusão RRF + limiar mínimo);
//   4) a detecção de backend vetorial (pgvector quando a extensão está
//      instalada, exato em cosseno calculado no JS quando não está).
//
// O módulo é deliberadamente puro nas partes que podem ser (conteúdo,
// cobertura, RRF, contexto) — o resto fala com o banco via injeção de pool.
//
// Decisões de calibragem estão em docs/RAG-PR1-FUNDACAO-SEMANTICA-2026-10-06.md.
import { cosineSimilarity, contentChecksum } from './ai-rag-embeddings.mjs';

const PT_STOPWORDS = new Set([
  // Stopwords clássicas + palavras de moldura de pergunta (sem sinal
  // discriminativo). Termos curtos e verbos genéricos que aparecem em
  // quase qualquer consulta ("como", "funciona", "existe", etc.) entram
  // aqui — o que importa para a cobertura é o termo raro.
  'a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos',
  'para', 'pra', 'com', 'sem', 'por', 'pela', 'pelo',
  'e', 'ou', 'mas', 'que', 'se', 'ja', 'ja',
  'eu', 'voce', 'voce', 'nós', 'nos', 'ele', 'ela', 'eles', 'elas',
  'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas',
  'este', 'esta', 'estes', 'estas', 'isto', 'isso', 'aquilo',
  'qual', 'quais', 'quem', 'onde', 'quando', 'porque', 'por que',
  'como', 'funciona', 'funcionam', 'fazer', 'faz', 'fiz', 'feito',
  'existe', 'existem', 'ha', 'sao', 'são', 'foi', 'era', 'ser', 'estar', 'estao', 'estao',
  'pode', 'podem', 'posso', 'podemos', 'devo', 'devemos', 'preciso', 'precisamos',
  'quero', 'queremos', 'gostaria', 'gostariamos', 'queria',
  'saber', 'sei', 'explica', 'explique', 'mostra', 'mostre', 'informa', 'informe',
  'sobre', 'ate', 'aqui', 'ali', 'la', 'cá', 'fica', 'ficao',
  'mais', 'menos', 'muito', 'pouco', 'todo', 'todos', 'toda', 'todas', 'nenhum', 'nenhuma',
  'rh', 'ti', 'adm', 'admin', 'sistema', 'ajuda', 'servico', 'servicos',
]);
const FOLD_MAP = ['áàâãä', 'éèêë', 'íìîï', 'óòôõö', 'úùûü', 'ç', 'ñ'].map((group) => ({ from: group, to: group[0] }));
function foldAccents(input) {
  let value = String(input || '').toLowerCase();
  for (const { from, to } of FOLD_MAP) {
    for (let i = 1; i < from.length; i += 1) value = value.split(from[i]).join(to);
  }
  return value;
}

export function contentTerms(question) {
  if (typeof question !== 'string') return [];
  const folded = foldAccents(question);
  const tokens = folded.match(/[a-z0-9]{3,}/g) || [];
  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (PT_STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
  }
  return unique;
}

export function termCoverage(terms, text) {
  if (!Array.isArray(terms) || terms.length === 0) return 0;
  const folded = foldAccents(text || '');
  if (!folded) return 0;
  let hits = 0;
  for (const term of terms) {
    if (!term) continue;
    if (folded.includes(term)) hits += 1;
  }
  return hits / terms.length;
}

const RRF_K = 60;

export function reciprocalRankFusion({ lexical, vector, weights, k = RRF_K }) {
  const wLex = weights?.lexical ?? 0.5;
  const wVec = weights?.vector ?? 0.5;
  const details = new Map();
  const score = (chunkId, list, rank, weight) => {
    if (rank == null) return;
    const previous = details.get(chunkId) || { chunk_id: chunkId, fusion: 0 };
    previous.fusion += weight / (k + rank);
    details.set(chunkId, previous);
    list.push({ chunk_id: chunkId, rank });
  };
  const lexList = [];
  const vecList = [];
  lexical.forEach((chunkId, index) => score(chunkId, lexList, index + 1, wLex));
  vector.forEach((chunkId, index) => score(chunkId, vecList, index + 1, wVec));
  const rows = [...details.values()].sort((a, b) => b.fusion - a.fusion || (a.chunk_id < b.chunk_id ? -1 : 1));
  return { rows, lexList, vecList };
}

export function rankAndFilter({ lexical, vector, details, weights, mode, config, k = RRF_K }) {
  const wLex = weights?.lexical ?? 0.5;
  const wVec = weights?.vector ?? 0.5;
  const hasVector = Array.isArray(vector) && vector.length > 0;
  const effectiveWeights = mode === 'lexical_only' || !hasVector
    ? { lexical: 1, vector: 0 }
    : { lexical: wLex, vector: wVec };
  const fusion = reciprocalRankFusion({ lexical, vector, weights: effectiveWeights, k });
  const denominator = effectiveWeights.lexical + effectiveWeights.vector || 1;
  const minRelevance = config?.min_relevance ?? 0.5;
  const ranked = [];
  const rejected = [];
  for (const row of fusion.rows) {
    const detail = details.get(row.chunk_id) || {};
    const lexSignal = detail.lexical_signal ?? 0;
    const vecSignal = Math.max(0, Number(detail.vector_similarity) || 0);
    const relevance = (effectiveWeights.lexical * lexSignal + effectiveWeights.vector * vecSignal) / denominator;
    const enriched = {
      ...row,
      lexical_signal: lexSignal,
      vector_similarity: detail.vector_similarity ?? null,
      relevance,
    };
    if (relevance >= minRelevance) ranked.push(enriched);
    else rejected.push(enriched);
  }
  ranked.sort((a, b) => b.fusion - a.fusion || b.relevance - a.relevance || (a.chunk_id < b.chunk_id ? -1 : 1));
  return {
    ranked,
    rejected,
    best_relevance: ranked[0]?.relevance ?? 0,
    fusion: { lex: fusion.lexList.length, vec: fusion.vecList.length, mode, weights: effectiveWeights },
  };
}

export function buildContext(sources, maxChars) {
  const limit = Number(maxChars) > 0 ? Number(maxChars) : 6000;
  const parts = [];
  let used = 0;
  let count = 0;
  for (const source of sources) {
    if (!source || typeof source.content !== 'string') continue;
    const header = `[${count + 1}] ${source.title || ''}`.trim();
    const body = String(source.content || '');
    const slice = body.slice(0, 1500);
    const segment = `${header}\n${slice}`;
    const separator = parts.length ? 2 : 0; // "\n\n"
    if (used + segment.length + separator > limit) break;
    parts.push(segment);
    used += segment.length + separator;
    count += 1;
  }
  return parts.join('\n\n');
}

// Predicado de escopo aplicado em TODA busca. Devolve { clause, params } com
// os placeholders corretos. O cliente tem que ter grant ativo, conta ativa
// e unidade casada; rh/marcelo/público leem apenas documentos sem
// client_account_id. O chamador posiciona os placeholders após o WHERE.
function scopeClause(ragKey, actor) {
  if (ragKey === 'cliente') {
    if (!actor?.identityId) return { clause: 'AND FALSE', params: [] };
    return {
      clause: `AND d.client_account_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM client_access_grants g
          JOIN client_accounts a ON a.id = g.client_account_id
         WHERE g.identity_id = $${actor.identityId ? 'IDENTITY_PLACEHOLDER' : 'IDENTITY_PLACEHOLDER'}
           AND g.client_account_id = d.client_account_id
           AND g.revoked_at IS NULL
           AND a.status = 'active'
           AND (g.unit_account_id IS NULL OR g.unit_account_id = a.id)
      )`,
      params: [actor.identityId],
    };
  }
  return { clause: 'AND d.client_account_id IS NULL', params: [] };
}

// Substitui o placeholder textual $IDENTITY_PLACEHOLDER pelo número correto
// do parâmetro, depois de todos os params anteriores já terem sido empilhados.
function bindScopeClause(scope, params) {
  const paramIndex = params.length; // o próximo índice será o identityId
  return {
    clause: scope.clause.replace('IDENTITY_PLACEHOLDER', String(paramIndex)),
    params: [...scope.params],
  };
}

const PUBLISHED = `d.rag_key = $1
   AND c.rag_key = $1
   AND i.rag_key = $1
   AND d.is_approved = true
   AND d.is_published = true
   AND i.is_approved = true
   AND i.is_published = true
   AND i.is_active = true`;

function foldSqlExpression(expression, mode) {
  // mode = 'fts' usa to_tsvector + unaccent (se a extensão existir);
  // mode = 'trgm' usa ILIKE + translate() (nativo, sempre disponível).
  if (mode === 'fts') {
    return `unaccent(lower(${expression}))`;
  }
  return `translate(lower(${expression}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')`;
}

export function createRagRetrieval({ pool, embeddings, env = process.env, clock = () => new Date() }) {
  if (!pool) throw new Error('pool_required');
  if (!embeddings) throw new Error('embeddings_required');

  let configCache = null;
  async function loadConfig(ragKey) {
    if (configCache && configCache.ragKey === ragKey) return configCache.value;
    const { rows } = await pool.query(
      'SELECT min_relevance, max_chunks, max_context_chars, lexical_candidates, vector_candidates, vector_scan_limit, retention_days FROM ai_rag_retrieval_config WHERE rag_key=$1 AND is_active=true',
      [ragKey]
    );
    const fallback = {
      min_relevance: 0.5,
      max_chunks: 6,
      max_context_chars: 6000,
      lexical_candidates: 40,
      vector_candidates: 40,
      vector_scan_limit: 800,
      retention_days: 90,
    };
    const value = rows[0] ? { ...fallback, ...rows[0] } : fallback;
    configCache = { ragKey, value };
    return value;
  }

  let probeCache = null;
  async function probe() {
    if (probeCache) return probeCache;
    const info = { fts: false, unaccent: false, trigram: false, pgvector: false };
    try {
      const ftsTest = await pool.query("SELECT to_tsvector('portuguese', 'teste') IS NOT NULL AS ok");
      info.fts = ftsTest.rows[0]?.ok === true;
    } catch {}
    try {
      const unaccentTest = await pool.query("SELECT unaccent('ação') IS NOT NULL AS ok");
      info.unaccent = unaccentTest.rows[0]?.ok === true;
    } catch {}
    try {
      const trgmTest = await pool.query("SELECT similarity('a','b') IS NOT NULL AS ok");
      info.trigram = trgmTest.rows[0]?.ok === true;
    } catch {}
    try {
      const pgVec = await pool.query("SELECT 1 FROM pg_extension WHERE extname='vector' LIMIT 1");
      info.pgvector = pgVec.rows.length > 0;
    } catch {}
    probeCache = info;
    return info;
  }

  async function detectVectorBackend() {
    const configured = String(env.RAG_VECTOR_BACKEND || 'auto').toLowerCase();
    const info = await probe();
    if (configured === 'pgvector') return { backend: info.pgvector ? 'pgvector' : 'exact', reason: info.pgvector ? 'configured_pgvector' : 'pgvector_unavailable' };
    if (configured === 'exact') return { backend: 'exact', reason: 'configured_exact' };
    if (configured === 'off') return { backend: 'none', reason: 'configured_off' };
    return { backend: info.pgvector ? 'pgvector' : 'exact', reason: info.pgvector ? 'extension_installed' : 'extension_missing_default_exact' };
  }

  async function lexicalSearch({ ragKey, actor, question, config }) {
    const params = [ragKey];
    const rawScope = scopeClause(ragKey, actor);
    const scope = bindScopeClause(rawScope, params);
    if (scope.clause.includes('AND FALSE')) return { rows: [], strategy: 'denied' };
    const terms = contentTerms(question);
    if (terms.length === 0) return { rows: [], strategy: 'empty' };
    const info = await probe();
    const limitParam = `$${params.push(config.lexical_candidates)}`;
    if (info.fts && info.unaccent) {
      const termsParam = `$${params.push(terms)}`;
      const queryParam = `$${params.push(terms.map((t) => t.replace(/'/g, "''")).join(' | '))}`;
      const sql = `SELECT c.id AS chunk_id,
             c.document_id,
             c.chunk_index,
             c.content,
             d.title,
             d.source,
             d.version,
             d.published_at,
             d.updated_at,
             ((SELECT COUNT(*)::float FROM unnest(${termsParam}::text[]) AS term
                WHERE to_tsvector('portuguese', unaccent(lower(c.content))) @@ to_tsquery('portuguese', unaccent(term)))
              / array_length(${termsParam}::text[], 1))::float AS lexical_signal
        FROM ai_rag_chunks c
        JOIN ai_rag_documents d ON d.id = c.document_id
        JOIN ai_rag_indexes i ON i.id = d.rag_index_id
       WHERE ${PUBLISHED}
         ${scope.clause}
         AND to_tsvector('portuguese', unaccent(lower(c.content))) @@ to_tsquery('portuguese', ${queryParam})
       ORDER BY lexical_signal DESC, c.id ASC
       LIMIT ${limitParam}`;
      const { rows } = await pool.query(sql, params);
      return { rows, strategy: 'fts' };
    }
    // Fallback nativo: ILIKE + translate() dobra acentos nos dois lados
    // (lexical e query) para evitar a divergência medida entre 'admissão'
    // → 'admiss' e 'admissao' → 'admissa'. Cobertura é calculada em JS com
    // a MESMA semântica de foldAccents.
    const patterns = terms.map((t) => `%${t}%`);
    const patternsParam = `$${params.push(patterns)}`;
    const fold = (expr) => foldSqlExpression(expr, 'trgm');
    const orderBy = info.trigram
      ? `ORDER BY similarity(${fold('c.content')}, ${patternsParam}::text) DESC, c.id ASC`
      : 'ORDER BY d.updated_at DESC, c.id ASC';
    const sql = `SELECT c.id AS chunk_id,
             c.document_id,
             c.chunk_index,
             c.content,
             d.title,
             d.source,
             d.version,
             d.published_at,
             d.updated_at,
             0::float AS lexical_signal
        FROM ai_rag_chunks c
        JOIN ai_rag_documents d ON d.id = c.document_id
        JOIN ai_rag_indexes i ON i.id = d.rag_index_id
       WHERE ${PUBLISHED}
         ${scope.clause}
         AND ${fold('c.content')} ILIKE ANY(${patternsParam}::text[])
       ${orderBy}
       LIMIT ${limitParam}`;
    const { rows } = await pool.query(sql, params);
    for (const row of rows) {
      row.lexical_signal = termCoverage(terms, `${row.title || ''} ${row.content || ''}`);
    }
    return { rows, strategy: 'trgm' };
  }

  async function vectorSearch({ ragKey, actor, question, config, backend, queryVector }) {
    if (!queryVector) return { rows: [], backend: 'none' };
    const params = [ragKey];
    const dimensionsParam = `$${params.push(queryVector.length)}`;
    const rawScope = scopeClause(ragKey, actor);
    const scope = bindScopeClause(rawScope, params);
    if (scope.clause.includes('AND FALSE')) return { rows: [], backend };
    if (backend === 'pgvector') {
      const vectorParam = `$${params.push(`[${queryVector.join(',')}]`)}`;
      const limitParam = `$${params.push(config.vector_candidates)}`;
      const sql = `SELECT e.chunk_id,
             1 - (e.embedding::vector <=> ${vectorParam}::vector) AS similarity,
             c.document_id,
             c.chunk_index,
             c.content,
             d.title,
             d.source,
             d.version,
             d.published_at,
             d.updated_at
        FROM ai_rag_chunk_embeddings e
        JOIN ai_rag_chunks c ON c.id = e.chunk_id
        JOIN ai_rag_documents d ON d.id = c.document_id
        JOIN ai_rag_indexes i ON i.id = d.rag_index_id
       WHERE ${PUBLISHED}
         ${scope.clause}
         AND e.status = 'gerado'
         AND e.dimensions = ${dimensionsParam}
       ORDER BY e.embedding::vector <=> ${vectorParam}::vector ASC
       LIMIT ${limitParam}`;
      const { rows } = await pool.query(sql, params);
      return { rows, backend: 'pgvector' };
    }
    // Backend exato: cosseno calculado em JS, depois de puxar os embeddings
    // já filtrados por escopo. Limitado a vector_scan_limit para não
    // varrer todo o corpus (corpos pequenos continuam honestos).
    const limitParam = `$${params.push(config.vector_scan_limit)}`;
    const sql = `SELECT e.chunk_id,
             e.embedding,
             c.document_id,
             c.chunk_index,
             c.content,
             d.title,
             d.source,
             d.version,
             d.published_at,
             d.updated_at
        FROM ai_rag_chunk_embeddings e
        JOIN ai_rag_chunks c ON c.id = e.chunk_id
        JOIN ai_rag_documents d ON d.id = c.document_id
        JOIN ai_rag_indexes i ON i.id = d.rag_index_id
       WHERE ${PUBLISHED}
         ${scope.clause}
         AND e.status = 'gerado'
         AND e.dimensions = ${dimensionsParam}
       ORDER BY d.updated_at DESC
       LIMIT ${limitParam}`;
    const { rows } = await pool.query(sql, params);
    for (const row of rows) {
      row.similarity = cosineSimilarity(queryVector, row.embedding || []);
      delete row.embedding;
    }
    rows.sort((a, b) => b.similarity - a.similarity);
    return { rows: rows.slice(0, config.vector_candidates), backend: 'exact' };
  }

  // Indexa UM documento. Idempotente: checksum de cada chunk decide se
  // precisa de embedding novo. Falha parcial NÃO marca o documento como
  // pronto — só chunks com status='gerado' contam.
  async function indexDocument({ documentId, onProgress, batchSize = 16 }) {
    const summary = { document_id: documentId, total: 0, generated: 0, skipped: 0, errored: 0 };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: docRows } = await client.query(
        'SELECT id, rag_key, is_approved, is_published FROM ai_rag_documents WHERE id=$1 FOR UPDATE',
        [documentId]
      );
      if (docRows.length === 0) {
        await client.query('COMMIT');
        return { ...summary, note: 'documento_ausente' };
      }
      const doc = docRows[0];
      if (!doc.is_approved || !doc.is_published) {
        // Despublicado: garante que qualquer embedding órfão seja purgado.
        await client.query(
          'DELETE FROM ai_rag_chunk_embeddings WHERE chunk_id IN (SELECT id FROM ai_rag_chunks WHERE document_id=$1)',
          [documentId]
        );
        await client.query('COMMIT');
        return { ...summary, note: 'documento_nao_publicado' };
      }
      const { rows: chunks } = await client.query(
        'SELECT id, rag_key, content, chunk_index FROM ai_rag_chunks WHERE document_id=$1 ORDER BY chunk_index',
        [documentId]
      );
      summary.total = chunks.length;
      if (chunks.length === 0) {
        await client.query('COMMIT');
        return summary;
      }
      const { rows: existing } = await client.query(
        'SELECT chunk_id, content_checksum, model_name, dimensions, status FROM ai_rag_chunk_embeddings WHERE chunk_id = ANY($1::uuid[])',
        [chunks.map((c) => c.id)]
      );
      const existingMap = new Map(existing.map((row) => [row.chunk_id, row]));
      const toEmbed = [];
      for (const chunk of chunks) {
        const checksum = contentChecksum(chunk.content);
        const previous = existingMap.get(chunk.id);
        if (previous && previous.status === 'gerado' && previous.content_checksum === checksum
            && previous.model_name === embeddings.config.model
            && previous.dimensions === embeddings.config.dimensions) {
          summary.skipped += 1;
          continue;
        }
        toEmbed.push({ chunk, checksum });
      }
      // Limpa embeddings desatualizados (mudou checksum/modelo/dimensão).
      for (const { chunk, checksum } of toEmbed) {
        await client.query(
          'DELETE FROM ai_rag_chunk_embeddings WHERE chunk_id=$1',
          [chunk.id]
        );
        await client.query(
          `INSERT INTO ai_rag_chunk_embeddings (chunk_id, rag_key, model_name, dimensions, content_checksum, status)
             VALUES ($1, $2, $3, $4, $5, 'pendente')
             ON CONFLICT (chunk_id) DO UPDATE SET
               model_name = EXCLUDED.model_name,
               dimensions = EXCLUDED.dimensions,
               content_checksum = EXCLUDED.content_checksum,
               status = 'pendente',
               embedding = NULL,
               error_code = NULL,
               generated_at = NULL`,
          [chunk.id, chunk.rag_key, embeddings.config.model, embeddings.config.dimensions, checksum]
        );
      }
      // Gera embeddings em lote.
      for (let i = 0; i < toEmbed.length; i += batchSize) {
        const batch = toEmbed.slice(i, i + batchSize);
        const result = await embeddings.embedMany(batch.map((b) => b.chunk.content));
        if (!result.ok) {
          for (const item of batch) {
            await client.query(
              'UPDATE ai_rag_chunk_embeddings SET status=$2, error_code=$3, generated_at=NULL WHERE chunk_id=$1',
              [item.chunk.id, 'erro', result.code || 'embedding_unavailable']
            );
            summary.errored += 1;
          }
          if (onProgress) onProgress(summary);
          continue;
        }
        for (let j = 0; j < batch.length; j += 1) {
          const item = batch[j];
          const vector = result.vectors[j];
          await client.query(
            'UPDATE ai_rag_chunk_embeddings SET status=$2, embedding=$3, generated_at=NOW(), error_code=NULL WHERE chunk_id=$1',
            [item.chunk.id, 'gerado', vector]
          );
          summary.generated += 1;
        }
        if (onProgress) onProgress(summary);
      }
      await client.query('COMMIT');
      return summary;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function purgeUnpublishedEmbeddings() {
    const { rowCount } = await pool.query(`DELETE FROM ai_rag_chunk_embeddings e
       USING ai_rag_chunks c, ai_rag_documents d
       WHERE e.chunk_id = c.id
         AND c.document_id = d.id
         AND (d.is_approved = false OR d.is_published = false)`);
    return { purged: rowCount };
  }

  async function indexStatus(ragKey) {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM ai_rag_documents d
            JOIN ai_rag_indexes i ON i.id = d.rag_index_id
           WHERE d.rag_key=$1 AND d.is_approved=true AND d.is_published=true
             AND i.is_approved=true AND i.is_published=true AND i.is_active=true) AS published_documents,
         (SELECT COUNT(*) FROM ai_rag_chunks c
            JOIN ai_rag_documents d ON d.id = c.document_id
            JOIN ai_rag_indexes i ON i.id = d.rag_index_id
           WHERE c.rag_key=$1 AND d.is_approved=true AND d.is_published=true
             AND i.is_approved=true AND i.is_published=true AND i.is_active=true) AS total_chunks,
         (SELECT COUNT(*) FROM ai_rag_chunk_embeddings e
            JOIN ai_rag_chunks c ON c.id = e.chunk_id
           WHERE e.rag_key=$1 AND e.status='gerado') AS indexed,
         (SELECT COUNT(*) FROM ai_rag_chunk_embeddings e
            JOIN ai_rag_chunks c ON c.id = e.chunk_id
           WHERE e.rag_key=$1 AND e.status='pendente') AS pending,
         (SELECT COUNT(*) FROM ai_rag_chunk_embeddings e
            JOIN ai_rag_chunks c ON c.id = e.chunk_id
           WHERE e.rag_key=$1 AND e.status='erro') AS errored,
         (SELECT model_name FROM ai_rag_chunk_embeddings
            WHERE rag_key=$1 AND status='gerado'
            ORDER BY generated_at DESC NULLS LAST LIMIT 1) AS model_name,
         (SELECT dimensions FROM ai_rag_chunk_embeddings
            WHERE rag_key=$1 AND status='gerado'
            ORDER BY generated_at DESC NULLS LAST LIMIT 1) AS dimensions,
         (SELECT MAX(generated_at) FROM ai_rag_chunk_embeddings
            WHERE rag_key=$1 AND status='gerado') AS last_generated_at`,
      [ragKey]
    );
    return rows[0] || {};
  }

  // Recuperação híbrida. Devolve:
  //   - mode: 'hybrid' | 'lexical_only'
  //   - vector_backend: 'pgvector' | 'exact' | 'none'
  //   - ranked: chunks acima do limiar
  //   - rejected: chunks abaixo
  //   - sources: payload pronto para o widget (com trecho e metadados)
  //   - best_relevance / vector_error (códigos do módulo de embeddings)
  async function retrieve({ ragKey, actor, question, config }) {
    const cfg = config || (await loadConfig(ragKey));
    const backendInfo = await detectVectorBackend();
    const embedStatus = await embeddings.status();
    let queryVector = null;
    let vectorError = null;
    if (!embedStatus.enabled) {
      vectorError = 'embedding_disabled';
    } else if (!embedStatus.ok) {
      vectorError = embedStatus.code || 'embedding_unavailable';
    } else {
      const result = await embeddings.embedOne(question);
      if (result.ok) {
        queryVector = result.vector;
      } else {
        vectorError = result.code;
      }
    }
    const useVector = Boolean(queryVector) && backendInfo.backend !== 'none';
    const lexical = await lexicalSearch({ ragKey, actor, question, config: cfg });
    const lexicalIds = lexical.rows.map((row) => row.chunk_id);
    const vector = useVector
      ? await vectorSearch({ ragKey, actor, question, config: cfg, backend: backendInfo.backend, queryVector })
      : { rows: [], backend: 'none' };
    const vectorIds = vector.rows.map((row) => row.chunk_id);
    const details = new Map();
    for (const row of lexical.rows) details.set(row.chunk_id, { ...(details.get(row.chunk_id) || {}), ...row, lexical_signal: row.lexical_signal ?? 0 });
    for (const row of vector.rows) details.set(row.chunk_id, { ...(details.get(row.chunk_id) || {}), ...row, vector_similarity: row.similarity ?? 0 });
    const ranking = rankAndFilter({
      lexical: lexicalIds,
      vector: vectorIds,
      details,
      weights: { lexical: 0.5, vector: 0.5 },
      mode: useVector ? 'hybrid' : 'lexical_only',
      config: cfg,
    });
    const acceptedSet = new Set(ranking.ranked.map((row) => row.chunk_id));
    const maxChunks = cfg.max_chunks;
    const chosen = ranking.ranked.slice(0, maxChunks);
    const lookup = new Map();
    for (const row of [...lexical.rows, ...vector.rows]) lookup.set(row.chunk_id, row);
    const sources = chosen.map((row, index) => {
      const source = lookup.get(row.chunk_id) || {};
      const content = String(source.content || '');
      return {
        rank: index + 1,
        chunk_id: row.chunk_id,
        document_id: source.document_id || null,
        title: source.title || '',
        source: source.source || '',
        version: source.version || null,
        published_at: source.published_at || null,
        updated_at: source.updated_at || null,
        chunk_index: source.chunk_index ?? null,
        relevance: Number(row.relevance.toFixed(4)),
        lexical_signal: Number((row.lexical_signal ?? 0).toFixed(4)),
        vector_similarity: row.vector_similarity == null ? null : Number(row.vector_similarity.toFixed(4)),
        excerpt: content.slice(0, 600),
      };
    });
    const context = buildContext(sources.map((s) => ({ title: s.title, content: s.excerpt })), cfg.max_context_chars);
    const staleAfterDays = Number(env.RAG_STALE_AFTER_DAYS || 180);
    const now = clock();
    for (const source of sources) {
      const updated = source.updated_at ? new Date(source.updated_at) : null;
      const published = source.published_at ? new Date(source.published_at) : null;
      const reference = published || updated;
      const ageDays = reference ? Math.floor((now - reference) / (1000 * 60 * 60 * 24)) : null;
      source.age_days = ageDays;
      source.stale = ageDays != null && ageDays > staleAfterDays;
    }
    const staleCount = sources.filter((s) => s.stale).length;
    return {
      mode: useVector ? 'hybrid' : 'lexical_only',
      vector_backend: useVector ? backendInfo.backend : 'none',
      vector_error: vectorError,
      lexical_strategy: lexical.strategy,
      lexical_candidates: lexical.rows.length,
      vector_candidates: vector.rows.length,
      min_relevance: cfg.min_relevance,
      best_relevance: Number(ranking.best_relevance.toFixed(4)),
      accepted: chosen.length,
      rejected: ranking.rejected.length,
      stale_warning: staleCount > 0,
      stale_sources: sources.filter((s) => s.stale).map((s) => s.document_id).filter(Boolean),
      sources,
      context,
      ranking: ranking.ranked.map((row) => ({ chunk_id: row.chunk_id, relevance: Number(row.relevance.toFixed(4)) })),
    };
  }

  return {
    loadConfig,
    detectVectorBackend,
    probe,
    lexicalSearch,
    vectorSearch,
    indexDocument,
    purgeUnpublishedEmbeddings,
    indexStatus,
    retrieve,
  };
}
