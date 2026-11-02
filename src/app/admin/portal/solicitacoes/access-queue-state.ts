// UX-PRO-06 — estado de LEITURA e de ESCRITA da fila de acesso do portal
// (CLI-13 administrativo, `/admin/portal/solicitacoes`).
//
// A tela já era viva e já chamava a API real (`GET/PATCH` de modos e de
// pedidos), mas não tinha estado: as duas leituras eram um `Promise.all` só,
// qualquer falha virava a MESMA frase, a fila aparecia como "vazia" mesmo
// quando a leitura tinha falhado ou devolvido lixo, a negativa mantinha os
// pedidos na tela e a decisão morria em silêncio quando o corpo da resposta não
// era JSON. Este módulo não fala com o servidor: ele VALIDA o que chegou,
// TRADUZ o motivo e REDUZ o ciclo a um estado explícito.
//
// Regras que a tela passou a respeitar:
//   1. resposta fora de ordem não publica item nem encerra carregamento alheio;
//   2. falha transitória PRESERVA a última leitura concluída, com a hora dela,
//      e oferece repetição — sem apagar a fila;
//   3. negativa (401/403) e payload inválido são falha FECHADA: descartam a
//      leitura anterior e NUNCA viram "nenhum pedido registrado";
//   4. "vazio" só existe depois de uma leitura concluída com sucesso;
//   5. erro de escrita é dito em português e nunca publica o código cru do
//      servidor na tela.
//
// Nada de URL, método, corpo, papel, permissão ou campo mudou por causa daqui.

export type ModoEntrada = {
  mode: string;
  is_active: boolean;
  requires_approval: boolean;
  auto_release_contracts: boolean;
  description?: string | null;
  updated_at?: string | null;
};

export type PedidoAcesso = {
  id: string;
  protocol: string;
  mode: string;
  client_account_id: string | null;
  requested_email: string;
  requested_name: string;
  document_ref: string | null;
  status: string;
  verified_link: boolean;
  decision_reason?: string | null;
};

export type FalhaLeituraKind = "auth" | "denied" | "invalid" | "retry" | "error";

export type FalhaLeitura = {
  kind: FalhaLeituraKind;
  title: string;
  detail: string;
  /** Só falha transitória oferece repetir a MESMA chamada. */
  canRetry: boolean;
};

export type Leitura<T> = {
  itens: T[];
  carregando: boolean;
  /** Falha sem leitura concluída (ou negada/inválida): nada de dado na tela. */
  falha: FalhaLeitura | null;
  /** Já houve uma leitura concluída com sucesso nesta tela. */
  concluiu: boolean;
  /** Hora (relógio do navegador) da última leitura concluída. Nada é gravado. */
  hora: string | null;
  /** Falha transitória DEPOIS de concluir: os itens acima continuam valendo. */
  desatualizada: FalhaLeitura | null;
};

export type EventoLeitura<T> =
  | { tipo: "iniciar" }
  | { tipo: "sucesso"; sequencia: number; atual: number; itens: T[]; hora: string }
  | { tipo: "falha"; sequencia: number; atual: number; falha: FalhaLeitura };

