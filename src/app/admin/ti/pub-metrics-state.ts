/**
 * Estado da mensuração de origem, eventos de conversão e testes A/B (PUB-10).
 *
 * Puro: sem React, sem DOM, sem `fetch`.
 *
 * Quatro coisas que o protótipo escondia e o servidor não sustenta:
 *
 *  1. as três leituras vinham com `.catch(() => ({ items: [] }))`: **403/500
 *     viravam "nenhum registro"** — a tela negava a própria falha;
 *  2. o status do A/B era trocado por botões fixos ("Aprovar", "Iniciar",
 *     "Concluir") em **qualquer** linha, mesmo que o teste estivesse
 *     `concluido`; e o motivo gravado no histórico imutável era **fixo no
 *     código**, nunca o que o operador via;
 *  3. o vencedor vinha de `prompt()` — sem lista, sem validação, sem registro
 *     do que foi escolhido antes de gravar;
 *  4. o servidor **valida o valor** do status, não a **ordem**: `valid.includes`
 *     só aceita os sete nomes. A sequência é política desta tela, e a tela
 *     precisa dizer isso em vez de sugerir que a API impede um retrocesso.
 *
 * Além disso: `POST /api/admin/conversion-events` **não exige sessão** (é
 * ingestão pública por desenho) e o IP/user-agent crus são transformados em
 * SHA-256 **no servidor**. A tela registra isso; nunca exibe IP original.
 */

export type Situacao = "ok" | "vazio" | "negado" | "falha" | "invalido";

export const EVENT_TYPES = [
  "lead_received", "lead_converted", "opportunity_created",
  "proposal_sent", "contract_created", "visit_confirmed", "outro",
] as const;

export const STATUS_AB = ["rascunho", "em_revisao", "aprovado", "em_execucao", "concluido", "cancelado", "arquivado"] as const;
export const VENCEDORES = ["A", "B", "empate", "inconclusivo"] as const;

/**
 * `pub_origin_metrics.channel` é **enum fechado no banco** (CHECK), e o
 * servidor não confere isso antes do INSERT: um canal fora da lista vira
 * **500**, não 400. A tela oferece exatamente esta lista para não provocar erro
 * de servidor com dado que ela mesma aceitou.
 */
export const CANAIS = ["site", "whatsapp", "phone", "referral", "other", "email", "organic", "paid", "social"] as const;

/**
 * Política **desta tela**: o servidor aceita qualquer um dos sete valores em
 * qualquer momento, então a ordem abaixo não é garantida pela API.
 */
export const TRANSICOES: Readonly<Record<(typeof STATUS_AB)[number], readonly (typeof STATUS_AB)[number][]>> = Object.freeze({
  rascunho: ["em_revisao", "cancelado", "arquivado"],
  em_revisao: ["aprovado", "cancelado", "arquivado"],
  aprovado: ["em_execucao", "cancelado", "arquivado"],
  em_execucao: ["concluido", "cancelado"],
  concluido: [],
  cancelado: [],
  arquivado: [],
});

export const AVISO_ORDEM =
  "A ordem do ciclo do teste A/B é política desta tela. O servidor confere o valor do status, não a sequência: por isso a tela não oferece passos fora do ciclo.";

export const AVISO_INGESTAO =
  "Eventos de conversão são ingestão pública: a rota aceita POST sem sessão por desenho. O IP e o user-agent digitados aqui são convertidos em hash SHA-256 no servidor e não são exibidos de volta.";

export const AVISO_LEAD =
  "O lead informado no evento precisa existir em public_leads: o banco tem chave estrangeira e responde erro de servidor para identificador desconhecido. Deixe em branco quando não houver lead.";

export const AVISO_HASH =
  "Nesta entrega o servidor devolve `ip_hash` e `user_agent_hash` nulos: o valor digitado não é armazenado, mas também não é convertido em hash. A tela não afirma minimização por hash que não aconteceu.";

export const AVISO_MINIMIZACAO =
  "As métricas e os eventos nascem com minimização de dados ligada pelo servidor; a tela não oferece desligar.";

