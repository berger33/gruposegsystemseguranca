// UX-PRO-03 — 16ª promoção "com prova": preferências de notificação e modelos
// de mensagem (PLT-05) deixam de ser órfãos e viram a 29ª aba do TiConsole.
//
// O protótipo tinha seis problemas que esta guarda trava:
//
//  1. `any` em toda parte e nenhuma leitura automática: as duas listas só
//     apareciam depois de clicar em dois botões; erro de leitura virava uma
//     frase solta e a tela continuava parecendo vazia;
//  2. os quatro botões de situação apareciam em QUALQUER modelo, em qualquer
//     ordem;
//  3. a rejeição mandava `rejection_reason` fixo no código — o motivo gravado
//     no registro não era o do operador;
//  4. "salvar preferência" não distinguia preferência global de por pessoa, e o
//     servidor criava linha nova a cada gravação global;
//  5. quiet hours era texto livre: valor inválido virava falha de servidor;
//  6. um modelo com informação médica no corpo (`is_medical_safe: false`)
//     podia ser aprovado.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const componente = await read("src/app/admin/ti/NotificationPreferencesClient.tsx");
const css = await read("src/app/admin/ti/NotificationPreferencesClient.module.css");
const estadoTs = await read("src/app/admin/ti/notification-prefs-state.ts");
const consoleTi = await read("src/app/admin/ti/TiConsole.tsx");
const api = await read("src/server/notification-preferences-api.mjs");
const migracao = await read("db/migrations/043-plt05-notifications.sql");
const pkg = JSON.parse(await read("package.json"));

