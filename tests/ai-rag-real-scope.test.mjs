import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiRagRealApi, rankApprovedChunks } from '../src/server/ai-rag-real-api.mjs';

// FECH-01 — contrato do assistente com POOL SIMULADO (sem banco) e, quando
// indicado, com provedor HTTP determinístico explicitamente identificado como
// STUB. Nada aqui prova Ollama real: nenhum teste deste arquivo fala com o
// modelo instalado na máquina do operador.

function response() {
  return { status: null, body: null, writeHead(status) { this.status = status; }, end(raw) { this.body = JSON.parse(raw); } };
}
async function request(api, rag_key, query = 'Como abrir um chamado?') {
  const req = { method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ rag_key, query })); } };
  const res = response();
  await api.ask(req, res);
  return res;
}
function withEnv(key, value, body) {
  const old = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  return Promise.resolve().then(body).finally(() => {
    if (old === undefined) delete process.env[key]; else process.env[key] = value;
  });
}
/** Substitui `fetch` global por um stub determinístico; nunca é Ollama real. */
async function withStubFetch(stub, body) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try { return await body(); } finally { globalThis.fetch = original; }
}
function staffPool(rows) {
  const seen = [];
  return { seen, pool: { async query(text, args) { seen.push({ text, args }); return { rows }; } } };
}

