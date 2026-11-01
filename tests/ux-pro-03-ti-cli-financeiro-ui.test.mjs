// UX-PRO-03 — 12ª promoção "com prova": o console CLI (CLI-09..14) deixa de ser
// órfão e vira a 25ª aba do TiConsole ("Financeiro do portal").
//
// Escopo desta guarda:
//
//  1. o módulo puro `cli-finance-load.ts` — o defeito que ele impede é o do
//     protótipo antigo, onde `.catch(()=>({charges:[]}))` transformava
//     401/403/500/corpo inválido em "lista vazia" (falha aberta com cara de
//     sucesso) e a tela publicava o código cru do servidor;
//  2. as rotas canônicas: os oito endpoints vivem em `/api/cli/*` (ou no
//     canônico administrativo `/api/admin/portal-access-requests`), NUNCA nos
//     aliases `/api/hr/...`, que a borda legada de RH nega para `ti`;
//  3. a montagem: a aba existe, é importada dinamicamente, está no grupo
//     "Financeiro e cadastros" e o TiConsole passa a ter 25 abas;
//  4. o CSS module: tokens do produto, sem hex, com foco visível e breakpoint.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const componente = await read("src/app/admin/ti/CliFinanceClient.tsx");
const css = await read("src/app/admin/ti/CliFinanceClient.module.css");
const console15 = await read("src/app/admin/ti/TiConsole.tsx");
const server = await read("server.mjs");
const pkg = JSON.parse(await read("package.json"));