export const MODOS_ENTRADA = ["convite", "solicitacao_aprovacao", "autocadastro"] as const;
export const STATUS_PEDIDO = ["pendente", "aprovada", "rejeitada", "cancelada"] as const;
export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function objeto(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textoNaoVazio(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function booleano(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function modoValido(value: unknown): value is string {
  return typeof value === "string" && (MODOS_ENTRADA as readonly string[]).includes(value);
}

function statusValido(value: unknown): value is string {
  return typeof value === "string" && (STATUS_PEDIDO as readonly string[]).includes(value);
}

function linhaModo(value: unknown): value is ModoEntrada {
  if (!objeto(value)) return false;
  return modoValido(value.mode)
    && booleano(value.is_active)
    && booleano(value.requires_approval)
    && booleano(value.auto_release_contracts);
}

function linhaPedido(value: unknown): value is PedidoAcesso {
  if (!objeto(value)) return false;
  if (typeof value.id !== "string" || !UUID.test(value.id)) return false;
  if (!textoNaoVazio(value.protocol, 64)) return false;
  if (!modoValido(value.mode) || !statusValido(value.status)) return false;
  if (!textoNaoVazio(value.requested_email, 200) || !textoNaoVazio(value.requested_name, 200)) return false;
  if (!booleano(value.verified_link)) return false;
  if (value.client_account_id !== null && value.client_account_id !== undefined
    && (typeof value.client_account_id !== "string" || !UUID.test(value.client_account_id))) return false;
  if (value.document_ref !== null && value.document_ref !== undefined && typeof value.document_ref !== "string") return false;
  return true;
}

/**
 * Valida `{ modes: [...] }`. Payload malformado é `invalid_response` — nunca
 * "nenhum modo configurado": a tela não pode publicar configuração inexistente.
 */
export function parseModos(value: unknown): ModoEntrada[] {
  if (!objeto(value) || !Array.isArray(value.modes) || !value.modes.every(linhaModo)) {
    throw new Error("invalid_response");
  }
  // Preserva o restante do contrato (description, updated_at, note).
  return value.modes as ModoEntrada[];
}

/** Valida `{ requests: [...] }`. Lista vazia é VÁLIDA: fila vazia é resposta honesta. */
export function parsePedidos(value: unknown): PedidoAcesso[] {
  if (!objeto(value) || !Array.isArray(value.requests) || !value.requests.every(linhaPedido)) {
    throw new Error("invalid_response");
  }
  return value.requests as PedidoAcesso[];
}

/** Tradução de motivo de LEITURA. Falha nunca é apresentada como fila vazia. */
export function descreverFalhaLeitura(status: number, recurso: "fila" | "modos"): FalhaLeitura {
  const alvo = recurso === "fila" ? "a fila de pedidos" : "a configuração dos modos";
  if (status === 401) {
    return {
      kind: "auth",
      title: "Sua sessão administrativa não está mais ativa",
      detail: `A sessão expirou ou não foi reconhecida. Entre novamente para ler ${alvo}. Nenhum pedido foi inferido desta tentativa.`,
      canRetry: false,
    };
  }
  if (status === 403) {
    return {
      kind: "denied",
      title: "Sua conta não tem acesso a esta leitura",
      detail: `O servidor negou ${alvo}. O que estava na tela foi descartado: sem autorização, esta área não exibe pedidos, e-mails nem documentos.`,
      canRetry: false,
    };
  }
  if (status === 0 || status === 408 || status === 429 || status >= 500) {
    return {
      kind: "retry",
      title: "O serviço está temporariamente indisponível",
      detail: `Não foi possível ler ${alvo}. A última leitura concluída continua na tela com a hora a que pertence — isto não significa que não haja pedidos.`,
      canRetry: true,
    };
  }
  return {
    kind: "error",
    title: "A leitura não foi concluída",
    detail: `O servidor recusou ${alvo}. Nada foi inferido sobre a existência de pedidos.`,
    canRetry: true,
  };
}

/** Payload que não passa no parser: falha fechada, com repetição possível. */
export function descreverRespostaInvalida(recurso: "fila" | "modos"): FalhaLeitura {
  const alvo = recurso === "fila" ? "a fila de pedidos" : "a configuração dos modos";
  return {
    kind: "invalid",
    title: "O servidor devolveu uma resposta inválida",
    detail: `Os dados recebidos para ${alvo} não têm o formato esperado. Isso não significa que não haja pedidos — a leitura anterior não é publicada como se fosse esta.`,
    canRetry: true,
  };
}

/** Falha de transporte antes de qualquer status HTTP. */
export function descreverFalhaRede(recurso: "fila" | "modos"): FalhaLeitura {
  const alvo = recurso === "fila" ? "a fila de pedidos" : "a configuração dos modos";
  return {
    kind: "retry",
    title: "Não foi possível falar com o servidor",
    detail: `A conexão falhou ao ler ${alvo}. A última leitura concluída continua na tela com a hora a que pertence — isto não significa que não haja pedidos.`,
    canRetry: true,
  };
}

/**
 * Redutor do ciclo de leitura. Eventos de uma sequência que não é a corrente
 * são IGNORADOS: resposta antiga não publica item, não apaga item e não
 * encerra o carregamento de uma leitura mais nova.
 */
export function reduzirLeitura<T>(estado: Leitura<T>, evento: EventoLeitura<T>): Leitura<T> {
  if (evento.tipo === "iniciar") {
    return { ...estado, carregando: true, falha: null, desatualizada: null };
  }
  if (evento.sequencia !== evento.atual) return estado;
  if (evento.tipo === "sucesso") {
    return {
      itens: evento.itens,
      carregando: false,
      falha: null,
      concluiu: true,
      hora: evento.hora,
      desatualizada: null,
    };
  }
  const descarta = evento.falha.kind === "auth" || evento.falha.kind === "denied" || evento.falha.kind === "invalid";
  if (descarta) {
    return { itens: [], carregando: false, falha: evento.falha, concluiu: false, hora: null, desatualizada: null };
  }
  if (estado.concluiu) {
    return { ...estado, carregando: false, falha: null, desatualizada: evento.falha };
  }
  return { itens: [], carregando: false, falha: evento.falha, concluiu: false, hora: null, desatualizada: null };
}

/** "Vazio" é uma conclusão, não um default: exige leitura concluída sem itens. */
export function estaVazia<T>(leitura: Leitura<T>): boolean {
  return leitura.concluiu && !leitura.carregando && leitura.itens.length === 0 && leitura.falha === null;
}

export function rotuloModo(mode: string): string {
  if (mode === "convite") return "Convite";
  if (mode === "solicitacao_aprovacao") return "Solicitação com aprovação";
  if (mode === "autocadastro") return "Autocadastro";
  return "Modo não reconhecido";
}

export function rotuloStatus(status: string): string {
  if (status === "pendente") return "Pendente";
  if (status === "aprovada") return "Aprovada";
  if (status === "rejeitada") return "Rejeitada";
  if (status === "cancelada") return "Cancelada";
  return "Situação não reconhecida";
}

/**
 * Motivo do PATCH. A tela valida antes de enviar para poder explicar em
 * português — o servidor continua sendo a autoridade e a regra dele é a mesma
 * (10 a 500 caracteres depois de `trim`).
 */
export function validarMotivo(texto: string): { ok: boolean; mensagem: string } {
  const limpo = String(texto ?? "").trim();
  if (limpo.length < MOTIVO_MIN) {
    return { ok: false, mensagem: `O motivo precisa ter pelo menos ${MOTIVO_MIN} caracteres. Nada foi enviado.` };
  }
  if (limpo.length > MOTIVO_MAX) {
    return { ok: false, mensagem: `O motivo não pode passar de ${MOTIVO_MAX} caracteres. Nada foi enviado.` };
  }
  return { ok: true, mensagem: "" };
}

/** Só pedido pendente pode ser decidido; a tela não oferece o que o servidor recusa. */
export function podeDecidir(pedido: PedidoAcesso): boolean {
  return pedido.status === "pendente";
}

/**
 * Tradução do erro de ESCRITA (decisão ou configuração de modo). Nenhum código
 * cru do servidor é publicado: cada motivo fechado tem a sua frase, e o
 * desconhecido recebe uma frase genérica que ainda diz o status.
 */
export function traduzirErroEscrita(status: number, code?: unknown): string {
  const codigo = typeof code === "string" ? code : "";
  const porCodigo: Record<string, string> = {
    decision_reason_10_500_required: `O motivo precisa ter de ${MOTIVO_MIN} a ${MOTIVO_MAX} caracteres. Nada foi decidido.`,
    reason_10_500: `O motivo precisa ter de ${MOTIVO_MIN} a ${MOTIVO_MAX} caracteres. A configuração não foi alterada.`,
    request_already_decided: "Este pedido já foi decidido por outra pessoa. Releia a fila para ver a situação atual.",
    verified_link_required: "O vínculo deste pedido não foi verificado pelo servidor, então a decisão não é permitida.",
    identity_exists_use_explicit_grant_flow: "Já existe uma identidade com este e-mail. Conceder o vínculo é uma ação separada e motivada.",
    mode_policy_blocks_approval: "O modo deste pedido está inativo ou não permite aprovação. Ajuste a configuração antes de decidir.",
    request_not_found: "O pedido não foi encontrado. Releia a fila.",
    autocadastro_never_releases_contracts: "Autocadastro nunca libera contratos sozinho. A configuração não foi alterada.",
    invalid_mode_config: "A configuração enviada é inválida. Nada foi alterado.",
    invalid_request: "O pedido enviado é inválido. Nada foi alterado.",
    mode_not_found: "O modo não existe mais no servidor. Releia a configuração.",
    individual_staff_required: "Esta operação exige uma conta individual de equipe, não uma sessão compartilhada.",
    forbidden: "Sua conta não tem acesso a esta operação.",
    unauthorized: "Sua sessão administrativa não está mais ativa. Entre novamente — nada foi alterado.",
    audit_unavailable: "O servidor não conseguiu registrar a auditoria, então a operação foi recusada inteira. Tente novamente.",
    origin_forbidden: "A origem da requisição não foi aceita pelo servidor. Recarregue a página e tente novamente.",
    method_not_allowed: "O servidor não aceita esta operação nesta rota. Nada foi alterado.",
  };
  if (porCodigo[codigo]) return porCodigo[codigo];
  if (status === 401) return porCodigo.unauthorized;
  if (status === 403) return "O servidor negou a operação e nada foi alterado.";
  if (status === 404) return "O recurso não existe mais no servidor. Releia a tela.";
  if (status === 409) return "O estado mudou no servidor desde a sua leitura. Releia a tela antes de tentar de novo.";
  if (status === 400) return "O servidor recusou os dados enviados e nada foi alterado.";
  if (status >= 500 || status <= 0) return "O serviço está indisponível e a operação não foi concluída. Tente novamente.";
  return `A operação não foi concluída (o servidor respondeu ${status}). Nada foi alterado.`;
}
