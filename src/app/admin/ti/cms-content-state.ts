/**
 * Estado do console de conteúdo (PUB-06 — CMS do site).
 *
 * Puro de propósito: sem React, sem DOM, sem `fetch`. A tela entrega as
 * respostas e este módulo decide o que cada uma significa.
 *
 * Dois defeitos do protótipo que ele existe para impedir:
 *
 *  1. as transições de status chamavam `PATCH /api/admin/cms-contents` (sem id),
 *     que o servidor recusa com **405 `method_not_allowed`** — o botão existia e
 *     nunca funcionou; a transição real é `PATCH /api/admin/cms-contents/:id`;
 *  2. o detalhe lia `detail.content`, mas a API devolve o registro **plano**
 *     (`{...conteudo, versions, history}`) — a tela mostrava `undefined`.
 *
 * Além disso: nenhuma leitura pode virar lista vazia por omissão, e o motivo
 * (10..1000) é validado antes de gastar uma requisição.
 */

export type Situacao = "ok" | "vazio" | "negado" | "falha" | "invalido";

/** Espelho da máquina de estados do servidor (`cms-api.mjs`, `NEXT`). */
export const TRANSICOES: Readonly<Record<string, readonly string[]>> = {
  rascunho: ["em_revisao"],
  em_revisao: ["aprovado", "rejeitado"],
  aprovado: ["publicado", "arquivado"],
  publicado: ["arquivado"],
  rejeitado: ["arquivado"],
  arquivado: [],
};

export const TIPOS = ["pagina", "faq", "case", "blog", "vaga", "outro"] as const;

export const ROTULO_STATUS: Readonly<Record<string, string>> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  publicado: "Publicado",
  arquivado: "Arquivado",
};

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 1000;

export type Conteudo = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  content_type: string;
  version: number;
  status: string;
  is_published: boolean;
  is_authorized: boolean;
  seo_title: string | null;
  seo_description: string | null;
};

export function rotuloStatus(status: string): string {
  return ROTULO_STATUS[status] ?? status;
}

/** Próximos status permitidos a partir do atual (vazio = terminal). */
export function proximosEstados(status: string): string[] {
  return [...(TRANSICOES[status] ?? [])];
}

export function podePublicar(conteudo: { status: string; content_type: string; is_authorized: boolean }): boolean {
  if (!proximosEstados(conteudo.status).includes("publicado")) return false;
  return conteudo.content_type !== "case" || conteudo.is_authorized;
}

function codigoDe(corpo: unknown): string {
  if (!corpo || typeof corpo !== "object") return "";
  const valor = (corpo as Record<string, unknown>).error;
  return typeof valor === "string" ? valor : "";
}

/** Mensagem para o usuário — o código cru não aparece. */
const ERROS: Readonly<Record<string, string>> = {
  invalid_slug: "O slug precisa ter 3 a 200 caracteres, minúsculas e hífens (ex.: quem-somos).",
  invalid_type: "Tipo de conteúdo inválido.",
  invalid_title: "O título precisa ter de 5 a 200 caracteres.",
  invalid_content: "O conteúdo precisa ter de 50 a 20.000 caracteres.",
  invalid_excerpt: "O resumo, quando informado, precisa ter de 10 a 1.000 caracteres.",
  invalid_seo_title: "O título de SEO, quando informado, precisa ter de 5 a 200 caracteres.",
  invalid_seo_description: "A descrição de SEO, quando informada, precisa ter de 10 a 500 caracteres.",
  invalid_reason: "O motivo precisa ter de 10 a 1.000 caracteres.",
  slug_type_conflict: "Este slug já existe com outro tipo de conteúdo.",
  invalid_transition: "Esta mudança de status não é permitida a partir do status atual.",
  case_authorization_required: "Case só pode ser publicado com autorização explícita do cliente.",
  create_revision_to_edit: "Para editar o texto, crie uma nova versão (rascunho); a transição muda só o status.",
  invalid_id: "Identificador inválido.",
  not_found: "Conteúdo não encontrado — pode ter sido removido.",
  role_required: "Sua sessão não tem papel para publicar conteúdo.",
  session_required: "Sessão expirada. Entre novamente.",
  same_origin_required: "A escrita precisa vir da própria origem do painel.",
  method_not_allowed: "O servidor não aceita este método nesta rota.",
  public_read_only: "Esta rota é somente leitura pública.",
};

