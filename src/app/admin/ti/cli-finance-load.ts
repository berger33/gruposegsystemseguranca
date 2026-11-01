/**
 * Estado de leitura do console CLI (aba "Financeiro do portal" do TiConsole).
 *
 * Puro de propósito: sem React, sem DOM, sem `fetch` embutido. A tela recebe as
 * respostas e este módulo decide o que cada uma significa. O defeito que ele
 * existe para impedir é o do protótipo antigo: `.catch(()=>({charges:[]}))`
 * transformava 401/403/500/corpo inválido em "lista vazia", então uma negação de
 * acesso era exibida como "nada aqui" — falha aberta com cara de sucesso.
 *
 * Regra: vazio legítimo é `[]`; todo o resto é declarado.
 */

export type Situacao = "ok" | "vazio" | "negado" | "falha" | "invalido";

export type Bloco = {
  chave: string;
  rota: string;
  campo: string;
  rotulo: string;
};

/**
 * As oito leituras do console. Todas em alias canônico já despachado em
 * `server.mjs`: `/api/cli/*` nunca passa pela borda legada de RH (que exige
 * `employees.read` e negava `ti` com 403), e a fila de pedidos de acesso usa o
 * canônico administrativo `/api/admin/portal-access-requests`.
 */
export const BLOCOS: readonly Bloco[] = [
  { chave: "cobrancas", rota: "/api/cli/charges-v2", campo: "charges", rotulo: "Cobranças e documentos fiscais" },
  { chave: "servicos", rota: "/api/cli/service-requests", campo: "serviceRequests", rotulo: "Solicitações de serviço adicional" },
  { chave: "satisfacao", rota: "/api/cli/satisfaction-surveys", campo: "surveys", rotulo: "Satisfação pós-atendimento" },
  { chave: "renovacoes", rota: "/api/cli/renewal-communications", campo: "communications", rotulo: "Comunicações de renovação" },
  { chave: "modos", rota: "/api/cli/portal-mode-configs", campo: "modes", rotulo: "Modos de entrada do portal" },
  { chave: "acessos", rota: "/api/admin/portal-access-requests", campo: "requests", rotulo: "Pedidos de acesso ao portal" },
  { chave: "seguranca", rota: "/api/cli/security-events", campo: "events", rotulo: "Eventos de segurança da conta" },
  { chave: "emails", rota: "/api/cli/email-change-requests", campo: "requests", rotulo: "Trocas de e-mail em andamento" },
];

export type ResultadoBloco = {
  chave: string;
  rotulo: string;
  situacao: Situacao;
  itens: unknown[];
  mensagem: string;
};

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;

function textoDeErro(corpo: unknown): string {
  if (!corpo || typeof corpo !== "object") return "";
  const valor = (corpo as Record<string, unknown>).error ?? (corpo as Record<string, unknown>).detail;
  return typeof valor === "string" ? valor : "";
}

/** Mensagem para o usuário — nunca o código cru do servidor. */
export function descreverFalhaLeitura(status: number, codigo: string, rotulo: string): { situacao: Situacao; mensagem: string } {
  if (status === 401) return { situacao: "negado", mensagem: `Sessão expirada ao ler ${rotulo}. Entre novamente.` };
  if (status === 403) {
    return {
      situacao: "negado",
      mensagem: `Sua sessão não tem permissão para ler ${rotulo}. Nada foi lido — a lista abaixo não está vazia, está indisponível.`,
    };
  }
  if (status === 404) return { situacao: "falha", mensagem: `A rota de ${rotulo} não existe neste servidor.` };
  if (status >= 500) return { situacao: "falha", mensagem: `O servidor falhou ao ler ${rotulo}. Tente novamente.` };
  return {
    situacao: "falha",
    mensagem: `Não foi possível ler ${rotulo}${codigo ? ` (${codigo})` : ""}. Tente novamente.`,
  };
}

/**
 * Classifica UMA resposta. `corpo` já deve estar parseado; quando o corpo não é
 * JSON, o chamador passa `undefined` e o resultado é `invalido` — nunca vazio.
 */
export function classificarResposta(bloco: Bloco, status: number, corpo: unknown): ResultadoBloco {
  const base = { chave: bloco.chave, rotulo: bloco.rotulo };
  if (!status || Number.isNaN(status)) {
    return { ...base, situacao: "falha", itens: [], mensagem: `Falha de rede ao ler ${bloco.rotulo}. Tente novamente.` };
  }
  if (status < 200 || status >= 300) {
    const { situacao, mensagem } = descreverFalhaLeitura(status, textoDeErro(corpo), bloco.rotulo);
    return { ...base, situacao, itens: [], mensagem };
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { ...base, situacao: "invalido", itens: [], mensagem: `Resposta inválida de ${bloco.rotulo}. Nada foi exibido.` };
  }
  const lista = (corpo as Record<string, unknown>)[bloco.campo];
  if (!Array.isArray(lista)) {
    return {
      ...base,
      situacao: "invalido",
      itens: [],
      mensagem: `Resposta sem a lista "${bloco.campo}" em ${bloco.rotulo}. Nada foi exibido.`,
    };
  }
  if (lista.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
    return { ...base, situacao: "invalido", itens: [], mensagem: `${bloco.rotulo} veio com item malformado. Nada foi exibido.` };
  }
  if (lista.length === 0) {
    return { ...base, situacao: "vazio", itens: [], mensagem: `${bloco.rotulo}: nenhum registro.` };
  }
  return { ...base, situacao: "ok", itens: lista as unknown[], mensagem: `${bloco.rotulo}: ${lista.length} registro(s).` };
}

