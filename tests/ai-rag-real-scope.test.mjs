import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiRagRealApi } from '../src/server/ai-rag-real-api.mjs';
import { contentTerms, rankAndFilter, termCoverage } from '../src/server/ai-rag-retrieval.mjs';

function response() {
  return { status: null, body: null, writeHead(status) { this.status = status; }, end(raw) { this.body = JSON.parse(raw); } };
}
async function request(api, rag_key, query = 'Como abrir um chamado?') {
  const req = { method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ rag_key, query })); } };
  const res = response();
  await api.ask(req, res);
  return res;
}

test('recuperação aceita apenas chunks com cobertura suficiente da pergunta', () => {
  // Mesmo sinal usado em produção: cobertura dos termos de conteúdo do chunk.
  const terms = contentTerms('Como abrir chamado?');
  const chunks = [
    { chunk_id: 'chamado', title: 'Chamados', content: 'Para abrir chamado, use o portal e informe a categoria.' },
    { chunk_id: 'ferias', title: 'Férias', content: 'Solicite férias ao RH pelo formulário próprio.' },
  ];
  const details = Object.fromEntries(chunks.map(chunk => [chunk.chunk_id, { ...chunk, lexical_signal: termCoverage(terms, chunk.content) }]));
  const ranked = rankAndFilter({
    lexical: chunks.map(chunk => chunk.chunk_id),
    details,
    mode: 'lexical_only',
    config: { min_relevance: 0.5 },
  });
  assert.deepEqual(ranked.ranked.map(row => row.title), ['Chamados']);
  assert.equal(ranked.rejected_count, 1, 'o chunk sem relação não é aceito nem pontuado como relevante');
});

test('escopos privados são barrados antes da consulta ao banco', async () => {
  let queries = 0;
  const api = createAiRagRealApi({ pool: { async query() { queries++; return { rows: [] }; } }, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null });
  assert.equal((await request(api, 'marcelo')).status, 403);
  assert.equal((await request(api, 'cliente')).status, 401);
  assert.equal(queries, 0);
});

test('cliente só recupera documentos aprovados da conta vinculada antes do modelo', async () => {
  const old = process.env.OLLAMA_ENABLED;
  process.env.OLLAMA_ENABLED = 'true';
  const identityId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const seen = [];
  const api = createAiRagRealApi({ pool: { async query(text, args) { seen.push({ text, args }); return { rows: [] }; } }, sameOrigin: () => true,
    readStaffSession: async () => null,
    readClientSession: async () => ({ identityId }) });
  try {
    const res = await request(api, 'cliente');
    assert.equal(res.status, 200);
    assert.equal(res.body.reason, 'no_relevant_source');
    assert.equal(res.body.ollama_used, false);
    const corpus = seen.filter(entry => entry.text.includes('ai_rag_documents'));
    assert.ok(corpus.length >= 1, 'a busca no corpus aconteceu');
    for (const entry of corpus) {
      assert.equal(entry.args[0], 'cliente', 'o corpus consultado é o do escopo pedido');
      assert.match(entry.text, /client_access_grants/, 'o vínculo entra na consulta, não depois dela');
      assert.match(entry.text, /d\.is_approved=true AND d\.is_published=true/, 'só documento aprovado e publicado');
      assert.match(entry.text, /g\.revoked_at IS NULL/, 'vínculo revogado não alcança documento');
      assert.ok(entry.args.includes(identityId), 'a identidade da sessão é parâmetro da consulta');
    }
  } finally { if (old === undefined) delete process.env.OLLAMA_ENABLED; else process.env.OLLAMA_ENABLED = old; }
});

test('RH acessa só corpus RH e não consulta corpus Marcelo', async () => {
  const old = process.env.OLLAMA_ENABLED;
  process.env.OLLAMA_ENABLED = 'true';
  const seen = [];
  const api = createAiRagRealApi({ pool: { async query(text, args) { seen.push({ text, args }); return { rows: [] }; } }, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null });
  try {
    assert.equal((await request(api, 'rh', 'Como solicitar férias?')).status, 200);
    const corpus = seen.filter(entry => entry.text.includes('ai_rag_documents'));
    assert.ok(corpus.length >= 1, 'a busca no corpus RH aconteceu');
    for (const entry of corpus) {
      assert.equal(entry.args[0], 'rh', 'toda consulta ao corpus é do escopo RH');
      assert.ok(!entry.args.includes('marcelo'), 'nenhuma consulta toca o escopo Marcelo');
    }
    const before = seen.length;
    assert.equal((await request(api, 'marcelo')).status, 403);
    assert.equal(seen.length, before, 'escopo negado não gera consulta nenhuma');
  } finally { if (old === undefined) delete process.env.OLLAMA_ENABLED; else process.env.OLLAMA_ENABLED = old; }
});
