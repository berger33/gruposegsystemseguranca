// UX-PRO-03 — 18ª promoção "com prova": a FAQ assistida (PUB-05), a
// transferência humana e os segmentos do site (PUB-02) deixam de ser órfãos:
// `PubFaqAssistedClient` vira a 31ª aba do TiConsole.
//
// O protótipo tinha seis problemas que esta guarda trava:
//
//  1. `catch{}` em `load()`: negação, falha e resposta torta viravam quatro
//     listas vazias;
//  2. uma `msg` única para erro e sucesso;
//  3. motivo de mudança de situação e resposta ao visitante **fixos no
//     código** — o texto do operador nunca chegava ao banco;
//  4. as três situações oferecidas em qualquer linha, inclusive publicado e
//     rejeitado;
//  5. `is_approved`/`is_published` calculados na tela e aceitos como verdade
//     pelo servidor: uma regra era publicada sem aprovação no mesmo UPDATE;
//  6. `session_token`/`visitor_contact` do visitante exibidos crus.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const componente = await read("src/app/admin/ti/PubFaqAssistedClient.tsx");
const css = await read("src/app/admin/ti/PubFaqAssistedClient.module.css");
const estadoTs = await read("src/app/admin/ti/pub-faq-assistida-state.ts");
const consoleTi = await read("src/app/admin/ti/TiConsole.tsx");
const api = await read("src/server/pub-faq-assisted-api.mjs");
const servidor = await read("server.mjs");
const migracao = await read("db/migrations/094-pub02-pub05-paginas-segmento-faq-assistida-handoff.sql");
const pkg = JSON.parse(await read("package.json"));

