// RAG-01 — contrato unitário da fundação semântica.
//
// Nenhum banco, nenhuma rede: funções puras, contrato do serviço de embeddings
// com fetch injetado SOMENTE aqui (o gate HTTP usa servidor real) e guardas
// estáticas contra regressão de apresentação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildContext, contentTerms, termCoverage, reciprocalRankFusion, rankAndFilter,
  ageInDays, isStale, DEFAULT_RETRIEVAL_CONFIG, PT_STOPWORDS,
} from '../src/server/ai-rag-retrieval.mjs';
import {
  chunkChecksum, cosineSimilarity, declaredDimensions, extractVector,
  resolveEmbeddingConfig, createEmbeddingService, DEFAULT_EMBED_MODEL, DEFAULT_EMBED_DIMENSIONS,
} from '../src/server/ai-rag-embeddings.mjs';
import { buildProtocol } from '../src/server/ai-rag-real-api.mjs';
import { RAG_ERROR_CODES, describeRagError, ragNoSourceMessage, honestDate, honestRelevance, ragRetrievalLabel, ragVectorBackendLabel } from '../src/lib/rag-vocabulary.mjs';

// Superfície do assistente: a rota canônica e o provedor de embeddings. Os
// códigos de validação do painel de curadoria (formulário administrativo) não
// são traduzidos aqui porque não aparecem no widget.
const serverFiles = [
  await readFile(new URL('../src/server/ai-rag-real-api.mjs', import.meta.url), 'utf8'),
  await readFile(new URL('../src/server/ai-rag-embeddings.mjs', import.meta.url), 'utf8'),
];
// Códigos que o widget realmente recebe destas rotas além dos extraídos acima.
const FEEDBACK_SURFACE_CODES = ['feedback_failed', 'protocol_not_found', 'same_origin_required', 'rag_unavailable', 'index_status_unavailable', 'retrieval_unavailable', 'embedding_backfill_failed'];
const retrieval = await readFile(new URL('../src/server/ai-rag-retrieval.mjs', import.meta.url), 'utf8');
const widget = await readFile(new URL('../src/components/RagWidget.tsx', import.meta.url), 'utf8');
const panel = await readFile(new URL('../src/app/admin/ti/AiRagClient.tsx', import.meta.url), 'utf8');
const migration = await readFile(new URL('../db/migrations/175-ai-rag-hybrid-embeddings.sql', import.meta.url), 'utf8');
const betaInit = await readFile(new URL('../db/beta-pglite-init.sql', import.meta.url), 'utf8');

