/**
 * Estado do app do funcionário: configuração do PWA e FAQ interna (EMP-18/EMP-19).
 *
 * Puro: sem React, sem DOM, sem `fetch`.
 *
 * O que o protótipo escondia e o servidor não sustentava:
 *
 *  1. as cinco leituras vinham de `/api/hr/*` — caminho que passa pela **borda
 *     legada de RH** (`authorizeLegacyHrRequest`), que exige `employees.read`.
 *     Só os papéis `rh` e `marcelo` recebem essa permissão automática
 *     (migrações 102 e 180), então `ti` — o papel que monta esta tela — recebia
 *     **403 em tudo**. A tela promovida usa o alias canônico
 *     `/api/admin/pwa-configs` e `/api/admin/faq-internal`, fora da borda, e o
 *     gate prova que os aliases antigos **continuam 403** para `ti`;
 *  2. cada leitura terminava em `.catch(()=>({…:[]}))`: negação virava "nada
 *     aqui";
 *  3. `status` da FAQ era oferecido por botões fixos, em qualquer ordem, e o
 *     servidor aceita os quatro valores a qualquer momento;
 *  4. o `PATCH` do servidor não validava nada: valor fora do CHECK do banco
 *     (fila 0, display inventado, descrição curta, categoria inexistente, nível
 *     de leitura inválido) voltava como **500**, não 400;
 *  5. fila offline, conflitos, log de acesso ao FAQ e preferências de
 *     acessibilidade são **dado de funcionário** e continuam atrás de
 *     `employees.read`: esta tela não oferece botão que sempre falha.
 */

export type Situacao = "ok" | "vazio" | "negado" | "falha" | "invalido";

/** Espelho do enum `emp_pwa_display` (migração 069). */
export const DISPLAY = ["standalone", "minimal-ui", "browser", "fullscreen"] as const;

/** Espelho do enum `emp_offline_task_type` (migração 069). */
export const TAREFAS_OFFLINE = [
  "occurrence", "handover", "absence_notice", "shift_swap",
  "procedure_ack", "journey_proof", "absence_followup", "occurrence_action",
] as const;

/** Espelho do enum `emp_faq_category` (migração 069). */
export const CATEGORIAS_FAQ = [
  "geral", "escala", "ponto", "beneficios", "uniformes",
  "seguranca", "procedimentos", "rh", "tecnico", "outro",
] as const;

/** Espelho do enum `emp_faq_status` (migração 069). */
export const STATUS_FAQ = ["rascunho", "em_revisao", "publicado", "arquivado"] as const;

/** Espelho do CHECK de `emp_faq_internal.reading_level` (migração 069). */
export const NIVEIS_LEITURA = ["simples", "medio", "tecnico"] as const;

/**
 * Política **desta tela**. O servidor confere o valor da situação, não a ordem.
 * Publicar liga `is_published` e grava `published_at`/`published_by`; arquivar
 * desliga a publicação.
 */
export const TRANSICOES_FAQ: Readonly<Record<(typeof STATUS_FAQ)[number], readonly (typeof STATUS_FAQ)[number][]>> =
  Object.freeze({
    rascunho: ["em_revisao", "arquivado"],
    em_revisao: ["publicado", "arquivado"],
    publicado: ["arquivado"],
    arquivado: ["rascunho"],
  });

export const AVISO_BORDA =
  "Os aliases /api/hr/pwa-configs e /api/hr/faq-internal passam pela borda legada de RH e exigem a permissão employees.read, que só rh e marcelo recebem automática — por isso esta tela usa os caminhos canônicos de administração. Os aliases antigos continuam existindo e continuam negando ti.";

export const AVISO_ATIVO =
  "Desligar a última configuração ativa faz o manifest cair no padrão embutido no código: a tela avisa em vez de tratar isso como sucesso silencioso.";

export const AVISO_OFFLINE =
  "Fila offline, conflitos, log de acesso ao FAQ e preferências de acessibilidade são dado de funcionário e seguem atrás de employees.read. Esta tela não oferece botão que sempre falha: essas leituras são declaradas, não montadas.";

export const AVISO_FAQ =
  "Publicar exige resposta de 20 a 5.000 caracteres e pergunta de 10 a 500. O banco só aceita publicado com is_published ligado; esta tela nunca desliga a publicação por edição silenciosa de outro campo.";