async function modulo() {
  const ts = await read("src/app/admin/ti/cli-finance-load.ts");
  const js = stripTypeScriptTypes(ts);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const carga = await modulo();

const blocoDe = chave => carga.BLOCOS.find(item => item.chave === chave);
const corpo = (campo, lista) => ({ [campo]: lista });

test("CLI console: as oito leituras usam rota canônica e nenhuma passa pela borda de RH", () => {
  assert.equal(carga.BLOCOS.length, 8, "o console lê oito blocos");
  for (const bloco of carga.BLOCOS) {
    assert.match(bloco.rota, /^\/api\//, `${bloco.chave} precisa de rota absoluta`);
    assert.ok(!bloco.rota.startsWith("/api/hr/") && !bloco.rota.startsWith("/api/admin/hr/") && !bloco.rota.startsWith("/api/crm/hr/"),
      `${bloco.chave} não pode usar alias preso na borda legada de RH`);
    assert.ok(server.includes(`"${bloco.rota}"`), `${bloco.rota} precisa estar despachada em server.mjs`);
  }
  const rotas = carga.BLOCOS.map(item => item.rota);
  assert.deepEqual([...new Set(rotas)].length, rotas.length, "nenhuma rota repetida entre blocos");
  assert.ok(rotas.includes("/api/admin/portal-access-requests"),
    "a fila de pedidos usa o canônico administrativo da fatia UX-PRO-06");
});

test("CLI console: 403 vira NEGADO explícito, nunca lista vazia", () => {
  const resultado = carga.classificarResposta(blocoDe("cobrancas"), 403, { error: "individual_staff_required" });
  assert.equal(resultado.situacao, "negado");
  assert.deepEqual(resultado.itens, []);
  assert.ok(!/individual_staff_required/.test(resultado.mensagem), "código cru não vai para a tela");
  assert.match(resultado.mensagem, /permissão/i);
  assert.match(resultado.mensagem, /indispon/i, "negação não é vazio");
});

test("CLI console: 401 também é negado, com instrução de sessão", () => {
  const resultado = carga.classificarResposta(blocoDe("acessos"), 401, { error: "admin_session_required" });
  assert.equal(resultado.situacao, "negado");
  assert.match(resultado.mensagem, /sess[ãa]o|entre novamente/i);
});

test("CLI console: 500 e 404 são FALHA, sem código cru", () => {
  const falha = carga.classificarResposta(blocoDe("seguranca"), 503, { error: "audit_unavailable" });
  assert.equal(falha.situacao, "falha");
  assert.ok(!/audit_unavailable/.test(falha.mensagem));
  assert.equal(carga.classificarResposta(blocoDe("emails"), 404, {}).situacao, "falha");
});

test("CLI console: corpo inválido é INVÁLIDO e nunca vira vazio", () => {
  const semCampo = carga.classificarResposta(blocoDe("cobrancas"), 200, {});
  assert.equal(semCampo.situacao, "invalido");
  const corpoNulo = carga.classificarResposta(blocoDe("cobrancas"), 200, undefined);
  assert.equal(corpoNulo.situacao, "invalido");
  const itemQuebrado = carga.classificarResposta(blocoDe("servicos"), 200, corpo("serviceRequests", [null]));
  assert.equal(itemQuebrado.situacao, "invalido");
  const listaErrada = carga.classificarResposta(blocoDe("servicos"), 200, corpo("serviceRequests", { nao: "lista" }));
  assert.equal(listaErrada.situacao, "invalido");
});

test("CLI console: vazio legítimo é distinto de ok e de inválido", () => {
  const vazio = carga.classificarResposta(blocoDe("satisfacao"), 200, corpo("surveys", []));
  assert.equal(vazio.situacao, "vazio");
  const cheio = carga.classificarResposta(blocoDe("satisfacao"), 200, corpo("surveys", [{ id: "a" }, { id: "b" }]));
  assert.equal(cheio.situacao, "ok");
  assert.equal(cheio.itens.length, 2);
});

test("CLI console: falha de rede não é vazio e pede nova tentativa", () => {
  const rede = carga.classificarResposta(blocoDe("renovacoes"), 0, undefined);
  assert.equal(rede.situacao, "falha");
  assert.match(rede.mensagem, /rede|tente novamente/i);
});

test("CLI console: a faixa agregada declara negação e só fica completa com tudo lido", () => {
  const ok = carga.classificarResposta(blocoDe("cobrancas"), 200, corpo("charges", [{ id: "1" }]));
  const vazio = carga.classificarResposta(blocoDe("servicos"), 200, corpo("serviceRequests", []));
  const negado = carga.classificarResposta(blocoDe("acessos"), 403, { error: "individual_staff_required" });
  const falha = carga.classificarResposta(blocoDe("modos"), 500, {});

  const parcial = carga.agregarLeitura([ok, vazio, negado, falha], "10:30");
  assert.equal(parcial.completo, false);
  assert.equal(parcial.negados, 1);
  assert.equal(parcial.falhas, 1);
  assert.equal(parcial.lidos, 2);
  assert.equal(parcial.hora, "10:30");
  assert.match(parcial.mensagem, /negad/i);

  const completo = carga.agregarLeitura([ok, vazio], "10:31");
  assert.equal(completo.completo, true);
  assert.equal(completo.mensagem, "", "sem problema, sem faixa");

  const tudo_negado = carga.agregarLeitura([negado, negado], "10:32");
  assert.equal(tudo_negado.completo, false);
  assert.equal(tudo_negado.lidos, 0);
});

test("CLI console: escrita traduz o motivo do servidor e nunca publica o código", () => {
  assert.match(carga.traduzirErroEscrita(400, "reason_10_500"), /10 e 500|10 a 500/);
  assert.match(carga.traduzirErroEscrita(400, "autocadastro_never_releases_contracts"), /autocadastro nunca libera/i);
  assert.match(carga.traduzirErroEscrita(409, "request_already_decided"), /já foi decidid/i);
  assert.match(carga.traduzirErroEscrita(503, "audit_unavailable"), /auditoria/i);
  assert.match(carga.traduzirErroEscrita(500, "boom_interno"), /servidor falhou/i);
  for (const codigo of ["reason_10_500", "request_already_decided", "audit_unavailable", "boom_interno"]) {
    assert.ok(!carga.traduzirErroEscrita(400, codigo).includes(codigo), `${codigo} não pode vazar`);
  }
});

test("CLI console: motivo exige 10..500 caracteres depois do trim", () => {
  assert.equal(carga.validarMotivo("curto").ok, false);
  assert.equal(carga.validarMotivo("  1234567890  ").ok, true);
  assert.equal(carga.validarMotivo("  1234567890  ").motivo, "1234567890", "grava o motivo sem espaços nas pontas");
  assert.equal(carga.validarMotivo("x".repeat(501)).ok, false);
  assert.equal(carga.validarMotivo("x".repeat(500)).ok, true);
  assert.ok(carga.validarMotivo("").erro.length > 0);
});

test("CLI console: a tela usa o módulo, declara os estados e não engole falha", () => {
  assert.match(componente, /from "\.\/cli-finance-load"/, "a tela precisa usar o módulo puro");
  assert.match(componente, /classificarResposta/);
  assert.match(componente, /agregarLeitura/);
  assert.match(componente, /traduzirErroEscrita/);
  assert.match(componente, /role="alert"/, "negativa/falha precisa ser anunciada");
  assert.match(componente, /data-testid="clifin-faixa"/);
  assert.match(componente, /aria-busy=\{lendo\}/);
  assert.ok(!/\.catch\(\(\)=>\(\{\s*\w+\s*:\s*\[\]\s*\}\)\)/.test(componente),
    "nenhuma leitura pode cair em lista vazia por padrão");
  assert.ok(!componente.includes("/api/hr/"), "a tela não pode usar alias preso na borda de RH");
  assert.ok(!/setMsg\("Erro[^"]*"\+e\.message\)/.test(componente), "erro cru de exceção não vai para a tela");
});

test("CLI console: a aba existe, é dinâmica, está no grupo certo e o console tem 31 abas", () => {
  const declaracaoAbas = console15.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? "";
  const abas = [...declaracaoAbas.matchAll(/\['([a-z0-9_]+)','([^']+)'\]/g)].map(item => item[1]);
  assert.equal(abas.length, 31, "o console tem 31 abas depois das promoções de 31/10");
  assert.ok(abas.includes("cli_financeiro"), "a chave da aba precisa existir");
  assert.match(console15, /const CliFinanceClient=dynamic\(\(\)=>import\('\.\/CliFinanceClient'\)\);/);
  assert.match(console15, /\{active==='cli_financeiro'&&<CliFinanceClient\/>\}/);
  assert.match(console15, /name:'Financeiro e cadastros',keys:\['financeiro_cadastros','cli_financeiro'\]/);
  assert.match(pkg.scripts["test:unit"], /tests\/ux-pro-03-ti-cli-financeiro-ui\.test\.mjs/,
    "a guarda precisa rodar no test:unit");
});

test("CLI console: CSS por tokens, sem hex, com foco visível e breakpoint", () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), "CSS module não pode fixar cor em hex");
  assert.match(css, /:focus-visible/, "foco visível obrigatório");
  assert.match(css, /@media\(max-width:740px\)/, "quebra para coluna única no celular");
  assert.match(css, /var\(--ux-color-border\)/);
  assert.match(css, /var\(--ux-color-brand\)/);
});
