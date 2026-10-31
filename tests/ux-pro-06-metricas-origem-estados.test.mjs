// UX-PRO-06 — estado de leitura da MENSURAÇÃO DE ORIGEM (PUB-10, /admin/leads).
//
// Escopo desta guarda: o painel `OriginMetricsPanel` já era uma superfície viva
// dentro de `/admin/leads` e tinha prova de contrato no gate L04 (PUB-10), mas
// não tinha estado de leitura honesto: qualquer falha zerava a última leitura,
// um payload malformado derrubava o painel e não havia período/hora da leitura
// publicada nem retry. A guarda testa o módulo de estado puro que a tela passou
// a usar — parser, tradução de falhas e redutor de leitura sequenciada — e
// confere que a tela continua sendo SOMENTE LEITURA e preserva o contrato.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const source = await read('src/app/admin/leads/OriginMetricsPanel.tsx');
const css = await read('src/app/admin/leads/LeadAdmin.module.css');
const gate = await read('tests/ux-crm-workspace.integration.test.mjs');
const pkg = JSON.parse(await read('package.json'));

async function helpers() {
  const ts = await read('src/app/admin/leads/origin-metrics-state.ts');
  const js = stripTypeScriptTypes(ts);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

const row = {
  origin: 'site', campaign: 'institucional', channel: 'orgânico',
  leads: 4, visitsConfirmed: 2, converted: 1, won: 0,
  conversionRate: 25, winRate: 0,
};
const totals = { leads: 4, visitsConfirmed: 2, converted: 1, won: 0, conversionRate: 25, winRate: 0 };
const payload = { from: '2026-09-01', to: '2026-10-31', windowDays: 61, rows: [row], totals, minimized: true, role: 'comercial' };

test('MÉTRICAS DE ORIGEM: parser aceita o contrato real e preserva os campos que a tela não renderiza', async () => {
  const { parseOriginMetrics } = await helpers();
  const input = structuredClone(payload);
  const before = structuredClone(input);
  const parsed = parseOriginMetrics(input);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].leads, 4);
  assert.equal(parsed.totals.visitsConfirmed, 2);
  assert.equal(parsed.from, '2026-09-01');
  assert.equal(parsed.to, '2026-10-31');
  assert.equal(parsed.windowDays, 61);
  // `minimized`/`role` continuam no objeto: a tela não projeta nem descarta o contrato.
  assert.equal(parsed.minimized, true, 'campos do contrato vigente são preservados');
  assert.deepEqual(input, before, 'o parser não pode modificar o payload do servidor');
  // Janela vazia é um payload VÁLIDO: ausência de pedidos não é erro de leitura.
  const empty = parseOriginMetrics({ ...payload, rows: [], totals: { ...totals, leads: 0, visitsConfirmed: 0, converted: 0, won: 0, conversionRate: null, winRate: null } });
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.totals.conversionRate, null, 'sem base, a taxa é null e nunca 0');
});

test('MÉTRICAS DE ORIGEM: payload malformado nunca vira "nenhum pedido"', async () => {
  const { parseOriginMetrics } = await helpers();
  const invalidos = [
    null, undefined, 'ok', 42, [],
    { ...payload, rows: {} },
    { ...payload, rows: undefined },
    { ...payload, rows: [null] },
    { ...payload, rows: [{ ...row, leads: -1 }] },
    { ...payload, rows: [{ ...row, leads: 1.5 }] },
    { ...payload, rows: [{ ...row, leads: '4' }] },
    { ...payload, rows: [{ ...row, origin: null }] },
    { ...payload, rows: [{ ...row, campaign: 7 }] },
    { ...payload, rows: [{ ...row, conversionRate: '25' }] },
    { ...payload, rows: [{ ...row, conversionRate: Number.NaN }] },
    { ...payload, rows: [{ ...row, winRate: 101 }] },
    { ...payload, totals: null },
    { ...payload, totals: { ...totals, leads: -2 } },
    { ...payload, totals: { ...totals, conversionRate: '-1' } },
    { ...payload, from: '01/09/2026' },
    { ...payload, to: '2026-02-31' },
    { ...payload, from: '2026-10-31', to: '2026-09-01' },
    { ...payload, windowDays: 0 },
    { ...payload, windowDays: 999 },
    { ...payload, windowDays: 61.5 },
  ];
  for (const invalido of invalidos) {
    assert.throws(() => parseOriginMetrics(invalido), /invalid_response/, JSON.stringify(invalido));
  }
  // O período exibido precisa ser o período PEDIDO: números de outra janela não
  // podem ser publicados sob o rótulo da janela atual.
  assert.throws(
    () => parseOriginMetrics(payload, { from: '2026-10-01', to: '2026-10-31' }),
    /invalid_response/,
    'resposta de outra janela não pode ser atribuída ao período pedido',
  );
  assert.equal(parseOriginMetrics(payload, { from: '2026-09-01', to: '2026-10-31' }).windowDays, 61);
});

