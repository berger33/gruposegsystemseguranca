// UX-PRO-06 — estado de LEITURA e de ESCRITA da fila de acesso do portal
// (CLI-13 administrativo, `/admin/portal/solicitacoes`).
//
// Escopo desta guarda: a superfície já era viva (duas leituras reais, duas
// escritas reais, `AdminGate` de `ti|admin`), mas não tinha estado nem prova de
// jornada. A sonda em PostgreSQL 17 + Chromium mediu, ANTES da correção:
//
//  - a fila respondia 403 para `ti`/`admin` nos três aliases de RH e 405 no
//    alias `/api/cli/`, e o alias público devolvia 404 → a tela dizia ao mesmo
//    tempo "Não foi possível carregar" e "Nenhum pedido registrado";
//  - a negativa mantinha os pedidos na tela (falha aberta de apresentação);
//  - `{}` (200 sem o campo) virava fila vazia e um item sem UUID era publicado
//    como pedido real;
//  - corpo não-JSON na escrita derrubava a ação em silêncio (`SyntaxError` de
//    `response.json()`), e o 400 publicava o código cru do servidor;
//  - dois cliques em "Atualizar" disparavam quatro GET e o botão seguia ativo.
//
// A guarda testa o módulo puro que a tela passou a usar (parser, tradução de
// motivo, redutor sequenciado, validação do motivo) e confere que a tela usa o
// alias canônico de administração, que o servidor o despacha e que a borda
// legada de RH continua de pé para os aliases antigos.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const page = await read("src/app/admin/portal/solicitacoes/page.tsx");
const css = await read("src/app/admin/portal/solicitacoes/AccessRequests.module.css");
const server = await read("server.mjs");
const pkg = JSON.parse(await read("package.json"));

async function helpers() {
  const ts = await read("src/app/admin/portal/solicitacoes/access-queue-state.ts");
  const js = stripTypeScriptTypes(ts);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const pedido = {
  id: "11111111-1111-4111-8111-111111111111",
  protocol: "ACC-CLI-20261031-AB12",
  mode: "solicitacao_aprovacao",
  client_account_id: "22222222-2222-4222-8222-222222222222",
  requested_email: "qa-cli13@exemplo.invalid",
  requested_name: "Pessoa QA",
  document_ref: "12345000199",
  status: "pendente",
  verified_link: true,
};
const modo = { mode: "convite", is_active: true, requires_approval: false, auto_release_contracts: false };

test("CLI-13: o parser aceita o contrato real e preserva o que a tela não renderiza", async () => {
  const { parsePedidos, parseModos } = await helpers();
  const entrada = { requests: [{ ...pedido, approved_by_identity: null, created_at: "2026-10-31T10:00:00Z" }] };
  const antes = structuredClone(entrada);
  const itens = parsePedidos(entrada);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].protocol, pedido.protocol);
  assert.equal(itens[0].verified_link, true);
  assert.equal(itens[0].status, "pendente");
  assert.deepEqual(entrada, antes, "o parser não pode modificar o payload do servidor");
  // Fila vazia é payload VÁLIDO: ausência de pedido não é erro de leitura.
  assert.deepEqual(parsePedidos({ requests: [] }), []);
  const modos = parseModos({ modes: [modo, { ...modo, mode: "autocadastro" }], note: "autocadastro nunca libera contratos sozinho" });
  assert.equal(modos.length, 2);
  assert.equal(modos[0].mode, "convite");
});

