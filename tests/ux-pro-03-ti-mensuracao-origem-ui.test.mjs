// UX-PRO-03 — 15ª promoção "com prova": mensuração de origem, conversão e A/B
// (PUB-10) deixa de ser órfã e vira a 28ª aba do TiConsole.
//
// O protótipo tinha quatro problemas que esta guarda trava:
//
//  1. as três leituras em `.catch(()=>({items:[]}))`: 403/500 viravam lista
//     vazia, e o operador concluía "não há dado" quando não tinha permissão;
//  2. o ciclo do A/B era oferecido por botões fixos em qualquer linha e o
//     motivo gravado no histórico imutável era constante no código;
//  3. o vencedor vinha de `prompt()`;
//  4. o servidor valida o VALOR do status, não a ORDEM — e a tela precisa
//     dizer isso em vez de sugerir que a API impede retrocesso.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const componente = await read("src/app/admin/ti/OriginMetricsClient.tsx");
const css = await read("src/app/admin/ti/OriginMetricsClient.module.css");
const consoleTi = await read("src/app/admin/ti/TiConsole.tsx");
const api = await read("src/server/origin-metrics-api.mjs");
const pkg = JSON.parse(await read("package.json"));

async function modulo() {
  const ts = await read("src/app/admin/ti/pub-metrics-state.ts");
  const js = stripTypeScriptTypes(ts);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const estado = await modulo();

test("PUB-10: toda leitura distingue negado, falha, inválido e vazio de 'ok com registros'", () => {
  const negado = estado.classificarLista(403, undefined, "métricas");
  assert.equal(negado.situacao, "negado");
  assert.match(negado.mensagem, /n[ãa]o [ée] uma lista vazia/i);
  assert.equal(estado.classificarLista(401, undefined, "métricas").situacao, "negado");
  assert.equal(estado.classificarLista(500, { items: [] }, "métricas").situacao, "falha");
  assert.equal(estado.classificarLista(0, undefined, "métricas").situacao, "falha");
  assert.equal(estado.classificarLista(400, { items: [] }, "métricas").situacao, "invalido");
  assert.equal(estado.classificarLista(200, {}, "métricas").situacao, "invalido");
  assert.equal(estado.classificarLista(200, { items: "x" }, "métricas").situacao, "invalido");
  assert.equal(estado.classificarLista(200, { items: [] }, "métricas").situacao, "vazio");
  const ok = estado.classificarLista(200, { items: [{ id: "1" }] }, "métricas");
  assert.equal(ok.situacao, "ok");
  assert.equal(ok.itens.length, 1);
});

test("PUB-10: os códigos do servidor são traduzidos, nunca despejados crus", () => {
  const codigos = [
    "invalid_origin", "invalid_campaign", "invalid_channel", "missing_period",
    "invalid_period_end_before_start", "invalid_total_leads", "invalid_converted",
    "converted_exceeds_total", "invalid_notes", "duplicate_period_origin",
    "invalid_event_type", "invalid_test_key", "invalid_hypothesis", "invalid_description",
    "invalid_metric_name", "invalid_traffic_required", "invalid_treatment",
    "duplicate_test_key", "invalid_status", "invalid_winner", "traffic_required_not_met",
    "invalid_reason", "missing_id", "not_found",
  ];
  for (const codigo of codigos) {
    const texto = estado.traduzirErroPub(400, codigo);
    assert.ok(!texto.includes(codigo), `${codigo} vazou para a tela`);
    assert.notEqual(texto, "A gravação foi recusada pelo servidor. Confira os campos e tente novamente.", `${codigo} sem tradução própria`);
  }
  assert.match(estado.traduzirErroPub(400, "converted_exceeds_total"), /n[ãa]o podem passar/i);
  assert.match(estado.traduzirErroPub(400, "invalid_hypothesis"), /hip[óo]tese/i);
  assert.match(estado.traduzirErroPub(400, "invalid_winner"), /A, B, empate ou inconclusivo/);
  assert.match(estado.traduzirErroPub(500, "boom"), /servidor falhou/i);
});

test("PUB-10: a métrica é validada com as mesmas faixas do servidor, inclusive convertidos ≤ total", () => {
  const base = {
    origin: "qa-site", campaign: "", channel: "", period_start: "2026-10-01", period_end: "2026-10-31",
    total_leads: "100", converted_leads: "10", total_opportunities: "5", total_contracts: "1", notes: "",
  };
  assert.equal(estado.validarMetrica(base).ok, true);
  assert.ok(estado.validarMetrica({ ...base, origin: "ab" }).erros.origin, "origem 3..100");
  assert.ok(estado.validarMetrica({ ...base, campaign: "ab" }).erros.campaign, "campanha 3..100");
  assert.ok(estado.validarMetrica({ ...base, channel: "" }).ok, "canal é opcional");
  assert.ok(estado.validarMetrica({ ...base, channel: "organic" }).ok, "canal da lista do banco passa");
  // `pub_origin_metrics.channel` é CHECK fechado: "organico" no INSERT vira 500.
  assert.match(estado.validarMetrica({ ...base, channel: "organico" }).erros.channel, /lista aceita pelo banco/i);
  assert.ok(estado.CANAIS.includes("social") && !estado.CANAIS.includes("organico"));
  assert.match(estado.validarMetrica({ ...base, period_end: "" }).erros.periodo, /obrigat/i);
  assert.match(estado.validarMetrica({ ...base, period_end: "2026-09-01" }).erros.periodo, /anterior/i);
  assert.match(estado.validarMetrica({ ...base, period_end: "2026-02-31" }).erros.periodo, /datas reais/i);
  assert.equal(estado.validarMetrica({ ...base, converted_leads: "101" }).erros.converted_leads, "Leads convertidos não podem passar do total de leads.");
  assert.ok(estado.validarMetrica({ ...base, total_leads: "-1" }).erros.total_leads);
  assert.ok(estado.validarMetrica({ ...base, notes: "curto" }).erros.notes);
  const enviado = estado.validarMetrica(base).payload;
  assert.equal(enviado.campaign, null, "campanha vazia vai como null, não como string vazia");
  assert.equal(enviado.total_leads, 100, "números vão como número");
  assert.ok(!("is_minimized" in enviado), "minimização não é decisão do formulário");
});

test("PUB-10: o evento exige UUID de lead e nunca promete guardar IP cru", () => {
  const base = { event_type: "lead_received", origin: "qa-site", campaign: "", channel: "", lead_id: "", ip: "203.0.113.9", user_agent: "Mozilla/5.0" };
  const ok = estado.validarEvento(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.ip, "203.0.113.9", "o valor vai para o servidor calcular o hash");
  assert.ok(!("ip_hash" in ok.payload), "a tela não pré-calcula hash");
  assert.match(estado.validarEvento({ ...base, lead_id: "nao-e-uuid" }).erros.lead_id, /UUID/i);
  assert.equal(estado.validarEvento({ ...base, lead_id: "f2c6a1d4-0b6f-4c11-9a1a-1f2b3c4d5e6f" }).ok, true);
  assert.ok(estado.validarEvento({ ...base, event_type: "inventado" }).erros.event_type);
  assert.ok(estado.validarEvento({ ...base, origin: "ab" }).erros.origin);
  assert.match(estado.AVISO_INGESTAO, /p[úu]blica/i);
  assert.match(estado.AVISO_INGESTAO, /hash/i);
  assert.match(estado.AVISO_MINIMIZACAO, /minimiza/i);
  assert.match(estado.AVISO_LEAD, /precisa existir/i, "o lead do evento tem FK: a tela precisa avisar");
});

test("PUB-10: o teste A/B é validado antes do envio, com hipótese e tratamento obrigatórios", () => {
  const base = {
    test_key: "qa-teste-1", hypothesis: "Usuários do site convertem mais com retorno rápido no formulário.",
    description: "Teste sintético do gate de mensuração.", metric_name: "conversion_rate",
    traffic_required: "100", treatment: "Dados minimizados, sem IP original, apenas hash SHA-256.",
    variant_a: "{}", variant_b: "{}",
  };
  assert.equal(estado.validarTeste(base).ok, true);
  assert.equal(estado.validarTeste({ ...base, test_key: "QA Teste" }).erros.test_key !== undefined, true);
  assert.ok(estado.validarTeste({ ...base, test_key: "QA-Teste-1" }).ok, "chave é normalizada para minúsculas");
  assert.ok(estado.validarTeste({ ...base, hypothesis: "curta" }).erros.hypothesis, "hipótese 20..2000");
  assert.ok(estado.validarTeste({ ...base, treatment: "curto" }).erros.treatment, "tratamento 10..2000");
  assert.ok(estado.validarTeste({ ...base, traffic_required: "9" }).erros.traffic_required, "tráfego ≥ 10");
  assert.match(estado.validarTeste({ ...base, variant_a: "{quebrado" }).erros.variant_a, /JSON/i);
  assert.equal(estado.validarTeste({ ...base, test_key: "QA-Teste-1" }).payload.test_key, "qa-teste-1");
});

test("PUB-10: a tela só oferece passos do ciclo e diz que a ordem é política local", () => {
  assert.deepEqual([...estado.proximosEstados("rascunho")], ["em_revisao", "cancelado", "arquivado"]);
  assert.deepEqual([...estado.proximosEstados("em_execucao")], ["concluido", "cancelado"]);
  assert.deepEqual([...estado.proximosEstados("concluido")], [], "concluído não anda para trás");
  assert.deepEqual([...estado.proximosEstados("arquivado")], []);
  assert.deepEqual([...estado.proximosEstados("inventado")], [], "situação desconhecida não oferece passo");
  assert.match(estado.AVISO_ORDEM, /valor do status, n[ãa]o a sequ[êe]ncia/i);
  // O servidor de fato não impõe ordem: a guarda falha se ele passar a impor
  // silenciosamente sem a tela ser revista.
  assert.ok(api.includes("const valid=['rascunho','em_revisao','aprovado','em_execucao','concluido','cancelado','arquivado'];"),
    "a lista de status do servidor precisa continuar visível na guarda");
  assert.ok(!/TRANSICOES|proximosEstados/.test(api), "o servidor não implementa a máquina de estados");
  // Regressão 42P08: o mesmo `$2` comparado ao enum e a texto fazia TODA
  // transição responder 500 ("inconsistent types deduced for parameter $2").
  assert.match(api, /status=\$2::text::ab_test_status/, "o status precisa ser tipado como texto e convertido na coluna");
  assert.match(api, /\$2::text IN \('aprovado','em_execucao'\)/, "as comparações usam o mesmo tipo do parâmetro");
  assert.ok(!/status=\$2,/.test(api), "sem o cast, o Postgres volta a recusar a dedução");
});

test("PUB-10: concluir exige vencedor declarado e motivo com faixa do servidor", () => {
  assert.match(estado.validarTransicao("id-1", "concluido", "curto", "A").erros.reason, /10 a 1\.000/);
  assert.match(estado.validarTransicao("id-1", "concluido", "Conclusão sintética do teste A/B.", "").erros.winner, /A, B, empate ou inconclusivo/);
  assert.equal(estado.validarTransicao("id-1", "concluido", "Conclusão sintética do teste A/B.", "A").ok, true);
  const enviado = estado.validarTransicao("id-1", "concluido", "Conclusão sintética do teste A/B.", "empate").payload;
  assert.equal(enviado.winner, "empate");
  assert.deepEqual(enviado.result_data, { conclusion: "empate" });
  assert.ok(!("winner" in estado.validarTransicao("id-1", "aprovado", "Aprovação sintética do teste.", undefined).payload)
    || estado.validarTransicao("id-1", "aprovado", "Aprovação sintética do teste.", undefined).payload.winner === undefined);
  assert.ok(estado.validarTransicao("", "aprovado", "Aprovação sintética do teste.", undefined).erros.id);
  assert.ok(estado.validarTransicao("id-1", "inventado", "Aprovação sintética do teste.", undefined).erros.status);
});

test("PUB-10: situação do experimento e taxa não inventam resultado", () => {
  assert.equal(estado.situacaoExperimento({ status: "concluido", winner: null }).situacao, "concluido_sem_vencedor");
  assert.match(estado.situacaoExperimento({ status: "concluido", winner: null }).rotulo, /sem vencedor/i);
  assert.match(estado.situacaoExperimento({ status: "concluido", winner: "B" }).rotulo, /venceu B/i);
  assert.match(estado.situacaoExperimento({ status: "concluido", winner: "empate" }).rotulo, /empate/i);
  assert.match(estado.situacaoExperimento({ status: "em_execucao", traffic_required: 250 }).rotulo, /250/);
  assert.equal(estado.situacaoExperimento({ status: "qualquer" }).situacao, "desconhecida");
  assert.equal(estado.situacaoHash({ ip_hash: null, user_agent_hash: null }).situacao, "sem_hash");
  assert.match(estado.situacaoHash({ ip_hash: null, user_agent_hash: null }).rotulo, /sem hash/i);
  assert.equal(estado.situacaoHash({ ip_hash: "a".repeat(64), user_agent_hash: "b".repeat(64) }).situacao, "ip_e_ua");
  assert.equal(estado.situacaoHash({ ip_hash: "a".repeat(64), user_agent_hash: null }).situacao, "parcial");
  assert.match(estado.AVISO_HASH, /nulos/i);
  // O defeito que a tela declara: `require` dentro de ESM faz o hash cair no catch.
  assert.match(api, /require\('node:crypto'\)/, "a guarda registra a causa do hash nulo");
  assert.match(api, /catch\{ return null; \}|catch\{ return null;\}/, "o erro do hash é engolido");
  assert.equal(estado.dataCurta("2026-10-01T00:00:00.000Z"), "2026-10-01", "ISO completo vira dia");
  assert.equal(estado.dataCurta(null), "—");
  assert.equal(estado.dataCurta("sem data"), "sem data");
  assert.equal(estado.taxaConversao({ total_leads: 0, converted_leads: 0 }), "—", "sem leads não se inventa taxa");
  assert.equal(estado.taxaConversao({ total_leads: 200, converted_leads: 25 }), "12.50%");
  assert.equal(estado.taxaConversao({ conversion_rate: "7.5", total_leads: 1, converted_leads: 1 }), "7.50%", "usa a taxa do servidor quando existe");
});

test("PUB-10: a tela não engole falha, não usa prompt() e não exibe IP cru de volta", () => {
  assert.ok(!/\.catch\(\(\)\s*=>\s*\(\{\s*items\s*:\s*\[\]\s*\}\)\)/.test(componente), "nenhuma leitura cai em lista vazia");
  assert.ok(!/prompt\(/.test(componente), "nada de prompt() para vencedor");
  assert.match(componente, /catch \{\s*return classificarLista\(0, undefined, rotulo\);/, "falha de rede precisa ser classificada como falha");
  assert.ok(!/situacao:\s*"ok",\s*itens:\s*\[\]/.test(componente), "nenhum catch pode devolver lista ok-vazia");
  assert.ok(!/setMsg\([^)]*e\.message/.test(componente), "mensagem crua de exceção não vai para a tela");
  assert.match(componente, /data-testid=\{`pub-estado-\$\{chave\}`\}/, "o estado é por coleção, com testid próprio");
  for (const chave of ["metricas", "eventos", "ab"]) {
    assert.match(componente, new RegExp(`estado\\([a-zA-Z]+, "${chave}"\\)`), `a coleção ${chave} precisa declarar seu estado`);
  }
  assert.match(componente, /data-testid="pub-aviso-ordem"/);
  assert.match(componente, /data-testid="pub-aviso-ingestao"/);
  assert.match(componente, /data-testid="pub-aviso-lead"/);
  assert.match(componente, /data-testid="pub-aviso-hash"/);
  assert.ok(!/viraram hash/i.test(componente), "a tela não pode afirmar hash que não aconteceu");
  assert.match(componente, /CANAIS\.map/, "o canal é lista fechada, não texto livre");
  assert.match(componente, /data-testid={`pub-avancar-\$\{String\(item\.test_key\)\}-\$\{passo\}`}/);
  // O hash exibido é prefixo; o valor digitado nunca é impresso na lista.
  assert.ok(!/\{String\(item\.ip\)\}/.test(componente), "IP original não volta para a tela");
  assert.match(componente, /situacaoHash\(item\)/, "a lista lê o hash pela função que não inventa resultado");
  assert.match(componente, /dataCurta\(item\.period_start\)/, "a lista mostra o dia, não o ISO cru");
});

test("PUB-10: a aba existe, é dinâmica, está no grupo certo e o console tem 30 abas", () => {
  const declaracao = consoleTi.match(/const tabs=(\[[\s\S]*?\]) as const;/)?.[1] ?? "";
  const abas = [...declaracao.matchAll(/\['([a-z0-9_]+)','([^']+)'\]/g)].map(item => item[1]);
  assert.equal(abas.length, 30, "as promoções levam o console de 27 para 30 abas");
  assert.ok(abas.includes("pub_metricas"));
  assert.match(consoleTi, /const OriginMetricsClient=dynamic\(\(\)=>import\('\.\/OriginMetricsClient'\)\);/);
  assert.match(consoleTi, /\{active==='pub_metricas'&&<OriginMetricsClient\/>\}/);
  assert.match(consoleTi, /name:'Inteligência e monitoramento',keys:\['monitoramento_ext','pub_metricas'\]/);
  assert.match(pkg.scripts["test:unit"], /tests\/ux-pro-03-ti-mensuracao-origem-ui\.test\.mjs/);
});

test("PUB-10: CSS por tokens, sem hex, com foco visível e breakpoint", () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css));
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:740px\)/);
  assert.match(css, /var\(--ux-color-border\)/);
});