export const LIMITES = Object.freeze({
  nomeMin: 3, nomeMax: 100,
  apelidoMin: 2, apelidoMax: 20,
  descricaoMin: 10, descricaoMax: 500,
  scopeMin: 1, scopeMax: 200,
  startUrlMin: 1, startUrlMax: 500,
  filaMin: 1, filaMax: 200,
  retriesMin: 1, retriesMax: 20,
  perguntaMin: 10, perguntaMax: 500,
  respostaMin: 20, respostaMax: 5000,
  tagsMax: 20, tagMax: 50,
});

const ERROS: Readonly<Record<string, string>> = {
  unauthorized: "Sessão expirada. Entre novamente para ver o app do funcionário.",
  admin_session_required: "Sessão expirada. Entre novamente.",
  employee_permission_required: "A borda legada de RH nega este caminho: falta a permissão employees.read.",
  forbidden: "Sua sessão não pode administrar esta configuração (papel admin ou ti).",
  same_origin_required: "A escrita precisa vir da própria origem do painel.",
  invalid_json: "O servidor não entendeu o corpo enviado.",
  invalid_id: "Identificador inválido.",
  not_found: "Registro não encontrado — pode ter sido removido.",
  no_fields: "Nenhum campo para atualizar.",
  invalid_name: "O nome do app precisa ter de 3 a 100 caracteres.",
  invalid_short_name: "O nome curto precisa ter de 2 a 20 caracteres.",
  invalid_description: "A descrição precisa ter de 10 a 500 caracteres.",
  invalid_theme_color: "A cor de tema precisa ser hexadecimal no formato #rrggbb.",
  invalid_background_color: "A cor de fundo precisa ser hexadecimal no formato #rrggbb.",
  invalid_display: "Modo de exibição fora da lista aceita pelo banco.",
  invalid_scope: "O escopo precisa ter de 1 a 200 caracteres.",
  invalid_start_url: "A URL inicial precisa ter de 1 a 500 caracteres.",
  invalid_approved_offline_tasks: "Tarefa offline fora da lista aceita pelo banco.",
  invalid_max_queue_size: "O tamanho da fila precisa ser inteiro de 1 a 200.",
  invalid_max_retries: "As tentativas precisam ser inteiras de 1 a 20.",
  invalid_do_not_cache_patterns: "Os padrões de não-cache precisam ser lista de até 50 itens de 200 caracteres.",
  invalid_question: "A pergunta precisa ter de 10 a 500 caracteres.",
  invalid_answer: "A resposta precisa ter de 20 a 5.000 caracteres.",
  invalid_category: "Categoria fora da lista aceita pelo banco.",
  invalid_status: "Situação da FAQ inválida.",
  invalid_reading_level: "Nível de leitura fora da lista aceita pelo banco.",
  invalid_tags: "As etiquetas precisam ser até 20 itens de 50 caracteres.",
  invalid_faq_id: "Identificador de FAQ inválido.",
  invalid_employee_id: "Identificador de funcionário inválido.",
  method_not_allowed: "O servidor não aceita este método nesta rota.",
  internal_error: "O servidor falhou. Nada foi confirmado — confira antes de repetir.",
};

export function traduzirErroEmp(status: number, codigo: string): string {
  if (codigo && ERROS[codigo]) return ERROS[codigo];
  if (status === 401) return ERROS.admin_session_required;
  if (status === 403) return ERROS.same_origin_required;
  if (status === 404) return ERROS.not_found;
  if (status === 405) return ERROS.method_not_allowed;
  if (status >= 500) return ERROS.internal_error;
  if (status >= 400) return "O servidor recusou a gravação. Confira os campos e tente novamente.";
  return "Não foi possível confirmar a gravação.";
}

export type ResultadoLista = { situacao: Situacao; itens: Record<string, unknown>[]; mensagem: string };

function listaValida(lista: unknown): lista is Record<string, unknown>[] {
  return Array.isArray(lista) && lista.every(item => item !== null && typeof item === "object" && !Array.isArray(item));
}

