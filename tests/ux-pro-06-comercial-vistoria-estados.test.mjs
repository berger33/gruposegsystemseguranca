// UX-PRO-06 — prova focal da superfície VIVA "Vistoria" da tela /admin/comercial
// (primeira etapa da casca comercial, `src/app/admin/ti/InspectionClient.tsx`).
//
// O teste é nomeado pela ÁREA, não pelo identificador da matriz de 222: o
// índice de reauditoria conta ocorrências de ID em testes e um teste que
// citasse o identificador mudaria a classe de evidência do requisito sem
// nenhuma prova de jornada. Aqui se prova o estado de leitura da tela e o
// contrato que ela consome — nunca aceite humano, UAT ou reauditoria integral.
//
// Duas famílias de asserção:
//  1) ESTADO DECLARADO — o componente precisa declarar carregando, atualizando,
//     vazio, falha, negado e repetição, validar arrays e descartar resposta
//     fora de ordem (guarda estática, no mesmo padrão das fatias irmãs);
//  2) CONTRATO DO SERVIDOR — `createInspectionApi` continua respondendo 401,
//     403, 400, 503 e 200/201 com os mesmos códigos e o mesmo formato de lista
//     (execução real do módulo, com pool sintético: nada é alterado no servidor).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createInspectionApi } from '../src/server/inspection-api.mjs';

const idEmpresa = '11111111-1111-4111-8111-111111111111';
const idVistoria = '22222222-2222-4222-8222-222222222222';

function response() {
  const res = {
    status: 0,
    payload: null,
    headers: {},
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers || {}); },
    end(body) { this.payload = body === undefined ? null : JSON.parse(body); },
  };
  return res;
}

function request(method, url, body) {
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); },
  };
}

function setup({ session = { role: 'comercial', identityId: '33333333-3333-4333-8333-333333333333' }, sameOrigin = true, failQuery = false } = {}) {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      const texto = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: texto, params });
      if (failQuery) throw new Error('synthetic_database_failure');
      if (/COUNT\(\*\)::int as total FROM crm_inspections/i.test(texto)) return { rows: [{ total: 1 }] };
      if (/FROM crm_inspections WHERE/i.test(texto) || /FROM crm_inspections ORDER BY/i.test(texto)) {
        return { rows: [{ id: idVistoria, title: 'VISTORIA-SINTETICA', company_id: idEmpresa, status: 'rascunho', photos: [] }] };
      }
      if (/FROM crm_inspection_templates/i.test(texto)) {
        return { rows: [{ id: '44444444-4444-4444-8444-444444444444', name: 'Checklist sintético', service_id: 'cftv', checklist: [] }] };
      }
      if (/INSERT INTO crm_inspections/i.test(texto)) {
        return { rows: [{ id: idVistoria, title: params[6], company_id: params[1], status: 'rascunho', photos: [] }] };
      }
      return { rows: [] };
    },
  };
  const api = createInspectionApi({
    getPool: () => pool,
    json: (res, status, payload, headers) => { res.writeHead(status, headers); res.end(JSON.stringify(payload)); },
    readAdminSession: async () => session,
    sameOrigin: () => sameOrigin,
    readJson: async req => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    },
  });
  return { api, calls };
}

// ---------------------------------------------------------------------------
// 1. Estado declarado no componente
// ---------------------------------------------------------------------------

