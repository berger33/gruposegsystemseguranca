/**
 * Estado das preferências de notificação e dos modelos de mensagem (PLT-05).
 *
 * Puro: sem React, sem DOM, sem `fetch`.
 *
 * O que o protótipo fazia e o servidor não sustenta:
 *
 *  1. `any` em toda parte e nenhuma leitura automática: as duas listas só
 *     apareciam depois de o operador clicar em "Carregar preferências" e
 *     "Carregar templates". Erro de leitura virava mensagem solta — a tela
 *     continuava parecendo vazia;
 *  2. os quatro botões de situação (`aprovado`, `em_revisao`, `arquivado`,
 *     `rejeitado`) apareciam em **qualquer** modelo, em qualquer ordem;
 *  3. a rejeição mandava `rejection_reason: 'Conteúdo não conforme PLT-05'`
 *     **fixo no código**: o motivo gravado no registro não era o do operador;
 *  4. "salvar preferência" não distinguia preferência **global** (sem
 *     destinatário) de preferência **por pessoa**, e o servidor gravava uma
 *     linha nova a cada gravação global em vez de atualizar a existente;
 *  5. o silêncio (quiet hours) era aceito como texto livre: valor inválido não
 *     virava 400 — virava falha de servidor;
 *  6. o modelo podia ser **aprovado** depois de criado com informação médica
 *     no corpo (`is_medical_safe: false`). PLT-05 pede o contrário.
 *
 * Nada disso é inferido: cada afirmação acima é medida no gate do portal
 * (`browser UX-PRO-03 PLT-05`) contra PostgreSQL real.
 */

export type Situacao = "ok" | "vazio" | "negado" | "falha" | "invalido";

/** Espelho do CHECK `crm_notification_channel` (migração 043). */
export const CANAIS = ["email", "whatsapp", "sms", "push", "webhook", "internal", "sistema"] as const;

/** Espelho do CHECK `recipient_kind IN (...)` (migração 043). */
export const TIPOS_DESTINATARIO = ["client", "staff", "lead", "system", "marcelo", "ti", "admin", "rh"] as const;

/** Espelho do CHECK `crm_notification_template_status` (migração 043). */
export const STATUS_MODELO = ["rascunho", "em_revisao", "aprovado", "rejeitado", "arquivado"] as const;

/**
 * Política **desta tela**. O servidor confere o valor da situação, não a
 * ordem: `PATCH` aceita qualquer um dos cinco valores a qualquer momento.
 */
export const TRANSICOES: Readonly<Record<(typeof STATUS_MODELO)[number], readonly (typeof STATUS_MODELO)[number][]>> =
  Object.freeze({
    rascunho: ["em_revisao", "arquivado"],
    em_revisao: ["aprovado", "rejeitado", "arquivado"],
    aprovado: ["arquivado"],
    rejeitado: ["rascunho", "arquivado"],
    arquivado: ["rascunho"],
  });

/** Situações oferecidas na criação: aprovar exige revisão registrada. */
export const STATUS_NA_CRIACAO = ["rascunho", "em_revisao"] as const;

export const AVISO_ORDEM =
  "A ordem das situações do modelo é política desta tela. O servidor confere o valor da situação, não a sequência — por isso a tela só oferece o próximo passo do ciclo.";

export const AVISO_APROVACAO =
  "Aprovar ou rejeitar um modelo exige papel admin ou ti no servidor; qualquer outro papel recebe 403 e a tela não finge que aprovou.";

export const AVISO_MEDICO =
  "PLT-05: nenhuma informação médica (prontuário, diagnóstico, CID, laudo, medicação) em assunto ou canal push. O servidor recusa esses termos e a tela avisa antes de enviar.";

export const AVISO_REJEICAO =
  "Rejeitar exige motivo escrito por quem rejeita: é esse texto que fica gravado no modelo, não uma frase pronta do código.";

export const AVISO_PREFERENCIA =
  "Preferência sem destinatário é global para o tipo escolhido e é atualizada, não duplicada. Preferência com destinatário vale para aquela identidade.";

export const AVISO_QUIET_HOURS =
  "O silêncio usa hora cheia e minuto (HH:MM) e vale em par: sem início e fim juntos, o servidor recusa a gravação.";

