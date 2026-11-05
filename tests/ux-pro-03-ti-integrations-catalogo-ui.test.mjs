// UX-PRO-03 — 19ª promoção "com prova": o catálogo de integrações e o teste de
// conexão (PLT-03) deixam de ser órfãos: `IntegrationsClient` vira a 32ª aba do
// TiConsole.
//
// O protótipo tinha seis problemas que esta guarda trava:
//
//  1. `alert()` para o resultado do teste — nada ficava na tela, nada era lido
//     por leitor de tela;
//  2. a lista vazia dizia "Nenhuma integração (ou sem permissão)": negação e
//     vazio no mesmo texto;
//  3. `config_sanitized` despejado com `JSON.stringify` no meio do cartão;
//  4. os filtros `provider`/`status` que o servidor aceita desde sempre nunca
//     eram usados;
//  5. o `PATCH` de identificação existia no servidor e não aparecia na tela;
//  6. a tela não declarava que os registros/jobs/webhooks moram na aba vizinha.
//
// E o servidor tinha três defeitos medidos contra PostgreSQL 17 real:
//
//  a. o padrão `/:id` casava antes dos subcaminhos literais da aba viva
//     "Registros de integração": `GET /jobs`, `/logs`, `/webhooks` e
//     `/reconciliation` respondiam **405**;
//  b. `PATCH` com nome em branco respondia **200** sem mudar nada, e `PATCH`
//     sem campo nenhum também respondia 200;
//  c. `rh` podia testar conexão e renomear/criar integração (**200**).

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const componente = await read("src/app/admin/ti/IntegrationsClient.tsx");
const css = await read("src/app/admin/ti/IntegrationsClient.module.css");
const estadoTs = await read("src/app/admin/ti/integrations-state.ts");
const consoleTi = await read("src/app/admin/ti/TiConsole.tsx");
const api = await read("src/server/integrations-api.mjs");
const servidor = await read("server.mjs");
const logsClient = await read("src/app/admin/ti/IntegrationLogClient.tsx");

