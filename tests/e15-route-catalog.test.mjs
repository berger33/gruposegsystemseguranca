// E15 — paridade entre a tabela canônica de rotas e o despacho real de `server.mjs`.
//
// O defeito estrutural que este teste ataca não é um bug pontual: é a
// possibilidade de a BORDA (`API_PATH_MATCH`, que decide "isto é API?") e o
// DESPACHO (`routeApi`, que decide "qual handler?") divergirem sem que nada
// perceba. Um caminho só no despacho é código inalcançável (o Next responde);
// um caminho só na borda termina em 404 interno. Ambos são invisíveis em
// revisão de diff, porque cada linha isolada parece correta.
//
// ADITIVO POR CONSTRUÇÃO: nada aqui importa, executa ou altera `server.mjs`.
// O teste lê o texto, reconstrói o catálogo e compara com o JSON versionado.
// Sem banco, sem rede, sem Next, sem fixture.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  construirCatalogo,
  catalogoParaJson,
  lerServidor,
  prefixoLiteral,
  regraAlcancavel,
  regraCasa,
  regraCobre,
  recortarArrow,
  recortarFuncao,
  extrairRegras,
  serializarCatalogo,
} from "../src/server/route-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGO = "docs/E15-ROTAS-CATALOGO-2026-11-02.json";

const catalogo = async () => construirCatalogo(await lerServidor(root));

// ---------------------------------------------------------------------------
// Controle positivo: o extrator precisa ACHAR o que existe
// ---------------------------------------------------------------------------
test("E15: o extrator encontra a borda e o despacho, não um arquivo vazio", async () => {
  const c = await catalogo();
  // Limites inferiores grosseiros: se o recorte de função quebrar, o resultado
  // vira 0 (ou punhado) e os testes abaixo passariam por vacuidade. Estes
  // números são a âncora contra "verde no vazio".
  assert.ok(c.resumo.borda.regras > 1000,
    `borda com poucas regras (${c.resumo.borda.regras}): o recorte de ${c.borda.funcao} provavelmente quebrou`);
  assert.ok(c.resumo.despacho.regras > 1000,
    `despacho com poucas regras (${c.resumo.despacho.regras}): o recorte de ${c.despacho.funcao} provavelmente quebrou`);
  assert.ok(c.resumo.despacho.modulos > 50,
    `poucos módulos identificados (${c.resumo.despacho.modulos})`);
  // A borda precisa vir ANTES do despacho no arquivo? Não: ela vem depois.
  // O que importa é que os dois recortes não se sobreponham.
  assert.ok(c.borda.linhas[0] > c.despacho.linhas[1],
    "os recortes de borda e despacho se sobrepõem: o extrator está lendo o mesmo trecho duas vezes");
});

test("E15: amostras conhecidas do despacho casam com o texto real de server.mjs", async () => {
  const source = await lerServidor(root);
  const linhas = source.split("\n");
  const c = await catalogo();
  const porCaminho = new Map(c.despacho.regras.map((r) => [r.caminho ?? r.pattern, r]));

  // Escolhidas por cobrirem as três formas de casamento do despacho.
  const amostras = [
    ["/api/crm/commercial-versions", (l) => l.includes('url.pathname === "/api/crm/commercial-versions"')],
    ["/api/hr/", (l) => l.includes('url.pathname.startsWith("/api/hr/")')],
    ["^\\/api\\/admin\\/leads\\/([0-9a-f-]{36})$", (l) => l.includes("url.pathname.match(/^\\/api\\/admin\\/leads\\/([0-9a-f-]{36})$/i)")],
  ];
  for (const [chave, casaTexto] of amostras) {
    const regra = porCaminho.get(chave);
    assert.ok(regra, `regra ausente do catálogo: ${chave}`);
    const linha = linhas[regra.linha - 1] ?? "";
    assert.ok(casaTexto(linha),
      `linha ${regra.linha} não corresponde a ${chave}: ${JSON.stringify(linha.trim().slice(0, 120))}`);
  }
});