export type ResumoLeitura = {
  hora: string;
  total: number;
  lidos: number;
  negados: number;
  falhas: number;
  invalidos: number;
  vazios: number;
  /** `true` só quando TODOS os blocos foram lidos com sucesso (vazio é sucesso). */
  completo: boolean;
  /** Mensagem da faixa de estado; string vazia quando está tudo bem. */
  mensagem: string;
};

function horaAgora(): string {
  const agora = new Date();
  const hora = String(agora.getHours()).padStart(2, "0");
  const minuto = String(agora.getMinutes()).padStart(2, "0");
  return `${hora}:${minuto}`;
}

/** Agrega os oito blocos numa faixa única — sem esconder nenhuma falha. */
export function agregarLeitura(resultados: readonly ResultadoBloco[], hora = horaAgora()): ResumoLeitura {
  const contar = (situacao: Situacao) => resultados.filter(item => item.situacao === situacao).length;
  const negados = contar("negado");
  const falhas = contar("falha") + contar("invalido");
  const invalidos = contar("invalido");
  const vazios = contar("vazio");
  const lidos = contar("ok") + vazios;
  const total = resultados.length;
  const completo = lidos === total && total > 0;
  let mensagem = "";
  if (negados > 0) {
    mensagem = negados === total
      ? "Nenhum bloco pôde ser lido: a sessão não tem permissão para este console."
      : `${negados} de ${total} blocos foram negados pela sessão. O que está vazio pode estar apenas indisponível.`;
  } else if (falhas > 0) {
    mensagem = `${falhas} de ${total} blocos não puderam ser lidos${invalidos > 0 ? ` (${invalidos} com resposta inválida)` : ""}. Tente novamente.`;
  }
  return { hora, total, lidos, negados, falhas, invalidos, vazios, completo, mensagem };
}

/** Tradução dos códigos de escrita que a tela pode receber. */
const ERROS_ESCRITA: Record<string, string> = {
  reason_10_500: `O motivo precisa ter entre ${MOTIVO_MIN} e ${MOTIVO_MAX} caracteres.`,
  invalid_mode_config: "Modo inválido: escolha modo, situação, aprovação e liberação.",
  autocadastro_never_releases_contracts: "Autocadastro nunca libera contratos sozinho.",
  invalid_request: "Os dados enviados não foram aceitos pelo servidor.",
  individual_staff_required: "Esta escrita exige sessão individual de staff.",
  link_not_verified: "O vínculo entre conta e documento não pôde ser conferido.",
  mode_inactive: "Este modo de entrada está inativo no portal.",
  idempotency_key_reused: "Os dados mudaram durante a tentativa. Recarregue e repita.",
  request_not_found: "O pedido de acesso não existe mais.",
  request_already_decided: "Este pedido já foi decidido por outra pessoa.",
  verified_link_required: "O pedido não tem vínculo verificado para aprovar.",
  identity_exists_use_explicit_grant_flow: "A identidade já existe: use o fluxo explícito de concessão.",
  mode_policy_blocks_approval: "A política do modo ativo bloqueia esta aprovação.",
  audit_unavailable: "A auditoria está indisponível: a escrita foi recusada para não perder trilha.",
  method_not_allowed: "O servidor não aceita este método nesta rota.",
  unauthorized: "Sessão expirada. Entre novamente.",
};

export function traduzirErroEscrita(status: number, codigo: string): string {
  if (codigo && ERROS_ESCRITA[codigo]) return ERROS_ESCRITA[codigo];
  if (status === 401) return ERROS_ESCRITA.unauthorized;
  if (status === 403) return ERROS_ESCRITA.individual_staff_required;
  if (status >= 500) return "O servidor falhou ao gravar. Nada foi confirmado — confira antes de repetir.";
  if (status >= 400) return "A escrita foi recusada pelo servidor. Confira os campos e tente novamente.";
  return "Não foi possível confirmar a escrita.";
}

/** Motivo obrigatório (10–500 pós-trim) para rejeição e para mudança de modo. */
export function validarMotivo(valor: string): { ok: boolean; motivo: string; erro: string } {
  const motivo = String(valor ?? "").trim();
  if (motivo.length < MOTIVO_MIN) return { ok: false, motivo, erro: `O motivo precisa de pelo menos ${MOTIVO_MIN} caracteres.` };
  if (motivo.length > MOTIVO_MAX) return { ok: false, motivo, erro: `O motivo passa de ${MOTIVO_MAX} caracteres.` };
  return { ok: true, motivo, erro: "" };
}
