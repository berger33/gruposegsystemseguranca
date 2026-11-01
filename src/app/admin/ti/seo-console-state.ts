/**
 * Estado do console de SEO técnico (PUB-08 — SEO e domínios).
 *
 * Puro: sem React, sem DOM, sem `fetch`.
 *
 * Três coisas que o protótipo dizia e o servidor não permite:
 *
 *  1. o formulário de **sitemap** gravava linhas em `/api/admin/seo-sitemap`;
 *     a rota virou **prévia derivada** e só aceita `GET` (405 em POST) — o
 *     formulário era morto;
 *  2. publicar um config com `is_noindex=false` esbarra em
 *     `cannot_publish_with_noindex` até haver domínio verificado e aprovação;
 *  3. o servidor **recusa** declarar um domínio `verificado` à mão
 *     (`domain_verification_not_supported`): verificação real é fronteira
 *     externa (DNS/HTTP), fora desta entrega local. Ou seja, nesta entrega a
 *     publicação é **declaradamente inalcançável**, e a tela não pode fingir
 *     um botão que nunca vai funcionar.
 */

export type Situacao = "ok" | "vazio" | "negado" | "falha" | "invalido";

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 1000;

export const CHANGEFREQ = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"] as const;
export const REDIRECT_TYPES = ["301", "302", "307", "308"] as const;
/** Regra que a tela precisa dizer antes de o operador errar. */
export const REGRA_DESTINO = "O destino precisa ser uma rota pública existente; a origem não pode esconder rota que já existe.";

export const VERIFICATION_METHODS = ["dns_txt", "file", "meta_tag", "outro"] as const;

const ERROS: Readonly<Record<string, string>> = {
  forbidden: "Sua sessão não tem papel para administrar SEO técnico.",
  admin_session_required: "Sessão expirada. Entre novamente.",
  same_origin_required: "A escrita precisa vir da própria origem do painel.",
  invalid_path: "O caminho precisa ter de 1 a 500 caracteres.",
  invalid_title: "O título precisa ter de 5 a 200 caracteres.",
  invalid_description: "A descrição precisa ter de 10 a 500 caracteres.",
  invalid_canonical: "A URL canônica, quando informada, precisa ter de 5 a 1.000 caracteres.",
  invalid_robots: "A diretiva robots precisa ter de 5 a 200 caracteres.",
  invalid_og_title: "O título Open Graph, quando informado, precisa ter de 5 a 200 caracteres.",
  invalid_og_description: "A descrição Open Graph, quando informada, precisa ter de 10 a 500 caracteres.",
  invalid_og_image: "A imagem Open Graph, quando informada, precisa ter de 5 a 1.000 caracteres.",
  invalid_priority: "A prioridade do sitemap precisa estar entre 0 e 1.",
  invalid_changefreq: "Frequência de mudança inválida.",
  duplicate_path: "Já existe configuração para este caminho.",
  missing_id: "Selecione o registro antes de gravar.",
  not_found: "Registro não encontrado — pode ter sido removido.",
  cannot_publish_with_noindex: "Publicar com noindex é proibido: noindex é preservado em ambiente não produtivo. Liberar exige verificação de domínio e aprovação.",
  method_not_allowed: "O servidor não aceita este método nesta rota.",
  invalid_domain: "O domínio precisa ter de 3 a 200 caracteres.",
  invalid_token: "O token de verificação precisa ter de 10 a 500 caracteres.",
  invalid_method: "Método de verificação inválido.",
  duplicate_domain: "Este domínio já está cadastrado.",
  invalid_status: "Situação de verificação inválida.",
  domain_verification_not_supported: "A verificação real (DNS/HTTP no domínio) não é executável nesta entrega local — o domínio não pode ser declarado verificado.",
  server_managed_fields: "Campos controlados pelo servidor (id, hits, datas) não vêm do formulário.",
  invalid_reason: "O motivo precisa ter de 10 a 1.000 caracteres.",
  invalid_redirect_type: "Tipo de redirecionamento inválido (use 301, 302, 307 ou 308).",
  duplicate_old_path: "Já existe redirecionamento cadastrado para esta origem.",
  redirect_target_not_public: "O destino precisa ser uma rota pública que existe de verdade — redirecionar para 404 é promessa quebrada.",
  cannot_shadow_existing_route: "A origem não pode esconder uma rota que já existe.",
  cannot_redirect_to_self: "Origem e destino não podem ser iguais.",
  redirect_chain_not_allowed: "Isso criaria uma corrente de redirecionamentos, que a política recusa.",
  invalid_id: "Identificador inválido.",
  invalid_request: "Os dados enviados não foram aceitos pelo servidor.",
};

export function traduzirErroSeo(status: number, codigo: string): string {
  if (codigo && ERROS[codigo]) return ERROS[codigo];
  if (status === 401) return ERROS.admin_session_required;
  if (status === 403) return ERROS.forbidden;
  if (status === 404) return ERROS.not_found;
  if (status === 405) return ERROS.method_not_allowed;
  if (status >= 500) return "O servidor falhou. Nada foi confirmado — confira antes de repetir.";
  if (status >= 400) return "A gravação foi recusada pelo servidor. Confira os campos e tente novamente.";
  return "Não foi possível confirmar a gravação.";
}