test('MÉTRICAS DE ORIGEM: cada motivo de falha é traduzido sem inventar ausência de pedidos', async () => {
  const { describeOriginMetricsError } = await helpers();
  const sessao = describeOriginMetricsError(401, 'admin_session_required');
  assert.equal(sessao.kind, 'auth');
  assert.equal(sessao.canRetry, false);
  const negado = describeOriginMetricsError(403, 'forbidden');
  assert.equal(negado.kind, 'denied');
  assert.equal(negado.canRetry, false);
  assert.match(negado.detail, /não tem acesso/i);
  const invalido = describeOriginMetricsError(200, 'invalid_response');
  assert.equal(invalido.kind, 'invalid');
  assert.equal(invalido.canRetry, true);
  assert.match(invalido.detail, /não significa que não haja pedidos/i);
  const indisponivel = describeOriginMetricsError(503, 'lead_metrics_unavailable');
  assert.equal(indisponivel.kind, 'retry');
  assert.equal(indisponivel.canRetry, true);
  assert.match(indisponivel.detail, /última leitura/i, 'a mensagem precisa dizer que a leitura anterior é preservada');
  assert.equal(describeOriginMetricsError(0, undefined).kind, 'retry');
  assert.equal(describeOriginMetricsError(429, 'too_many').kind, 'retry');
  assert.equal(describeOriginMetricsError(503, 'database_not_configured').kind, 'retry');
  assert.equal(describeOriginMetricsError(503, 'migration_required').kind, 'retry');
  const periodo = describeOriginMetricsError(400, 'invalid_period');
  assert.equal(periodo.canRetry, false);
  assert.match(periodo.detail, /inicial não pode ser posterior/i);
  const longo = describeOriginMetricsError(400, 'period_too_long');
  assert.equal(longo.canRetry, false);
  assert.match(longo.detail, /366/);
  assert.equal(describeOriginMetricsError(404, 'nope').kind, 'error');
});

test('MÉTRICAS DE ORIGEM: somente a leitura mais recente publica dados ou encerra o carregamento', async () => {
  const { ORIGIN_METRICS_INITIAL, reduceOriginMetrics, parseOriginMetrics, describeOriginMetricsError } = await helpers();
  const inicio = ORIGIN_METRICS_INITIAL;
  assert.equal(inicio.loading, true);
  assert.equal(inicio.data, null);
  const baixando = reduceOriginMetrics(inicio, { type: 'begin' });
  assert.equal(baixando.loading, true);
  const dados = parseOriginMetrics(payload);

  // Leitura 1 responde quando a leitura 2 já é a corrente: nada é publicado e
  // nada encerra o carregamento.
  const antiga = reduceOriginMetrics(baixando, { type: 'success', sequence: 1, current: 2, data: dados, at: 1_000 });
  assert.equal(antiga, baixando, 'resposta fora de ordem não pode mudar o estado');
  const antigaFalha = reduceOriginMetrics(baixando, {
    type: 'failure', sequence: 1, current: 2,
    failure: describeOriginMetricsError(503, 'lead_metrics_unavailable'),
  });
  assert.equal(antigaFalha, baixando, 'falha fora de ordem não pode encerrar o carregamento');

  const recente = reduceOriginMetrics(baixando, { type: 'success', sequence: 2, current: 2, data: dados, at: 2_000 });
  assert.equal(recente.loading, false);
  assert.equal(recente.stale, false);
  assert.equal(recente.failure, null);
  assert.equal(recente.readAt, 2_000);
  assert.deepEqual(recente.readWindow, { from: '2026-09-01', to: '2026-10-31' });
  assert.equal(recente.data.totals.leads, 4);
});

