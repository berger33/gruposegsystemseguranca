// UX-PRO-03 — 14ª promoção "com prova": SEO técnico (PUB-08) deixa de ser órfão
// e vira a 27ª aba do TiConsole ("SEO e domínios").
//
// O protótipo tinha três problemas que esta guarda trava:
//
//  1. formulário de sitemap que gravava em `/api/admin/seo-sitemap` — a rota
//     virou prévia derivada e só aceita GET (POST = 405);
//  2. leituras em `.catch(()=>({items:[]}))` e erro cru na tela;
//  3. promessa de "publicar após domínio verificado" quando o servidor RECUSA
//     declarar domínio verificado (`domain_verification_not_supported`) e
//     recusa publicar com noindex (`cannot_publish_with_noindex`).

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const componente = await read("src/app/admin/ti/SeoClient.tsx");
const css = await read("src/app/admin/ti/SeoClient.module.css");
const consoleTi = await read("src/app/admin/ti/TiConsole.tsx");
const apiSeo = await read("src/server/seo-api.mjs");
const apiTecnica = await read("src/server/seo-technical-api.mjs");
const pkg = JSON.parse(await read("package.json"));

async function modulo() {
  const ts = await read("src/app/admin/ti/seo-console-state.ts");
  const js = stripTypeScriptTypes(ts);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const estado = await modulo();

test("SEO: as três regras do servidor estão traduzidas, sem código cru", () => {
  assert.match(estado.traduzirErroSeo(400, "cannot_publish_with_noindex"), /noindex/i);
  assert.match(estado.traduzirErroSeo(400, "cannot_publish_with_noindex"), /verifica/i);
  assert.match(estado.traduzirErroSeo(400, "domain_verification_not_supported"), /n[ãa]o [ée] execut[áa]vel/i);
  assert.match(estado.traduzirErroSeo(409, "duplicate_path"), /já existe/i);
  assert.match(estado.traduzirErroSeo(409, "duplicate_domain"), /já est[áa] cadastrado/i);
  assert.match(estado.traduzirErroSeo(400, "server_managed_fields"), /servidor/i);
  assert.match(estado.traduzirErroSeo(400, "invalid_priority"), /0 e 1/);
  for (const codigo of ["cannot_publish_with_noindex", "domain_verification_not_supported", "duplicate_path", "server_managed_fields"]) {
    assert.ok(!estado.traduzirErroSeo(400, codigo).includes(codigo), `${codigo} não pode vazar`);
  }
  assert.match(estado.traduzirErroSeo(500, "boom"), /servidor falhou/i);
});

test("SEO: as regras continuam existindo no servidor (não só na tela)", () => {
  assert.match(apiSeo, /cannot_publish_with_noindex/);
  assert.match(apiSeo, /domain_verification_not_supported/);
  assert.match(apiTecnica, /method_not_allowed/);
  assert.match(apiTecnica, /derived: true/, "o sitemap administrativo é prévia derivada");
});

test("SEO: 403 é NEGADO e não vira lista vazia", () => {
  const negado = estado.classificarLista(403, { error: "forbidden" }, "configurações de SEO");
  assert.equal(negado.situacao, "negado");
  assert.deepEqual(negado.itens, []);
  assert.match(negado.mensagem, /indispon[íi]vel/i);
  assert.equal(estado.classificarLista(401, {}, "x").situacao, "negado");
});

test("SEO: inválido, vazio e ok são distintos", () => {
  assert.equal(estado.classificarLista(200, {}, "x").situacao, "invalido");
  assert.equal(estado.classificarLista(200, { items: [null] }, "x").situacao, "invalido");
  assert.equal(estado.classificarLista(200, { items: [] }, "x").situacao, "vazio");
  const ok = estado.classificarLista(200, { items: [{ path: "/a" }, { path: "/b" }] }, "x");
  assert.equal(ok.situacao, "ok");
  assert.equal(ok.itens.length, 2);
  assert.equal(estado.classificarLista(0, undefined, "x").situacao, "falha");
});

test("SEO: a prévia do sitemap declara liberado ou não, e exige caminhos/robots/xml", () => {
  const bloqueado = estado.classificarPreviaSitemap(200, { released: false, paths: ["/", "/servicos"], robots: "User-agent: *\nDisallow: /", xml: "<urlset/>", origin: "http://x", note: "prévia" });
  assert.equal(bloqueado.situacao, "ok");
  assert.equal(bloqueado.liberado, false);
  assert.match(bloqueado.mensagem, /N[ÃA]O publicado/i);
  const liberado = estado.classificarPreviaSitemap(200, { released: true, paths: ["/"], robots: "User-agent: *", xml: "<urlset/>" });
  assert.equal(liberado.liberado, true);
  assert.match(liberado.mensagem, /liberado/i);
  assert.equal(estado.classificarPreviaSitemap(200, { released: true }).situacao, "invalido");
  assert.equal(estado.classificarPreviaSitemap(405, {}).situacao, "falha");
  assert.equal(estado.classificarPreviaSitemap(403, {}).situacao, "negado");
});

test("SEO: publicar é declarado inalcançável sem domínio verificado", () => {
  const semDominio = estado.situacaoPublicacao([]);
  assert.equal(semDominio.permitido, false);
  assert.match(semDominio.motivo, /bloqueada/i);
  assert.match(semDominio.motivo, /DNS\/HTTP|n[ãa]o [ée] execut[áa]vel/i);
  const pendente = estado.situacaoPublicacao([{ status: "pendente" }, { status: "pendente" }]);
  assert.equal(pendente.permitido, false);
  assert.match(pendente.motivo, /2 dom[íi]nio/);
  assert.equal(estado.situacaoPublicacao([{ status: "verificado" }]).permitido, true);
});

test("SEO: a configuração é validada com as faixas do servidor e nasce noindex", () => {
  const base = { path: "/servicos", title: "Serviços de segurança", description: "Descrição suficientemente longa", keywords: "a, b", canonical_url: "", robots: "noindex, nofollow", sitemap_priority: "0.5", changefreq: "weekly", is_noindex: false };
  const ok = estado.validarConfig(base);
  assert.equal(ok.ok, true, JSON.stringify(ok.erros));
  assert.equal(ok.payload.is_noindex, true, "criar sempre nasce noindex");
  assert.deepEqual(ok.payload.keywords, ["a", "b"]);
  assert.equal(ok.payload.canonical_url, null);
  assert.equal(estado.validarConfig({ ...base, path: "sem-barra" }).ok, false);
  assert.equal(estado.validarConfig({ ...base, title: "abc" }).ok, false);
  assert.equal(estado.validarConfig({ ...base, description: "curta" }).ok, false);
  assert.equal(estado.validarConfig({ ...base, sitemap_priority: "1.5" }).ok, false);
  assert.equal(estado.validarConfig({ ...base, changefreq: "sempre" }).ok, false);
  assert.equal(estado.validarConfig({ ...base, robots: "x" }).ok, false);
});

test("SEO: redirecionamento exige origem ≠ destino e motivo 10..1000", () => {
  const base = { old_path: "/antigo", new_path: "/novo", redirect_type: "301", reason: "Motivo do redirecionamento", is_active: true };
  assert.equal(estado.validarRedirect(base).ok, true);
  assert.match(estado.validarRedirect({ ...base, new_path: "/antigo" }).erros.new_path, /n[ãa]o podem ser iguais/i);
  assert.match(estado.validarRedirect({ ...base, reason: "curto" }).erros.reason, /10/);
  assert.equal(estado.validarRedirect({ ...base, redirect_type: "200" }).ok, false);
  assert.equal(estado.validarRedirect({ ...base, old_path: "sem-barra" }).ok, false);
});

test("SEO: domínio normaliza e exige token 10..500", () => {
  const base = { domain: " WWW.Exemplo.com.br ", verification_method: "dns_txt", verification_token: "x".repeat(20) };
  const ok = estado.validarDominio(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.domain, "www.exemplo.com.br");
  assert.equal(estado.validarDominio({ ...base, domain: "com espaço" }).ok, false);
  assert.equal(estado.validarDominio({ ...base, verification_token: "curto" }).ok, false);
  assert.equal(estado.validarDominio({ ...base, verification_method: "telepatia" }).ok, false);
});

test("SEO: a tela não grava sitemap, não engole falha e não publica às cegas", () => {
  assert.match(componente, /from "\.\/seo-console-state"/);
  assert.match(componente, /classificarLista/);
  assert.match(componente, /classificarPreviaSitemap/);
  assert.match(componente, /situacaoPublicacao/);
  assert.match(componente, /role="alert"/);
  assert.match(componente, /data-testid="seo-publicacao"/);
  assert.match(componente, /aria-busy=\{lendo\}/);
  // Sitemap é só leitura: nenhuma chamada de escrita para /api/admin/seo-sitemap.
  assert.ok(!/seo-sitemap"[\s\S]{0,120}(POST|PATCH)/.test(componente), "sitemap não aceita escrita");
  assert.ok(!/gravar\([^)]*seo-sitemap/.test(componente), "nada grava no sitemap");
  assert.ok(!/\.catch\(\(\)=>\(\{\s*\w+\s*:\s*\[\]\s*\}\)\)/.test(componente), "nenhuma leitura cai em lista vazia");
  assert.ok(!/setMsg\([^)]*e\.message/.test(componente), "mensagem crua de exceção não vai para a tela");
  assert.ok(!/prompt\(/.test(componente), "nada de prompt()");
});

test("SEO: a aba existe, é dinâmica, está no grupo certo e o console tem 28 abas", () => {
  const declaracao = consoleTi.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? "";
  const abas = [...declaracao.matchAll(/\['([a-z0-9_]+)','([^']+)'\]/g)].map(item => item[1]);
  assert.equal(abas.length, 28, "as promoções levam o console de 26 para 28 abas");
  assert.ok(abas.includes("seo"));
  assert.match(consoleTi, /const SeoClient=dynamic\(\(\)=>import\('\.\/SeoClient'\)\);/);
  assert.match(consoleTi, /\{active==='seo'&&<SeoClient\/>\}/);
  assert.match(consoleTi, /name:'Experiência e comunicação',keys:\['avisos','visual','cliente','cms','seo'\]/);
  assert.match(pkg.scripts["test:unit"], /tests\/ux-pro-03-ti-seo-dominios-ui\.test\.mjs/);
});

test("SEO: CSS por tokens, sem hex, com foco visível e breakpoint", () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css));
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:740px\)/);
  assert.match(css, /var\(--ux-color-border\)/);
});