export type ResultadoLista = { situacao: Situacao; itens: Record<string, unknown>[]; mensagem: string };

function listaValida(lista: unknown): lista is Record<string, unknown>[] {
  return Array.isArray(lista) && lista.every(item => item !== null && typeof item === "object" && !Array.isArray(item));
}

/** Classifica uma listagem administrativa (`{items:[...]}`). */
export function classificarLista(status: number, corpo: unknown, rotulo: string): ResultadoLista {
  if (!status) return { situacao: "falha", itens: [], mensagem: `Falha de rede ao ler ${rotulo}. Tente novamente.` };
  if (status === 401 || status === 403) {
    return {
      situacao: "negado",
      itens: [],
      mensagem: `Sua sessão não pode ler ${rotulo}. A lista não está vazia: ela está indisponível para este papel.`,
    };
  }
  if (status < 200 || status >= 300) {
    return { situacao: "falha", itens: [], mensagem: `O servidor não devolveu ${rotulo} (HTTP ${status}). Tente novamente.` };
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { situacao: "invalido", itens: [], mensagem: `Resposta inválida de ${rotulo}: nada foi exibido.` };
  }
  const lista = (corpo as Record<string, unknown>).items;
  if (!Array.isArray(lista) || !listaValida(lista)) {
    return { situacao: "invalido", itens: [], mensagem: `Resposta de ${rotulo} sem lista válida. Nada foi exibido.` };
  }
  if (lista.length === 0) return { situacao: "vazio", itens: [], mensagem: `${rotulo}: nenhum registro.` };
  return { situacao: "ok", itens: lista, mensagem: `${rotulo}: ${lista.length} registro(s).` };
}

export type PreviaSitemap = {
  situacao: Situacao;
  liberado: boolean;
  caminhos: string[];
  robots: string;
  xml: string;
  origem: string;
  nota: string;
  mensagem: string;
};

/** Classifica a prévia do sitemap — leitura derivada, não loja de linhas. */
export function classificarPreviaSitemap(status: number, corpo: unknown): PreviaSitemap {
  const vazio = { liberado: false, caminhos: [], robots: "", xml: "", origem: "", nota: "" };
  if (!status) return { situacao: "falha", ...vazio, mensagem: "Falha de rede ao ler a prévia do sitemap." };
  if (status === 401 || status === 403) return { situacao: "negado", ...vazio, mensagem: "Sua sessão não pode ver a prévia do sitemap." };
  if (status < 200 || status >= 300) return { situacao: "falha", ...vazio, mensagem: `O servidor não devolveu a prévia (HTTP ${status}).` };
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { situacao: "invalido", ...vazio, mensagem: "Resposta inválida da prévia do sitemap." };
  }
  const registro = corpo as Record<string, unknown>;
  if (!Array.isArray(registro.paths) || typeof registro.robots !== "string" || typeof registro.xml !== "string") {
    return { situacao: "invalido", ...vazio, mensagem: "A prévia não trouxe caminhos, robots e XML. Nada foi exibido." };
  }
  return {
    situacao: "ok",
    liberado: registro.released === true,
    caminhos: registro.paths.map(String),
    robots: registro.robots,
    xml: registro.xml,
    origem: typeof registro.origin === "string" ? registro.origin : "",
    nota: typeof registro.note === "string" ? registro.note : "",
    mensagem: registro.released === true
      ? `Sitemap liberado: ${registro.paths.length} caminho(s) derivados do catálogo público.`
      : `Sitemap NÃO publicado: /sitemap.xml devolve 404 e /robots.txt nega tudo. Prévia com ${registro.paths.length} caminho(s).`,
  };
}

/** Publicar exige domínio verificado — e verificar não é executável aqui. */
export function situacaoPublicacao(dominios: Record<string, unknown>[]): { permitido: boolean; motivo: string } {
  const verificado = dominios.some(item => item.status === "verificado");
  if (verificado) return { permitido: true, motivo: "" };
  const pendentes = dominios.filter(item => item.status === "pendente").length;
  return {
    permitido: false,
    motivo: pendentes > 0
      ? `Publicação bloqueada: há ${pendentes} domínio(s) pendente(s) e a verificação real (DNS/HTTP) não é executável nesta entrega. Com noindex, o servidor recusa publicar.`
      : "Publicação bloqueada: nenhum domínio verificado. A verificação real (DNS/HTTP) não é executável nesta entrega; com noindex, o servidor recusa publicar.",
  };
}