export const AVISO_SESSAO =
  "Leitura e escrita exigem sessão administrativa. Papel sem permissão recebe 401/403 — a tela mostra a negativa em vez de uma lista vazia.";

export const LIMITES = Object.freeze({
  chaveMin: 1, chaveMax: 100,
  assuntoMax: 200,
  corpoMin: 1, corpoMax: 5000,
  motivoMin: 1, motivoMax: 1000,
  observacaoMin: 1, observacaoMax: 1000,
  emailMin: 5, emailMax: 320,
});

/**
 * Mesma lista de termos do servidor (`containsMedicalInfo`) e o mesmo padrão de
 * CPF. Duplicada de propósito: a tela precisa avisar **antes** do POST, e o
 * teste focal compara as duas listas para que não divirjam em silêncio.
 */
export const TERMOS_MEDICOS = [
  "prontuario", "prontuário", "diagnostico", "diagnóstico", "cid ", "doença", "sintoma",
  "exame médico", "atestado médico", "receita médica", "medicação", "medicamento",
  "tratamento médico", "laudo", "histórico médico", "histórico clínico",
] as const;

const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;

export function contemInfoMedica(texto: unknown): boolean {
  if (typeof texto !== "string" || !texto.trim()) return false;
  const minusculo = texto.toLowerCase();
  if (TERMOS_MEDICOS.some(termo => minusculo.includes(termo))) return true;
  return CPF.test(minusculo);
}

const ERROS: Readonly<Record<string, string>> = {
  admin_session_required: "Sessão expirada. Entre novamente para ver as preferências.",
  unauthorized: "Sessão expirada ou sem papel administrativo para notificações.",
  same_origin_required: "A escrita precisa vir da própria origem do painel.",
  invalid_recipient_kind: "Tipo de destinatário fora da lista aceita pelo banco.",
  invalid_channel: "Canal fora da lista aceita pelo banco.",
  invalid_recipient_id: "O destinatário precisa ser identificador (UUID) válido.",
  invalid_quiet_hours: "O silêncio precisa ser hora cheia no formato HH:MM, com início e fim juntos.",
  preference_update_failed: "O servidor não conseguiu gravar a preferência. Nada foi confirmado.",
  preferences_unavailable: "O servidor falhou ao ler as preferências. O que está na tela pode estar incompleto.",
  invalid_template_key: "A chave do modelo precisa ter de 1 a 100 caracteres.",
  invalid_body: "O corpo do modelo precisa ter de 1 a 5.000 caracteres.",
  invalid_status: "Situação de modelo inválida.",
  medical_info_not_allowed_in_subject: "O assunto contém informação médica — proibido pelo PLT-05.",
  medical_info_not_allowed_in_push: "Canal push não aceita informação médica (PLT-05).",
  medical_info_not_allowed_in_subject_push:
    "Informação médica não é permitida no assunto nem no canal push (PLT-05). Remova prontuário, diagnóstico, CID, laudo e afins.",
  medical_safety_required: "O modelo contém informação médica e não pode ser aprovado (PLT-05).",
  approval_requires_admin_ti: "Aprovar ou rejeitar modelo exige papel admin ou ti.",
  rejection_reason_required: "Rejeitar exige motivo escrito.",
  template_create_failed: "O servidor não conseguiu criar o modelo. Nada foi confirmado.",
  template_update_failed: "O servidor não conseguiu atualizar o modelo. Nada foi confirmado.",
  templates_unavailable: "O servidor falhou ao ler os modelos. O que está na tela pode estar incompleto.",
  template_unavailable: "O servidor falhou ao ler o modelo.",
  invalid_template_id: "Identificador de modelo inválido.",
  invalid_json: "O servidor não entendeu o corpo enviado.",
  no_fields: "Nenhum campo para atualizar.",
  not_found: "Modelo não encontrado — pode ter sido removido.",
  method_not_allowed: "O servidor não aceita este método nesta rota.",
};

