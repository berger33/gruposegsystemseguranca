// F01 — Entrada e navegação central do staff.
//
// Lógica pura e determinística, compartilhada entre o servidor
// (opções públicas de login) e as páginas /admin (login central, redireciono
// por papel e menu). Sem acesso a banco, rede ou process — tudo entra por
// parâmetro, o que torna a política testável isoladamente.
//
// Isto NÃO é controle de autorização: autorização continua sendo decidida no
// servidor em cada API (readSession/requireRole). Menu e redireciono existem
// só para que a pessoa certa chegue à tela certa depois do login.

export const ADMIN_HOME_FALLBACK = "/admin";

/** Destino inicial por papel staff após o login. */
export const ROLE_HOME = Object.freeze({
  admin: "/admin",
  marcelo: "/admin/marcelo",
  ti: "/admin",
  rh: "/admin/funcionarios",
  comercial: "/admin/crm",
  financeiro: "/admin/financeiro",
  supervisor: "/admin/operacao",
});

/** Rótulo humano do papel para chips e mensagens. */
export const ROLE_LABEL = Object.freeze({
  admin: "Administração geral",
  marcelo: "Marcelo · administração",
  ti: "TI · sistema",
  rh: "RH · recursos humanos",
  comercial: "Comercial",
  financeiro: "Financeiro",
  supervisor: "Supervisão operacional",
});

export function roleHome(role) {
  const key = String(role || "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_HOME, key) ? ROLE_HOME[key] : ADMIN_HOME_FALLBACK;
}

export function roleLabel(role) {
  const key = String(role || "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_LABEL, key) ? ROLE_LABEL[key] : "Conta de equipe";
}

/**
 * Sanitiza o destino `next` do redirecionamento pós-login.
 * Aceita apenas caminhos internos do namespace /admin (com query/hash), sem
 * esquema, host, barra invertida ou caracteres de controle, e nunca a própria
 * página de entrada (evita loop). Qualquer entrada suspeita cai no fallback.
 * Os destinos NUNCA são URLs absolutas: o servidor não emite Location externo
 * e o cliente só navega com o valor já sanitizado aqui.
 */
export function sanitizeAdminNext(candidate) {
  if (typeof candidate !== "string") return ADMIN_HOME_FALLBACK;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.length > 200) return ADMIN_HOME_FALLBACK;
  // Namespace restrito: "/admin" exato ou caminho abaixo dele — "/administrador"
  // e cia. são vizinhos fora da área e precisam cair no fallback.
  if (!(trimmed === ADMIN_HOME_FALLBACK || trimmed.startsWith(`${ADMIN_HOME_FALLBACK}/`) || trimmed.startsWith(`${ADMIN_HOME_FALLBACK}?`) || trimmed.startsWith(`${ADMIN_HOME_FALLBACK}#`))) {
    return ADMIN_HOME_FALLBACK;
  }
  if (trimmed.startsWith("//")) return ADMIN_HOME_FALLBACK;
  if (trimmed.includes("\\")) return ADMIN_HOME_FALLBACK;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return ADMIN_HOME_FALLBACK;
  const pathOnly = trimmed.split(/[?#]/, 2)[0].replace(/\/+$/, "") || "/admin";
  if (pathOnly === "/admin/entrar") return ADMIN_HOME_FALLBACK;
  return trimmed;
}

/** Destino final pós-login: `next` válido vence; senão, a home do papel. */
export function resolvePostLoginTarget({ role, next }) {
  const safe = sanitizeAdminNext(next);
  return safe !== ADMIN_HOME_FALLBACK ? safe : roleHome(role);
}

/**
 * Decide se a UI pode oferecer a aba de "chave administrativa legada".
 * Mesma política do servidor (evaluateLegacyTokenPolicy): só quando o operador
 * ligou SITE_ADMIN_LEGACY_TOKENS=true de forma explícita E existe algum token
 * configurado com tamanho mínimo. A contagem de staff provisionado fica de
 * fora de propósito (endpoint público não deve vazar estado da base); a
 * recusa final continua acontecendo a cada tentativa de login no servidor,
 * fail-closed. `envLike` é um objeto com as variáveis (ex.: process.env).
 */
export function legacyLoginEnabled(envLike) {
  if (!envLike || typeof envLike !== "object") return false;
  if (String(envLike.SITE_ADMIN_LEGACY_TOKENS ?? "").trim().toLowerCase() !== "true") return false;
  const marcelo = typeof envLike.SITE_ADMIN_TOKEN_MARCELO === "string" ? envLike.SITE_ADMIN_TOKEN_MARCELO : "";
  const ti = typeof envLike.SITE_ADMIN_TOKEN_TI === "string" ? envLike.SITE_ADMIN_TOKEN_TI : "";
  return marcelo.length >= 32 || ti.length >= 32;
}

/**
 * Mensagem compreensível para cada código de erro conhecido do login staff.
 * Sem detalhar internos; o cliente traduz apenas o que a API já publica.
 */
export function loginErrorMessage(code, mode = "individual") {
  switch (String(code || "")) {
    case "invalid_credentials":
      return "E-mail ou senha não conferem. Confira os dados e tente novamente.";
    case "identity_not_active":
      return "Sua conta ainda não está ativa ou foi suspensa. Procure o TI.";
    case "staff_profile_missing":
      return "Sua conta existe, mas o perfil de equipe não foi concluído. Peça ao TI para finalizar o provisionamento.";
    case "role_not_allowed":
      return "Seu papel de equipe não tem acesso a esta área.";
    case "too_many_attempts":
      return "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.";
    case "same_origin_required":
      return "Pedido recusado por origem inválida. Recarregue a página e tente novamente.";
    case "admin_auth_not_configured":
      return "A autenticação administrativa ainda não está configurada no servidor.";
    case "database_not_configured":
    case "migration_required":
    case "auth_unavailable":
    case "mfa_login_unavailable":
      return "Serviço de autenticação indisponível no momento. Tente novamente em instantes ou contate o TI.";
    case "mfa_challenge_invalid":
      return "Código de verificação inválido ou expirado. Tente novamente.";
    case "legacy_admin_tokens_disabled":
    case "legacy_admin_tokens_superseded":
      return "A chave legada está desativada neste ambiente. Entre com sua conta individual de e-mail e senha.";
    case "admin_auth_not_configured_tokens":
      return "A chave legada ainda não está configurada neste ambiente.";
    case "invalid_token":
      return "Chave administrativa inválida.";
    case "invalid_email":
      return "Formato de e-mail inválido.";
    case "invalid_request":
      return "Pedido incompleto. Preencha os campos e tente novamente.";
    default:
      return mode === "legacy"
        ? "Não foi possível entrar com a chave administrativa."
        : "Não foi possível entrar. Verifique os dados e tente novamente.";
  }
}