test("CLI-13: payload malformado nunca vira \"nenhum pedido registrado\"", async () => {
  const { parsePedidos, parseModos } = await helpers();
  const invalidos = [
    null, undefined, "ok", 42, [], {},
    { requests: undefined },
    { requests: {} },
    { requests: [null] },
    { requests: [{ ...pedido, id: "nao-e-uuid" }] },
    { requests: [{ ...pedido, id: undefined }] },
    { requests: [{ ...pedido, protocol: "" }] },
    { requests: [{ ...pedido, protocol: 7 }] },
    { requests: [{ ...pedido, mode: "modo-inventado" }] },
    { requests: [{ ...pedido, status: "em-analise" }] },
    { requests: [{ ...pedido, verified_link: "sim" }] },
    { requests: [{ ...pedido, requested_email: "" }] },
    { requests: [{ ...pedido, requested_name: 3 }] },
    { requests: [{ ...pedido, client_account_id: "conta-1" }] },
    { requests: [{ ...pedido, document_ref: 42 }] },
  ];
  for (const invalido of invalidos) {
    assert.throws(() => parsePedidos(invalido), /invalid_response/, JSON.stringify(invalido));
  }
  const modosInvalidos = [
    null, [], {}, { modes: undefined }, { modes: [null] },
    { modes: [{ ...modo, mode: "qualquer" }] },
    { modes: [{ ...modo, is_active: "true" }] },
    { modes: [{ ...modo, requires_approval: 1 }] },
    { modes: [{ ...modo, auto_release_contracts: null }] },
  ];
  for (const invalido of modosInvalidos) {
    assert.throws(() => parseModos(invalido), /invalid_response/, JSON.stringify(invalido));
  }
});

test("CLI-13: a negativa e o payload inválido são falha FECHADA, com frases distintas", async () => {
  const { descreverFalhaLeitura, descreverRespostaInvalida, descreverFalhaRede } = await helpers();
  const auth = descreverFalhaLeitura(401, "fila");
  const negado = descreverFalhaLeitura(403, "fila");
  const indisponivel = descreverFalhaLeitura(503, "fila");
  assert.equal(auth.kind, "auth");
  assert.equal(negado.kind, "denied");
  assert.equal(indisponivel.kind, "retry");
  assert.equal(auth.canRetry, false, "negativa de sessão não oferece repetir a mesma chamada");
  assert.equal(negado.canRetry, false, "negativa de acesso não oferece repetir a mesma chamada");
  assert.equal(indisponivel.canRetry, true);
  assert.equal(descreverRespostaInvalida("fila").kind, "invalid");
  assert.equal(descreverRespostaInvalida("fila").canRetry, true);
  assert.equal(descreverFalhaRede("modos").kind, "retry");
  const textos = [auth, negado, indisponivel, descreverRespostaInvalida("fila"), descreverFalhaRede("fila")].map(item => `${item.title} ${item.detail}`);
  for (const texto of textos) {
    assert.doesNotMatch(texto, /nenhum pedido registrado/i, "falha não pode ser redigida como fila vazia");
  }
  assert.equal(new Set(textos).size, textos.length, "cada motivo tem a sua própria frase");
});

test("CLI-13: resposta fora de ordem não publica nem apaga leitura", async () => {
  const { reduzirLeitura } = await helpers();
  const inicial = { itens: [], carregando: true, falha: null, concluiu: false, hora: null, desatualizada: null };
  const primeira = reduzirLeitura(inicial, { tipo: "sucesso", sequencia: 1, atual: 2, itens: [pedido], hora: "10:00" });
  assert.deepEqual(primeira, inicial, "sucesso de uma leitura antiga é ignorado");
  const falhaAntiga = reduzirLeitura(inicial, {
    tipo: "falha", sequencia: 1, atual: 2,
    falha: { kind: "retry", title: "t", detail: "d", canRetry: true },
  });
  assert.deepEqual(falhaAntiga, inicial, "falha de uma leitura antiga não encerra o carregamento da nova");
  const atual = reduzirLeitura(inicial, { tipo: "sucesso", sequencia: 2, atual: 2, itens: [pedido], hora: "10:01" });
  assert.equal(atual.itens.length, 1);
  assert.equal(atual.hora, "10:01");
  assert.equal(atual.concluiu, true);
});

