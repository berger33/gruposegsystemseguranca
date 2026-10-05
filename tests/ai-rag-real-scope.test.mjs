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

test('cliente só recupera documentos aprovados da conta vinculada antes do modelo', async () => {
  const old = process.env.OLLAMA_ENABLED;
  process.env.OLLAMA_ENABLED = 'true';
  let sql = '', params;
  const api = createAiRagRealApi({ pool: { async query(text, args) { sql = text; params = args; return { rows: [] }; } }, sameOrigin: () => true,
    readStaffSession: async () => null,
    readClientSession: async () => ({ identityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }) });
  try {
    const res = await request(api, 'cliente');
    assert.equal(res.status, 200);
    assert.equal(res.body.reason, 'no_relevant_source');
    assert.equal(res.body.ollama_used, false);
    assert.match(sql, /g\.identity_id=\$2 AND g\.client_account_id=d\.client_account_id/);
    assert.match(sql, /d\.is_approved=true AND d\.is_published=true/);
    assert.deepEqual(params, ['cliente', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
  } finally { if (old === undefined) delete process.env.OLLAMA_ENABLED; else process.env.OLLAMA_ENABLED = old; }
});

test('RH acessa só corpus RH e não consulta corpus Marcelo', async () => {
  const old = process.env.OLLAMA_ENABLED;
  process.env.OLLAMA_ENABLED = 'true';
  const seen = [];
  const api = createAiRagRealApi({ pool: { async query(_sql, args) { seen.push(args); return { rows: [] }; } }, sameOrigin: () => true,
    readStaffSession: async () => ({ identityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'rh' }),
    readClientSession: async () => null });
  try {
    assert.equal((await request(api, 'rh', 'Como solicitar férias?')).status, 200);
    assert.deepEqual(seen, [['rh']]);
    assert.equal((await request(api, 'marcelo')).status, 403);
    assert.equal(seen.length, 1);
  } finally { if (old === undefined) delete process.env.OLLAMA_ENABLED; else process.env.OLLAMA_ENABLED = old; }
});
