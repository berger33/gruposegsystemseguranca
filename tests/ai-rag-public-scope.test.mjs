import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiRagApi } from '../src/server/ai-rag-api.mjs';

// RAG-SEG-001: unit contract for HTTP handlers. No server, credentials, or database.
function harness(pathname, method, body, session = null) {
  let queried = 0;
  const pool = { query: async () => { queried++; throw new Error('No database access allowed before authorization'); } };
  const api = createAiRagApi({
    pool, auditLog: async () => {}, sameOrigin: () => true,
    requireSession: () => session,
    requireRole: (s, roles) => roles.includes(s?.role),
  });
  const req = {
    url: pathname, method,
    async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); },
  };
  let response;
  const res = {
    writeHead(status, headers) { response = { status, headers }; },
    end(data) { response.body = JSON.parse(data); },
  };
  return {
    api, req, res,
    result() { assert.equal(queried, 0, 'negado antes de consultar banco'); return response; },
  };
}

for (const pathname of ['/api/ai/rag', '/api/public/ai/rag', '/api/ai/rag/queries']) {
  test(`RAG-SEG-001 ${pathname}: listagem pública de consultas nunca divulga histórico`, async () => {
    const t = harness(pathname + '?rag_key=publico', 'GET');
    await t.api.handleQueries(t.req, t.res);
    assert.equal(t.result().status, 403);
  });
  for (const rag_key of ['cliente', 'rh', 'marcelo']) {
    test(`RAG-SEG-001 ${pathname}: público não consulta ${rag_key}`, async () => {
      const t = harness(pathname, 'POST', { rag_key, query: 'Dados do escopo privado?' });
      await t.api.handleQueries(t.req, t.res);
      assert.equal(t.result().status, 403);
    });
  }
}

for (const pathname of ['/api/ai/bot', '/api/public/ai/bot', '/api/bot']) {
  test(`RAG-SEG-001 ${pathname}: listagem pública de sessões nunca divulga histórico`, async () => {
    const t = harness(pathname, 'GET');
    await t.api.handleBotSessions(t.req, t.res);
    assert.equal(t.result().status, 403);
  });
  for (const rag_key of ['cliente', 'rh', 'marcelo']) {
    test(`RAG-SEG-001 ${pathname}: bot público não consulta ${rag_key}`, async () => {
      const t = harness(pathname, 'POST', { rag_key, query: 'Dados do escopo privado?' });
      await t.api.handleBotSessions(t.req, t.res);
      assert.equal(t.result().status, 403);
    });
  }
}

for (const [handler, pathname] of [['handleQueries', '/api/ai-rag-queries'], ['handleBotSessions', '/api/ai/bot-sessions']]) {
  test(`RAG-SEG-001 ${pathname}: alias de histórico exige sessão admin/ti`, async () => {
    const t = harness(pathname, 'GET');
    await t.api[handler](t.req, t.res);
    assert.equal(t.result().status, 401);
  });
  test(`RAG-SEG-001 ${pathname}: papel não privilegiado não consulta escopo RH`, async () => {
    const t = harness(pathname, 'POST', { rag_key: 'rh', query: 'Dados RH privados?' }, { role: 'rh' });
    await t.api[handler](t.req, t.res);
    assert.equal(t.result().status, 401);
  });
}

test('RAG-SEG-001: feedback de escopo privado exige a sessão dona, e o código diz qual', async () => {
  const casos = [
    ['rh', 'RAG-RH-SYNTHETIC', 'staff_session_required'],
    ['marcelo', 'RAG-MAR-SYNTHETIC', 'staff_session_required'],
    ['cliente', 'RAG-CLI-SYNTHETIC', 'client_session_required'],
  ];
  for (const [rag_key, protocol, esperado] of casos) {
    const t = harness('/api/ai/rag/feedback', 'POST', { rag_key, protocol, rating: 5 });
    await t.api.handleFeedback(t.req, t.res);
    assert.equal(t.result().status, 401, `${rag_key} sem sessão é negado`);
    assert.equal(t.result().body.error, esperado);
  }
  // Sessão de equipe não responde por escopo de cliente, nem sessão de cliente por RH.
  const equipe = harness('/api/ai/rag/feedback', 'POST', { rag_key: 'cliente', protocol: 'RAG-CLI-SYNTHETIC', rating: 5 }, { role: 'rh' });
  await equipe.api.handleFeedback(equipe.req, equipe.res);
  assert.equal(equipe.result().status, 403);
  assert.equal(equipe.result().body.error, 'scope_forbidden');
  const clienteEmRh = harness('/api/ai/rag/feedback', 'POST', { rag_key: 'rh', protocol: 'RAG-RH-SYNTHETIC', rating: 5 }, { role: 'cliente' });
  await clienteEmRh.api.handleFeedback(clienteEmRh.req, clienteEmRh.res);
  assert.equal(clienteEmRh.result().status, 403);
  assert.equal(clienteEmRh.result().body.error, 'scope_forbidden');
});