export const LIMITES = Object.freeze({
  originMin: 3, originMax: 100,
  campaignMin: 3, campaignMax: 100,
  channelMin: 1, channelMax: 100,
  notesMin: 10, notesMax: 1000,
  testKeyMin: 3, testKeyMax: 100,
  hypothesisMin: 20, hypothesisMax: 2000,
  descriptionMin: 10, descriptionMax: 2000,
  metricMin: 3, metricMax: 200,
  treatmentMin: 10, treatmentMax: 2000,
  trafficMin: 10,
  reasonMin: 10, reasonMax: 1000,
});

const ERROS: Readonly<Record<string, string>> = {
  unauthorized: "Sessão expirada ou sem papel para mensuração (admin ou ti).",
  admin_session_required: "Sessão expirada. Entre novamente.",
  forbidden: "Sua sessão não pode administrar métricas de origem.",
  forbidden_origin: "A escrita precisa vir da própria origem do painel.",
  invalid_origin: "A origem precisa ter de 3 a 100 caracteres.",
  invalid_campaign: "A campanha, quando informada, precisa ter de 3 a 100 caracteres.",
  invalid_channel: "O canal, quando informado, precisa ter de 1 a 100 caracteres.",
  missing_period: "As duas datas do período são obrigatórias.",
  invalid_period_end_before_start: "O fim do período não pode ser anterior ao início.",
  invalid_total_leads: "O total de leads precisa ser número maior ou igual a zero.",
  invalid_converted: "O total convertido precisa ser número maior ou igual a zero.",
  converted_exceeds_total: "Leads convertidos não podem passar do total de leads.",
  invalid_notes: "As observações, quando informadas, precisam ter de 10 a 1.000 caracteres.",
  duplicate_period_origin: "Já existe métrica para esta origem, campanha, canal e período.",
  invalid_event_type: "Tipo de evento inválido.",
  invalid_test_key: "A chave do teste precisa ter de 3 a 100 caracteres.",
  invalid_hypothesis: "A hipótese precisa ter de 20 a 2.000 caracteres — sem hipótese não há teste.",
  invalid_description: "A descrição precisa ter de 10 a 2.000 caracteres.",
  invalid_metric_name: "A métrica observada precisa ter de 3 a 200 caracteres.",
  invalid_traffic_required: "O tráfego exigido precisa ser número maior ou igual a 10.",
  invalid_treatment: "O tratamento de dados precisa ter de 10 a 2.000 caracteres.",
  duplicate_test_key: "Já existe teste A/B com esta chave.",
  invalid_status: "Situação de teste inválida.",
  invalid_winner: "Vencedor inválido: use A, B, empate ou inconclusivo.",
  traffic_required_not_met: "O teste não atingiu o tráfego mínimo exigido para entrar em execução.",
  invalid_reason: "O motivo precisa ter de 10 a 1.000 caracteres.",
  missing_id: "Selecione o teste antes de mudar a situação.",
  not_found: "Registro não encontrado — pode ter sido removido.",
  method_not_allowed: "O servidor não aceita este método nesta rota.",
  internal: "O servidor falhou. Nada foi confirmado — confira antes de repetir.",
};

export function traduzirErroPub(status: number, codigo: string): string {
  if (codigo && ERROS[codigo]) return ERROS[codigo];
  if (status === 401) return ERROS.admin_session_required;
  if (status === 403) return ERROS.forbidden;
  if (status === 404) return ERROS.not_found;
  if (status === 405) return ERROS.method_not_allowed;
  if (status === 409) return "Já existe registro com esta combinação única.";
  if (status >= 500) return ERROS.internal;
  if (status >= 400) return "A gravação foi recusada pelo servidor. Confira os campos e tente novamente.";
  return "Não foi possível confirmar a gravação.";
}

export type ResultadoLista = { situacao: Situacao; itens: Record<string, unknown>[]; mensagem: string };

function listaValida(lista: unknown): lista is Record<string, unknown>[] {
  return Array.isArray(lista) && lista.every(item => item !== null && typeof item === "object" && !Array.isArray(item));
}