test('recuperação pontua apenas chunks relacionados', () => {
  const ranked = rankApprovedChunks('Como abrir chamado?', [
    { title: 'Chamados', content: 'Para abrir chamado, use o portal.' },
    { title: 'Férias', content: 'Solicite férias ao RH.' },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].title, 'Chamados');
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

test('consulta exige flag E estado publicado no documento e no índice', async () => {
  const { pool, seen } = staffPool([]);
  const api = createAiRagRealApi({ pool, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null });
  await request(api, 'rh', 'Como solicitar férias?');
  const sql = seen[0].text;
  assert.match(sql, /d\.is_approved=true AND d\.is_published=true AND d\.status IN \('aprovado','publicado'\)/);
  assert.match(sql, /i\.is_approved=true AND i\.is_published=true AND i\.is_active=true AND i\.status IN \('aprovado','publicado'\)/);
  assert.deepEqual(seen[0].args, ['rh']);
});

test('cliente só recupera documentos aprovados da conta vinculada antes do modelo', async () => {
  const { pool, seen } = staffPool([
    { title: 'Documentos do portal', content: 'Procedimento interno de arquivamento de contratos antigos.', keywords: [], source: 'manual', document_id: 'x', version: 1 },
  ]);
  const api = createAiRagRealApi({ pool, sameOrigin: () => true,
    readStaffSession: async () => null,
    readClientSession: async () => ({ identityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }) });
  const calls = [];
  await withStubFetch(async (...args) => { calls.push(args); throw new Error('modelo não deveria ser chamado'); }, async () => {
    const res = await request(api, 'cliente');
    assert.equal(res.status, 200);
    assert.equal(res.body.reason, 'no_relevant_source');
    assert.equal(res.body.ollama_used, false);
    assert.deepEqual(res.body.sources, []);
    assert.equal('protocol' in res.body, false, 'sem fonte não existe protocolo');
    assert.equal('model' in res.body, false, 'sem fonte a tela não pode afirmar modelo usado');
  });
  assert.equal(calls.length, 0, 'a ausência de fonte relacionada não pode chamar o modelo');
  const sql = seen[0].text;
  assert.match(sql, /g\.identity_id=\$2 AND g\.client_account_id=d\.client_account_id/);
  assert.match(sql, /d\.is_approved=true AND d\.is_published=true AND d\.status IN \('aprovado','publicado'\)/);
  assert.deepEqual(seen[0].args, ['cliente', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
});

test('escopo sem conteúdo publicado é declarado como tal e não chama o modelo', async () => {
  const { pool } = staffPool([]);
  const api = createAiRagRealApi({ pool, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'marcelo' }),
    readClientSession: async () => null });
  const calls = [];
  await withStubFetch(async (...args) => { calls.push(args); throw new Error('modelo não deveria ser chamado'); }, async () => {
    const res = await request(api, 'marcelo', 'Como aprovar despesas?');
    assert.equal(res.status, 200);
    assert.equal(res.body.reason, 'empty_scope');
    assert.equal(res.body.ollama_used, false);
    assert.deepEqual(res.body.sources, []);
    assert.equal('protocol' in res.body, false);
  });
  assert.equal(calls.length, 0);
});

test('com fonte relacionada e OLLAMA_ENABLED desligado a rota recusa sem inventar resposta', async () => {
  const { pool } = staffPool([
    { title: 'Férias no RH', content: 'Para solicitar férias use o fluxo de programação do RH.', keywords: ['ferias'], source: 'procedimento', document_id: 'y', version: 2 },
  ]);
  const api = createAiRagRealApi({ pool, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null });
  const calls = [];
  await withEnv('OLLAMA_ENABLED', 'false', () => withStubFetch(async (...args) => { calls.push(args); throw new Error('modelo não deveria ser chamado'); }, async () => {
    const res = await request(api, 'rh', 'Como solicitar férias?');
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'ai_unavailable');
    assert.equal(res.body.reason, 'ollama_disabled');
    assert.equal('response' in res.body, false, 'nada de resposta simulada no lugar do modelo');
  }));
  assert.equal(calls.length, 0, 'modelo desligado não pode ser chamado');
});

test('RH acessa só corpus RH e não consulta corpus Marcelo', async () => {
  const { pool, seen } = staffPool([]);
  const api = createAiRagRealApi({ pool, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null });
  assert.equal((await request(api, 'rh', 'Como solicitar férias?')).status, 200);
  assert.deepEqual(seen.map(item => item.args), [['rh']]);
  assert.equal((await request(api, 'marcelo')).status, 403);
  assert.equal(seen.length, 1);
});

test('contrato HTTP com provedor determinístico STUB: contexto autorizado e protocolo', async () => {
  const rhDoc = { title: 'Férias no RH', content: 'Para solicitar férias use o fluxo de programação do RH e confirme com a liderança.', keywords: ['ferias'], source: 'procedimento', document_id: 'doc-rh', version: 3 };
  const { pool } = staffPool([rhDoc]);
  const api = createAiRagRealApi({ pool, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null });
  const seen = [];
  const stub = async (endpoint, init) => {
    seen.push({ endpoint: String(endpoint), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ model: 'stub-modelo-deterministico-1', message: { content: 'Use o fluxo de programação de férias do RH.' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await withEnv('OLLAMA_ENABLED', 'true', () => withEnv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434', () => withStubFetch(stub, async () => {
    const res = await request(api, 'rh', 'Como solicitar férias?');
    assert.equal(res.status, 200);
    assert.equal(res.body.ollama_used, true);
    assert.equal(res.body.model, 'stub-modelo-deterministico-1');
    assert.match(res.body.protocol, /^RAG-RH-/);
    assert.deepEqual(res.body.sources.map(s => s.title), ['Férias no RH']);
  })));
  assert.equal(seen.length, 1, 'com fonte relacionada o provedor é chamado exatamente uma vez');
  assert.equal(seen[0].endpoint, 'http://127.0.0.1:11434/api/chat');
  assert.match(seen[0].body.messages[0].content, /escopo rh/);
  assert.match(seen[0].body.messages[1].content, /Férias no RH/);
  assert.match(seen[0].body.messages[1].content, /Use SOMENTE|Contexto autorizado/);
});

test('uma geração por vez: a segunda consulta recebe ai_busy com retry', async () => {
  const { pool } = staffPool([
    { title: 'Férias no RH', content: 'Para solicitar férias use o fluxo de programação do RH.', keywords: ['ferias'], source: 'procedimento', document_id: 'doc-rh', version: 1 },
  ]);
  const api = createAiRagRealApi({ pool, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const stub = async () => { calls += 1; await gate; return new Response(JSON.stringify({ model: 'stub-modelo-deterministico-1', message: { content: 'Resposta do stub determinístico.' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  await withEnv('OLLAMA_ENABLED', 'true', () => withStubFetch(stub, async () => {
    const first = request(api, 'rh', 'Como solicitar férias?');
    await new Promise(resolve => setTimeout(resolve, 20));
    const second = await request(api, 'rh', 'Como solicitar férias?');
    assert.equal(second.status, 503);
    assert.equal(second.body.error, 'ai_busy');
    assert.equal(second.body.retry_after_seconds, 5);
    assert.equal('response' in second.body, false, 'ocupado nunca devolve resposta inventada');
    release();
    const done = await first;
    assert.equal(done.status, 200);
    assert.equal(done.body.ollama_used, true);
  }));
  assert.equal(calls, 1, 'o provedor determinístico foi chamado uma única vez');
});

test('origem cruzada é recusada antes de qualquer leitura do banco', async () => {
  let queries = 0;
  const api = createAiRagRealApi({ pool: { async query() { queries++; return { rows: [] }; } }, sameOrigin: () => false,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null });
  assert.equal((await request(api, 'publico')).status, 403);
  assert.equal(queries, 0);
});