test('vistoria: a tela declara carregando, atualizando, vazio, falha, negado e repetição', async () => {
  const componente = await readFile(new URL('../src/app/admin/ti/InspectionClient.tsx', import.meta.url), 'utf8');
  for (const testid of [
    'vistoria-carregando',
    'vistoria-atualizando',
    'vistoria-atualizado',
    'vistoria-desatualizada',
    'vistoria-erro',
    'vistoria-negado',
    'vistoria-vazio',
    'vistoria-tabela',
    'vistoria-templates-carregando',
    'vistoria-templates-erro',
    'vistoria-templates-vazio',
    'vistoria-templates-lista',
    'vistoria-escrita-erro',
  ]) {
    assert.match(componente, new RegExp(`data-testid="${testid}"`), `a tela precisa declarar o estado "${testid}"`);
  }
  assert.match(componente, /role="status"/, 'leitura em curso e vazio precisam ser anunciados como status');
  assert.match(componente, /role="alert"/, 'falha e negativa precisam ser anunciadas como alerta');
  assert.match(componente, /aria-busy=\{carregando\}/, 'a área de dados precisa declarar aria-busy durante a leitura');
  assert.match(componente, /Tentar novamente/, 'a falha recuperável precisa oferecer repetição');
  assert.match(componente, /Array\.isArray\(/, 'a leitura precisa validar que a lista é array antes de renderizar');
  assert.match(componente, /aria-label=/, 'os campos precisam de nome acessível');
  assert.doesNotMatch(componente, /<p style=\{\{ color: "red" \}\}>\{error\}<\/p>/, 'o código técnico do servidor não pode ir cru para a tela');
  assert.doesNotMatch(componente, /setInspections\(data\.inspections \|\| \[\]\)/, 'lista ausente não pode virar lista vazia silenciosamente');
});

test('vistoria: leitura sem dados nunca aparece como vazio nem como falha silenciosa', async () => {
  const componente = await readFile(new URL('../src/app/admin/ti/InspectionClient.tsx', import.meta.url), 'utf8');
  const trecho = (inicio) => {
    const posicao = componente.indexOf(inicio);
    if (posicao < 0) return '';
    const fim = componente.indexOf('useEffect(', posicao + inicio.length);
    return componente.slice(posicao, fim < 0 ? undefined : fim);
  };
  const carregarVistorias = trecho('const carregarVistorias = useCallback');
  assert.ok(carregarVistorias.length > 0, 'a leitura das vistorias precisa estar isolada numa função própria');
  assert.match(carregarVistorias, /setCarregando\(true\)/, 'a leitura precisa declarar que está em curso');
  assert.match(carregarVistorias, /setFalha\(/, 'a falha precisa ser declarada como estado, não jogada em variável solta');
  assert.match(carregarVistorias, /throw classificarFalhaVistoria/, 'o status/código do servidor precisa ser classificado');
  assert.match(carregarVistorias, /Array\.isArray\(dados\?\.inspections\)/, 'a lista precisa ser validada como array');
  assert.match(carregarVistorias, /if \(sequencia !== readSequence\.current\) return;/, 'resposta fora de ordem precisa ser descartada');

  const carregarTemplates = trecho('const carregarTemplates = useCallback');
  assert.ok(carregarTemplates.length > 0, 'a leitura dos checklists precisa estar isolada numa função própria');
  assert.doesNotMatch(carregarTemplates, /\} catch \{\}/, 'falha de checklist não pode ser engolida em silêncio (parecia "Templates (0)")');
  assert.match(carregarTemplates, /setFalhaTemplates\(/, 'a falha de checklist precisa ser declarada');
  assert.match(carregarTemplates, /Array\.isArray\(dados\?\.templates\)/, 'a lista de checklists precisa ser validada como array');
});

test('vistoria: cada leitura reivindica sequência própria e só a mais recente publica resultado', async () => {
  const componente = await readFile(new URL('../src/app/admin/ti/InspectionClient.tsx', import.meta.url), 'utf8');
  assert.match(componente, /const readSequence = useRef\(0\)/, 'a leitura das vistorias precisa de sequência própria');
  assert.match(componente, /const templateSequence = useRef\(0\)/, 'a leitura dos checklists precisa de sequência própria');
  assert.match(componente, /const sequencia = \+\+readSequence\.current/, 'cada leitura precisa reivindicar a sequência');
  assert.match(componente, /if \(sequencia === readSequence\.current\) setCarregando\(false\)/,
    'só a leitura mais recente pode encerrar o estado de carregamento');
});

test('vistoria: os códigos técnicos são traduzidos e a negativa não oferece repetir a mesma chamada', async () => {
  const componente = await readFile(new URL('../src/app/admin/ti/InspectionClient.tsx', import.meta.url), 'utf8');
  assert.match(componente, /function classificarFalhaVistoria\(/, 'a leitura precisa de classificador próprio');
  assert.match(componente, /admin_session_required/, 'a negativa de sessão precisa ser reconhecida');
  assert.match(componente, /same_origin_required/, 'a recusa por origem precisa ser reconhecida');
  assert.match(componente, /inspection_unavailable/, 'a indisponibilidade precisa ser reconhecida');
  assert.match(componente, /classe: "negado"/, 'precisa existir a classe "negado"');
  assert.match(componente, /classe: "repetir"/, 'precisa existir a classe "repetir"');
  assert.match(componente, /\{falha\.classe === "repetir" && \(/, 'só falha recuperável oferece "Tentar novamente"');
  const blocoNegado = componente.slice(
    componente.indexOf('data-testid="vistoria-negado"'),
    componente.indexOf('data-testid="vistoria-erro"'),
  );
  assert.ok(blocoNegado.length > 0, 'a negativa precisa de bloco próprio');
  assert.ok(!blocoNegado.includes('Tentar novamente'), 'a negativa não oferece repetir a mesma chamada');
  assert.ok(!/não significa que a empresa não tenha/.test(blocoNegado), 'a negativa não pode ser apresentada como "ainda não lido"');
  // A mensagem chega traduzida: o teste cobre os códigos crus mais comuns.
  for (const cru of ['inspection_unavailable', 'same_origin_required', 'create_failed']) {
    assert.doesNotMatch(componente, new RegExp(`>\\s*\\{[^}]*\\b${cru}\\b`), `o código ${cru} não pode ser renderizado cru`);
  }
});

test('vistoria: a superfície continua no pacote da tela e o teste focal entra no test:unit', async () => {
  const [workspace, pkg, workflow] = await Promise.all([
    readFile(new URL('../src/app/admin/comercial/ComercialWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/ux-crm-delivery.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(workspace, /<InspectionClient \/>/, 'a etapa Vistoria continua renderizando o mesmo componente');
  assert.match(pkg, /tests\/ux-pro-06-comercial-vistoria-estados\.test\.mjs/, 'o teste focal precisa estar explícito no test:unit');
  assert.match(workflow, /src\/app\/admin\/comercial\/\*\*/, 'o workflow dispara em mudanças de /admin/comercial');
  assert.match(workflow, /tests\/ux-crm-workspace\.integration\.test\.mjs/, 'o gate de navegador continua sendo o da casca comercial');
});

// ---------------------------------------------------------------------------
// 2. Contrato do servidor (execução real do módulo, pool sintético)
// ---------------------------------------------------------------------------

test('contrato: leitura de vistorias exige sessão e mesma origem, sem tocar o banco quando recusa', async () => {
  const anonimo = setup({ session: null });
  const resAnonimo = response();
  await anonimo.api.handleInspections(request('GET', '/api/crm/inspections?limit=50'), resAnonimo, new URL('http://127.0.0.1/api/crm/inspections?limit=50'));
  assert.equal(resAnonimo.status, 401);
  assert.deepEqual(resAnonimo.payload, { error: 'admin_session_required' });
  assert.equal(anonimo.calls.length, 0, 'sem sessão, nenhuma consulta pode ser feita');

  const outraOrigem = setup({ sameOrigin: false });
  const resOrigem = response();
  await outraOrigem.api.handleInspections(request('GET', '/api/crm/inspections'), resOrigem, new URL('http://127.0.0.1/api/crm/inspections'));
  assert.equal(resOrigem.status, 403);
  assert.deepEqual(resOrigem.payload, { error: 'same_origin_required' });
});

test('contrato: lista de vistorias mantém o formato {inspections,total,limit,offset} e a indisponibilidade é 503', async () => {
  const { api } = setup();
  const res = response();
  await api.handleInspections(request('GET', '/api/crm/inspections?limit=50'), res, new URL('http://127.0.0.1/api/crm/inspections?limit=50'));
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.payload.inspections), 'a lista precisa ser array');
  assert.equal(res.payload.inspections[0].title, 'VISTORIA-SINTETICA');
  assert.equal(typeof res.payload.total, 'number');
  assert.equal(res.payload.limit, 50);
  assert.equal(res.payload.offset, 0);

  const quebrado = setup({ failQuery: true });
  const resQuebrado = response();
  await quebrado.api.handleInspections(request('GET', '/api/crm/inspections'), resQuebrado, new URL('http://127.0.0.1/api/crm/inspections'));
  assert.equal(resQuebrado.status, 503);
  assert.deepEqual(resQuebrado.payload, { error: 'inspection_unavailable' });
});

test('contrato: checklists respondem lista e falha de banco vira 503 (não lista vazia)', async () => {
  const { api } = setup();
  const res = response();
  await api.handleTemplates(request('GET', '/api/crm/inspection-templates'), res, new URL('http://127.0.0.1/api/crm/inspection-templates'));
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.payload.templates));
  assert.equal(res.payload.total, res.payload.templates.length);

  const quebrado = setup({ failQuery: true });
  const resQuebrado = response();
  await quebrado.api.handleTemplates(request('GET', '/api/crm/inspection-templates'), resQuebrado, new URL('http://127.0.0.1/api/crm/inspection-templates'));
  assert.equal(resQuebrado.status, 503);
  assert.deepEqual(resQuebrado.payload, { error: 'inspection_unavailable' });
});

test('contrato: criação responde 201 com o registro, 400 com o campo inválido e 503 quando o banco falha', async () => {
  const { api } = setup();
  const criado = response();
  await api.handleInspections(
    request('POST', '/api/crm/inspections', { company_id: idEmpresa, title: 'Vistoria criada pelo teste' }),
    criado,
    new URL('http://127.0.0.1/api/crm/inspections'),
  );
  assert.equal(criado.status, 201);
  assert.equal(criado.payload.inspection.title, 'Vistoria criada pelo teste');
  assert.equal(criado.payload.inspection.status, 'rascunho');

  const semEmpresa = response();
  await api.handleInspections(request('POST', '/api/crm/inspections', { title: 'sem empresa' }), semEmpresa, new URL('http://127.0.0.1/api/crm/inspections'));
  assert.equal(semEmpresa.status, 400);
  assert.deepEqual(semEmpresa.payload, { error: 'invalid_company_id' });

  const semTitulo = response();
  await api.handleInspections(request('POST', '/api/crm/inspections', { company_id: idEmpresa, title: '   ' }), semTitulo, new URL('http://127.0.0.1/api/crm/inspections'));
  assert.equal(semTitulo.status, 400);
  assert.deepEqual(semTitulo.payload, { error: 'invalid_title' });

  const quebrado = setup({ failQuery: true });
  const resQuebrado = response();
  await quebrado.api.handleInspections(
    request('POST', '/api/crm/inspections', { company_id: idEmpresa, title: 'Vistoria em banco fora' }),
    resQuebrado,
    new URL('http://127.0.0.1/api/crm/inspections'),
  );
  assert.equal(resQuebrado.status, 503);
  assert.deepEqual(resQuebrado.payload, { error: 'create_failed' });
});