export function validarMotivo(valor: string): { ok: boolean; motivo: string; erro: string } {
  const motivo = String(valor ?? "").trim();
  if (motivo.length < MOTIVO_MIN) return { ok: false, motivo, erro: `O motivo precisa de pelo menos ${MOTIVO_MIN} caracteres.` };
  if (motivo.length > MOTIVO_MAX) return { ok: false, motivo, erro: `O motivo passa de ${MOTIVO_MAX} caracteres.` };
  return { ok: true, motivo, erro: "" };
}

export type FormConfig = {
  path: string; title: string; description: string; keywords: string; canonical_url: string;
  robots: string; sitemap_priority: string; changefreq: string; is_noindex: boolean;
};

export function validarConfig(form: FormConfig): { ok: boolean; erros: Record<string, string>; payload: Record<string, unknown> | null } {
  const erros: Record<string, string> = {};
  const path = String(form.path ?? "").trim();
  if (path.length < 1 || path.length > 500) erros.path = ERROS.invalid_path;
  else if (!path.startsWith("/")) erros.path = "O caminho precisa começar com /.";
  const title = String(form.title ?? "").trim();
  if (title.length < 5 || title.length > 200) erros.title = ERROS.invalid_title;
  const description = String(form.description ?? "").trim();
  if (description.length < 10 || description.length > 500) erros.description = ERROS.invalid_description;
  const canonical = String(form.canonical_url ?? "").trim();
  if (canonical && (canonical.length < 5 || canonical.length > 1000)) erros.canonical_url = ERROS.invalid_canonical;
  const robots = String(form.robots ?? "").trim();
  if (robots.length < 5 || robots.length > 200) erros.robots = ERROS.invalid_robots;
  const prioridade = Number(form.sitemap_priority);
  if (!Number.isFinite(prioridade) || prioridade < 0 || prioridade > 1) erros.sitemap_priority = ERROS.invalid_priority;
  if (!CHANGEFREQ.includes(form.changefreq as (typeof CHANGEFREQ)[number])) erros.changefreq = ERROS.invalid_changefreq;
  const keywords = String(form.keywords ?? "").split(",").map(item => item.trim()).filter(Boolean);
  if (Object.keys(erros).length > 0) return { ok: false, erros, payload: null };
  return {
    ok: true,
    erros: {},
    payload: {
      path, title, description, keywords, canonical_url: canonical || null, robots,
      sitemap_priority: prioridade, changefreq: form.changefreq,
      // noindex nunca é ligado a partir do formulário de criação: o padrão do
      // servidor já é `true` e a tela só cria registros não indexáveis.
      is_noindex: true,
    },
  };
}

export type FormRedirect = { old_path: string; new_path: string; redirect_type: string; reason: string; is_active: boolean };

export function validarRedirect(form: FormRedirect): { ok: boolean; erros: Record<string, string>; payload: Record<string, unknown> | null } {
  const erros: Record<string, string> = {};
  const oldPath = String(form.old_path ?? "").trim();
  const newPath = String(form.new_path ?? "").trim();
  if (oldPath.length < 1 || oldPath.length > 500) erros.old_path = "O caminho de origem precisa ter de 1 a 500 caracteres.";
  else if (!oldPath.startsWith("/")) erros.old_path = "O caminho de origem precisa começar com /.";
  if (newPath.length < 1 || newPath.length > 500) erros.new_path = "O caminho de destino precisa ter de 1 a 500 caracteres.";
  else if (!newPath.startsWith("/")) erros.new_path = "O caminho de destino precisa começar com /.";
  else if (newPath === oldPath) erros.new_path = "Origem e destino não podem ser iguais.";
  if (!REDIRECT_TYPES.includes(form.redirect_type as (typeof REDIRECT_TYPES)[number])) erros.redirect_type = "Tipo de redirecionamento inválido.";
  const motivo = validarMotivo(form.reason);
  if (!motivo.ok) erros.reason = motivo.erro;
  if (Object.keys(erros).length > 0) return { ok: false, erros, payload: null };
  return {
    ok: true,
    erros: {},
    payload: { old_path: oldPath, new_path: newPath, redirect_type: form.redirect_type, reason: motivo.motivo, is_active: form.is_active === true },
  };
}

export type FormDominio = { domain: string; verification_method: string; verification_token: string };

export function validarDominio(form: FormDominio): { ok: boolean; erros: Record<string, string>; payload: Record<string, unknown> | null } {
  const erros: Record<string, string> = {};
  const domain = String(form.domain ?? "").trim().toLowerCase();
  if (domain.length < 3 || domain.length > 200) erros.domain = ERROS.invalid_domain;
  else if (/\s/.test(domain)) erros.domain = "O domínio não pode ter espaços.";
  const token = String(form.verification_token ?? "").trim();
  if (token.length < 10 || token.length > 500) erros.verification_token = ERROS.invalid_token;
  if (!VERIFICATION_METHODS.includes(form.verification_method as (typeof VERIFICATION_METHODS)[number])) erros.verification_method = ERROS.invalid_method;
  if (Object.keys(erros).length > 0) return { ok: false, erros, payload: null };
  return { ok: true, erros: {}, payload: { domain, verification_method: form.verification_method, verification_token: token } };
}
