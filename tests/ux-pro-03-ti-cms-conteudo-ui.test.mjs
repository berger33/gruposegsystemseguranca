// UX-PRO-03 — 13ª promoção "com prova": o CMS (PUB-06) deixa de ser órfão e
// vira a 26ª aba do TiConsole ("Conteúdo do site").
//
// Dois defeitos do protótipo que esta guarda trava:
//
//  1. as transições chamavam `PATCH /api/admin/cms-contents` (sem id), rota que
//     o servidor recusa com 405 `method_not_allowed` — os botões de revisão,
//     aprovação, publicação, arquivamento e reversão nunca funcionaram;
//  2. o detalhe lia `detail.content`, mas a API devolve o registro PLANO com
//     `versions` e `history` — a tela mostrava `undefined`.
//
// Além disso: leitura que engole falha (`.catch(()=>({items:[]}))`), motivo via
// `prompt()`, erro cru e ausência de validação antes de enviar.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const componente = await read("src/app/admin/ti/CmsClient.tsx");
const css = await read("src/app/admin/ti/CmsClient.module.css");
const consoleTi = await read("src/app/admin/ti/TiConsole.tsx");
const servidor = await read("src/server/cms-api.mjs");
const pkg = JSON.parse(await read("package.json"));

async function modulo() {
  const ts = await read("src/app/admin/ti/cms-content-state.ts");
  const js = stripTypeScriptTypes(ts);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const estado = await modulo();

const conteudo = overrides => ({
  id: "11111111-1111-4111-8111-111111111111", slug: "quem-somos", title: "Quem somos",
  excerpt: null, content: "x".repeat(60), content_type: "pagina", version: 1,
  status: "rascunho", is_published: false, is_authorized: false,
  seo_title: null, seo_description: null, ...overrides,
});

test("CMS: a máquina de estados da tela espelha a do servidor", () => {
  const NEXT = { rascunho: ["em_revisao"], em_revisao: ["aprovado", "rejeitado"], aprovado: ["publicado", "arquivado"], publicado: ["arquivado"], rejeitado: ["arquivado"], arquivado: [] };
  for (const [status, destinos] of Object.entries(NEXT)) {
    assert.deepEqual(estado.proximosEstados(status), destinos, `transições de ${status} divergem do servidor`);
  }
  assert.deepEqual(estado.proximosEstados("inexistente"), [], "status desconhecido não inventa transição");
  // A fonte da verdade é o arquivo do servidor: se a máquina mudar lá, cai aqui.
  for (const status of Object.keys(NEXT)) assert.ok(servidor.includes(`${status}:[`), `servidor precisa declarar ${status}`);
  assert.match(servidor, /publicado:\['arquivado'\]/);
});

test("CMS: case sem autorização não pode ser publicado", () => {
  assert.equal(estado.podePublicar(conteudo({ status: "aprovado", content_type: "case", is_authorized: false })), false);
  assert.equal(estado.podePublicar(conteudo({ status: "aprovado", content_type: "case", is_authorized: true })), true);
  assert.equal(estado.podePublicar(conteudo({ status: "aprovado", content_type: "pagina" })), true);
  assert.equal(estado.podePublicar(conteudo({ status: "rascunho" })), false, "rascunho não publica direto");
});

test("CMS: 403 na listagem é NEGADO explícito, nunca lista vazia", () => {
  const negado = estado.classificarLista(403, { error: "role_required" });
  assert.equal(negado.situacao, "negado");
  assert.deepEqual(negado.itens, []);
  assert.match(negado.mensagem, /indispon/i, "negação não é ausência de conteúdo");
  assert.equal(estado.classificarLista(401, {}).situacao, "negado");
});

test("CMS: corpo inválido é INVÁLIDO e vazio legítimo é VAZIO", () => {
  assert.equal(estado.classificarLista(200, {}).situacao, "invalido");
  assert.equal(estado.classificarLista(200, undefined).situacao, "invalido");
  assert.equal(estado.classificarLista(200, { items: [null] }).situacao, "invalido");
  assert.equal(estado.classificarLista(200, { items: [{ id: 1 }] }).situacao, "invalido");
  assert.equal(estado.classificarLista(200, { items: [] }).situacao, "vazio");
  const ok = estado.classificarLista(200, { items: [conteudo(), conteudo({ slug: "faq-1", version: 2 })] });
  assert.equal(ok.situacao, "ok");
  assert.equal(ok.itens.length, 2);
  assert.equal(estado.classificarLista(0, undefined).situacao, "falha");
  assert.equal(estado.classificarLista(500, {}).situacao, "falha");
});

test("CMS: o detalhe é o registro PLANO (o bug do protótipo não volta)", () => {
  const plano = { ...conteudo({ version: 3 }), versions: [{ version: 3 }, { version: 2 }], history: [{ next_version: 3 }] };
  const detalhe = estado.classificarDetalhe(200, plano);
  assert.equal(detalhe.situacao, "ok");
  assert.equal(detalhe.conteudo.slug, "quem-somos", "o conteúdo vem no topo, não em `content`");
  assert.equal(detalhe.versoes.length, 2);
  assert.equal(detalhe.historico.length, 1);
  assert.equal(estado.classificarDetalhe(404, {}).situacao, "falha");
  assert.equal(estado.classificarDetalhe(403, {}).situacao, "negado");
  assert.equal(estado.classificarDetalhe(200, { versions: [] }).situacao, "invalido");
  assert.match(detalhe.mensagem, /2 vers[ãa]o/i);
});

test("CMS: códigos de erro viram frase em português, sem código cru", () => {
  const casos = {
    invalid_slug: /slug/i, invalid_type: /tipo/i, invalid_transition: /n[ãa]o [ée] permitida/i,
    case_authorization_required: /autoriza[çc][ãa]o/i, create_revision_to_edit: /nova vers[ãa]o/i,
    slug_type_conflict: /já existe/i, not_found: /n[ãa]o encontrado/i, method_not_allowed: /m[ée]todo/i,
    role_required: /papel/i, same_origin_required: /origem/i,
  };
  for (const [codigo, esperado] of Object.entries(casos)) {
    const mensagem = estado.traduzirErroCms(400, codigo);
    assert.match(mensagem, esperado, `${codigo} precisa de mensagem própria`);
    assert.ok(!mensagem.includes(codigo), `${codigo} não pode vazar para a tela`);
  }
  assert.match(estado.traduzirErroCms(500, "boom_interno"), /servidor falhou/i);
  assert.match(estado.traduzirErroCms(409, "codigo_novo"), /recusada/i, "código desconhecido ainda vira frase");
});

test("CMS: motivo exige 10..1000 depois do trim", () => {
  assert.equal(estado.validarMotivo("curto").ok, false);
  assert.equal(estado.validarMotivo("  1234567890  ").motivo, "1234567890");
  assert.equal(estado.validarMotivo("x".repeat(1000)).ok, true);
  assert.equal(estado.validarMotivo("x".repeat(1001)).ok, false);
});

test("CMS: rascunho é validado ANTES de enviar, com as regras do servidor", () => {
  const base = { slug: "Quem-Somos", title: "Quem somos", excerpt: "", content: "x".repeat(60), content_type: "pagina", seo_title: "", seo_description: "", is_authorized: false, metadata: "", tags: "a, b" };
  const ok = estado.validarRascunho(base);
  assert.equal(ok.ok, true, JSON.stringify(ok.erros));
  assert.equal(ok.payload.slug, "quem-somos", "o slug é normalizado para minúsculas");
  assert.deepEqual(ok.payload.tags, ["a", "b"]);
  assert.equal(ok.payload.excerpt, null);

  assert.equal(estado.validarRascunho({ ...base, slug: "com espaço" }).ok, false);
  assert.equal(estado.validarRascunho({ ...base, slug: "ab" }).ok, false);
  assert.equal(estado.validarRascunho({ ...base, title: "abc" }).ok, false);
  assert.equal(estado.validarRascunho({ ...base, content: "curto" }).ok, false);
  assert.equal(estado.validarRascunho({ ...base, excerpt: "curto" }).ok, false);
  assert.equal(estado.validarRascunho({ ...base, seo_description: "curto" }).ok, false);
  assert.equal(estado.validarRascunho({ ...base, metadata: "{nao-json" }).ok, false);
  assert.equal(estado.validarRascunho({ ...base, content_type: "inexistente" }).ok, false);
});

test("CMS: a tela transiciona por PATCH /:id e nunca pela coleção", () => {
  assert.ok(componente.includes("/api/admin/cms-contents/${conteudo.id}"), "a transição precisa ir para o id");
  assert.match(componente, /\/api\/admin\/cms-contents\/\$\{[^`]+`,\s*"PATCH"/, "o PATCH precisa ser da rota com id");
  assert.ok(!/method:\s*"PATCH"[\s\S]{0,120}"\/api\/admin\/cms-contents"/.test(componente),
    "PATCH na coleção é 405 no servidor — o protótipo fazia isso");
  assert.match(componente, /\/api\/admin\/cms-contents\/revert/, "reversão usa a rota própria");
  assert.ok(!/prompt\(/.test(componente), "motivo não pode vir de prompt()");
  assert.match(componente, /validarMotivo/, "o motivo é validado antes de enviar");
  assert.match(componente, /validarRascunho/, "o rascunho é validado antes de enviar");
});

test("CMS: a tela declara estados e não engole falha", () => {
  assert.match(componente, /from "\.\/cms-content-state"/);
  assert.match(componente, /classificarLista/);
  assert.match(componente, /classificarDetalhe/);
  assert.match(componente, /role="alert"/);
  assert.match(componente, /data-testid="cms-faixa"/);
  assert.match(componente, /aria-busy=\{lendo\}/);
  assert.ok(!/\.catch\(\(\)=>\(\{\s*\w+\s*:\s*\[\]\s*\}\)\)/.test(componente), "nenhuma leitura cai em lista vazia");
  assert.ok(!/e\.message/.test(componente), "mensagem de exceção crua não vai para a tela");
  assert.match(componente, /data-testid="cms-transicoes"/);
  assert.match(componente, /data-testid="cms-estado-lista"/);
});

test("CMS: a aba existe, é dinâmica, está no grupo certo e o console tem 29 abas", () => {
  const declaracao = consoleTi.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? "";
  const abas = [...declaracao.matchAll(/\['([a-z0-9_]+)','([^']+)'\]/g)].map(item => item[1]);
  assert.equal(abas.length, 29, "as promoções levam o console de 25 para 29 abas");
  assert.ok(abas.includes("cms"));
  assert.match(consoleTi, /const CmsClient=dynamic\(\(\)=>import\('\.\/CmsClient'\)\);/);
  assert.match(consoleTi, /\{active==='cms'&&<CmsClient\/>\}/);
  assert.match(consoleTi, /name:'Experiência e comunicação',keys:\['avisos','visual','cliente','cms','seo','plt_notificacoes'\]/);
  assert.match(pkg.scripts["test:unit"], /tests\/ux-pro-03-ti-cms-conteudo-ui\.test\.mjs/);
});

test("CMS: CSS por tokens, sem hex, com foco visível e breakpoint", () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css));
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:740px\)/);
  assert.match(css, /var\(--ux-color-border\)/);
});