test("E15: o casamento por regra responde certo nos quatro tipos", () => {
  const exato = { tipo: "exato", caminho: "/api/a" };
  const prefixo = { tipo: "prefixo", caminho: "/api/b/" };
  const regex = { tipo: "regex", pattern: "^\\/api\\/c\\/([0-9a-f-]{36})$", flags: "i" };
  assert.equal(regraCasa(exato, "/api/a"), true);
  assert.equal(regraCasa(exato, "/api/a/"), false, "comparação exata não pode aceitar subcaminho");
  assert.equal(regraCasa(prefixo, "/api/b/1"), true);
  assert.equal(regraCasa(prefixo, "/api/b"), false, "prefixo com barra final não casa o próprio nó");
  assert.equal(regraCasa(regex, "/api/c/00000000-0000-0000-0000-000000000000"), true);
  assert.equal(regraCasa(regex, "/api/c/nao-uuid"), false);
  // Cobertura: prefixo cobre exato dentro dele; regex não afirma cobertura.
  assert.equal(regraCobre(prefixo, exato), false);
  assert.equal(regraCobre({ tipo: "prefixo", caminho: "/api/" }, exato), true);
  assert.equal(regraCobre(regex, exato), false, "regex nunca é declarada como cobertura total");
});

test("E15: o prefixo literal de uma regex é o que ela obriga", () => {
  assert.equal(prefixoLiteral({ tipo: "regex", pattern: "^\\/api\\/admin\\/leads\\/([0-9a-f-]{36})$", flags: "i" }),
    "/api/admin/leads/");
  assert.equal(prefixoLiteral({ tipo: "exato", caminho: "/api/x" }), "/api/x");
  assert.equal(prefixoLiteral({ tipo: "regex", pattern: "^(?:a|b)", flags: "" }), "",
    "regex sem prefixo literal não pode inventar um");
});

// ---------------------------------------------------------------------------
// Controle negativo: a divergência TEM de ser detectada
// ---------------------------------------------------------------------------
test("E15: divergência sintética é detectada nas duas direções", async () => {
  const source = await lerServidor(root);
  const injetado = source.replace(
    `  if (url.pathname === "/api/crm/commercial-versions") return commercialHistoryApi(req,res);`,
    `  if (url.pathname === "/api/crm/commercial-versions") return commercialHistoryApi(req,res);
  if (url.pathname === "/api/e15/sonda-inalcancavel") return commercialHistoryApi(req,res);`,
  );
  assert.notEqual(injetado, source, "a sonda não conseguiu injetar a rota: o teste perderia o sentido");
  const comSonda = construirCatalogo(injetado);
  const semSonda = await catalogo();
  assert.equal(comSonda.resumo.inalcancaveis, semSonda.resumo.inalcancaveis + 1,
    "rota injetada só no despacho precisa aparecer como inalcançável");
  assert.ok(comSonda.divergencias.inalcancaveis.some((r) => r.caminho === "/api/e15/sonda-inalcancavel"),
    "a sonda precisa ser nomeada na divergência");

  const bordaComSonda = source.replace(
    `const API_PATH_MATCH = pathname =>`,
    `const API_PATH_MATCH = pathname =>
  pathname === "/api/e15/sonda-orfa"`,
  );
  assert.notEqual(bordaComSonda, source);
  const orfa = construirCatalogo(bordaComSonda);
  assert.equal(orfa.resumo.bordaSemDespacho, semSonda.resumo.bordaSemDespacho + 1,
    "caminho só na borda precisa aparecer como borda sem despacho");
  assert.ok(orfa.divergencias.bordaSemDespacho.some((r) => r.caminho === "/api/e15/sonda-orfa"));
});