/** As três rotas devolvem `{items:[...]}`. */
export function classificarLista(status: number, corpo: unknown, rotulo: string): ResultadoLista {
  if (!status) return { situacao: "falha", itens: [], mensagem: `Falha de rede ao ler ${rotulo}. Tente novamente.` };
  if (status === 401 || status === 403) {
    return { situacao: "negado", itens: [], mensagem: `Sua sessão não pode ler ${rotulo}. Nada foi exibido — isto não é uma lista vazia.` };
  }
  if (status >= 500) {
    return { situacao: "falha", itens: [], mensagem: `O servidor falhou ao ler ${rotulo}. O que está na tela pode estar incompleto.` };
  }
  if (status >= 400) return { situacao: "invalido", itens: [], mensagem: `O servidor recusou a leitura de ${rotulo}.` };
  const lista = corpo && typeof corpo === "object" ? (corpo as Record<string, unknown>).items : undefined;
  if (!listaValida(lista)) return { situacao: "invalido", itens: [], mensagem: `A resposta de ${rotulo} não trouxe a lista esperada.` };
  if (lista.length === 0) return { situacao: "vazio", itens: [], mensagem: `Nenhum registro em ${rotulo}.` };
  return { situacao: "ok", itens: lista, mensagem: `${lista.length} registro(s) em ${rotulo}.` };
}

type Validado = { ok: boolean; erros: Record<string, string>; payload: Record<string, unknown> | null };

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const entre = (valor: string, min: number, max: number): boolean => valor.length >= min && valor.length <= max;
const numero = (valor: unknown): number | null => {
  const bruto = typeof valor === "number" ? String(valor) : texto(valor);
  if (bruto === "") return null;
  const convertido = Number(bruto.replace(",", "."));
  return Number.isFinite(convertido) ? convertido : Number.NaN;
};

function dataValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FormMetrica = {
  origin: string; campaign: string; channel: string;
  period_start: string; period_end: string;
  total_leads: string; converted_leads: string;
  total_opportunities: string; total_contracts: string; notes: string;
};

export function validarMetrica(form: FormMetrica): Validado {
  const erros: Record<string, string> = {};
  const origin = texto(form?.origin);
  const campaign = texto(form?.campaign);
  const channel = texto(form?.channel);
  const inicio = texto(form?.period_start);
  const fim = texto(form?.period_end);
  const notes = texto(form?.notes);
  if (!entre(origin, LIMITES.originMin, LIMITES.originMax)) erros.origin = ERROS.invalid_origin;
  if (campaign && !entre(campaign, LIMITES.campaignMin, LIMITES.campaignMax)) erros.campaign = ERROS.invalid_campaign;
  if (channel && !CANAIS.includes(channel as (typeof CANAIS)[number])) {
    erros.channel = `Canal fora da lista aceita pelo banco (${CANAIS.join(", ")}).`;
  }
  if (!inicio || !fim) erros.periodo = ERROS.missing_period;
  else if (!dataValida(inicio) || !dataValida(fim)) erros.periodo = "Use datas reais no formato AAAA-MM-DD.";
  else if (fim < inicio) erros.periodo = ERROS.invalid_period_end_before_start;
  const leads = numero(form?.total_leads) ?? 0;
  const convertidos = numero(form?.converted_leads) ?? 0;
  const oportunidades = numero(form?.total_opportunities) ?? 0;
  const contratos = numero(form?.total_contracts) ?? 0;
  if (!Number.isFinite(leads) || leads < 0) erros.total_leads = ERROS.invalid_total_leads;
  if (!Number.isFinite(convertidos) || convertidos < 0) erros.converted_leads = ERROS.invalid_converted;
  if (!Number.isFinite(oportunidades) || oportunidades < 0) erros.total_opportunities = "Oportunidades precisam ser número maior ou igual a zero.";
  if (!Number.isFinite(contratos) || contratos < 0) erros.total_contracts = "Contratos precisam ser número maior ou igual a zero.";
  if (!erros.converted_leads && !erros.total_leads && convertidos > leads) erros.converted_leads = ERROS.converted_exceeds_total;
  if (notes && !entre(notes, LIMITES.notesMin, LIMITES.notesMax)) erros.notes = ERROS.invalid_notes;
  if (Object.keys(erros).length) return { ok: false, erros, payload: null };
  return {
    ok: true, erros: {},
    payload: {
      origin, campaign: campaign || null, channel: channel || null,
      period_start: inicio, period_end: fim,
      total_leads: leads, converted_leads: convertidos,
      total_opportunities: oportunidades, total_contracts: contratos,
      notes: notes || null,
    },
  };
}