test("CLI-13: falha transitória preserva a leitura; transiente antes de ler não inventa vazio", async () => {
  const { reduzirLeitura, estaVazia } = await helpers();
  const concluida = { itens: [pedido], carregando: false, falha: null, concluiu: true, hora: "10:01", desatualizada: null };
  const falha = { kind: "retry", title: "O serviço está temporariamente indisponível", detail: "d", canRetry: true };
  const depois = reduzirLeitura(concluida, { tipo: "falha", sequencia: 2, atual: 2, falha });
  assert.equal(depois.itens.length, 1, "a leitura concluída continua valendo");
  assert.equal(depois.hora, "10:01", "a hora continua sendo a da leitura que valeu");
  assert.equal(depois.falha, null);
  assert.equal(depois.desatualizada?.kind, "retry");
  assert.equal(estaVazia(depois), false, "leitura desatualizada não é fila vazia");

  const nuncaLeu = reduzirLeitura({ itens: [], carregando: true, falha: null, concluiu: false, hora: null, desatualizada: null },
    { tipo: "falha", sequencia: 1, atual: 1, falha });
  assert.equal(nuncaLeu.itens.length, 0);
  assert.equal(nuncaLeu.falha?.kind, "retry");
  assert.equal(estaVazia(nuncaLeu), false, "sem leitura concluída, vazio é proibido");
});

test("CLI-13: negativa e payload inválido DESCARTAM o que estava na tela", async () => {
  const { reduzirLeitura, estaVazia } = await helpers();
  const concluida = { itens: [pedido], carregando: false, falha: null, concluiu: true, hora: "10:01", desatualizada: null };
  for (const kind of ["denied", "auth", "invalid"]) {
    const depois = reduzirLeitura(concluida, {
      tipo: "falha", sequencia: 2, atual: 2,
      falha: { kind, title: "t", detail: "d", canRetry: false },
    });
    assert.deepEqual(depois.itens, [], `${kind} não pode manter pedidos na tela`);
    assert.equal(depois.hora, null, `${kind} não pode manter a hora de uma leitura descartada`);
    assert.equal(depois.concluiu, false);
    assert.equal(estaVazia(depois), false, `${kind} não é "vazio"`);
  }
});