test("SEO: a política de destino de redirect é dita na tela e traduzida, não descoberta no erro", () => {
  // O servidor recusa destino que não é rota pública (`redirect_target_not_public`)
  // e origem que esconde rota existente (`cannot_shadow_existing_route`).
  // Sem os códigos traduzidos, a tela mostraria "recusada pelo servidor" e o
  // operador tentaria de novo o mesmo destino inválido.
  for (const codigo of [
    "redirect_target_not_public", "cannot_shadow_existing_route",
    "cannot_redirect_to_self", "redirect_chain_not_allowed", "duplicate_old_path",
    "invalid_reason", "invalid_redirect_type",
  ]) {
    const texto = estado.traduzirErroSeo(400, codigo);
    assert.notEqual(texto, "A gravação foi recusada pelo servidor. Confira os campos e tente novamente.", `código ${codigo} sem tradução`);
    assert.match(texto, /\s/, `código ${codigo} sem mensagem útil`);
  }
  assert.match(estado.traduzirErroSeo(400, "redirect_target_not_public"), /rota pública/i);
  assert.match(estado.traduzirErroSeo(400, "cannot_publish_with_noindex"), /noindex/i);
  assert.match(estado.traduzirErroSeo(400, "domain_verification_not_supported"), /DNS\/HTTP/i);
  assert.match(estado.REGRA_DESTINO, /rota pública/i);
  assert.match(componente, /data-testid="seo-regra-destino"/);
  assert.match(componente, /\{REGRA_DESTINO\}/);
});