export type FormEvento = {
  event_type: string; origin: string; campaign: string; channel: string;
  lead_id: string; ip: string; user_agent: string;
};

export function validarEvento(form: FormEvento): Validado {
  const erros: Record<string, string> = {};
  const event_type = texto(form?.event_type);
  const origin = texto(form?.origin);
  const campaign = texto(form?.campaign);
  const channel = texto(form?.channel);
  const lead_id = texto(form?.lead_id);
  if (!EVENT_TYPES.includes(event_type as (typeof EVENT_TYPES)[number])) erros.event_type = ERROS.invalid_event_type;
  if (origin && !entre(origin, LIMITES.originMin, LIMITES.originMax)) erros.origin = ERROS.invalid_origin;
  if (campaign && !entre(campaign, LIMITES.campaignMin, LIMITES.campaignMax)) erros.campaign = ERROS.invalid_campaign;
  if (channel && !entre(channel, LIMITES.channelMin, LIMITES.channelMax)) erros.channel = ERROS.invalid_channel;
  // O servidor não valida o UUID: um id torto viraria 500 na coluna uuid.
  if (lead_id && !UUID.test(lead_id)) erros.lead_id = "O identificador do lead precisa ser UUID válido.";
  if (Object.keys(erros).length) return { ok: false, erros, payload: null };
  return {
    ok: true, erros: {},
    payload: {
      event_type, origin: origin || null, campaign: campaign || null, channel: channel || null,
      lead_id: lead_id || null,
      // O servidor calcula o SHA-256; a tela manda o valor e nunca o exibe de volta.
      ip: texto(form?.ip) || null,
      user_agent: texto(form?.user_agent) || null,
    },
  };
}

export type FormTeste = {
  test_key: string; hypothesis: string; description: string; metric_name: string;
  traffic_required: string; treatment: string; variant_a: string; variant_b: string;
};

export function validarTeste(form: FormTeste): Validado {
  const erros: Record<string, string> = {};
  const test_key = texto(form?.test_key).toLowerCase();
  const hypothesis = texto(form?.hypothesis);
  const description = texto(form?.description);
  const metric_name = texto(form?.metric_name);
  const treatment = texto(form?.treatment);
  const traffic_required = numero(form?.traffic_required);
  if (!entre(test_key, LIMITES.testKeyMin, LIMITES.testKeyMax)) erros.test_key = ERROS.invalid_test_key;
  else if (!/^[a-z0-9._-]+$/.test(test_key)) erros.test_key = "A chave do teste aceita apenas minúsculas, números, ponto, hífen e sublinhado.";
  if (!entre(hypothesis, LIMITES.hypothesisMin, LIMITES.hypothesisMax)) erros.hypothesis = ERROS.invalid_hypothesis;
  if (!entre(description, LIMITES.descriptionMin, LIMITES.descriptionMax)) erros.description = ERROS.invalid_description;
  if (!entre(metric_name, LIMITES.metricMin, LIMITES.metricMax)) erros.metric_name = ERROS.invalid_metric_name;
  if (traffic_required === null || !Number.isFinite(traffic_required) || traffic_required < LIMITES.trafficMin) {
    erros.traffic_required = ERROS.invalid_traffic_required;
  }
  if (!entre(treatment, LIMITES.treatmentMin, LIMITES.treatmentMax)) erros.treatment = ERROS.invalid_treatment;
  const variantes: Record<string, unknown> = {};
  for (const chave of ["variant_a", "variant_b"] as const) {
    const bruto = texto(form?.[chave]);
    if (!bruto) { variantes[chave] = {}; continue; }
    try { variantes[chave] = JSON.parse(bruto); }
    catch { erros[chave] = "A variante precisa ser JSON válido antes de qualquer envio."; }
  }
  if (Object.keys(erros).length) return { ok: false, erros, payload: null };
  return {
    ok: true, erros: {},
    payload: {
      test_key, hypothesis, description, metric_name,
      traffic_required,
      treatment,
      variant_a: variantes.variant_a, variant_b: variantes.variant_b,
    },
  };
}