test('MÉTRICAS DE ORIGEM: falha preserva a última leitura; negativa e payload inválido descartam', async () => {
  const { ORIGIN_METRICS_INITIAL, reduceOriginMetrics, parseOriginMetrics, describeOriginMetricsError } = await helpers();
  const dados = parseOriginMetrics(payload);
  const lido = reduceOriginMetrics(ORIGIN_METRICS_INITIAL, { type: 'success', sequence: 1, current: 1, data: dados, at: 5_000 });
  assert.equal(lido.data.totals.leads, 4);

  const falhaTransitoria = reduceOriginMetrics(lido, {
    type: 'failure', sequence: 2, current: 2,
    failure: describeOriginMetricsError(503, 'lead_metrics_unavailable'),
  });
  assert.equal(falhaTransitoria.stale, true);
  assert.equal(falhaTransitoria.loading, false);
  assert.equal(falhaTransitoria.data.totals.leads, 4, 'a leitura anterior continua publicada');
  assert.equal(falhaTransitoria.readAt, 5_000, 'a hora da última leitura concluída é preservada');
  assert.deepEqual(falhaTransitoria.readWindow, { from: '2026-09-01', to: '2026-10-31' });
  assert.equal(falhaTransitoria.failure.canRetry, true);

  const recuperado = reduceOriginMetrics(falhaTransitoria, { type: 'success', sequence: 3, current: 3, data: dados, at: 9_000 });
  assert.equal(recuperado.stale, false);
  assert.equal(recuperado.failure, null);
  assert.equal(recuperado.readAt, 9_000);

  for (const failure of [
    describeOriginMetricsError(403, 'forbidden'),
    describeOriginMetricsError(401, 'admin_session_required'),
    describeOriginMetricsError(200, 'invalid_response'),
  ]) {
    const descartado = reduceOriginMetrics(lido, { type: 'failure', sequence: 2, current: 2, failure });
    assert.equal(descartado.data, null, `${failure.kind} não é dado aproveitável e não vira vazio`);
    assert.equal(descartado.readAt, null);
    assert.equal(descartado.readWindow, null);
    assert.equal(descartado.stale, false);
    assert.equal(descartado.loading, false);
  }

  // Falha sem leitura anterior não é "desatualizada": é falha e ponto.
  const semLeitura = reduceOriginMetrics(ORIGIN_METRICS_INITIAL, {
    type: 'failure', sequence: 1, current: 1,
    failure: describeOriginMetricsError(503, 'lead_metrics_unavailable'),
  });
  assert.equal(semLeitura.stale, false);
  assert.equal(semLeitura.data, null);
  assert.equal(semLeitura.failure.canRetry, true);
});

test('MÉTRICAS DE ORIGEM: o painel continua somente leitura, com período e hora da leitura declarados', () => {
  // Mesma rota, mesmos controles e mesmos rótulos já provados pelo gate PUB-10.
  assert.match(source, /\/api\/admin\/leads\/metrics\?from=/);
  assert.match(source, /id="metrics-from"/);
  assert.match(source, /id="metrics-to"/);
  assert.match(source, /aria-label="Recalcular mensuração de origem"/);
  assert.match(source, /data-testid="origin-metrics-panel"/);
  assert.match(source, /data-testid="origin-metrics-table"/);
  assert.match(source, /data-testid="origin-metrics-totals"/);
  assert.match(source, /data-testid="origin-metrics-empty"/);
  assert.match(source, /data-testid="origin-metrics-refresh"/);
  // Nenhuma escrita de métrica: o painel não pode ganhar POST/PATCH.
  assert.doesNotMatch(source, /method:\s*"(POST|PATCH|PUT|DELETE)"/);
  assert.doesNotMatch(source, /Métrica digitada|salvar métrica/i);
  // Estado honesto: parser, sequência, preservação, hora e retry.
  assert.match(source, /parseOriginMetrics/);
  assert.match(source, /reduceOriginMetrics/);
  assert.match(source, /readSequence/);
  assert.match(source, /data-testid="origin-metrics-stale"/);
  assert.match(source, /data-testid="origin-metrics-retry"/);
  assert.match(source, /data-testid="origin-metrics-updated"/);
  assert.match(source, /data-testid="origin-metrics-period"/);
  assert.match(source, /aria-busy=\{view\.loading \|\| undefined\}/);
  assert.match(source, /role="status"/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /setData\(null\)/, 'falha transitória não pode descartar a última leitura');
  assert.doesNotMatch(source, /Array\.isArray\(payload\.rows\) \? payload\.rows : \[\]/);
  assert.match(css, /\.metricsStale/);
  assert.match(css, /\.metricsUpdated/);
  assert.match(css, /:global\(html\[data-admin-theme="night"\]\) \.metricsStale/);
});

test('MÉTRICAS DE ORIGEM: teste focal é explícito e o gate cobre papéis, escrita real, falha, inválido, A/B, larguras e teclado', () => {
  assert.ok(pkg.scripts['test:unit'].split(/\s+/).includes('tests/ux-pro-06-metricas-origem-estados.test.mjs'));
  assert.match(gate, /UX-PRO-06 métricas: contrato, papéis e escrita real alimentam o agregado/);
  assert.match(gate, /UX-PRO-06 métricas: falha preserva a leitura, retry, inválido, A\/B, larguras, tema e teclado/);
  assert.match(gate, /origin-metrics-stale/);
  assert.match(gate, /origin-metrics-invalid/);
  assert.match(gate, /origin-metrics-denied/);
  assert.match(gate, /leads\/metrics/);
  assert.match(gate, /\[320, 390, 768, 1440\]/);
  assert.match(gate, /public_lead_status_audit/);
});