test("E15: forma de comparação desconhecida falha em vez de sumir", () => {
  const fonte = [
    "function sonda(pathname) {",
    '  if (pathname === "/api/a") return x(req, res);',
    "  if (pathname.toLowerCase() === \"/api/b\") return y(req, res);",
    "}",
  ].join("\n");
  const { regras, avisos } = extrairRegras(fonte, { fonte: "sonda", modo: "edge", limiteLinhas: 100 });
  // Só a forma reconhecida vira regra: `pathname.toLowerCase() === …` não é
  // lida como caminho literal — vira aviso, que é o comportamento desejado.
  assert.deepEqual(regras.map((r) => r.caminho), ["/api/a"]);
  assert.equal(regras[0].linha, 102, "linha precisa ser ABSOLUTA, não relativa ao trecho");
  assert.equal(avisos.length, 1,
    "forma não reconhecida precisa gerar aviso: ignorar em silêncio esconde rota do catálogo");
  assert.equal(avisos[0].linha, 103);
  assert.equal(avisos[0].motivo, "forma de comparação desconhecida");
});

// ---------------------------------------------------------------------------
// Paridade com o código versionado
// ---------------------------------------------------------------------------
test("E15: o catálogo versionado confere com server.mjs", async () => {
  const versionado = await readFile(path.join(root, CATALOGO), "utf8").catch(() => null);
  assert.ok(versionado, `catálogo ausente: ${CATALOGO}`);
  assert.equal(versionado, catalogoParaJson(await catalogo()),
    `o catálogo está desatualizado. Rode \`node scripts/e15-route-catalog.mjs\` e revise o diff.`);
});