test('RAG-01: todo erro que o servidor devolve tem tradução declarada', () => {
  const codes = new Set();
  for (const source of serverFiles) {
    for (const match of source.matchAll(/error:\s*['"]([a-z_]+)['"]/g)) codes.add(match[1]);
    for (const match of source.matchAll(/error_code:\s*['"]([a-z_]+)['"]/g)) codes.add(match[1]);
  }
  for (const code of FEEDBACK_SURFACE_CODES) codes.add(code);
  assert.ok(codes.size >= 20, `esperado um conjunto real de códigos, veio ${codes.size}`);
  const missing = [...codes].filter(code => !RAG_ERROR_CODES.includes(code));
  assert.deepEqual(missing, [], `códigos sem tradução: ${missing.join(', ')}`);
});

test('RAG-01: ausência nunca é apresentada como resposta confiante', () => {
  assert.match(ragNoSourceMessage('below_threshold'), /suposição|Nada foi respondido/i);
  assert.doesNotMatch(ragNoSourceMessage('nothing_found'), /R\$|1970/);
  assert.notEqual(describeRagError('no_relevant_source').title, 'Resposta não reconhecida');
  assert.equal(describeRagError(null, 0).canRetry, true);
  assert.match(describeRagError(null, 0).detail, /não chegou a ser feita/);
  assert.equal(describeRagError('ai_unavailable').kind, 'unavailable');
  assert.equal(honestDate(null), 'Data de publicação não informada');
  assert.equal(honestRelevance(undefined), 'Relevância não informada');
  assert.match(ragRetrievalLabel('lexical_only'), /semântica indisponível/i);
  assert.match(ragVectorBackendLabel('exact'), /sem índice ANN/i);
});

test('RAG-01: FTS só acento-insensível nos dois lados, e com a guarda do provedor', () => {
  // Acentuação assimétrica no FTS já produziu "ausência" falsa: admissao (consulta)
  // nunca casava com admissão (conteúdo). O sinal lexical exige unaccent dos dois
  // lados, com translate como reserva declarada — nunca só to_tsvector cru.
  assert.match(retrieval, /probeInfo\.fts && probeInfo\.unaccent/, 'FTS condicionado à normalização de acento');
  assert.match(retrieval, /to_tsvector\('portuguese', unaccent\(lower\(/, 'conteúdo normalizado com unaccent+lower');
  assert.match(retrieval, /to_tsquery\('portuguese', ?unaccent\(lower\(/, 'rag do termo normalizado com unaccent+lower');
  assert.match(retrieval, /translate\(/, 'reserva declarada quando unaccent não existe');
  assert.ok(PT_STOPWORDS.includes('funciona') && PT_STOPWORDS.includes('existe'), 'moldura de pergunta não vira termo de conteúdo');
  assert.deepEqual(contentTerms('Como funciona a admissão no RH?'), ['admissao'], 'a forma sem acento é a mesma do conteúdo indexado');
});

test('RAG-01: cobertura lexical usa termos de conteúdo, sem palavra funcional', () => {
  assert.ok(PT_STOPWORDS.includes('como') && PT_STOPWORDS.includes('para'));
  assert.deepEqual(contentTerms('Como abrir um chamado no portal?'), ['abrir', 'chamado', 'portal']);
  assert.deepEqual(contentTerms('como para sobre'), [], 'pergunta só com palavras funcionais não gera termos');
  assert.equal(contentTerms('férias FERIAS ferias')[0], 'ferias', 'sem acento e sem duplicata');
  assert.equal(termCoverage(['abrir', 'chamado', 'portal'], 'Para abrir um chamado no portal, use a área Chamados.'), 1);
  assert.equal(termCoverage(['abrir', 'chamado', 'portal'], 'O portal fica na área restrita.'), 1 / 3);
  assert.equal(termCoverage(['desconto'], 'Tabela de preços sob consulta.'), 0);
  assert.equal(termCoverage([], 'qualquer texto'), 0);
});

test('RAG-01: fusão determinística e limiar mínimo por relevância', () => {
  const details = {
    a: { lexical_signal: 1 },
    b: { lexical_signal: 0.5, vector_similarity: 0.9 },
    c: { lexical_signal: 0.25 },
    d: { vector_similarity: 0.8 },
  };
  const rows = reciprocalRankFusion({ lexical: ['a', 'b', 'c'], vector: ['b', 'd'], details });
  assert.deepEqual(rows.map(row => row.chunk_id), ['b', 'a', 'd', 'c'], 'RRF ordena por peso e posição');
  const byId = Object.fromEntries(rows.map(row => [row.chunk_id, row.relevance]));
  assert.equal(byId.a, 1, 'só lexical: relevância é o próprio sinal');
  assert.equal(byId.b, 0.7, 'nos dois lados: média ponderada');
  assert.equal(byId.d, 0.8, 'só vetorial: relevância é o cosseno');

  const hybrid = rankAndFilter({ lexical: ['a', 'b', 'c'], vector: ['b', 'd'], details, mode: 'hybrid' });
  assert.deepEqual(hybrid.ranked.map(row => row.chunk_id), ['b', 'a', 'd'], 'ordem de aceitos segue o RRF');
  assert.equal(hybrid.rejected_count, 1);
  assert.equal(hybrid.ranked.find(row => row.chunk_id === 'c'), undefined, 'abaixo do limiar não entra');

  const lexicalOnly = rankAndFilter({ lexical: ['a', 'b', 'c'], vector: ['b', 'd'], details, mode: 'lexical_only' });
  assert.deepEqual(lexicalOnly.ranked.map(row => row.chunk_id), ['a', 'b'], 'sem embeddings só existe lista lexical');

  // Determinismo: mesma entrada, mesma saída, sem depender de ordem de inserção.
  const shuffled = reciprocalRankFusion({ lexical: ['a', 'b', 'c'], vector: ['d', 'b'], details });
  assert.deepEqual(shuffled.map(row => row.chunk_id), ['b', 'a', 'd', 'c']);
});

test('RAG-01: candidato fraco não vira resposta e limiar zero é o único permissivo', () => {
  const details = { fraco: { lexical_signal: 0.2 }, forte: { lexical_signal: 0.9 } };
  const strict = rankAndFilter({ lexical: ['fraco'], vector: [], details, mode: 'lexical_only' });
  assert.equal(strict.ranked.length, 0);
  assert.equal(strict.below_threshold, true);
  assert.equal(strict.best_relevance, 0.2);

  const permissive = rankAndFilter({ lexical: ['fraco'], vector: [], details, mode: 'lexical_only', config: { min_relevance: 0 } });
  assert.equal(permissive.ranked.length, 1, 'limiar é o único controle: por isso o padrão é conservador');
  assert.equal(DEFAULT_RETRIEVAL_CONFIG.min_relevance, 0.5);
  assert.ok(rankAndFilter({ lexical: ['forte'], vector: [], details, mode: 'lexical_only' }).ranked.length === 1);
});

test('RAG-01: contexto respeita o teto de caracteres sem inventar trecho', () => {
  const chunks = [
    { title: 'A', content: 'x'.repeat(40) },
    { title: 'B', content: 'y'.repeat(40) },
  ];
  const context = buildContext(chunks, 60);
  assert.ok(context.length <= 60, `contexto passou do teto: ${context.length}`);
  assert.match(context, /\[1\] A/);
  assert.equal(buildContext([], 100), '');
  assert.equal(buildContext(chunks, 3), '', 'sem espaço para conteúdo, não devolve cabeçalho solto');
});

test('RAG-01: idade e desatualização são derivadas, nunca inventadas', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');
  assert.equal(ageInDays(null, now), null);
  assert.equal(ageInDays('', now), null);
  assert.equal(ageInDays('data-invalida', now), null);
  assert.equal(ageInDays('2026-10-01T12:00:00Z', now), 5);
  assert.deepEqual(isStale({ published_at: null, updated_at: null }, { staleAfterDays: 180, now }), { stale: false, age_days: null, reference: null });
  assert.equal(isStale({ published_at: '2025-01-01T00:00:00Z' }, { staleAfterDays: 180, now }).stale, true);
  assert.equal(isStale({ published_at: '2026-09-01T00:00:00Z' }, { staleAfterDays: 180, now }).stale, false);
});

test('RAG-01: serviço de embeddings recusa destino que não é loopback e não baixa modelo', async () => {
  const disabled = resolveEmbeddingConfig({ OLLAMA_ENABLED: 'false' });
  assert.equal(disabled.enabled, false);
  const remote = resolveEmbeddingConfig({ OLLAMA_ENABLED: 'true', OLLAMA_BASE_URL: 'http://10.0.0.9:11434' });
  assert.equal(remote.endpoint, null, 'host não loopback nunca vira destino de rede');
  const https = resolveEmbeddingConfig({ OLLAMA_ENABLED: 'true', OLLAMA_BASE_URL: 'https://127.0.0.1:11434' });
  assert.equal(https.endpoint, null);
  const local = resolveEmbeddingConfig({ OLLAMA_ENABLED: 'true', OLLAMA_BASE_URL: 'http://127.0.0.1:11434' });
  assert.equal(local.endpoint.href, 'http://127.0.0.1:11434/api/embed');
  assert.equal(local.model, DEFAULT_EMBED_MODEL);
  assert.equal(local.dimensions, DEFAULT_EMBED_DIMENSIONS);
  assert.equal(declaredDimensions('nomic-embed-text'), 768);
  assert.equal(declaredDimensions('bge-m3-1024'), 1024);

  let fetched = 0;
  const service = createEmbeddingService({ env: { OLLAMA_ENABLED: 'false' }, fetchImpl: async () => { fetched += 1; return { ok: true, json: async () => ({}) }; } });
  const result = await service.embedOne('texto');
  assert.equal(result.ok, false);
  assert.equal(result.error_code, 'embedding_disabled');
  assert.equal(fetched, 0, 'desabilitado não faz chamada nenhuma');

  const partial = createEmbeddingService({ env: { OLLAMA_ENABLED: 'true' }, fetchImpl: async () => ({ ok: true, json: async () => ({ embeddings: [[0.1, 0.2]] }) }) });
  const mismatch = await partial.embedOne('texto');
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error_code, 'embedding_dimension_mismatch');
  assert.equal(mismatch.expected, undefined);
  assert.equal(mismatch.dimensions, 768);
});

test('RAG-01: vetor inválido é recusado, nunca truncado nem arredondado para valor falso', () => {
  assert.deepEqual(extractVector({ embeddings: [[1, 2, 3]] }, 3), { ok: true, vector: [1, 2, 3] });
  assert.equal(extractVector({ embeddings: [[1, 2]] }, 3).error_code, 'embedding_dimension_mismatch');
  assert.equal(extractVector({ embeddings: [] }, 3).error_code, 'embedding_empty_response');
  assert.equal(extractVector({ embedding: [1, 'não-numérico', 3] }, 3).error_code, 'embedding_invalid_vector');
  assert.equal(extractVector(null, 3).error_code, 'embedding_empty_response');
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  assert.equal(cosineSimilarity([1, 0], [1]), null);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), null);
  assert.equal(cosineSimilarity([1, Number.NaN], [1, 0]), null);
  assert.equal(chunkChecksum('abc').length, 64);
  assert.equal(chunkChecksum('abc'), chunkChecksum('abc'));
  assert.notEqual(chunkChecksum('abc'), chunkChecksum('abd'));
});

test('RAG-01: protocolo canônico cabe no contrato do banco e é único', () => {
  const protocol = buildProtocol('publico', new Date(Date.UTC(2026, 9, 6)));
  assert.match(protocol, /^RAG-[A-Z]{2,4}-[0-9]{8}-[A-Z0-9]{4}$/);
  assert.equal(protocol.slice(0, 8), 'RAG-PUB-');
  assert.equal(protocol.slice(8, 16), '20261006', 'a data do protocolo vem do relógio injetado');
  assert.equal(protocol.slice(16, 17), '-');
  assert.match(protocol.slice(17), /^[A-Z0-9]{4}$/);
  assert.match(buildProtocol('cliente'), /^RAG-CLI-/);
  assert.match(buildProtocol('rh'), /^RAG-RH-/);
  assert.match(buildProtocol('marcelo'), /^RAG-MAR-/);
  const many = new Set(Array.from({ length: 50 }, () => buildProtocol('publico')));
  assert.ok(many.size >= 45, 'protocolo precisa variar entre execuções');
});

test('RAG-01: apresentação usa transporte canônico e não promete fila/modelo inexistente', () => {
  assert.doesNotMatch(widget, /fetch\(/, 'o widget não faz fetch bruto');
  assert.match(widget, /ragRequest/);
  assert.match(widget, /role="status"/);
  assert.match(widget, /aria-live="polite"/);
  assert.match(widget, /aria-describedby/);
  assert.match(widget, /Sem fonte suficiente/);
  assert.doesNotMatch(widget, /fila garantida|Qwen3 1.7B|queue_position/);
  assert.doesNotMatch(widget, /page\.route|monkeypatch/);
  assert.match(panel, /ai-rag-index-status/);
  assert.match(panel, /ai-rag-embeddings\/backfill/);
  assert.match(panel, /embedding_status<\/code> não representa indexação real/, 'o campo legado aparece apenas como aviso, não como prova');
});

test('RAG-01: migração e init beta concordam com o código', () => {
  for (const column of ['ai_rag_chunk_embeddings', 'ai_rag_answer_events', 'ai_rag_retrieval_config', 'published_at', 'answer_event_id']) {
    assert.match(migration, new RegExp(column), `migração 175 deveria conter ${column}`);
    assert.match(betaInit, new RegExp(column), `init beta deveria conter ${column}`);
  }
  assert.match(migration, /status <> 'gerado' OR \(embedding IS NOT NULL AND generated_at IS NOT NULL\)/);
  assert.match(migration, /array_length\(embedding, 1\) = dimensions/);
  assert.match(migration, /INSERT INTO ai_rag_retrieval_config \(rag_key\) VALUES \('publico'\), \('cliente'\), \('rh'\), \('marcelo'\)/);
  assert.doesNotMatch(migration, /DROP TABLE ai_rag_chunks|DROP COLUMN published_at/);
  assert.match(migration, /ALTER TABLE ai_rag_documents ADD COLUMN IF NOT EXISTS published_at/);
});