async function modulo() {
  const js = stripTypeScriptTypes(estadoTs);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const estado = await modulo();

test("PLT-05: toda leitura distingue negado, falha, inválido e vazio de 'ok com registros'", () => {
  const negado = estado.classificarLista(403, undefined, "preferences", "preferências");
  assert.equal(negado.situacao, "negado");
  assert.match(negado.mensagem, /n[ãa]o [ée] uma lista vazia/i);
  assert.equal(estado.classificarLista(401, undefined, "templates", "modelos").situacao, "negado");
  assert.equal(estado.classificarLista(503, { preferences: [] }, "preferences", "preferências").situacao, "falha");
  assert.equal(estado.classificarLista(0, undefined, "preferences", "preferências").situacao, "falha");
  assert.equal(estado.classificarLista(400, { preferences: [] }, "preferences", "preferências").situacao, "invalido");
  assert.equal(estado.classificarLista(200, {}, "preferences", "preferências").situacao, "invalido");
  assert.equal(estado.classificarLista(200, { preferences: "x" }, "preferences", "preferências").situacao, "invalido");
  assert.equal(estado.classificarLista(200, { preferences: [] }, "preferences", "preferências").situacao, "vazio");
  const ok = estado.classificarLista(200, { templates: [{ id: "1" }] }, "templates", "modelos");
  assert.equal(ok.situacao, "ok");
  assert.equal(ok.itens.length, 1);
  // As chaves das duas rotas são diferentes: trocar de lista não pode passar.
  assert.equal(estado.classificarLista(200, { preferences: [{ id: "1" }] }, "templates", "modelos").situacao, "invalido");
});

test("PLT-05: os códigos do servidor são traduzidos, nunca despejados crus", () => {
  const codigos = [
    "admin_session_required", "unauthorized", "same_origin_required", "invalid_recipient_kind",
    "invalid_channel", "invalid_recipient_id", "invalid_quiet_hours", "preference_update_failed",
    "preferences_unavailable", "invalid_template_key", "invalid_body", "invalid_status",
    "medical_info_not_allowed_in_subject", "medical_info_not_allowed_in_push",
    "medical_info_not_allowed_in_subject_push", "medical_safety_required", "approval_requires_admin_ti",
    "rejection_reason_required", "template_create_failed", "template_update_failed",
    "templates_unavailable", "template_unavailable", "invalid_template_id", "invalid_json",
    "no_fields", "not_found", "method_not_allowed",
  ];
  for (const codigo of codigos) {
    const texto = estado.traduzirErroPlt(400, codigo);
    assert.ok(!texto.includes(codigo), `${codigo} vazou para a tela`);
    assert.notEqual(texto, "O servidor recusou a gravação. Confira os campos e tente novamente.", `${codigo} sem tradução própria`);
  }
  assert.match(estado.traduzirErroPlt(400, "medical_safety_required"), /n[ãa]o pode ser aprovado/i);
  assert.match(estado.traduzirErroPlt(403, "approval_requires_admin_ti"), /admin ou ti/);
  assert.match(estado.traduzirErroPlt(400, "rejection_reason_required"), /motivo/i);
  assert.match(estado.traduzirErroPlt(500, "boom"), /servidor falhou/i);
});

test("PLT-05: as listas da tela são as do CHECK do banco", () => {
  const canais = [...migracao.match(/crm_notification_channel AS ENUM \(([^)]*)\)/)[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual([...estado.CANAIS], canais, "canais precisam casar com o enum do banco");
  const kinds = [...migracao.match(/recipient_kind IN \(([^)]*)\)/)[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual([...estado.TIPOS_DESTINATARIO], kinds, "tipos de destinatário precisam casar com o CHECK");
  const status = [...migracao.match(/crm_notification_template_status AS ENUM \(([^)]*)\)/)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual([...estado.STATUS_MODELO].sort(), status.sort(), "situações precisam casar com o enum");
  // O CHECK fecha o valor: canal fora da lista vira erro de banco, não 400.
  for (const termo of ["email", "whatsapp", "sms", "push", "webhook", "internal", "sistema"]) {
    assert.ok(estado.CANAIS.includes(termo));
  }
  assert.ok(!estado.CANAIS.includes("telegram"));
});

test("PLT-05: a lista de termos médicos da tela é a mesma do servidor", () => {
  const declarados = [...api.match(/const medicalTerms = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual([...estado.TERMOS_MEDICOS], declarados, "as duas listas não podem divergir em silêncio");
  for (const termo of declarados) {
    assert.equal(estado.contemInfoMedica(`texto com ${termo} dentro`), true, `${termo} precisa ser detectado`);
  }
  assert.equal(estado.contemInfoMedica("mensagem comercial sem termos proibidos"), false);
  assert.equal(estado.contemInfoMedica(""), false);
  assert.equal(estado.contemInfoMedica(null), false);
  assert.equal(estado.contemInfoMedica("CPF 123.456.789-00"), true, "padrão de CPF também é bloqueado");
});

test("PLT-05: a preferência é validada antes do POST, inclusive o par de silêncio", () => {
  const base = {
    recipient_kind: "staff", channel: "email", recipient_id: "", recipient_email: "",
    is_enabled: true, is_email_enabled: true, is_push_enabled: false,
    is_whatsapp_enabled: false, is_sms_enabled: false, is_internal_enabled: true,
    quiet_hours_start: "", quiet_hours_end: "",
  };
  assert.equal(estado.validarPreferencia(base).ok, true);
  assert.equal(estado.validarPreferencia({ ...base, quiet_hours_start: "22:00", quiet_hours_end: "07:00" }).ok, true);
  assert.equal(estado.validarPreferencia(base).payload.recipient_id, null, "sem destinatário é preferência global");
  assert.ok(estado.validarPreferencia({ ...base, recipient_kind: "presidente" }).erros.recipient_kind);
  assert.ok(estado.validarPreferencia({ ...base, channel: "telegram" }).erros.channel);
  assert.ok(estado.validarPreferencia({ ...base, recipient_id: "nao-e-uuid" }).erros.recipient_id);
  assert.ok(estado.validarPreferencia({ ...base, recipient_email: "ab" }).erros.recipient_email);
  assert.ok(estado.validarPreferencia({ ...base, quiet_hours_start: "22:00" }).erros.quiet_hours, "silêncio é par");
  assert.ok(estado.validarPreferencia({ ...base, quiet_hours_end: "07:00" }).erros.quiet_hours);
  assert.ok(estado.validarPreferencia({ ...base, quiet_hours_start: "25:00", quiet_hours_end: "07:00" }).erros.quiet_hours);
  assert.ok(estado.validarPreferencia({ ...base, quiet_hours_start: "7:00", quiet_hours_end: "08:00" }).erros.quiet_hours);
});

test("PLT-05: o modelo é validado com as faixas do banco e a regra médica", () => {
  const base = { template_key: "qa_boas_vindas", channel: "email", subject: "Bem-vindo", body: "Olá! Seu cadastro foi recebido.", status: "rascunho", medical_review_note: "" };
  assert.equal(estado.validarModelo(base).ok, true);
  assert.ok(estado.validarModelo({ ...base, template_key: "" }).erros.template_key);
  assert.ok(estado.validarModelo({ ...base, template_key: "k".repeat(101) }).erros.template_key);
  assert.ok(estado.validarModelo({ ...base, channel: "telegram" }).erros.channel);
  assert.ok(estado.validarModelo({ ...base, subject: "s".repeat(201) }).erros.subject);
  assert.ok(estado.validarModelo({ ...base, body: "" }).erros.body);
  assert.ok(estado.validarModelo({ ...base, body: "b".repeat(5001) }).erros.body);
  assert.ok(estado.validarModelo({ ...base, status: "aprovado" }).erros.status, "criar aprovado pularia a revisão");
  assert.match(estado.validarModelo({ ...base, subject: "Seu diagnóstico saiu" }).erros.subject, /m[ée]dic/i);
  assert.match(estado.validarModelo({ ...base, channel: "push", body: "CID registrado no atendimento" }).erros.body, /m[ée]dic/i);
  // Corpo com termo médico em e-mail não impede criar: impede APROVAR.
  assert.equal(estado.validarModelo({ ...base, body: "Segue o laudo solicitado." }).ok, true);
});

test("PLT-05: só o próximo passo do ciclo é oferecido, e rejeitar exige motivo", () => {
  assert.deepEqual(estado.proximosEstados("rascunho"), ["em_revisao", "arquivado"]);
  assert.deepEqual(estado.proximosEstados("em_revisao"), ["aprovado", "rejeitado", "arquivado"]);
  assert.deepEqual(estado.proximosEstados("aprovado"), ["arquivado"]);
  assert.deepEqual(estado.proximosEstados("rejeitado"), ["rascunho", "arquivado"]);
  assert.deepEqual(estado.proximosEstados("arquivado"), ["rascunho"]);
  assert.deepEqual(estado.proximosEstados("inventado"), []);
  const id = "11111111-2222-3333-4444-555555555555";
  assert.ok(estado.validarTransicao(id, "aprovado", "", "rascunho").erros.status, "rascunho não aprova direto");
  assert.equal(estado.validarTransicao(id, "em_revisao", "", "rascunho").ok, true);
  assert.ok(estado.validarTransicao(id, "aprovado", "", "em_revisao").ok, "o servidor também aceita o valor, a ordem é da tela");
  assert.ok(estado.validarTransicao(id, "rejeitado", "", "em_revisao").erros.reason, "rejeitar sem motivo");
  const rejeitado = estado.validarTransicao(id, "rejeitado", "Texto fora do padrão PLT-05.", "em_revisao");
  assert.equal(rejeitado.ok, true);
  assert.equal(rejeitado.payload.rejection_reason, "Texto fora do padrão PLT-05.", "o motivo gravado é o digitado");
  assert.ok(!/PLT-05'/.test(componente), "nenhum motivo fixo no código");
});

test("PLT-05: formatação não inventa estado nem esconde o silêncio", () => {
  assert.equal(estado.simNao(true), "ligado");
  assert.equal(estado.simNao(false), "desligado");
  assert.equal(estado.simNao(null), "não informado");
  assert.equal(estado.horaCurta("22:00:00"), "22:00");
  assert.equal(estado.horaCurta("07:05:00"), "07:05");
  assert.equal(estado.horaCurta(null), "");
  assert.equal(estado.janelaSilencio({ quiet_hours_start: "22:00:00", quiet_hours_end: "07:00:00" }), "silêncio 22:00–07:00");
  assert.equal(estado.janelaSilencio({}), "sem silêncio");
  assert.equal(estado.chavePreferencia({ recipient_kind: "staff", channel: "email" }), "staff-email-global");
  assert.equal(estado.chavePreferencia({ recipient_kind: "ti", channel: "push", recipient_id: "x" }), "ti-push-destinatario");
  assert.equal(estado.chaveModelo({ template_key: "qa", channel: "email", version: 2 }), "qa-email-v2");
});

test("PLT-05: a tela não engole falha, lê sozinha e não usa texto fixo de rejeição", () => {
  assert.ok(!/\bany\b/.test(componente), "nada de any na tela promovida");
  assert.ok(!/\.catch\(\(\)\s*=>\s*\(\{\s*(preferences|templates)\s*:\s*\[\]\s*\}\)\)/.test(componente), "nenhuma leitura cai em lista vazia");
  assert.match(componente, /useEffect\(\(\) => \{ void carregar\(\); \}, \[\]\)/, "as duas listas são lidas ao montar");
  assert.match(componente, /catch \{\s*return classificarLista\(0, undefined, chave, rotulo\);/, "falha de rede é classificada como falha");
  assert.ok(!/setMsg\(/.test(componente), "não há mensagem solta: erro e sucesso têm lugar próprio");
  assert.match(componente, /data-testid=\{`plt-estado-\$\{chave\}`\}/, "o estado é por coleção, com testid próprio");
  for (const chave of ["preferencias", "modelos"]) {
    assert.match(componente, new RegExp(`estado\\([a-zA-Z]+, "${chave}"\\)`), `a coleção ${chave} precisa declarar seu estado`);
  }
  for (const aviso of ["preferencia", "quiet", "sessao", "medico", "ordem", "aprovacao", "rejeicao"]) {
    assert.match(componente, new RegExp(`data-testid="plt-aviso-${aviso}"`), `o aviso ${aviso} precisa estar na tela`);
  }
  assert.match(componente, /TIPOS_DESTINATARIO\.map/);
  assert.match(componente, /CANAIS\.map/);
  assert.match(componente, /STATUS_NA_CRIACAO\.map/, "a criação não oferece aprovável direto");
  assert.match(componente, /proximosEstados\(item\.status\)/, "os botões vêm do ciclo, não de lista fixa");
  assert.match(componente, /data-testid=\{`plt-avancar-\$\{chave\}-\$\{destino\}`\}/);
  assert.match(componente, /validarTransicao\(String\(item\.id \?\? ""\), destino, motivo, item\.status\)/,
    "o motivo enviado é o que o operador digitou, não constante");
  assert.match(componente, /contemInfoMedica\(/, "a tela avisa sobre informação médica");
});

test("PLT-05: o servidor não duplica preferência global, valida silêncio e barra aprovação insegura", () => {
  // Duplicação: o UNIQUE do banco tem recipient_id NULLABLE — NULL não colide,
  // então `ON CONFLICT` nunca dispara para preferência global. A correção é
  // atualizar antes de inserir.
  assert.match(migracao, /UNIQUE\(recipient_kind, recipient_id, channel\)/);
  assert.match(api, /recipient_id IS NOT DISTINCT FROM/, "a atualização precisa tratar NULL como valor");
  assert.match(api, /UPDATE crm_notification_preferences[\s\S]*?WHERE recipient_kind=\$1 AND recipient_id IS NOT DISTINCT FROM \$2 AND channel=\$3/);
  assert.ok(!/ON CONFLICT \(recipient_kind, recipient_id, channel\)/.test(api), "ON CONFLICT não serve com coluna NULLABLE");
  // Silêncio: valor inválido precisa ser 400, não falha de servidor.
  assert.match(api, /invalid_quiet_hours/);
  assert.match(api, /const HORA = \/\^\(\[01\]\\d\|2\[0-3\]\):/);
  // PLT-05: modelo com informação médica não pode ser aprovado.
  assert.match(api, /medical_safety_required/);
  assert.match(api, /is_medical_safe/);
  // Criar já aprovado precisa de papel e de trilha de aprovação.
  assert.match(api, /approval_requires_admin_ti/);
  assert.match(api, /approved_by_id/);
});

test("PLT-05: a aba existe, é dinâmica, está no grupo certo e o console tem 29 abas", () => {
  const declaracao = consoleTi.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? "";
  const abas = [...declaracao.matchAll(/\['([a-z0-9_]+)','([^']+)'\]/g)].map(item => item[1]);
  assert.equal(abas.length, 29, "a promoção leva o console de 28 para 29 abas");
  assert.ok(abas.includes("plt_notificacoes"));
  assert.match(consoleTi, /const NotificationPreferencesClient=dynamic\(\(\)=>import\('\.\/NotificationPreferencesClient'\)\);/);
  assert.match(consoleTi, /\{active==='plt_notificacoes'&&<NotificationPreferencesClient\/>\}/);
  assert.match(consoleTi, /name:'Experiência e comunicação',keys:\['avisos','visual','cliente','cms','seo','plt_notificacoes'\]/);
  assert.match(pkg.scripts["test:unit"], /tests\/ux-pro-03-ti-preferencias-notificacao-ui\.test\.mjs/);
});

test("PLT-05: CSS por tokens, sem hex, com foco visível e breakpoint", () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css));
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:740px\)/);
  assert.match(css, /var\(--ux-color-border\)/);
});