test("CLI-13: erro de escrita é dito em português e nunca publica o código cru", async () => {
  const { traduzirErroEscrita } = await helpers();
  const codigos = [
    "decision_reason_10_500_required", "reason_10_500", "request_already_decided",
    "verified_link_required", "identity_exists_use_explicit_grant_flow",
    "mode_policy_blocks_approval", "request_not_found", "autocadastro_never_releases_contracts",
    "invalid_mode_config", "invalid_request", "mode_not_found", "individual_staff_required",
    "forbidden", "unauthorized", "audit_unavailable", "origin_forbidden", "method_not_allowed",
  ];
  const frases = new Set();
  for (const codigo of codigos) {
    const frase = traduzirErroEscrita(400, codigo);
    assert.equal(typeof frase, "string");
    assert.ok(frase.length > 20, `${codigo} precisa de uma frase explicativa`);
    assert.doesNotMatch(frase, new RegExp(codigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `a frase não pode repetir o código cru ${codigo}`);
    frases.add(frase);
  }
  assert.ok(frases.size >= codigos.length - 1, "cada código tem frase própria");
  // Código desconhecido: frase genérica que ainda diz o status, sem inventar causa.
  assert.match(traduzirErroEscrita(418, "codigo_novo_do_servidor"), /418/);
  assert.doesNotMatch(traduzirErroEscrita(418, "codigo_novo_do_servidor"), /codigo_novo_do_servidor/);
  assert.match(traduzirErroEscrita(503, undefined), /indisponível/i);
  assert.match(traduzirErroEscrita(409, undefined), /mudou no servidor/i);
});

test("CLI-13: o motivo é validado como o servidor valida (10 a 500 depois de trim)", async () => {
  const { validarMotivo, MOTIVO_MIN, MOTIVO_MAX } = await helpers();
  assert.equal(MOTIVO_MIN, 10);
  assert.equal(MOTIVO_MAX, 500);
  assert.equal(validarMotivo("   curto   ").ok, false);
  assert.equal(validarMotivo("123456789").ok, false);
  assert.equal(validarMotivo("1234567890").ok, true);
  assert.equal(validarMotivo(`  ${"a".repeat(10)}  `).ok, true, "o servidor faz trim antes de contar");
  assert.equal(validarMotivo("a".repeat(500)).ok, true);
  assert.equal(validarMotivo("a".repeat(501)).ok, false);
  assert.match(validarMotivo("x").mensagem, /pelo menos 10/);
});

test("CLI-13: só pedido pendente é decidível", async () => {
  const { podeDecidir, rotuloStatus } = await helpers();
  assert.equal(podeDecidir(pedido), true);
  for (const status of ["aprovada", "rejeitada", "cancelada"]) {
    assert.equal(podeDecidir({ ...pedido, status }), false);
  }
  assert.equal(rotuloStatus("pendente"), "Pendente");
  assert.equal(rotuloStatus("cancelada"), "Cancelada");
});

test("CLI-13: a tela usa o alias canônico e não volta para a borda legada de RH", async () => {
  assert.match(page, /"\/api\/admin\/portal-access-requests"/, "a fila precisa do alias canônico de administração");
  assert.match(page, /"\/api\/cli\/portal-mode-configs"/, "os modos continuam no alias canônico que já respondia");
  assert.doesNotMatch(page, /\/api\/hr\/cli-/, "nenhuma leitura pode voltar para o alias preso na borda de RH");
  // O servidor despacha os dois caminhos e os dois estão na lista de caminhos de API.
  const apiPathMatch = server.slice(server.indexOf("const API_PATH_MATCH"), server.indexOf("const app = next("));
  assert.match(apiPathMatch, /pathname === "\/api\/admin\/portal-access-requests"/);
  assert.match(apiPathMatch, /pathname === "\/api\/public\/portal-access-requests"/);
  assert.match(server, /url\.pathname === "\/api\/admin\/portal-access-requests"/);
  // Compatibilidade: os aliases antigos continuam despachados e a borda de RH
  // continua cobrindo `/api/hr/` para quem não tem a permissão granular.
  for (const antigo of ["/api/hr/cli-portal-access-requests", "/api/admin/hr/cli-portal-access-requests", "/api/crm/hr/cli-portal-access-requests", "/api/client/portal-access-requests"]) {
    assert.ok(server.includes(antigo), `o alias ${antigo} não pode desaparecer`);
  }
  assert.match(server, /async function authorizeLegacyHrRequest/);
  assert.match(server, /if \(!\(await authorizeLegacyHrRequest\(req, res, url\)\)\) return;/);
});

test("CLI-13: a tela declara carregando, vazio, falha e negado de formas distintas", async () => {
  for (const marcador of ["role=\"alert\"", "role=\"status\"", "aria-busy", "cli13-fila-vazia", "cli13-fila-negado", "cli13-fila-erro", "cli13-fila-desatualizada", "cli13-fila-hora"]) {
    assert.ok(page.includes(marcador), `a tela precisa de ${marcador}`);
  }
  assert.match(page, /estaVazia\(pedidos\)/, "vazio só depois de leitura concluída");
  assert.doesNotMatch(page, /Decisão recusada:/, "o código cru do servidor não volta para a frase");
  assert.doesNotMatch(page, /data\.error \|\| "erro"/, "código cru interpolado na tela");
  assert.match(page, /traduzirErroEscrita/, "erro de escrita precisa passar pelo vocabulário");
  assert.match(page, /validarMotivo/, "o motivo é validado antes de enviar");
  assert.match(page, /disabled=\{pedidos\.carregando\}/, "o atualizar vira leitura única enquanto lê");
  // Nada de `<main>` aninhado no shell do AdminGate (UX-PRO-E6).
  assert.doesNotMatch(page, /<main[\s>]/);
  // O CSS novo cobre os dois temas.
  for (const classe of [".stateError", ".stateDenied", ".retryButton", ".readStamp"]) {
    assert.ok(css.includes(classe), `o CSS precisa de ${classe}`);
  }
  assert.match(css, /html\[data-admin-theme="night"\][^}]*stateError/s);
  // E27: a guarda precisa estar listada no `test:unit`.
  assert.ok(pkg.scripts["test:unit"].includes("tests/ux-pro-06-cli13-fila-acesso-estados.test.mjs"));
});