/** As duas leituras respondem `{configs: [...]}` e `{faqs: [...]}`. */
export function classificarLista(status: number, corpo: unknown, chave: "configs" | "faqs", rotulo: string): ResultadoLista {
  if (!status) return { situacao: "falha", itens: [], mensagem: `Falha de rede ao ler ${rotulo}. Tente novamente.` };
  if (status === 401 || status === 403) {
    return { situacao: "negado", itens: [], mensagem: `Sua sessão não pode ler ${rotulo}. Nada foi exibido — isto não é uma lista vazia.` };
  }
  if (status >= 500) {
    return { situacao: "falha", itens: [], mensagem: `O servidor falhou ao ler ${rotulo}. O que está na tela pode estar incompleto.` };
  }
  if (status >= 400) return { situacao: "invalido", itens: [], mensagem: `O servidor recusou a leitura de ${rotulo}.` };
  const lista = corpo && typeof corpo === "object" ? (corpo as Record<string, unknown>)[chave] : undefined;
  if (!listaValida(lista)) return { situacao: "invalido", itens: [], mensagem: `A resposta de ${rotulo} não trouxe a lista esperada.` };
  if (lista.length === 0) return { situacao: "vazio", itens: [], mensagem: `Nenhum registro em ${rotulo}.` };
  return { situacao: "ok", itens: lista, mensagem: `${lista.length} registro(s) em ${rotulo}.` };
}

type Validado = { ok: boolean; erros: Record<string, string>; payload: Record<string, unknown> | null };

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const entre = (valor: string, min: number, max: number): boolean => valor.length >= min && valor.length <= max;
const HEX = /^#[0-9a-f]{6}$/i;
const INTEIRO = (valor: unknown): number | null => {
  const bruto = typeof valor === "number" ? valor : Number(texto(valor));
  return Number.isInteger(bruto) ? bruto : null;
};

export type FormConfig = {
  name: string;
  short_name: string;
  description: string;
  theme_color: string;
  background_color: string;
  display: string;
  scope: string;
  start_url: string;
  max_queue_size: string;
  max_retries: string;
  tarefas: string[];
};

export function validarConfig(form: FormConfig): Validado {
  const erros: Record<string, string> = {};
  const name = texto(form?.name);
  const short_name = texto(form?.short_name);
  const description = texto(form?.description);
  const theme_color = texto(form?.theme_color);
  const background_color = texto(form?.background_color);
  const display = texto(form?.display);
  const scope = texto(form?.scope) || "/";
  const start_url = texto(form?.start_url) || "/";
  const fila = INTEIRO(form?.max_queue_size ?? "50");
  const retries = INTEIRO(form?.max_retries ?? "5");
  const tarefas = Array.isArray(form?.tarefas) ? form.tarefas : [];
  if (!entre(name, LIMITES.nomeMin, LIMITES.nomeMax)) erros.name = ERROS.invalid_name;
  if (!entre(short_name, LIMITES.apelidoMin, LIMITES.apelidoMax)) erros.short_name = ERROS.invalid_short_name;
  if (!entre(description, LIMITES.descricaoMin, LIMITES.descricaoMax)) erros.description = ERROS.invalid_description;
  if (!HEX.test(theme_color)) erros.theme_color = ERROS.invalid_theme_color;
  if (!HEX.test(background_color)) erros.background_color = ERROS.invalid_background_color;
  if (!DISPLAY.includes(display as (typeof DISPLAY)[number])) erros.display = ERROS.invalid_display;
  if (!entre(scope, LIMITES.scopeMin, LIMITES.scopeMax)) erros.scope = ERROS.invalid_scope;
  if (!entre(start_url, LIMITES.startUrlMin, LIMITES.startUrlMax)) erros.start_url = ERROS.invalid_start_url;
  // O CHECK do banco é 1..200 e 1..20: fora disso o PATCH antigo devolvia 500.
  if (fila === null || fila < LIMITES.filaMin || fila > LIMITES.filaMax) erros.max_queue_size = ERROS.invalid_max_queue_size;
  if (retries === null || retries < LIMITES.retriesMin || retries > LIMITES.retriesMax) erros.max_retries = ERROS.invalid_max_retries;
  if (tarefas.some(item => !TAREFAS_OFFLINE.includes(item as (typeof TAREFAS_OFFLINE)[number]))) {
    erros.tarefas = ERROS.invalid_approved_offline_tasks;
  }
  if (Object.keys(erros).length) return { ok: false, erros, payload: null };
  return {
    ok: true,
    erros: {},
    payload: {
      name, short_name, description, theme_color, background_color, display, scope, start_url,
      max_queue_size: fila, max_retries: retries,
      approved_offline_tasks: tarefas,
    },
  };
}

