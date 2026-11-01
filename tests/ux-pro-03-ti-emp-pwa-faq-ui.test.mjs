// UX-PRO-03 — 17ª promoção "com prova": app do funcionário (PWA) e FAQ interna
// (EMP-18/EMP-19) deixam de ser órfãos: `EmpPwaClient` vira a 30ª aba do
// TiConsole.
//
// O protótipo tinha cinco problemas que esta guarda trava:
//
//  1. as cinco leituras iam para `/api/hr/*`, que passa pela borda legada de RH
//     e exige `employees.read` — permissão automática só de `rh` e `marcelo`.
//     Para `ti`, o papel que monta a tela, tudo era 403;
//  2. cada leitura caía em `.catch(()=>({…:[]}))`: negação virava "nada aqui";
//  3. `any` em todos os tipos e uma única `msg` misturando erro e sucesso;
//  4. o status da FAQ era trocado por botões fixos e a criação já nascia
//     "publicado" por padrão;
//  5. o PATCH do servidor não validava nada: valor fora do CHECK do banco
//     voltava como 500, não 400.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const componente = await read("src/app/admin/ti/EmpPwaClient.tsx");
const css = await read("src/app/admin/ti/EmpPwaClient.module.css");
const estadoTs = await read("src/app/admin/ti/emp-pwa-state.ts");
const consoleTi = await read("src/app/admin/ti/TiConsole.tsx");
const api = await read("src/server/emp-pwa-api.mjs");
const servidor = await read("server.mjs");
const migracao = await read("db/migrations/069-emp18-19-pwa-faq-acessibilidade.sql");
const pkg = JSON.parse(await read("package.json"));