test("E15: nenhuma regra fica sem classificação nem sem linha real", async () => {
  const c = await catalogo();
  const source = await lerServidor(root);
  const linhas = source.split("\n");
  for (const regra of [...c.borda.regras, ...c.despacho.regras, ...c.legado.regras]) {
    assert.ok(["exato", "prefixo", "regex"].includes(regra.tipo), `tipo inesperado: ${regra.tipo}`);
    assert.ok(Number.isInteger(regra.linha) && regra.linha > 0, `linha inválida em ${regra.caminho ?? regra.pattern}`);
    assert.ok(linhas[regra.linha - 1] !== undefined, `linha ${regra.linha} não existe em server.mjs`);
    if (regra.tipo !== "regex") {
      assert.ok(regra.caminho.startsWith("/"), `caminho não absoluto: ${regra.caminho}`);
    }
  }
  for (const regra of c.despacho.regras) {
    assert.ok(["handler", "pre-auth"].includes(regra.classe), `classe de despacho inesperada: ${regra.classe}`);
    if (regra.classe === "handler") {
      assert.ok(regra.provedor, `regra de handler sem provedor na linha ${regra.linha}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Congelamento das divergências (o número não pode piorar em silêncio)
// ---------------------------------------------------------------------------
test("E15: as divergências medidas não aumentam sem decisão explícita", async () => {
  const c = await catalogo();
  // Congelado em 02/11 sobre `8a221a5`. Aumentar qualquer um destes números é
  // regressão de estrutura: exige atualizar este teste NA MESMA PR e dizer no
  // relatório qual rota ficou inalcançável ou sombreada.
  assert.equal(c.resumo.bordaSemDespacho, 0,
    "caminho na borda sem despacho termina em 404 interno");
  assert.equal(c.resumo.avisos, 0,
    "forma de comparação não reconhecida: o parser precisa cobrir a nova forma antes de o catálogo valer");
  assert.ok(c.resumo.inalcancaveis <= 3,
    `inalcançáveis subiu para ${c.resumo.inalcancaveis}: ${c.divergencias.inalcancaveis.map((r) => r.caminho).join(", ")}`);
  assert.ok(c.resumo.sombreadas <= 12,
    `sombreadas subiu para ${c.resumo.sombreadas}`);
});

test("E15: cada divergência nomeada está publicada no relatório datado", async () => {
  const c = await catalogo();
  const relatorio = await readFile(
    path.join(root, "docs/E15-CATALOGO-CANONICO-DE-ROTAS-2026-11-02.md"), "utf8").catch(() => null);
  assert.ok(relatorio, "o relatório datado da fatia precisa existir");
  const nomeadas = [
    ...c.divergencias.inalcancaveis.map((r) => r.caminho ?? r.pattern),
    ...c.divergencias.sombreadas.map((r) => r.caminho ?? r.pattern),
  ];
  const ausentes = nomeadas.filter((caminho) => !relatorio.includes(caminho));
  assert.deepEqual(ausentes, [],
    `divergência medida sem registro no relatório (número sem nome é número sem dono): ${ausentes.join(", ")}`);
});

test("E15: as rotas declaradas intencionais são exatamente as que o código diz", async () => {
  const c = await catalogo();
  const intencionais = c.divergencias.sombreadas.filter((d) => d.intencional);
  // Só entra aqui quem tem comentário no código declarando histórico/alcance.
  // Qualquer inclusão nova precisa de nota no código — não de decisão no teste.
  assert.deepEqual(intencionais.map((d) => d.caminho), [
    "/api/crm/contracts/from-proposal",
    "/api/crm/contracts",
    "/api/client/visits",
  ], "a lista de sombreadas declaradas intencionais mudou");
  for (const item of intencionais) {
    assert.ok(item.nota || item.notaCobertura, "intencional sem nota no código é suposição");
  }
});

test("E15: o catálogo serializado é estável entre duas leituras", async () => {
  const a = serializarCatalogo(await catalogo());
  const b = serializarCatalogo(await catalogo());
  assert.deepEqual(a, b, "a serialização precisa ser determinística para o --check valer");
  assert.equal(a.schema, "e15-route-catalog/1");
  assert.deepEqual(a.colunas_regra, ["tipo", "caminho", "modulo", "linha", "provedor"]);
});

// ---------------------------------------------------------------------------
// Guarda de não-regressão do próprio recorte
// ---------------------------------------------------------------------------
test("E15: recortes não engolem o resto do arquivo", async () => {
  const source = await lerServidor(root);
  const borda = recortarArrow(source, "const API_PATH_MATCH = pathname =>");
  const despacho = recortarFuncao(source, "async function routeApi(req, res) {");
  assert.ok(borda && despacho);
  // A borda NÃO é dona das rotas internas: se o recorte voltar a incluir
  // `routeApi`, as duas leituras mediriam o mesmo trecho e o catálogo mentiria.
  assert.ok(!/async function routeApi/.test(borda.text), "o recorte da borda engoliu routeApi");
  assert.ok(!/const API_PATH_MATCH/.test(despacho.text), "o recorte do despacho engoliu a borda");
  assert.ok(despacho.ultimaLinha < borda.primeiraLinha,
    `os dois recortes se sobrepõem (${despacho.ultimaLinha} >= ${borda.primeiraLinha})`);
  assert.ok(borda.text.trimEnd().endsWith(";"), "a borda precisa terminar com `;`");
  // Guarda de sanidade: há caminho legítimo nos DOIS lados (ex.: /api/site-visual,
  // despachado na linha 2621 e declarado na borda). Exigir exclusividade entre
  // os conjuntos seria falso: o que não pode é o recorte se sobrepor. Por isso
  // a interseção é medida, não proibida.
  const c = await catalogo();
  const caminhosDespacho = new Set(c.despacho.regras.filter((r) => r.tipo === "exato").map((r) => r.caminho));
  const caminhosBorda = new Set(c.borda.regras.filter((r) => r.tipo === "exato").map((r) => r.caminho));
  const comuns = [...caminhosDespacho].filter((p) => caminhosBorda.has(p));
  assert.ok(comuns.length > 100, `poucos caminhos em comum (${comuns.length}): recortes suspeitos`);
});

// ---------------------------------------------------------------------------
// Prova executável: o catálogo concorda com a FUNÇÃO REAL da borda
// ---------------------------------------------------------------------------
// Ler `server.mjs` como texto sempre deixa dúvida: "o parser entendeu mesmo?".
// Aqui a cadeia de `API_PATH_MATCH` é extraída, virou função de verdade
// (só depende de `pathname`, sem I/O) e é executada. O veredito do catálogo
// para cada caminho exato tem de coincidir com o veredito da função. Isso
// transforma "não está na lista" em fato executado, não em leitura de texto.
function bordaExecutavel(source) {
  const declaracao = "const API_PATH_MATCH = pathname =>";
  const inicio = source.indexOf(declaracao);
  assert.notEqual(inicio, -1, "declaração da borda não encontrada");
  const linhas = source.slice(inicio).split("\n");
  const forma = /^\s*(?:\|\||const\s+API_PATH_MATCH\b|pathname\b|\/\/|$)/;
  let consumidas = 1;
  for (let i = 1; i < linhas.length; i += 1) {
    if (!forma.test(linhas[i])) break;
    consumidas += 1;
    if (/;\s*$/.test(linhas[i])) break;
  }
  const corpo = linhas.slice(0, consumidas).join("\n").trim()
    .slice(declaracao.length).trim().replace(/;$/, "");
  assert.match(corpo, /^pathname\b/, "o corpo extraído precisa começar por `pathname`");
  return new Function("pathname", `return (${corpo});`); // eslint-disable-line no-new-func
}

test("E15: todo caminho exato do despacho tem o mesmo veredito na borda real", async () => {
  const source = await lerServidor(root);
  const naBorda = bordaExecutavel(source);
  const c = await catalogo();
  const exatos = c.despacho.regras.filter((r) => r.tipo === "exato");
  assert.ok(exatos.length > 1000, `amostra insuficiente (${exatos.length})`);
  const divergentes = exatos
    .filter((r) => Boolean(naBorda(r.caminho)) !== r.alcancavel)
    .map((r) => `${r.caminho} (borda=${naBorda(r.caminho)}, catálogo=${r.alcancavel})`);
  assert.deepEqual(divergentes, [],
    `o catálogo discorda da função real da borda: ${divergentes.slice(0, 5).join(", ")}`);
});

test("E15: as três rotas medidas como inalcançáveis são de fato barradas pela borda", async () => {
  const source = await lerServidor(root);
  const naBorda = bordaExecutavel(source);
  // Achado datado de 02/11: existem no despacho e NÃO passam a borda — a
  // requisição nunca chega ao handler, cai no Next (página/404), não no roteador.
  for (const caminho of [
    "/api/crm/management-diary",
    "/api/crm/management-diary/search",
    "/api/admin/ai-rag-directory-sources",
  ]) {
    assert.equal(naBorda(caminho), false,
      `${caminho} passou a ser reconhecido pela borda: o catálogo precisa ser regenerado e o achado reavaliado`);
  }
  // Controle positivo no mesmo teste: a borda NÃO barra tudo — se barrasse,
  // o teste acima passaria por vacuidade.
  assert.equal(naBorda("/api/crm/commercial-versions"), true);
});

// ---------------------------------------------------------------------------
// Decisão das 9 sombreadas "a revisar" (02/11) — congelada, NÃO executada
// ---------------------------------------------------------------------------
// O catálogo mede 12 sombreadas: 3 o próprio código declara intencionais e 9
// ficaram "a revisar". A revisão foi feita caso a caso e o resultado vive em
// JSON versionado. O que estes testes congelam é a DECISÃO e a evidência que a
// sustenta — não a execução: nenhuma regra foi removida e `server.mjs` não foi
// tocado. Se o código mudar a ponto de inverter uma decisão, o teste falha e
// obriga a rever, em vez de deixar um documento mentir em silêncio.
const DECISOES = "docs/E15-SOMBREADAS-DECISAO-2026-11-02.json";
const VOCABULARIO_DECISAO = new Set(["manter_rota", "remover_regra", "remover_alias"]);

const decisoes = async () => JSON.parse(await readFile(path.join(root, DECISOES), "utf8"));

test("E15: as 9 sombreadas 'a revisar' estão decididas uma por uma", async () => {
  const d = await decisoes();
  const c = await catalogo();
  assert.equal(d.schema, "e15-sombreadas-decisao/1");
  assert.equal(d.executado_nesta_fatia, false,
    "esta fatia DECIDE; remover regra do despacho exige autorização própria");

  const medidas = c.divergencias.sombreadas.filter((s) => !s.intencional);
  const intencionais = c.divergencias.sombreadas.filter((s) => s.intencional);
  assert.equal(medidas.length, 9, "o número de sombreadas a revisar mudou: revise a decisão");
  assert.equal(d.a_revisar, medidas.length);
  assert.equal(d.total_sombreadas, c.divergencias.sombreadas.length);
  assert.equal(d.declaradas_intencionais, intencionais.length);

  // Mesmo conjunto, pela chave que o catálogo usa: caminho + linha.
  const chave = (x) => `${x.caminho}@${x.linha}`;
  assert.deepEqual(d.decisoes.map(chave).sort(), medidas.map(chave).sort(),
    "a decisão precisa cobrir exatamente as 9 medidas — nem a mais, nem a menos");

  for (const item of d.decisoes) {
    assert.ok(VOCABULARIO_DECISAO.has(item.decisao), `decisão fora do vocabulário: ${item.decisao}`);
    const medido = medidas.find((m) => chave(m) === chave(item));
    assert.ok(medido, `decisão sobre caminho que o catálogo não mede: ${chave(item)}`);
    assert.equal(item.modulo, medido.modulo, `módulo divergente em ${chave(item)}`);
    assert.equal(item.cobertaPorLinha, medido.cobertaPorLinha, `linha de cobertura divergente em ${chave(item)}`);
    assert.equal(item.cobertaPorModulo, medido.cobertaPorModulo);
    assert.ok(["alcançavel", "sombreada"].includes(item.classe_real),
      `natureza da sombra precisa ser declarada em ${chave(item)}`);
    assert.ok((item.motivo ?? "").length > 40, `motivo vazio não é decisão: ${chave(item)}`);
    assert.ok((item.prova ?? "").length > 20, `decisão sem prova é opinião: ${chave(item)}`);
  }

  // O placar da decisão é parte do retrato: 4 manter, 3 regras e 2 aliases a remover.
  const contar = (v) => d.decisoes.filter((x) => x.decisao === v).length;
  assert.equal(contar("manter_rota"), 4);
  assert.equal(contar("remover_regra"), 3);
  assert.equal(contar("remover_alias"), 2);
});

test("E15: as 4 rotas de integrações sombreadas são falso positivo medido, não código morto", async () => {
  const source = await lerServidor(root);
  const linhas = source.split("\n");
  const modulo = await readFile(path.join(root, "src/server/integrations-api.mjs"), "utf8");
  const setLiteral = modulo.match(/INTEGRATION_ROUTE_SUBPATHS\s*=\s*new Set\(\[([^\]]*)\]\)/);
  assert.ok(setLiteral, "o Set de subcaminhos reservados desapareceu de integrations-api.mjs");
  const reservados = [...setLiteral[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(reservados, ["jobs", "logs", "reconciliation", "webhooks"],
    "o Set é a razão de as 4 regras serem alcançáveis: mudá-lo inverte a decisão");

  // A prova é a NEGAÇÃO: sem ela, o padrão `/:id` engole o subcaminho (405 do PLT-03).
  const indiceGuarda = linhas.findIndex((l) => /!\s*INTEGRATION_ROUTE_SUBPATHS\.has\(/.test(l));
  assert.ok(indiceGuarda > 0,
    "o guard de negação sumiu: os quatro painéis voltariam a responder 405 e as 4 regras virariam código morto");

  const d = await decisoes();
  const itens = d.decisoes.filter((x) => x.caminho.startsWith("/api/admin/integrations/"));
  assert.equal(itens.length, 4);
  for (const item of itens) {
    assert.equal(item.decisao, "manter_rota");
    assert.equal(item.classe_real, "alcançavel");
    assert.ok(item.linha > indiceGuarda + 1,
      `a regra literal ${item.caminho} precisa vir depois do guard que desvia o padrão /:id`);
    assert.match(linhas[item.linha], /integrationLogApi\.handle/,
      `a linha seguinte à condição precisa despachar o módulo de registros: ${item.caminho}`);
  }
});

test("E15: journey-corrections é sombra real — a fronteira L03 responde antes", async () => {
  const source = await lerServidor(root);
  const linhas = source.split("\n");
  const d = await decisoes();
  const itens = d.decisoes.filter((x) => x.caminho.endsWith("/journey-corrections"));
  assert.equal(itens.length, 3);

  for (const item of itens) {
    assert.equal(item.decisao, "remover_regra");
    assert.equal(item.classe_real, "sombreada");
    assert.ok(linhas[item.cobertaPorLinha - 1].includes(`"${item.caminho}"`),
      `a linha ${item.cobertaPorLinha} deveria casar ${item.caminho}`);
    assert.ok(item.cobertaPorLinha < item.linha, "a cobertura precisa vir antes da regra morta");
    assert.match(linhas[item.linha], /empPortalApi\.handleJourneyCorrections/,
      `a regra morta ${item.linha + 1} deveria despachar empPortalApi.handleJourneyCorrections`);
  }

  // O bloco que cobre retorna sem condição adicional: é isso que torna a sombra real.
  const bloco = linhas.slice(itens[0].cobertaPorLinha - 6, itens[0].cobertaPorLinha + 8).join("\n");
  assert.match(bloco, /return await employeeApi\.handle\(/, "o bloco L03 precisa despachar employeeApi.handle");
  assert.ok(!/!\s*\[[^\]]*\]\.includes\(/.test(bloco), "negação no bloco L03 mudaria a decisão: revise");

  // Removida a regra, o handler fica órfão: hoje ele só aparece no próprio despacho.
  const despachos = linhas.filter((l) => /empPortalApi\.handleJourneyCorrections\s*\(/.test(l));
  assert.equal(despachos.length, 1,
    "passou a haver segundo despacho de empPortalApi.handleJourneyCorrections: a decisão de remoção precisa ser revista");
});

test("E15: /api/faq-assisted é sombra parcial — dois aliases mortos, handler vivo", async () => {
  const source = await lerServidor(root);
  const linhas = source.split("\n");
  const d = await decisoes();
  const itens = d.decisoes.filter((x) => x.caminho.endsWith("/faq-assisted"));
  assert.equal(itens.length, 2);

  for (const item of itens) {
    assert.equal(item.decisao, "remover_alias",
      "o handler é vivo pelos outros três caminhos: o que morre é o alias, não o despacho");
    assert.equal(item.classe_real, "sombreada");
    assert.ok(linhas[item.cobertaPorLinha - 1].includes(`"${item.caminho}"`),
      `a linha ${item.cobertaPorLinha} deveria casar ${item.caminho}`);
    assert.ok(item.cobertaPorLinha < item.linha, "a cobertura precisa vir antes da regra sombreada");
  }

  // A condição da regra sombreada tem CINCO caminhos; três continuam vivos e não podem sair.
  const condicao = linhas[itens[0].linha - 1];
  for (const vivo of ["/api/pub/faq-sessions", "/api/admin/faq-assisted-sessions", "/api/admin/pub-faq-sessions"]) {
    assert.ok(condicao.includes(`"${vivo}"`), `caminho vivo sumiu da condição: ${vivo}`);
  }
  assert.match(linhas[itens[0].linha], /pubFaqAssistedApi\.handleSessions/,
    "o handler precisa continuar despachado — remover handler seria mudança de comportamento");
  // Um único ponto de despacho: se surgir outro, a sombra parcial deixou de ser parcial.
  assert.equal(linhas.filter((l) => /pubFaqAssistedApi\.handleSessions\s*\(/.test(l)).length, 1);
});