export type FormFaq = {
  question: string;
  answer: string;
  category: string;
  status: string;
  reading_level: string;
  tags: string;
  is_simple_language: boolean;
  is_low_data: boolean;
};

export function validarFaq(form: FormFaq): Validado {
  const erros: Record<string, string> = {};
  const question = texto(form?.question);
  const answer = texto(form?.answer);
  const category = texto(form?.category);
  const status = texto(form?.status);
  const reading_level = texto(form?.reading_level);
  const tags = texto(form?.tags)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  if (!entre(question, LIMITES.perguntaMin, LIMITES.perguntaMax)) erros.question = ERROS.invalid_question;
  if (!entre(answer, LIMITES.respostaMin, LIMITES.respostaMax)) erros.answer = ERROS.invalid_answer;
  if (!CATEGORIAS_FAQ.includes(category as (typeof CATEGORIAS_FAQ)[number])) erros.category = ERROS.invalid_category;
  if (!STATUS_FAQ.includes(status as (typeof STATUS_FAQ)[number])) erros.status = ERROS.invalid_status;
  if (!NIVEIS_LEITURA.includes(reading_level as (typeof NIVEIS_LEITURA)[number])) erros.reading_level = ERROS.invalid_reading_level;
  if (tags.length > LIMITES.tagsMax || tags.some(tag => tag.length > LIMITES.tagMax)) erros.tags = ERROS.invalid_tags;
  if (Object.keys(erros).length) return { ok: false, erros, payload: null };
  return {
    ok: true,
    erros: {},
    payload: {
      question, answer, category, status, reading_level, tags,
      is_simple_language: Boolean(form.is_simple_language),
      is_low_data: Boolean(form.is_low_data),
    },
  };
}

export function proximosEstados(situacao: unknown): readonly string[] {
  const atual = String(situacao ?? "");
  return (TRANSICOES_FAQ as Record<string, readonly string[]>)[atual] ?? [];
}

export function validarTransicao(id: string, destino: string, situacaoAtual: unknown): Validado {
  const erros: Record<string, string> = {};
  const alvo = texto(destino);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto(id))) erros.id = ERROS.invalid_id;
  if (!STATUS_FAQ.includes(alvo as (typeof STATUS_FAQ)[number])) erros.status = ERROS.invalid_status;
  else if (!proximosEstados(situacaoAtual).includes(alvo)) {
    erros.status = `De ${String(situacaoAtual || "situação desconhecida")} não se vai para ${alvo} nesta tela.`;
  }
  if (Object.keys(erros).length) return { ok: false, erros, payload: null };
  return { ok: true, erros: {}, payload: { id: texto(id), status: alvo } };
}

/** `true`/`false` do banco não responde à pergunta do operador. */
export function simNao(valor: unknown): string {
  return valor === true ? "ligado" : valor === false ? "desligado" : "não informado";
}

export function estadoConfig(item: Record<string, unknown>): string {
  return item?.is_active === true ? "ativa" : item?.is_active === false ? "inativa" : "não informada";
}

export function tarefasLegiveis(item: Record<string, unknown>): string {
  const lista = Array.isArray(item?.approved_offline_tasks) ? item.approved_offline_tasks : [];
  return lista.length ? lista.map(String).join(", ") : "nenhuma tarefa offline aprovada";
}

export function tagsLegiveis(item: Record<string, unknown>): string {
  const lista = Array.isArray(item?.tags) ? item.tags : [];
  return lista.length ? lista.map(String).join(", ") : "sem etiquetas";
}

export function chaveConfig(item: Record<string, unknown>): string {
  const versao = item?.version == null ? "?" : String(item.version);
  const ativo = item?.is_active === true ? "ativa" : "inativa";
  return `v${versao}-${ativo}`;
}

export function chaveFaq(item: Record<string, unknown>): string {
  const categoria = texto(item?.category) || "sem-categoria";
  const pergunta = texto(item?.question).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "sem-pergunta";
  return `${categoria}-${pergunta}`;
}