async function modulo() {
  const js = stripTypeScriptTypes(estadoTs);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const estado = await modulo();

// `ler(rota, chave, rótulo)` é o único caminho de leitura da tela promovida.
const pageLeituras = () => [...componente.matchAll(/ler\(\s*"([^"]+)"/g)].map(m => m[1]);
// Códigos de erro que o servidor realmente devolve neste módulo.
const codigosDoServidor = () => [...new Set([...api.matchAll(/\{error:'([a-z_]+)'/g)].map(m => m[1]))].sort();

test("PUB-02/05: toda leitura distingue negado, falha, inválido e vazio de 'ok com registros'", () => {
  const negado = estado.classificarLista(403, undefined, "items", "regras da FAQ assistida");
  assert.equal(negado.situacao, "negado");
  assert.match(negado.mensagem, /n[ãa]o [ée] uma lista vazia/i);
  assert.equal(estado.classificarLista(401, undefined, "items", "sessões").situacao, "negado");
  assert.equal(estado.classificarLista(500, { items: [] }, "items", "segmentos").situacao, "falha");
  assert.equal(estado.classificarLista(0, undefined, "items", "transferências").situacao, "falha");
  assert.equal(estado.classificarLista(400, { items: [] }, "items", "regras").situacao, "invalido");
  assert.equal(estado.classificarLista(200, {}, "items", "regras").situacao, "invalido");
  assert.equal(estado.classificarLista(200, { items: "x" }, "items", "regras").situacao, "invalido");
  assert.equal(estado.classificarLista(200, { items: [] }, "items", "regras").situacao, "vazio");
  const ok = estado.classificarLista(200, { items: [{ id: "1" }] }, "items", "regras");
  assert.equal(ok.situacao, "ok");
  assert.equal(ok.itens.length, 1);
});

test("PUB-02/05: todo código de erro do módulo do servidor tem tradução própria", () => {
  const codigos = codigosDoServidor();
  assert.ok(codigos.length >= 30, `esperava os códigos do módulo, achei ${codigos.length}`);
  for (const codigo of codigos) {
    const texto = estado.traduzirErroPub(400, codigo);
    assert.ok(!texto.includes(codigo), `${codigo} vazou para a tela`);
    assert.notEqual(texto, "O servidor recusou a operação. Confira os campos e tente novamente.", `${codigo} sem tradução própria`);
  }
  assert.match(estado.traduzirErroPub(409, "must_be_approved_before_publish"), /[Aa]prove a regra antes de publicar/);
  assert.match(estado.traduzirErroPub(409, "segment_must_be_validated_before_publish"), /[Vv]alide o segmento/);
  assert.match(estado.traduzirErroPub(400, "response_required"), /resposta escrita ao visitante/);
});

test("PUB-02/05: as quatro listas da tela são os enums da migração 094", () => {
  const doEnum = nome => {
    const bloco = migracao.match(new RegExp(`${nome} AS ENUM \\(([^)]*)\\)`));
    assert.ok(bloco, `enum ${nome} não encontrado na migração`);
    return [...bloco[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  };
  assert.deepEqual([...estado.SITUACOES_REGRA], doEnum("pub_faq_assisted_status"));
  assert.deepEqual([...estado.TIPOS_SEGMENTO], doEnum("pub_segment_type"));
  assert.deepEqual([...estado.SITUACOES_SESSAO], doEnum("pub_faq_session_status"));
  assert.deepEqual([...estado.SITUACOES_HANDOFF], doEnum("pub_handoff_status"));
});

test("PUB-05: a regra é validada com as faixas do CHECK antes do POST", () => {
  const base = {
    chave: "faq_preco_condominio", pergunta: "qual o preço do serviço",
    resposta: "O valor depende da vistoria técnica; fale com um atendente humano para receber a proposta.",
    categoria: "preco", palavras: "preço, valor", price: false, coverage: false,
    license: false, deadline: false, handoff: true,
    motivo: "Preço exige qualificação humana antes de qualquer número.",
  };
  assert.equal(estado.validarRegra(base).ok, true);
  assert.ok(estado.validarRegra({ ...base, chave: "ab" }).erros.chave);
  assert.ok(estado.validarRegra({ ...base, chave: "com espaço" }).erros.chave);
  assert.ok(estado.validarRegra({ ...base, pergunta: "oi" }).erros.pergunta);
  assert.ok(estado.validarRegra({ ...base, resposta: "curta" }).erros.resposta);
  assert.ok(estado.validarRegra({ ...base, categoria: "ab" }).erros.categoria);
  assert.ok(estado.validarRegra({ ...base, palavras: Array.from({ length: 21 }, (_, i) => `p${i}`).join(",") }).erros.palavras);
  assert.ok(estado.validarRegra({ ...base, palavras: "x".repeat(51) }).erros.palavras);
  assert.ok(estado.validarRegra({ ...base, motivo: "curto" }).erros.motivo);
  const payload = estado.validarRegra(base).payload;
  assert.equal(payload.rule_key, "faq_preco_condominio");
  assert.deepEqual(payload.keywords, ["preço", "valor"]);
  assert.equal(payload.handoff_reason, base.motivo);
  // CHECK `no_invented_price`: marcada como preço sensível, a resposta não pode
  // trazer R$ — no protótipo isso chegava ao banco e voltava 500.
  const sensivelComValor = estado.validarRegra({ ...base, price: true, resposta: "O posto custa R$ 3500 por mês, com visita técnica inclusa." });
  assert.ok(sensivelComValor.erros.resposta);
  assert.match(sensivelComValor.erros.resposta, /n[ãa]o pode trazer valor em R\$/i);
});

test("PUB-05: preço, cobertura, licença e prazo são espelhados do servidor", () => {
  // Cada detecção da tela precisa ter o mesmo termo e o mesmo código no servidor.
  const amostrasPorCodigo = {
    price_invention_detected: "O posto custa R$ 3500 por mês, sem visita técnica.",
    coverage_invention_detected: "O contrato tem cobertura garantida em toda a região.",
    license_invention_detected: "A equipe tem licença garantida para portaria armada.",
    deadline_invention_detected: "A implantação tem prazo garantido de sete dias.",
  };
  const semEscapes = api.toLowerCase().replaceAll("\\", "");
  for (const deteccao of estado.DETECCOES) {
    assert.ok(api.includes(`{error:'${deteccao.codigo}'`), `${deteccao.codigo} não existe no servidor`);
    assert.ok(semEscapes.includes(deteccao.termo.toLowerCase()), `o servidor não detecta "${deteccao.termo}"`);
    assert.equal(estado.detectarInvencao(amostrasPorCodigo[deteccao.codigo]), deteccao.codigo);
  }
  assert.equal(estado.detectarInvencao("Resposta neutra, sem promessa."), null);
  assert.equal(estado.detectarInvencao("Custa R$ 3.500 por posto."), "price_invention_detected");
  // Sensível exige transferência humana; a validação local recusa antes do POST.
  const sensivelSemHandoff = estado.validarRegra({
    chave: "faq_cobertura", pergunta: "tem cobertura", categoria: "cobertura",
    resposta: "A cobertura depende da análise técnica feita por um atendente humano.",
    palavras: "", price: false, coverage: true, license: false, deadline: false,
    handoff: false, motivo: "",
  });
  assert.equal(sensivelSemHandoff.ok, false);
  assert.match(sensivelSemHandoff.erros.handoff, /transfer[êe]ncia humana/);
});

test("PUB-05: só o próximo passo do ciclo é oferecido e publicar exige aprovação", () => {
  assert.deepEqual(estado.proximosEstados("rascunho"), ["em_revisao", "arquivado", "rejeitado"]);
  assert.deepEqual(estado.proximosEstados("em_revisao"), ["aprovado", "arquivado", "rejeitado"]);
  assert.deepEqual(estado.proximosEstados("aprovado"), ["publicado", "arquivado", "rejeitado"]);
  assert.deepEqual(estado.proximosEstados("publicado"), ["arquivado"]);
  assert.deepEqual(estado.proximosEstados("inventado"), []);
  const id = "11111111-2222-3333-4444-555555555555";
  const motivo = "Revisão competente concluída pelo time de TI no plantão.";
  assert.ok(estado.validarTransicaoRegra(id, "publicado", "rascunho", motivo).erros.status, "rascunho não publica direto");
  assert.ok(estado.validarTransicaoRegra(id, "publicado", "em_revisao", motivo).erros.status, "em revisão não publica direto");
  assert.ok(estado.validarTransicaoRegra(id, "publicado", "aprovado", "curto").erros.motivoTransicao);
  assert.ok(estado.validarTransicaoRegra("nao-e-uuid", "em_revisao", "rascunho", motivo).erros.id);
  const aprovacao = estado.validarTransicaoRegra(id, "aprovado", "em_revisao", motivo);
  assert.equal(aprovacao.ok, true);
  assert.equal(aprovacao.payload.is_approved, true);
  assert.equal(aprovacao.payload.reason, motivo, "o motivo gravado é o digitado");
  const publicacao = estado.validarTransicaoRegra(id, "publicado", "aprovado", motivo);
  assert.equal(publicacao.ok, true);
  assert.equal(publicacao.payload.status, "publicado");
});

test("PUB-05: concluir transferência exige a resposta do operador", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  assert.deepEqual(estado.proximosHandoff("pendente"), ["em_atendimento", "cancelado", "expirado"]);
  assert.deepEqual(estado.proximosHandoff("em_atendimento"), ["concluido", "cancelado"]);
  assert.deepEqual(estado.proximosHandoff("concluido"), []);
  assert.ok(estado.validarHandoff(id, "HND-PUB-20261101-AB12", "pendente", "concluido", "curta").erros.retorno);
  assert.ok(estado.validarHandoff(id, "HND-PUB-20261101-AB12", "concluido", "concluido", "Resposta com dez caracteres.").erros.status);
  const ok = estado.validarHandoff(id, "HND-PUB-20261101-AB12", "em_atendimento", "concluido", "Atendimento concluído por telefone com o síndico.");
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.response, "Atendimento concluído por telefone com o síndico.");
  assert.equal(ok.payload.protocolo, "HND-PUB-20261101-AB12");
});

test("PUB-02: publicar segmento exige validação e nunca é oferecido fora de hora", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  assert.ok(estado.validarSegmento(id, "publicar", { is_validated: false, is_published: false }).erros.acao);
  assert.ok(estado.validarSegmento(id, "validar", { is_validated: true }).erros.acao);
  assert.ok(estado.validarSegmento(id, "despublicar", { is_published: false }).erros.acao);
  assert.equal(estado.validarSegmento(id, "validar", { is_validated: false }).payload.is_validated, true);
  assert.equal(estado.validarSegmento(id, "publicar", { is_validated: true, is_published: false }).payload.is_published, true);
  assert.equal(estado.validarSegmento(id, "despublicar", { is_published: true }).payload.is_published, false);
});

test("PUB-05: o contato do visitante é mascarado e o token não é exibido", () => {
  assert.equal(estado.mascararContato(null), "não informado");
  const mascarado = estado.mascararContato("(11) 98765-4321");
  assert.ok(!mascarado.includes("98765"), "o contato não pode aparecer inteiro");
  assert.ok(mascarado.endsWith("21"), "os dois últimos caracteres continuam legíveis");
  assert.equal(estado.simNao(undefined), "não informado");
  assert.equal(estado.simNao(true), "sim");
  assert.equal(estado.rotuloSituacao("publicado"), "Publicado");
  assert.equal(estado.rotuloSituacao("transferida_humano"), "Transferida ao humano");
});

test("PUB-02/05: a tela não engole falha, lê sozinha e usa o caminho de administração", () => {
  assert.ok(!/\bany\b/.test(componente), "nada de any na tela promovida");
  assert.ok(!/catch\s*\{\s*return classificarLista\(0/.test(componente) || /catch \{\s*return classificarLista\(0, undefined, chave, rotulo\);/.test(componente),
    "falha de rede é classificada como falha");
  assert.match(componente, /useEffect\(\(\) => \{ void carregar\(\); \}, \[\]\)/, "as quatro listas são lidas ao montar");
  assert.ok(!/setMsg\(/.test(componente), "não há mensagem solta: erro e sucesso têm lugar próprio");
  assert.equal(pageLeituras().length, 4, "as quatro leituras saem do caminho de administração");
  for (const rota of pageLeituras()) {
    assert.match(rota, /^\/api\/admin\//, `leitura fora do caminho de administração: ${rota}`);
  }
  for (const chave of ["regras", "sessoes", "handoffs", "segmentos"]) {
    assert.match(componente, new RegExp(`estado\\([a-zA-Z]+, "${chave}"\\)`), `a coleção ${chave} precisa declarar seu estado`);
  }
  for (const aviso of ["publico", "historico", "minimizacao", "sensivel", "segmento"]) {
    assert.match(componente, new RegExp(`data-testid="pub-aviso-${aviso}"`), `o aviso ${aviso} precisa estar na tela`);
  }
  assert.match(componente, /proximosEstados\(situacao\)/, "os botões de situação vêm do ciclo");
  assert.match(componente, /proximosHandoff\(situacao\)/);
  assert.match(componente, /data-testid=\{`pub-mover-\$\{chave\}-\$\{destino\}`\}/);
  assert.match(componente, /mascararContato\(item\.visitor_contact\)/, "o contato do visitante é mascarado na tela");
  assert.ok(!/session_token/.test(componente), "o token da sessão não é exibido");
  assert.match(componente, /data-testid="pub-lista-fora"/, "o que não foi promovido é declarado, não montado");
  // O protótipo gravava estes dois textos fixos no código.
  assert.ok(!/Conteúdo não conforme/.test(componente));
  assert.ok(!/Atendimento humano concluído, cliente orientado/.test(componente), "a resposta ao visitante é do operador");
  assert.ok(!/Responsável comercial/.test(componente), "o responsável não é um texto fixo");
  assert.match(componente, /data-testid="pub-ok"/);
  assert.match(componente, /data-testid="pub-erro"/);
});

test("PUB-02/05: o servidor ganhou token de verdade, coerência de publicação e 400 em vez de 500", () => {
  // O `require('node:crypto')` em ESM caía em Math.random com ~11 caracteres.
  const apiSemComentarios = api.replace(/\/\/.*$/gm, "");
  assert.ok(!/[^.\w]require\(/.test(apiSemComentarios), "nada de require em módulo ESM");
  assert.match(api, /import \{ randomBytes \} from 'node:crypto';/);
  assert.match(api, /const generateToken = \(len = 32\) => randomBytes/);
  // Coerência publicar/aprovar/validar.
  for (const codigo of [
    "must_be_approved_before_publish", "publish_requires_published_status",
    "published_status_requires_publish", "approval_status_conflict",
    "segment_must_be_validated_before_publish", "response_required",
    "invalid_id", "no_fields", "handoff_reason_required", "sensitive_requires_handoff",
    "invalid_keywords", "sensitive_template_states_price",
  ]) {
    assert.ok(api.includes(codigo), `${codigo} precisa existir no servidor`);
  }
  assert.match(api, /if\(is_published===true && !validadoFinal\) return json\(res,409/);
  assert.match(api, /if\(publicando && !aprovadoFinal\)/);
  // O motivo do histórico deixou de ter texto padrão.
  assert.ok(!/Atualização FAQ assistida/.test(api), "o motivo não pode ser fixo no servidor");
  // As quatro rotas continuam despachadas.
  for (const rota of ["/api/admin/faq-assisted-rules", "/api/admin/pub-faq-sessions", "/api/admin/faq-handoff", "/api/admin/pub-segments"]) {
    assert.ok(servidor.includes(rota), `${rota} precisa continuar despachada`);
  }
});

test("PUB-02/05: a aba existe, é dinâmica, está no grupo certo e o console tem 32 abas", () => {
  const declaracao = consoleTi.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? "";
  const abas = [...declaracao.matchAll(/\['([a-z0-9_]+)','([^']+)'\]/g)].map(item => item[1]);
  assert.equal(abas.length, 32, "a promoção leva o console de 30 para 32 abas");
  assert.ok(abas.includes("pub_faq"));
  assert.match(consoleTi, /const PubFaqAssistedClient=dynamic\(\(\)=>import\('\.\/PubFaqAssistedClient'\)\);/);
  assert.match(consoleTi, /\{active==='pub_faq'&&<PubFaqAssistedClient\/>\}/);
  assert.match(consoleTi, /name:'Experiência e comunicação',keys:\['avisos','visual','cliente','cms','seo','plt_notificacoes','emp_pwa','pub_faq'\]/);
  assert.match(pkg.scripts["test:unit"], /tests\/ux-pro-03-ti-pub-faq-assistida-ui\.test\.mjs/);
});

test("PUB-02/05: CSS por tokens, sem hex, com foco visível e breakpoint", () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css));
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:740px\)/);
  assert.match(css, /var\(--ux-color-border\)/);
});