export function traduzirErroPlt(status: number, codigo: string): string {
  if (codigo && ERROS[codigo]) return ERROS[codigo];
  if (status === 401) return ERROS.admin_session_required;
  if (status === 403) return ERROS.same_origin_required;
  if (status === 404) return ERROS.not_found;
  if (status === 405) return ERROS.method_not_allowed;
  if (status >= 500) return "O servidor falhou. Nada foi confirmado — confira antes de repetir.";
  if (status >= 400) return "O servidor recusou a gravação. Confira os campos e tente novamente.";
  return "Não foi possível confirmar a gravação.";
}

export type ResultadoLista = { situacao: Situacao; itens: Record<string, unknown>[]; mensagem: string };

function listaValida(lista: unknown): lista is Record<string, unknown>[] {
  return Array.isArray(lista) && lista.every(item => item !== null && typeof item === "object" && !Array.isArray(item));
}

/**
 * As duas leituras respondem `{preferences: [...]}` e `{templates: [...]}`. O
 * `403`/`401` aqui é **negativa**, não lista vazia: antes da promoção os três
 * erros viravam uma tela em branco sem explicação.
 */
export function classificarLista(status: number, corpo: unknown, chave: "preferences" | "templates", rotulo: string): ResultadoLista {
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export type FormPreferencia = {
  recipient_kind: string;
  channel: string;
  recipient_id: string;
  recipient_email: string;
  is_enabled: boolean;
  is_email_enabled: boolean;
  is_push_enabled: boolean;
  is_whatsapp_enabled: boolean;
  is_sms_enabled: boolean;
  is_internal_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

export function validarPreferencia(form: FormPreferencia): Validado {
  const erros: Record<string, string> = {};
  const kind = texto(form?.recipient_kind);
  const channel = texto(form?.channel);
  const destinatario = texto(form?.recipient_id);
  const email = texto(form?.recipient_email);
  const inicio = texto(form?.quiet_hours_start);
  const fim = texto(form?.quiet_hours_end);
  if (!TIPOS_DESTINATARIO.includes(kind as (typeof TIPOS_DESTINATARIO)[number])) erros.recipient_kind = ERROS.invalid_recipient_kind;
  if (!CANAIS.includes(channel as (typeof CANAIS)[number])) erros.channel = ERROS.invalid_channel;
  if (destinatario && !UUID.test(destinatario)) erros.recipient_id = ERROS.invalid_recipient_id;
  if (email && !entre(email, LIMITES.emailMin, LIMITES.emailMax)) {
    erros.recipient_email = "O e-mail do destinatário precisa ter de 5 a 320 caracteres.";
  }
  // O servidor só descobria isso no banco: valor inválido virava falha de servidor.
  if (Boolean(inicio) !== Boolean(fim)) erros.quiet_hours = ERROS.invalid_quiet_hours;
  else if (inicio && fim && (!HORA.test(inicio) || !HORA.test(fim))) erros.quiet_hours = ERROS.invalid_quiet_hours;
  if (Object.keys(erros).length) return { ok: false, erros, payload: null };
  return {
    ok: true,
    erros: {},
    payload: {
      recipient_kind: kind,
      channel,
      recipient_id: destinatario || null,
      recipient_email: email || null,
      is_enabled: Boolean(form.is_enabled),
      is_email_enabled: Boolean(form.is_email_enabled),
      is_push_enabled: Boolean(form.is_push_enabled),
      is_whatsapp_enabled: Boolean(form.is_whatsapp_enabled),
      is_sms_enabled: Boolean(form.is_sms_enabled),
      is_internal_enabled: Boolean(form.is_internal_enabled),
      quiet_hours_start: inicio || null,
      quiet_hours_end: fim || null,
    },
  };
}

export type FormModelo = {
  template_key: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  medical_review_note: string;
};

export function validarModelo(form: FormModelo): Validado {
  const erros: Record<string, string> = {};
  const chave = texto(form?.template_key);
  const channel = texto(form?.channel);
  const subject = texto(form?.subject);
  const body = texto(form?.body);
  const status = texto(form?.status) || "rascunho";
  const observacao = texto(form?.medical_review_note);
  if (!entre(chave, LIMITES.chaveMin, LIMITES.chaveMax)) erros.template_key = ERROS.invalid_template_key;
  if (!CANAIS.includes(channel as (typeof CANAIS)[number])) erros.channel = ERROS.invalid_channel;
  if (subject && subject.length > LIMITES.assuntoMax) erros.subject = `O assunto aceita no máximo ${LIMITES.assuntoMax} caracteres.`;
  if (!entre(body, LIMITES.corpoMin, LIMITES.corpoMax)) erros.body = ERROS.invalid_body;
  if (!STATUS_NA_CRIACAO.includes(status as (typeof STATUS_NA_CRIACAO)[number])) {
    erros.status = "Criar já aprovado pularia a revisão: escolha rascunho ou em revisão.";
  }
  if (observacao && !entre(observacao, LIMITES.observacaoMin, LIMITES.observacaoMax)) {
    erros.medical_review_note = "A observação de revisão aceita de 1 a 1.000 caracteres.";
  }
  // O servidor recusa estes casos com 400; a tela avisa antes de enviar.
  if (subject && contemInfoMedica(subject)) erros.subject = ERROS.medical_info_not_allowed_in_subject;
  if (channel === "push" && contemInfoMedica(body)) erros.body = ERROS.medical_info_not_allowed_in_push;
  if (Object.keys(erros).length) return { ok: false, erros, payload: null };
  return {
    ok: true,
    erros: {},
    payload: {
      template_key: chave,
      channel,
      subject: subject || null,
      body,
      status,
      medical_review_note: observacao || null,
    },
  };
}

export function proximosEstados(situacao: unknown): readonly string[] {
  const atual = String(situacao ?? "");
  return (TRANSICOES as Record<string, readonly string[]>)[atual] ?? [];
}

export function validarTransicao(id: string, destino: string, motivo: string, situacaoAtual: unknown): Validado {
  const erros: Record<string, string> = {};
  const alvo = texto(destino);
  const razao = texto(motivo);
  if (!UUID.test(texto(id))) erros.id = "Modelo inválido.";
  if (!STATUS_MODELO.includes(alvo as (typeof STATUS_MODELO)[number])) erros.status = "Situação de modelo inválida.";
  else if (!proximosEstados(situacaoAtual).includes(alvo)) {
    erros.status = `De ${String(situacaoAtual || "situação desconhecida")} não se vai para ${alvo} nesta tela.`;
  }
  if (alvo === "rejeitado" && !entre(razao, LIMITES.motivoMin, LIMITES.motivoMax)) erros.reason = ERROS.rejection_reason_required;
  if (Object.keys(erros).length) return { ok: false, erros, payload: null };
  const payload: Record<string, unknown> = { status: alvo };
  if (alvo === "rejeitado") payload.rejection_reason = razao;
  return { ok: true, erros: {}, payload };
}

/** `false`/`true` do banco não é resposta para operador. */
export function simNao(valor: unknown): string {
  return valor === true ? "ligado" : valor === false ? "desligado" : "não informado";
}

/** `quiet_hours_start` chega como `HH:MM:SS`; a tela mostra `HH:MM`. */
export function horaCurta(valor: unknown): string {
  const bruto = texto(valor);
  if (!bruto) return "";
  const partes = bruto.split(":");
  return partes.length >= 2 ? `${partes[0].padStart(2, "0")}:${partes[1]}` : bruto;
}

export function janelaSilencio(item: Record<string, unknown>): string {
  const inicio = horaCurta(item?.quiet_hours_start);
  const fim = horaCurta(item?.quiet_hours_end);
  if (!inicio && !fim) return "sem silêncio";
  return `silêncio ${inicio || "?"}–${fim || "?"}`;
}

/** Identidade visual estável de uma preferência nas listas e nos testes. */
export function chavePreferencia(item: Record<string, unknown>): string {
  const kind = texto(item?.recipient_kind) || "desconhecido";
  const channel = texto(item?.channel) || "desconhecido";
  return `${kind}-${channel}-${texto(item?.recipient_id) ? "destinatario" : "global"}`;
}

export function chaveModelo(item: Record<string, unknown>): string {
  const chave = texto(item?.template_key) || "sem-chave";
  const channel = texto(item?.channel) || "desconhecido";
  const versao = item?.version == null ? "?" : String(item.version);
  return `${chave}-${channel}-v${versao}`;
}
