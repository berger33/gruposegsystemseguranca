import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiRagRealApi, rankApprovedChunks } from '../src/server/ai-rag-real-api.mjs';

function response() {
  return { status: null, body: null, writeHead(status) { this.status = status; }, end(raw) { this.body = JSON.parse(raw); } };
}
async function request(api, rag_key, query = 'Como abrir um chamado?') {
  const req = { method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ rag_key, query })); } };
  const res = response();
  await api.ask(req, res);
  return res;
}

// Retrieval mínimo: devolve o que a query de SELECT devolve. Asserções
// abaixo só checam que a recuperação é precedida pelo escopo, não tentam
// casar o SQL exato (a SQL mudou de forma controlada — ver
// src/server/ai-rag-retrieval.mjs).
function fakeRetrieval({ rowsByPattern = () => [], sources = [], mode = 'lexical_only' } = {}) {
  return {
    async retrieve({ ragKey, actor }) {
      const rows = rowsByPattern(ragKey, actor);
      const acceptedRows = mode === 'empty' ? [] : rows;
      return {
        mode,
        vector_backend: 'none',
        vector_error: mode === 'hybrid' ? null : 'embedding_disabled',
        lexical_strategy: 'fts',
        lexical_candidates: acceptedRows.length,
        vector_candidates: 0,
        min_relevance: 0.5,
        best_relevance: acceptedRows.length ? 1.0 : 0,
        accepted: acceptedRows.length,
        rejected: 0,
        stale_warning: false,
        stale_sources: [],
        ranking: acceptedRows.map((r, i) => ({ chunk_id: r.id, relevance: 1 })),
        context: acceptedRows.map((r) => r.content || '').join('\n\n'),
        sources: sources,
      };
    },
    async indexDocument() { return {}; },
    async purgeUnpublishedEmbeddings() { return { purged: 0 }; },
    async indexStatus() { return {}; },
    async detectVectorBackend() { return { backend: 'exact' }; },
    async loadConfig() { return { min_relevance: 0.5, max_chunks: 6, max_context_chars: 6000, lexical_candidates: 40, vector_candidates: 40, vector_scan_limit: 800, retention_days: 90 }; },
  };
}
const fakeEmbeddings = {
  config: { model: 'nomic-embed-text', dimensions: 768 },
  async status() { return { ok: true, enabled: false, model: 'nomic-embed-text', dimensions: 768 }; },
  async embedOne() { return { ok: false, code: 'embedding_disabled' }; },
  async embedMany() { return { ok: false, code: 'embedding_disabled' }; },
  contentChecksum(text) { return 'x'.repeat(64); },
};

const noopPool = {
  async query() {
    return { rows: [], rowCount: 0 };
  },
};

test('recuperação pontua apenas chunks relacionados', () => {
  const ranked = rankApprovedChunks('Como abrir chamado?', [
    { title: 'Chamados', content: 'Para abrir chamado, use o portal.' },
    { title: 'Férias', content: 'Solicite férias ao RH.' },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].title, 'Chamados');
});

test('escopos privados são barrados antes da consulta ao banco', async () => {
  let retrievalCalls = 0;
  const retrieval = fakeRetrieval();
  const originalRetrieve = retrieval.retrieve;
  retrieval.retrieve = async (params) => { retrievalCalls += 1; return originalRetrieve(params); };
  const api = createAiRagRealApi({ pool: noopPool, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null,
    retrieval,
    embeddings: fakeEmbeddings });
  assert.equal((await request(api, 'marcelo')).status, 403);
  assert.equal((await request(api, 'cliente')).status, 401);
  assert.equal(retrievalCalls, 0);
});

test('cliente só recupera documentos aprovados da conta vinculada antes do modelo', async () => {
  const old = process.env.OLLAMA_ENABLED;
  process.env.OLLAMA_ENABLED = 'true';
  const seenActor = { identityId: null };
  const retrieval = fakeRetrieval({ sources: [] });
  const originalRetrieve = retrieval.retrieve;
  retrieval.retrieve = async (params) => { seenActor.identityId = params.actor?.identityId || null; return { ...(await originalRetrieve(params)), sources: [] }; };
  const api = createAiRagRealApi({ pool: noopPool, sameOrigin: () => true,
    readStaffSession: async () => null,
    readClientSession: async () => ({ identityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
    retrieval,
    embeddings: fakeEmbeddings });
  try {
    const res = await request(api, 'cliente');
    assert.equal(res.status, 200);
    assert.equal(res.body.reason, 'no_relevant_source');
    assert.equal(res.body.ollama_used, false);
    assert.equal(seenActor.identityId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  } finally { if (old === undefined) delete process.env.OLLAMA_ENABLED; else process.env.OLLAMA_ENABLED = old; }
});

test('RH acessa só corpus RH e não consulta corpus Marcelo', async () => {
  const old = process.env.OLLAMA_ENABLED;
  process.env.OLLAMA_ENABLED = 'true';
  let rhCalls = 0;
  const retrieval = fakeRetrieval();
  const originalRetrieve = retrieval.retrieve;
  retrieval.retrieve = async (params) => { if (params.ragKey === 'rh') rhCalls += 1; return originalRetrieve(params); };
  const api = createAiRagRealApi({ pool: noopPool, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null,
    retrieval,
    embeddings: fakeEmbeddings });
  try {
    assert.equal((await request(api, 'rh', 'Como solicitar férias?')).status, 200);
    assert.equal(rhCalls, 1);
    assert.equal((await request(api, 'marcelo')).status, 403);
    assert.equal(rhCalls, 1);
  } finally { if (old === undefined) delete process.env.OLLAMA_ENABLED; else process.env.OLLAMA_ENABLED = old; }
});