export function traduzirErroCms(status: number, codigo: string): string {
  if (codigo && ERROS[codigo]) return ERROS[codigo];
  if (status === 401) return ERROS.session_required;
  if (status === 403) return ERROS.role_required;
  if (status === 404) return ERROS.not_found;
  if (status === 405) return ERROS.method_not_allowed;
  if (status >= 500) return "O servidor falhou ao gravar. Nada foi confirmado — confira antes de repetir.";
  if (status >= 400) return "A gravação foi recusada pelo servidor. Confira os campos e tente novamente.";
  return "Não foi possível confirmar a gravação.";
}

export type ResultadoLista = {
  situacao: Situacao;
  itens: Conteudo[];
  mensagem: string;
};

function itemValido(item: unknown): item is Conteudo {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const registro = item as Record<string, unknown>;
  return typeof registro.id === "string" && typeof registro.slug === "string" &&
    typeof registro.title === "string" && typeof registro.status === "string" &&
    Number.isFinite(Number(registro.version));
}

/** Classifica a listagem administrativa. */
export function classificarLista(status: number, corpo: unknown): ResultadoLista {
  if (!status) return { situacao: "falha", itens: [], mensagem: "Falha de rede ao ler o conteúdo. Tente novamente." };
  if (status === 401 || status === 403) {
    return {
      situacao: "negado",
      itens: [],
      mensagem: "Sua sessão não pode ler o conteúdo do site. Isto não significa que não há conteúdo — significa que ele está indisponível para este papel.",
    };
  }
  if (status < 200 || status >= 300) {
    return { situacao: "falha", itens: [], mensagem: `O servidor não devolveu o conteúdo (HTTP ${status}). Tente novamente.` };
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { situacao: "invalido", itens: [], mensagem: "Resposta inválida: o servidor não devolveu o objeto esperado." };
  }
  const lista = (corpo as Record<string, unknown>).items;
  if (!Array.isArray(lista)) {
    return { situacao: "invalido", itens: [], mensagem: "Resposta sem a lista de conteúdos. Nada foi exibido." };
  }
  if (lista.some(item => !itemValido(item))) {
    return { situacao: "invalido", itens: [], mensagem: "A lista veio com item malformado. Nada foi exibido." };
  }
  if (lista.length === 0) return { situacao: "vazio", itens: [], mensagem: "Nenhum conteúdo cadastrado ainda." };
  return { situacao: "ok", itens: lista as Conteudo[], mensagem: `${lista.length} conteúdo(s).` };
}

export type Versao = { id?: string; version: number; change_summary?: string | null; created_by_name?: string | null };
export type Historico = { id?: string; previous_version?: number | null; next_version?: number; previous_status?: string | null; next_status?: string; reason?: string | null; changed_by_name?: string | null };
export type ResultadoDetalhe = {
  situacao: Situacao;
  conteudo: Conteudo | null;
  versoes: Versao[];
  historico: Historico[];
  mensagem: string;
};

/**
 * Classifica o detalhe. A API devolve o registro PLANO no topo, junto com
 * `versions` e `history` — ler `corpo.content` (como o protótipo fazia) é o bug.
 */
