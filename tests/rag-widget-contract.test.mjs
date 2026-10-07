import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  RAG_QUESTION_MAX,
  RAG_QUESTION_MIN,
  RAG_SCOPE_LABELS,
  describeRagFailure,
  describeRagSuccess,
  normalizeRagAnswer,
  ragScopeLabel,
  validateRagQuestion,
} from '../src/lib/rag-widget-contract.mjs';

// FECH-01 — apresentação do assistente. Testes puros (nenhum HTTP, nenhum
// banco, nenhum modelo) + verificação estática do componente real. Não provam
// Ollama, PostgreSQL nem navegador: isso fica no gate
// `npm run test:ai-rag-widget:pg`.

const root = path.resolve(import.meta.dirname, '..');
const widget = readFileSync(path.join(root, 'src/components/RagWidget.tsx'), 'utf8');
const server = readFileSync(path.join(root, 'src/server/ai-rag-real-api.mjs'), 'utf8');

test('o limite do widget é o mesmo que o servidor aceita (5–500)', () => {
  assert.equal(RAG_QUESTION_MIN, 5);
  assert.equal(RAG_QUESTION_MAX, 500);
  assert.match(server, /question\.length < 5 \|\| question\.length > 500/);
  assert.match(widget, /maxLength=\{RAG_QUESTION_MAX\}/);
});

test('validação local recusa pergunta curta e longa e aceita os limites exatos', () => {
  assert.equal(validateRagQuestion('abcd').ok, false);
  assert.equal(validateRagQuestion('abcd').code, 'too_short');
  assert.equal(validateRagQuestion('abcde').ok, true);
  assert.equal(validateRagQuestion('a'.repeat(500)).ok, true);
  const tooLong = validateRagQuestion('a'.repeat(501));
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.code, 'too_long');
  assert.match(tooLong.message, /500/);
});

test('negativas explicam o estado sem afirmar que o modelo respondeu', () => {
  const session = describeRagFailure({ status: 401, error: 'client_session_required' });
  assert.equal(session.state, 'session_required');
  assert.equal(session.canRetry, false);
  assert.match(session.detail, /Nenhuma pergunta foi enviada ao modelo|não foi reconhecida/);

  const staffSession = describeRagFailure({ status: 401, error: 'staff_session_required' });
  assert.equal(staffSession.state, 'session_required');
  assert.match(staffSession.detail, /expirou|não foi reconhecida/);

  const denied = describeRagFailure({ status: 403, error: 'scope_forbidden' });
  assert.equal(denied.state, 'denied');
  assert.equal(denied.canRetry, false);
  assert.match(denied.detail, /Estar no menu não concede autorização/);

  const unavailable = describeRagFailure({ status: 503, error: 'rag_unavailable' });
  assert.equal(unavailable.state, 'source_unavailable');
  assert.equal(unavailable.canRetry, true);
  assert.match(unavailable.detail, /não significa que não exista conteúdo/);
});

test('modelo desligado, timeout e ocupado têm estados distintos e honestos', () => {
  const off = describeRagFailure({ status: 503, error: 'ai_unavailable', reason: 'ollama_disabled' });
  assert.equal(off.state, 'ai_disabled');
  assert.match(off.detail, /nenhuma resposta foi inventada/i);

  const timeout = describeRagFailure({ status: 503, error: 'ai_unavailable', reason: 'ollama_timeout_or_offline' });
  assert.equal(timeout.state, 'ai_timeout');
  assert.equal(timeout.canRetry, true);

  const empty = describeRagFailure({ status: 503, error: 'ai_unavailable', reason: 'empty_response' });
  assert.equal(empty.state, 'ai_unavailable');
  assert.match(empty.detail, /resposta simulada/i);

  const busy = describeRagFailure({ status: 503, error: 'ai_busy', retryAfterSeconds: 5 });
  assert.equal(busy.state, 'busy');
  assert.equal(busy.retryAfterSeconds, 5);
  assert.match(busy.detail, /uma consulta por vez/i);
});