const estado = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(estadoTs)).toString("base64")}`);

/** Conjunto literal do módulo do servidor, lido do próprio código. */
const conjuntoDoServidor = nome => {
  const linha = new RegExp(`const ${nome} = new Set\\(\\[([^\\]]+)\\]\\)`).exec(api);
  assert.ok(linha, `o servidor precisa manter ${nome} como Set literal`);
  return [...linha[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
};

test("PLT-03: a leitura distingue negado, falha, inválido e vazio de 'ok com integrações'", () => {
  const negado = estado.classificarLista(403, undefined);
  assert.equal(negado.situacao, "negado");
  assert.match(negado.mensagem, /n[ãa]o [ée] um cat[áa]logo vazio/i);
  assert.equal(estado.classificarLista(401, undefined).situacao, "negado");
  assert.equal(estado.classificarLista(0, undefined).situacao, "falha");
  assert.equal(estado.classificarLista(503, { error: "integrations_unavailable" }).situacao, "falha");
  assert.equal(estado.classificarLista(400, { error: "invalid_provider" }).situacao, "invalido");
  assert.equal(estado.classificarLista(200, {}).situacao, "invalido");
  assert.equal(estado.classificarLista(200, { integrations: "x" }).situacao, "invalido");
  assert.equal(estado.classificarLista(200, { integrations: [] }).situacao, "vazio");
  const ok = estado.classificarLista(200, { integrations: [{ id: "smtp" }] });
  assert.equal(ok.situacao, "ok");
  assert.equal(ok.itens.length, 1);
});

test("PLT-03: provedores e situações são espelho literal do servidor", () => {
  assert.deepEqual([...estado.PROVEDORES].sort(), conjuntoDoServidor("ALLOWED_PROVIDERS"));
  assert.deepEqual([...estado.SITUACOES_INTEGRACAO].sort(), conjuntoDoServidor("ALLOWED_STATUS"));
  for (const provedor of estado.PROVEDORES) {
    assert.equal(typeof estado.ROTULO_PROVEDOR[provedor], "string");
    assert.ok(estado.ROTULO_PROVEDOR[provedor].length > 2, `provedor ${provedor} precisa de rótulo legível`);
  }
  for (const situacao of estado.SITUACOES_INTEGRACAO) {
    assert.ok(estado.ROTULO_SITUACAO[situacao]);
    assert.ok(["neutral", "success", "warning", "danger"].includes(estado.TOM_SITUACAO[situacao]));
  }
});

test("PLT-03: todo código de erro do módulo do servidor tem tradução própria", () => {
  const codigos = [...new Set([...api.matchAll(/\{ error: "([a-z_]+)"/g)].map(m => m[1]))].sort();
  assert.ok(codigos.length >= 10, `esperava pelo menos 10 códigos, achei ${codigos.length}`);
  for (const codigo of codigos) {
    assert.ok(estado.ERROS[codigo], `código do servidor sem tradução na tela: ${codigo}`);
    assert.notEqual(estado.traduzirErroIntegracao(400, codigo), estado.FALLBACK_ERRO, `${codigo} caiu no fallback`);
  }
  assert.equal(estado.traduzirErroIntegracao(400, "codigo_que_nao_existe"), estado.FALLBACK_ERRO);
});

test("PLT-03: o filtro só manda o que o servidor aceita e o filtro local é o mesmo WHERE", () => {
  assert.equal(estado.validarFiltros({ provedor: "naoexiste", situacao: "" }).ok, false);
  assert.equal(estado.validarFiltros({ provedor: "", situacao: "quebrado" }).ok, false);
  assert.equal(estado.queryDoFiltro({ provedor: "naoexiste", situacao: "" }), "");
  assert.equal(estado.queryDoFiltro({ provedor: "", situacao: "" }), "");
  assert.equal(estado.queryDoFiltro({ provedor: "smtp", situacao: "" }), "?provider=smtp");
  assert.equal(estado.queryDoFiltro({ provedor: "", situacao: "failure" }), "?status=failure");
  assert.equal(estado.queryDoFiltro({ provedor: "smtp", situacao: "configured" }), "?provider=smtp&status=configured");
  const itens = [
    { id: "smtp", provider: "smtp", status: "configured" },
    { id: "whatsapp", provider: "whatsapp", status: "not_configured" },
    { id: "nfe", provider: "nfe", status: "failure" },
  ];
  assert.deepEqual(estado.filtrarIntegracoes(itens, { provedor: "smtp", situacao: "" }).map(i => i.id), ["smtp"]);
  assert.deepEqual(estado.filtrarIntegracoes(itens, { provedor: "", situacao: "failure" }).map(i => i.id), ["nfe"]);
  assert.deepEqual(estado.filtrarIntegracoes(itens, { provedor: "smtp", situacao: "failure" }), []);
  assert.equal(estado.filtrarIntegracoes(itens, { provedor: "", situacao: "" }).length, 3);
});

test("PLT-03: nome vazio é recusado antes do PATCH (o servidor respondia 200 sem mudar nada)", () => {
  assert.match(estado.validarNome(""), /1 a 100/);
  assert.match(estado.validarNome("   "), /1 a 100/);
  assert.match(estado.validarNome("x".repeat(101)), /1 a 100/);
  assert.equal(estado.validarNome("  SMTP do gate  "), null);
  assert.equal(estado.validarNome("x".repeat(100)), null);
  assert.equal(estado.ERROS.no_fields.includes("nome ou o provedor"), true);
});

test("PLT-03: config sanitizada vira par chave/valor, sem despejar JSON e sem reexpor segredo", () => {
  assert.deepEqual(estado.mascararConfig(null), []);
  assert.deepEqual(estado.mascararConfig([1, 2]), []);
  const pares = estado.mascararConfig({ port: 587, host: "[configured]", api_token: "[redacted]" });
  assert.deepEqual(pares.map(p => p.chave), ["api_token", "host", "port"]);
  assert.equal(pares.find(p => p.chave === "port").valor, "587");
  assert.equal(pares.find(p => p.chave === "api_token").valor, "[redacted]");
  const longo = estado.mascararConfig({ host: "h".repeat(200) })[0];
  assert.equal(longo.valor.length, estado.LIMITES.valorConfigMax + 1);
  assert.ok(longo.valor.endsWith("…"));
});

test("PLT-03: data ausente nunca vira 'Invalid Date' na tela", () => {
  assert.equal(estado.formatarQuando(null), "—");
  assert.equal(estado.formatarQuando(undefined), "—");
  assert.equal(estado.formatarQuando(""), "—");
  assert.equal(estado.formatarQuando("não é data"), "—");
  assert.match(estado.formatarQuando("2026-11-01T12:00:00.000Z"), /\d{2}\/\d{2}\/\d{4}/);
});

test("PLT-03: o resumo conta as situações e não inventa 'configurada'", () => {
  const placar = estado.resumo([
    { id: "a", status: "configured" },
    { id: "b", status: "failure" },
    { id: "c", status: "not_configured" },
    { id: "d", status: "not_configured" },
  ]);
  assert.deepEqual(placar, { total: 4, configuradas: 1, emFalha: 1, naoConfiguradas: 2 });
  assert.deepEqual(estado.resumo([]), { total: 0, configuradas: 0, emFalha: 0, naoConfiguradas: 0 });
});

test("PLT-03: HTTP 200 do teste não é 'configurado' — quem diz a situação é o registro", () => {
  const naoConfigurada = estado.descreverTeste(200, { integration: { id: "smtp", status: "not_configured", last_error_sanitized: "SMTP não configurado (MAIL_HOST ausente)" } });
  assert.equal(naoConfigurada.ok, true);
  assert.match(naoConfigurada.mensagem, /n[ãa]o configurada/);
  assert.doesNotMatch(naoConfigurada.mensagem, /Teste concluído: configurada/);
  assert.match(naoConfigurada.mensagem, /MAIL_HOST/);
  const falha = estado.descreverTeste(200, { integration: { id: "smtp", status: "failure", last_error_sanitized: "getaddrinfo ENOTFOUND" } });
  assert.match(falha.mensagem, /em falha/);
  const negado = estado.descreverTeste(403, { error: "role_required" });
  assert.equal(negado.ok, false);
  assert.match(negado.mensagem, /admin ou ti/);
  assert.equal(negado.item, null);
  const semCorpo = estado.descreverTeste(200, {});
  assert.equal(semCorpo.ok, false);
  assert.match(semCorpo.mensagem, /sem o registro/);
  assert.equal(estado.testeConectaDeVerdade("smtp"), true);
  assert.equal(estado.testeConectaDeVerdade("whatsapp"), false);
});

test("PLT-03: escrever exige admin/ti — o servidor confere, a tela não oferece", () => {
  assert.equal(estado.podeEscrever("ti"), true);
  assert.equal(estado.podeEscrever("admin"), true);
  assert.equal(estado.podeEscrever("rh"), false);
  assert.equal(estado.podeEscrever(""), false);
  assert.match(api, /const PAPEIS_DE_ESCRITA = new Set\(\["admin", "ti"\]\)/);
  const guardas = [...api.matchAll(/if \(!requireWriteRole\(session, res\)\) return;/g)];
  assert.equal(guardas.length, 2, "as duas rotas de escrita (teste e atualização) precisam da guarda de papel");
  assert.match(componente, /Seu papel/);
  assert.match(componente, /exigem <code>admin<\/code> ou <code>ti<\/code>/);
});

test("PLT-03: o roteador devolve os subcaminhos da aba viva antes do padrão /:id", () => {
  assert.match(api, /export const INTEGRATION_ROUTE_SUBPATHS = new Set\(\["jobs","logs","webhooks","reconciliation"\]\)/);
  assert.match(servidor, /import \{ createIntegrationsApi, INTEGRATION_ROUTE_SUBPATHS \} from "\.\/src\/server\/integrations-api\.mjs"/);
  assert.match(servidor, /if \(integrationMatch && !INTEGRATION_ROUTE_SUBPATHS\.has\(integrationMatch\[1\]\.toLowerCase\(\)\)\) \{/);
  // os cinco caminhos da aba viva continuam roteados no próprio server.mjs
  for (const caminho of ["/jobs", "/logs", "/webhooks", "/webhooks/deliveries", "/reconciliation"]) {
    assert.ok(servidor.includes(`"/api/admin/integrations${caminho}"`), `rota da aba viva ausente: ${caminho}`);
  }
  // e a tela promovida não os duplica: ela declara onde eles moram
  assert.match(componente, /Registros de integração/);
  for (const caminho of ["integrations/jobs", "integrations/logs", "integrations/webhooks", "integrations/reconciliation"]) {
    assert.ok(!componente.includes(caminho), `a tela de catálogo não pode duplicar ${caminho}`);
    assert.ok(logsClient.includes(`/api/admin/${caminho}`), `a aba viva precisa continuar dona de ${caminho}`);
  }
  assert.match(api, /INTEGRATION_ROUTE_SUBPATHS\.has\(idLimpo\.toLowerCase\(\)\)/);
});

test("PLT-03: a tela nova não usa alerta de navegador, não chama a borda de RH e não tem `any`", () => {
  assert.doesNotMatch(componente, /\balert\(/);
  assert.doesNotMatch(componente, /\/api\/hr\//);
  assert.doesNotMatch(componente, /: any\b|<any>|as any/);
  assert.doesNotMatch(estadoTs, /: any\b|<any>|as any/);
  assert.match(componente, /fetch\(`\/api\/admin\/integrations\$\{queryDoFiltro\(filtroAtual\)\}`/);
  assert.match(componente, /method: "POST"/);
  assert.match(componente, /method: "PATCH"/);
  assert.match(componente, /aria-live="polite"/);
  assert.match(componente, /data-testid=\{resultado\.ok \? "plt03-ok" : "plt03-erro"\}/);
  assert.match(componente, /data-situacao=\{situacao\}/);
});

test("PLT-03: a aba entra no console com 32 abas, grupo certo e import dinâmico", () => {
  const blocoDeAbas = /const tabs=\[([\s\S]*?)\] as const;/.exec(consoleTi);
  assert.ok(blocoDeAbas, "o TiConsole precisa manter o array `tabs`");
  const abas = [...blocoDeAbas[1].matchAll(/\['([a-z0-9_]+)','([^']+)'\]/g)].map(m => [m[1], m[2]]);
  assert.equal(abas.length, 32, "o console tem 32 abas depois das promoções de 01/11");
  const nova = abas.find(([chave]) => chave === "integracao_catalogo");
  assert.ok(nova, "aba integracao_catalogo ausente");
  assert.match(nova[1], /Integra[çc][õo]es: cat[áa]logo e teste/);
  assert.match(consoleTi, /const IntegrationsClient=dynamic\(\(\)=>import\('\.\/IntegrationsClient'\)\)/);
  assert.match(consoleTi, /name:'Sa[úu]de e opera[çc][ãa]o',keys:\[[^\]]*'integracoes','integracao_catalogo'/);
  assert.match(consoleTi, /active==='integracao_catalogo'&&<IntegrationsClient\/>/);
});

test("PLT-03: o CSS usa tokens da casa, foco visível e breakpoint em 740px", () => {
  assert.ok(css.includes("var(--color-border"));
  assert.ok(css.includes(":focus-visible"));
  assert.match(css, /@media \(max-width: 740px\)/);
  assert.ok(css.split("\n").length > 60, "o CSS da tela promovida não pode ser um remendo de 20 linhas");
  // o protótipo era `style={{…}}` em cada elemento; a tela promovida usa classe
  assert.doesNotMatch(componente, /style=\{\{/);
});

// 05Y: callback real, não implementação paralela; respostas fora de ordem.
async function leituraFixture() {
  const { default: ts } = await import('typescript');
  const { runInNewContext } = await import('node:vm');
  const source = await read('src/app/admin/ti/IntegrationsClient.tsx');
  const start = source.indexOf('const carregar = useCallback(async (filtroAtual: Filtros) => {');
  const end = source.indexOf('\n  }, []);', start) + '\n  }, []);'.length;
  assert.ok(start >= 0 && end > start);
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const state = { itens: [], situacao: 'vazio', carregando: false, papel: '' }, calls = [];
  const context = { leituraAtual: { current: 0 }, useCallback: fn => fn,
    queryDoFiltro: estado.queryDoFiltro, classificarLista: estado.classificarLista,
    fetch: () => new Promise((resolve, reject) => calls.push({ resolve, reject })),
    setCarregando: value => { state.carregando = value; }, setSituacao: value => { state.situacao = value; },
    setItens: value => { state.itens = value; }, setMensagemLista: () => {}, setPapel: value => { state.papel = value; },
  };
  return { carregar: runInNewContext(js + '\ncarregar', context), state, context,
    finish: (i, status, integrations) => calls[i].resolve({ status, json: async () => ({ integrations, role: 'ti' }) }),
    fail: i => calls[i].reject(new Error('synthetic_network')) };
}

test('05Y catálogo: resposta do filtro antigo não substitui catálogo após limpar', async () => {
  const f = await leituraFixture(); const old = f.carregar({ provedor: 'smtp', situacao: '' });
  const latest = f.carregar({ provedor: '', situacao: '' });
  f.finish(1, 200, [{ id: 'smtp' }, { id: 'storage' }]); await latest;
  f.finish(0, 200, [{ id: 'smtp' }]); await old;
  assert.equal(f.state.itens.length, 2);
});

test('05Y catálogo: sucesso antigo não publica dados após negativa atual', async () => {
  const f = await leituraFixture(); const old = f.carregar({}); const latest = f.carregar({});
  f.finish(1, 403, []); await latest; f.finish(0, 200, [{ id: 'protected' }]); await old;
  assert.equal(f.state.situacao, 'negado'); assert.equal(f.state.itens.length, 0);
});

test('05Y catálogo: erro antigo não encerra loading atual e cleanup invalida pendências', async () => {
  const f = await leituraFixture(); const old = f.carregar({}); const latest = f.carregar({});
  f.fail(0); await old; assert.equal(f.state.carregando, true); assert.equal(f.state.situacao, 'vazio');
  f.context.leituraAtual.current++; f.finish(1, 200, [{ id: 'unmounted' }]); await latest;
  assert.equal(f.state.itens.length, 0);
  const source = await read('src/app/admin/ti/IntegrationsClient.tsx');
  assert.match(source, /return \(\) => \{ leituraAtual.current\+\+; \}/);
});