/** Mudança de situação: motivo é obrigatório porque vai para o histórico. */
export function validarTransicao(id: string, status: string, motivo: string, vencedor?: string): Validado {
  const erros: Record<string, string> = {};
  if (!texto(id)) erros.id = ERROS.missing_id;
  if (!STATUS_AB.includes(texto(status) as (typeof STATUS_AB)[number])) erros.status = ERROS.invalid_status;
  const reason = texto(motivo);
  if (!entre(reason, LIMITES.reasonMin, LIMITES.reasonMax)) erros.reason = ERROS.invalid_reason;
  const winner = texto(vencedor);
  if (status === "concluido") {
    if (!VENCEDORES.includes(winner as (typeof VENCEDORES)[number])) erros.winner = ERROS.invalid_winner;
  } else if (winner && !VENCEDORES.includes(winner as (typeof VENCEDORES)[number])) {
    erros.winner = ERROS.invalid_winner;
  }
  if (Object.keys(erros).length) return { ok: false, erros, payload: null };
  return {
    ok: true, erros: {},
    payload: {
      id, status, reason,
      winner: winner || undefined,
      ...(status === "concluido" ? { result_data: { conclusion: winner } } : {}),
    },
  };
}

/** Próximos passos oferecidos pela tela a partir da situação atual. */
export function proximosEstados(status: unknown): readonly (typeof STATUS_AB)[number][] {
  const atual = texto(status) as (typeof STATUS_AB)[number];
  return TRANSICOES[atual] ?? [];
}

/** Leitura honesta de um experimento concluído (ou não). */
export function situacaoExperimento(item: Record<string, unknown>): { situacao: string; rotulo: string } {
  const status = texto(item?.status) as (typeof STATUS_AB)[number];
  const winner = texto(item?.winner);
  if (!STATUS_AB.includes(status)) return { situacao: "desconhecida", rotulo: "situação não reconhecida" };
  if (status === "concluido") {
    if (!winner) return { situacao: "concluido_sem_vencedor", rotulo: "concluído sem vencedor declarado" };
    return { situacao: "concluido_com_vencedor", rotulo: winner === "empate" ? "concluído: empate" : winner === "inconclusivo" ? "concluído: inconclusivo" : `concluído: venceu ${winner}` };
  }
  if (status === "em_execucao") {
    const trafego = numero(item?.traffic_required);
    return { situacao: "em_execucao", rotulo: `em execução — tráfego exigido ${Number.isFinite(trafego as number) ? String(trafego) : "?"}` };
  }
  return { situacao: status, rotulo: status.replaceAll("_", " ") };
}

/**
 * O que a tela pode afirmar sobre o hash do evento.
 *
 * `hashValue` do servidor chama `require('node:crypto')` dentro de um módulo
 * ESM: o `require` não existe, o erro é engolido pelo `catch` e o INSERT grava
 * `NULL`. Ou seja, hoje **nenhum** hash é produzido — e a tela não pode dizer
 * que o IP "virou hash".
 */
export function situacaoHash(item: Record<string, unknown>): { situacao: "ip_e_ua" | "parcial" | "sem_hash"; rotulo: string } {
  const ip = texto(item?.ip_hash);
  const userAgent = texto(item?.user_agent_hash);
  if (ip && userAgent) return { situacao: "ip_e_ua", rotulo: "ip e user-agent em hash" };
  if (ip || userAgent) return { situacao: "parcial", rotulo: "hash parcial" };
  return { situacao: "sem_hash", rotulo: "sem hash gravado" };
}

/** Data curta: o servidor devolve ISO completo e a lista mostra só o dia. */
export function dataCurta(valor: unknown): string {
  const bruto = texto(valor);
  if (!bruto) return "—";
  const dia = bruto.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : bruto;
}

/** Taxa exibida sem inventar número quando não há leads. */
export function taxaConversao(item: Record<string, unknown>): string {
  const bruta = item?.conversion_rate;
  if (bruta !== null && bruta !== undefined && bruta !== "") {
    const valor = Number(bruta);
    if (Number.isFinite(valor)) return `${valor.toFixed(2)}%`;
  }
  const leads = numero(item?.total_leads);
  const convertidos = numero(item?.converted_leads);
  if (leads === null || convertidos === null || !Number.isFinite(leads) || !Number.isFinite(convertidos) || leads <= 0) return "—";
  return `${((convertidos / leads) * 100).toFixed(2)}%`;
}