export function classificarDetalhe(status: number, corpo: unknown): ResultadoDetalhe {
  const vazio = { conteudo: null, versoes: [], historico: [] };
  if (!status) return { situacao: "falha", ...vazio, mensagem: "Falha de rede ao abrir o conteúdo." };
  if (status === 401 || status === 403) return { situacao: "negado", ...vazio, mensagem: "Sua sessão não pode abrir o histórico deste conteúdo." };
  if (status === 404) return { situacao: "falha", ...vazio, mensagem: ERROS.not_found };
  if (status < 200 || status >= 300) return { situacao: "falha", ...vazio, mensagem: `O servidor não devolveu o conteúdo (HTTP ${status}).` };
  if (!itemValido(corpo)) return { situacao: "invalido", ...vazio, mensagem: "Resposta inválida: o conteúdo não veio no formato esperado." };
  const versoes = Array.isArray((corpo as Record<string, unknown>).versions) ? ((corpo as Record<string, unknown>).versions as Versao[]) : [];
  const historico = Array.isArray((corpo as Record<string, unknown>).history) ? ((corpo as Record<string, unknown>).history as Historico[]) : [];
  return { situacao: "ok", conteudo: corpo as Conteudo, versoes, historico, mensagem: `${versoes.length} versão(ões) e ${historico.length} evento(s) de histórico.` };
}

/** Motivo obrigatório para toda transição e para reversão (10..1000 pós-trim). */
export function validarMotivo(valor: string): { ok: boolean; motivo: string; erro: string } {
  const motivo = String(valor ?? "").trim();
  if (motivo.length < MOTIVO_MIN) return { ok: false, motivo, erro: `O motivo precisa de pelo menos ${MOTIVO_MIN} caracteres.` };
  if (motivo.length > MOTIVO_MAX) return { ok: false, motivo, erro: `O motivo passa de ${MOTIVO_MAX} caracteres.` };
  return { ok: true, motivo, erro: "" };
}

export type FormRascunho = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  content_type: string;
  seo_title: string;
  seo_description: string;
  is_authorized: boolean;
  metadata: string;
  tags: string;
};

/**
 * Valida o formulário ANTES de enviar, com as mesmas regras do servidor.
 * Devolve o primeiro erro por campo — nada de descobrir por 400.
 */
export function validarRascunho(form: FormRascunho): { ok: boolean; erros: Record<string, string>; payload: Record<string, unknown> | null } {
  const erros: Record<string, string> = {};
  const slug = String(form.slug ?? "").trim().toLowerCase();
  if (slug.length < 3 || slug.length > 200) erros.slug = ERROS.invalid_slug;
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) erros.slug = ERROS.invalid_slug;
  const title = String(form.title ?? "").trim();
  if (title.length < 5 || title.length > 200) erros.title = ERROS.invalid_title;
  const content = String(form.content ?? "").trim();
  if (content.length < 50 || content.length > 20000) erros.content = ERROS.invalid_content;
  if (!TIPOS.includes(form.content_type as (typeof TIPOS)[number])) erros.content_type = ERROS.invalid_type;
  const excerpt = String(form.excerpt ?? "").trim();
  if (excerpt && (excerpt.length < 10 || excerpt.length > 1000)) erros.excerpt = ERROS.invalid_excerpt;
  const seoTitle = String(form.seo_title ?? "").trim();
  if (seoTitle && (seoTitle.length < 5 || seoTitle.length > 200)) erros.seo_title = ERROS.invalid_seo_title;
  const seoDescription = String(form.seo_description ?? "").trim();
  if (seoDescription && (seoDescription.length < 10 || seoDescription.length > 500)) erros.seo_description = ERROS.invalid_seo_description;
  let metadata: unknown = {};
  try {
    metadata = form.metadata && form.metadata.trim() ? JSON.parse(form.metadata) : {};
  } catch {
    erros.metadata = "O metadata precisa ser JSON válido.";
  }
  const tags = String(form.tags ?? "").split(",").map(item => item.trim()).filter(Boolean);
  if (Object.keys(erros).length > 0) return { ok: false, erros, payload: null };
  return {
    ok: true,
    erros: {},
    payload: {
      slug, title, content, content_type: form.content_type, tags, metadata,
      excerpt: excerpt || null, seo_title: seoTitle || null, seo_description: seoDescription || null,
      is_authorized: form.is_authorized === true,
    },
  };
}