async function modulo() {
  const js = stripTypeScriptTypes(estadoTs);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const estado = await modulo();

// `ler(rota, chave, rótulo)` é o único caminho de leitura da tela promovida.
const pageLeituras = () => [...componente.matchAll(/ler\(\s*"([^"]+)"/g)].map(m => m[1]);

test("EMP-18: toda leitura distingue negado, falha, inválido e vazio de 'ok com registros'", () => {
  const negado = estado.classificarLista(403, undefined, "configs", "configurações do PWA");
  assert.equal(negado.situacao, "negado");
  assert.match(negado.mensagem, /n[ãa]o [ée] uma lista vazia/i);
  assert.equal(estado.classificarLista(401, undefined, "faqs", "perguntas").situacao, "negado");
  assert.equal(estado.classificarLista(500, { configs: [] }, "configs", "configurações").situacao, "falha");
  assert.equal(estado.classificarLista(0, undefined, "faqs", "perguntas").situacao, "falha");
  assert.equal(estado.classificarLista(400, { faqs: [] }, "faqs", "perguntas").situacao, "invalido");
  assert.equal(estado.classificarLista(200, {}, "faqs", "perguntas").situacao, "invalido");
  assert.equal(estado.classificarLista(200, { configs: "x" }, "configs", "configurações").situacao, "invalido");
  assert.equal(estado.classificarLista(200, { configs: [] }, "configs", "configurações").situacao, "vazio");
  assert.equal(estado.classificarLista(200, { configs: [{ id: "1" }] }, "faqs", "perguntas").situacao, "invalido");
  const ok = estado.classificarLista(200, { faqs: [{ id: "1" }] }, "faqs", "perguntas");
  assert.equal(ok.situacao, "ok");
  assert.equal(ok.itens.length, 1);
});

test("EMP-18: os códigos que viram 500 no servidor antigo têm tradução própria", () => {
  const codigos = [
    "unauthorized", "admin_session_required", "employee_permission_required", "forbidden",
    "same_origin_required", "invalid_json", "invalid_id", "not_found", "no_fields",
    "invalid_name", "invalid_short_name", "invalid_description", "invalid_theme_color",
    "invalid_background_color", "invalid_display", "invalid_scope", "invalid_start_url",
    "invalid_approved_offline_tasks", "invalid_max_queue_size", "invalid_max_retries",
    "invalid_do_not_cache_patterns", "invalid_question", "invalid_answer", "invalid_category",
    "invalid_status", "invalid_reading_level", "invalid_tags", "invalid_faq_id",
    "invalid_employee_id", "method_not_allowed", "internal_error",
  ];
  for (const codigo of codigos) {
    const texto = estado.traduzirErroEmp(400, codigo);
    assert.ok(!texto.includes(codigo), `${codigo} vazou para a tela`);
    assert.notEqual(texto, "O servidor recusou a gravação. Confira os campos e tente novamente.", `${codigo} sem tradução própria`);
  }
  assert.match(estado.traduzirErroEmp(400, "invalid_max_queue_size"), /1 a 200/);
  assert.match(estado.traduzirErroEmp(400, "invalid_category"), /Categoria fora/i);
  assert.match(estado.traduzirErroEmp(403, "employee_permission_required"), /employees\.read/);
});

test("EMP-18: as listas da tela são as do enum do banco", () => {
  const display = [...migracao.match(/emp_pwa_display AS ENUM \(([^)]*)\)/)[1].matchAll(/'([a-z-]+)'/g)].map(m => m[1]);
  assert.deepEqual([...estado.DISPLAY], display);
  const tarefas = [...migracao.match(/emp_offline_task_type AS ENUM \(([^)]*)\)/)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual([...estado.TAREFAS_OFFLINE], tarefas);
  const categorias = [...migracao.match(/emp_faq_category AS ENUM \(([^)]*)\)/)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual([...estado.CATEGORIAS_FAQ], categorias);
  const status = [...migracao.match(/emp_faq_status AS ENUM \(([^)]*)\)/)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual([...estado.STATUS_FAQ], status);
  const niveis = [...migracao.match(/reading_level IN \(([^)]*)\)/)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual([...estado.NIVEIS_LEITURA], niveis);
});

test("EMP-18: a configuração é validada com as faixas do CHECK, antes do POST", () => {
  const base = {
    name: "Grupo SEG System - Portal Funcionário", short_name: "SEG Func",
    description: "Portal do funcionário com suporte offline limitado.", theme_color: "#0f172a",
    background_color: "#ffffff", display: "standalone", scope: "/", start_url: "/funcionario",
    max_queue_size: "50", max_retries: "5", tarefas: ["occurrence", "handover"],
  };
  assert.equal(estado.validarConfig(base).ok, true);
  assert.ok(estado.validarConfig({ ...base, name: "ab" }).erros.name);
  assert.ok(estado.validarConfig({ ...base, short_name: "a" }).erros.short_name);
  assert.ok(estado.validarConfig({ ...base, description: "curta" }).erros.description);
  assert.ok(estado.validarConfig({ ...base, theme_color: "azul" }).erros.theme_color);
  assert.ok(estado.validarConfig({ ...base, background_color: "#fff" }).erros.background_color);
  assert.ok(estado.validarConfig({ ...base, display: "janela" }).erros.display);
  assert.ok(estado.validarConfig({ ...base, scope: "" }).erros.scope === undefined, "escopo vazio assume /");
  // O CHECK do banco é 1..200 e 1..20: no PATCH antigo isso virava 500.
  assert.ok(estado.validarConfig({ ...base, max_queue_size: "0" }).erros.max_queue_size);
  assert.ok(estado.validarConfig({ ...base, max_queue_size: "201" }).erros.max_queue_size);
  assert.ok(estado.validarConfig({ ...base, max_queue_size: "1.5" }).erros.max_queue_size);
  assert.ok(estado.validarConfig({ ...base, max_retries: "0" }).erros.max_retries);
  assert.ok(estado.validarConfig({ ...base, max_retries: "21" }).erros.max_retries);
  assert.ok(estado.validarConfig({ ...base, tarefas: ["teleporte"] }).erros.tarefas);
  const payload = estado.validarConfig(base).payload;
  assert.equal(payload.max_queue_size, 50, "a fila vai como número, não string");
  assert.deepEqual(payload.approved_offline_tasks, ["occurrence", "handover"]);
});

test("EMP-19: a FAQ é validada com as faixas do banco e as etiquetas limitadas", () => {
  const base = {
    question: "Como pedir troca de escala?", answer: "Abra o portal do funcionário e escolha a opção de troca de escala.",
    category: "escala", status: "rascunho", reading_level: "simples", tags: "escala, portal",
    is_simple_language: true, is_low_data: true,
  };
  assert.equal(estado.validarFaq(base).ok, true);
  assert.ok(estado.validarFaq({ ...base, question: "curta" }).erros.question);
  assert.ok(estado.validarFaq({ ...base, answer: "curta demais" }).erros.answer);
  assert.ok(estado.validarFaq({ ...base, category: "inventada" }).erros.category);
  assert.ok(estado.validarFaq({ ...base, reading_level: "doutorado" }).erros.reading_level);
  assert.ok(estado.validarFaq({ ...base, status: "publicada" }).erros.status);
  assert.ok(estado.validarFaq({ ...base, tags: Array.from({ length: 21 }, (_, i) => `t${i}`).join(",") }).erros.tags);
  assert.ok(estado.validarFaq({ ...base, tags: "x".repeat(51) }).erros.tags);
  const payload = estado.validarFaq(base).payload;
  assert.deepEqual(payload.tags, ["escala", "portal"], "etiquetas viram lista sem espaços");
  assert.equal(payload.status, "rascunho", "criar não publica por padrão");
});

test("EMP-19: só o próximo passo do ciclo da FAQ é oferecido", () => {
  assert.deepEqual(estado.proximosEstados("rascunho"), ["em_revisao", "arquivado"]);
  assert.deepEqual(estado.proximosEstados("em_revisao"), ["publicado", "arquivado"]);
  assert.deepEqual(estado.proximosEstados("publicado"), ["arquivado"]);
  assert.deepEqual(estado.proximosEstados("arquivado"), ["rascunho"]);
  assert.deepEqual(estado.proximosEstados("inventado"), []);
  const id = "11111111-2222-3333-4444-555555555555";
  assert.ok(estado.validarTransicao(id, "publicado", "rascunho").erros.status, "rascunho não publica direto");
  assert.equal(estado.validarTransicao(id, "em_revisao", "rascunho").ok, true);
  assert.equal(estado.validarTransicao(id, "publicado", "em_revisao").payload.status, "publicado");
  assert.ok(estado.validarTransicao("nao-e-uuid", "em_revisao", "rascunho").erros.id);
});

test("EMP-18: a tela não engole falha, lê sozinha e usa o caminho canônico", () => {
  assert.ok(!/\bany\b/.test(componente), "nada de any na tela promovida");
  assert.ok(!/\.catch\(\(\)\s*=>\s*\(\{\s*(configs|faqs)\s*:\s*\[\]\s*\}\)\)/.test(componente), "nenhuma leitura cai em lista vazia");
  assert.match(componente, /useEffect\(\(\) => \{ void carregar\(\); \}, \[\]\)/, "as duas listas são lidas ao montar");
  assert.match(componente, /catch \{\s*return classificarLista\(0, undefined, chave, rotulo\);/, "falha de rede é classificada como falha");
  assert.ok(!/setMsg\(/.test(componente), "não há mensagem solta: erro e sucesso têm lugar próprio");
  // O protótipo lia `/api/hr/*`, que a borda de RH nega para `ti`.
  assert.ok(!/fetch\(\s*["'`]\/api\/hr\//.test(componente), "nenhuma leitura pela borda legada de RH");
  // A leitura passa por `ler(...)`: guardar só o `fetch` deixaria a troca de rota
  // passar (mutação medida: trocar o caminho em `ler` não era detectado).
  assert.equal(pageLeituras().length, 2, "as duas leituras precisam sair do caminho canônico");
  assert.match(componente, /"\/api\/admin\/pwa-configs"/);
  assert.match(componente, /"\/api\/admin\/faq-internal\?limit=50"/);
  for (const rota of pageLeituras()) {
    assert.match(rota, /^\/api\/admin\//, `leitura fora do caminho canônico de administração: ${rota}`);
  }
  for (const chave of ["configs", "faqs"]) {
    assert.match(componente, new RegExp(`estado\\([a-zA-Z]+, "${chave}"\\)`), `a coleção ${chave} precisa declarar seu estado`);
  }
  for (const aviso of ["borda", "ativo", "faq", "offline"]) {
    assert.match(componente, new RegExp(`data-testid="emp-aviso-${aviso}"`), `o aviso ${aviso} precisa estar na tela`);
  }
  assert.match(componente, /DISPLAY\.map/);
  assert.match(componente, /CATEGORIAS_FAQ\.map/);
  assert.match(componente, /NIVEIS_LEITURA\.map/);
  assert.match(componente, /TAREFAS_OFFLINE\.map/);
  assert.match(componente, /proximosEstados\(item\.status\)/, "os botões vêm do ciclo, não de lista fixa");
  assert.match(componente, /data-testid=\{`emp-mover-\$\{chave\}-\$\{destino\}`\}/);
  // Recursos de dado de funcionário são declarados, não montados.
  assert.match(componente, /data-testid="emp-lista-fora"/);
  assert.match(componente, /employees\.read/);
  assert.ok(!/offline-queue\?limit/.test(componente), "fila offline não é lida aqui");
});

test("EMP-18: o servidor ganhou caminho canônico e o PATCH deixou de responder 500", () => {
  // Caminho canônico de administração, fora da borda legada de RH.
  assert.match(servidor, /url\.pathname === "\/api\/admin\/pwa-configs"/);
  assert.match(servidor, /url\.pathname === "\/api\/admin\/faq-internal"/);
  assert.match(servidor, /\|\| pathname === "\/api\/admin\/pwa-configs"/, "o caminho precisa entrar na lista de API");
  assert.match(servidor, /\|\| pathname === "\/api\/admin\/faq-internal"/);
  // Nada afrouxado: os aliases de RH continuam despachados e continuam na borda.
  assert.match(servidor, /url\.pathname === "\/api\/hr\/pwa-configs"/);
  assert.match(servidor, /url\.pathname === "\/api\/hr\/faq-internal"/);
  assert.match(servidor, /authorizeLegacyHrRequest/);
  // PATCH validado antes do banco.
  for (const codigo of [
    "invalid_max_queue_size", "invalid_max_retries", "invalid_description",
    "invalid_display", "invalid_theme_color", "invalid_background_color",
    "invalid_approved_offline_tasks", "invalid_do_not_cache_patterns",
    "invalid_category", "invalid_reading_level", "invalid_tags",
  ]) {
    assert.ok(api.includes(codigo), `${codigo} precisa existir no servidor`);
  }
  assert.match(api, /if \(!Number\.isInteger\(maxQueue\) \|\| maxQueue < 1 \|\| maxQueue > 200\)/);
});

test("EMP-18: a aba existe, é dinâmica, está no grupo certo e o console tem 30 abas", () => {
  const declaracao = consoleTi.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? "";
  const abas = [...declaracao.matchAll(/\['([a-z0-9_]+)','([^']+)'\]/g)].map(item => item[1]);
  assert.equal(abas.length, 30, "a promoção leva o console de 29 para 30 abas");
  assert.ok(abas.includes("emp_pwa"));
  assert.match(consoleTi, /const EmpPwaClient=dynamic\(\(\)=>import\('\.\/EmpPwaClient'\)\);/);
  assert.match(consoleTi, /\{active==='emp_pwa'&&<EmpPwaClient\/>\}/);
  assert.match(consoleTi, /name:'Experiência e comunicação',keys:\['avisos','visual','cliente','cms','seo','plt_notificacoes','emp_pwa'\]/);
  assert.match(pkg.scripts["test:unit"], /tests\/ux-pro-03-ti-emp-pwa-faq-ui\.test\.mjs/);
});

test("EMP-18: CSS por tokens, sem hex, com foco visível e breakpoint", () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css));
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:740px\)/);
  assert.match(css, /var\(--ux-color-border\)/);
});