test('rede e erro desconhecido nunca viram resposta vazia silenciosa', () => {
  const network = describeRagFailure({ status: 0 });
  assert.equal(network.state, 'network');
  assert.equal(network.canRetry, true);
  assert.match(network.detail, /não é ausência de conteúdo/);

  const unknown = describeRagFailure({ status: 500, error: 'algo_novo' });
  assert.equal(unknown.state, 'error');
  assert.match(unknown.detail, /algo_novo/);
  assert.equal(unknown.canRetry, true);

  const clientError = describeRagFailure({ status: 400, error: 'invalid_query' });
  assert.equal(clientError.state, 'invalid_question');
  assert.equal(clientError.canRetry, false);
});

test('resposta sem protocolo/modelo não inventa valores e distingue ausências', () => {
  const noSource = normalizeRagAnswer({ response: 'Não encontrei informação aprovada.', sources: [], rag_key: 'rh', ollama_used: false, reason: 'no_relevant_source' });
  assert.equal(noSource.protocol, null);
  assert.equal(noSource.model, null);
  assert.equal(describeRagSuccess(noSource).state, 'no_source');

  const emptyScope = normalizeRagAnswer({ response: 'Nenhum conteúdo aprovado e publicado está disponível para este escopo.', sources: [], rag_key: 'cliente', ollama_used: false, reason: 'empty_scope' });
  assert.equal(describeRagSuccess(emptyScope).state, 'empty_scope');

  const answered = normalizeRagAnswer({ response: 'Use o fluxo de férias.', sources: [{ title: 'Férias' }], protocol: 'RAG-RH-1-ab12', model: 'qwen3:1.7b', ollama_used: true, rag_key: 'rh' });
  assert.equal(describeRagSuccess(answered).state, 'answered');
  assert.equal(answered.protocol, 'RAG-RH-1-ab12');

  const suspicious = normalizeRagAnswer({ response: 'Texto sem protocolo.', sources: [{ title: 'Fonte' }], ollama_used: false, rag_key: 'rh' });
  assert.notEqual(describeRagSuccess(suspicious).state, 'answered');
});

test('escopo declarado existe para as quatro bases e não promete acesso', () => {
  for (const key of ['publico', 'cliente', 'rh', 'marcelo']) {
    assert.ok(RAG_SCOPE_LABELS[key], `escopo ausente para ${key}`);
    assert.match(ragScopeLabel(key), /Somente|apenas/);
  }
  assert.match(ragScopeLabel('cliente'), /vinculadas à sua sessão/);
  assert.equal(ragScopeLabel('desconhecido'), 'Escopo não declarado para esta base.');
});

test('componente: sem bloqueio fixo do privado, com rótulo, foco, anúncio e antiduplicidade', () => {
  assert.doesNotMatch(widget, /ragKey !== "publico"/, 'o aviso fixo que escondia as bases privadas foi removido');
  assert.doesNotMatch(widget, /fila garantida/i, 'a promessa de fila garantida saiu da interface');
  assert.match(widget, /data-ui-state=\{uiState\}/);
  assert.match(widget, /aria-live="polite"/);
  assert.match(widget, /role="alert"/);
  assert.match(widget, /:focus-visible/);
  assert.match(widget, /htmlFor=\{inputId\}/, 'o campo precisa de rótulo persistente');
  assert.match(widget, /inFlight\.current\) return/, 'envio duplicado precisa ser bloqueado');
  assert.match(widget, /credentials: "same-origin"/);
  assert.match(widget, /answer\.protocol &&/, 'copiar protocolo só existe quando há protocolo');
  assert.match(widget, /status.*announce|setStatusText/, 'o estado precisa ser anunciado');
});

test('servidor: publicado exige flag E estado, e a ausência de escopo é declarada', () => {
  assert.match(server, /d\.status IN \$\{PUBLISHED_STATES\}/);
  assert.match(server, /i\.status IN \$\{PUBLISHED_STATES\}/);
  assert.match(server, /reason: 'empty_scope'/);
  assert.match(server, /reason: 'no_relevant_source'/);
});
