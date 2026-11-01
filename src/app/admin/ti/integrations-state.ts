/**
 * Estado do catálogo de integrações e do teste de conexão (PLT-03).
 * Puro: sem React, sem DOM, sem `fetch`.
 *
 * O que o protótipo escondia e o servidor não sustentava:
 *
 *  1. `alert()` para o resultado do teste: nada ficava na tela, nada era lido
 *     por leitor de tela e o operador perdia o histórico da própria ação;
 *  2. a mensagem de lista vazia era `"Nenhuma integração (ou sem permissão)"` —
 *     negação e vazio no mesmo texto, que é exatamente o que esta casa proíbe;
 *  3. `config_sanitized` era despejado com `JSON.stringify` no meio do cartão;
 *  4. o servidor aceita filtro por `provider` e `status` desde sempre, e o
 *     protótipo nunca os usava — sete cartões para achar um;
 *  5. o servidor aceita `PATCH` de identificação, e a tela não oferecia: um
 *     nome nascido do `id` ficava para sempre;
 *  6. os quatro subcaminhos da aba viva "Registros de integração" respondiam
 *     405 (o padrão `/:id` casava antes); esta tela não os duplica — ela declara
 *     onde eles moram.
 */

export type Situacao = "ok" | "vazio" | "negado" | "falha" | "invalido";

export type Item = Record<string, unknown>;

export type ResultadoLista = {
  situacao: Situacao;
  itens: Item[];
  mensagem: string;
  status: number;
};

/** Espelho de `ALLOWED_PROVIDERS` em `src/server/integrations-api.mjs`. */
export const PROVEDORES = [
  "smtp", "whatsapp", "payment", "nfe", "llm", "calendar", "storage", "sms", "push", "webhook", "other",
] as const;
export type Provedor = (typeof PROVEDORES)[number];

/** Espelho de `ALLOWED_STATUS` em `src/server/integrations-api.mjs`. */
export const SITUACOES_INTEGRACAO = ["not_configured", "configured", "failure", "testing"] as const;
export type SituacaoIntegracao = (typeof SITUACOES_INTEGRACAO)[number];

/** Papéis que podem testar conexão e renomear integração (o servidor confere). */
export const PAPEIS_DE_ESCRITA = ["admin", "ti"] as const;

export const LIMITES = {
  nomeMin: 1,
  nomeMax: 100,
  idMax: 100,
  valorConfigMax: 120,
} as const;

/** Rótulo em português para cada provedor conhecido. */
export const ROTULO_PROVEDOR: Readonly<Record<Provedor, string>> = {
  smtp: "E-mail (SMTP)",
  whatsapp: "WhatsApp",
  payment: "Pagamento",
  nfe: "NF-e / fiscal",
  llm: "IA / LLM",
  calendar: "Agenda",
  storage: "Armazenamento",
  sms: "SMS",
  push: "Push",
  webhook: "Webhook",
  other: "Outro",
};

export const ROTULO_SITUACAO: Readonly<Record<SituacaoIntegracao, string>> = {
  not_configured: "não configurada",
  configured: "configurada",
  failure: "em falha",
  testing: "em teste",
};

export const TOM_SITUACAO: Readonly<Record<SituacaoIntegracao, "neutral" | "success" | "warning" | "danger">> = {
  not_configured: "neutral",
  configured: "success",
  failure: "danger",
  testing: "warning",
};

export const FALLBACK_ERRO = "O servidor recusou o pedido e não informou o motivo.";

export const ERROS: Readonly<Record<string, string>> = {
  admin_session_required: "A sessão de equipe expirou. Entre novamente para ver as integrações.",
  same_origin_required: "O pedido veio de outra origem e foi recusado (mesma origem é obrigatória).",
  role_required: "Testar conexão e renomear integração exigem papel admin ou ti.",
  method_not_allowed: "O servidor não aceita esse método nesta rota.",
  invalid_request: "O corpo do pedido não é JSON válido. Nada foi gravado.",
  invalid_provider: "Esse provedor não existe no catálogo (smtp, whatsapp, payment, nfe, llm, calendar, storage, sms, push, webhook, other).",
  invalid_status: "Essa situação não existe (not_configured, configured, failure, testing).",
  invalid_name: "O nome da integração precisa ter de 1 a 100 caracteres.",
  no_fields: "Informe o nome ou o provedor: sem nenhum dos dois não há o que atualizar.",
  invalid_integration_id: "O identificador da integração é inválido (1 a 100 caracteres, sem colidir com os subcaminhos da aba de registros).",
  integration_not_found: "Não existe integração com esse identificador.",
  provider_required: "Para criar uma integração nova é preciso informar o provedor.",
  database_not_configured: "O banco não está configurado neste ambiente.",
  integrations_unavailable: "O catálogo de integrações não respondeu. Nada foi confirmado.",
  integration_test_failed: "O teste de conexão falhou no servidor. Nenhum resultado foi gravado.",
  integration_update_failed: "A atualização da integração falhou no servidor. Nada foi gravado.",
};

export function traduzirErroIntegracao(_status: number, codigo: string): string {
  return ERROS[codigo] ?? FALLBACK_ERRO;
}

/** `negado` nunca vira lista vazia; resposta sem `integrations` é inválida. */
export function classificarLista(status: number, corpo: unknown): ResultadoLista {
  if (status === 401 || status === 403) {
    return { situacao: "negado", itens: [], status, mensagem: "A leitura do catálogo foi negada. Isso não é um catálogo vazio: o servidor recusou o acesso." };
  }
  if (status === 0) {
    return { situacao: "falha", itens: [], status, mensagem: "Falha de rede ao ler o catálogo. Nada foi confirmado." };
  }
  if (status < 200 || status >= 300) {
    const codigo = typeof (corpo as { error?: unknown } | null)?.error === "string" ? String((corpo as { error: string }).error) : "";
    return { situacao: status >= 500 ? "falha" : "invalido", itens: [], status, mensagem: traduzirErroIntegracao(status, codigo) };
  }
  const itens = (corpo as Record<string, unknown> | null)?.integrations;
  if (!Array.isArray(itens)) {
    return { situacao: "invalido", itens: [], status, mensagem: "A resposta do catálogo não trouxe a lista esperada (integrations)." };
  }
  if (itens.length === 0) {
    return { situacao: "vazio", itens: [], status, mensagem: "Nenhuma integração cadastrada para este filtro." };
  }
  return { situacao: "ok", itens: itens as Item[], status, mensagem: `${itens.length} integração(ões) no catálogo.` };
}

export type Filtros = { provedor: string; situacao: string };

export function validarFiltros(filtros: Filtros): { ok: boolean; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  if (filtros.provedor && !(PROVEDORES as readonly string[]).includes(filtros.provedor)) erros.provedor = ERROS.invalid_provider;
  if (filtros.situacao && !(SITUACOES_INTEGRACAO as readonly string[]).includes(filtros.situacao)) erros.situacao = ERROS.invalid_status;
  return { ok: Object.keys(erros).length === 0, erros };
}

/** Monta a query string só com o que o servidor aceita. */
export function queryDoFiltro(filtros: Filtros): string {
  const { ok } = validarFiltros(filtros);
  if (!ok) return "";
  const params = new URLSearchParams();
  if (filtros.provedor) params.set("provider", filtros.provedor);
  if (filtros.situacao) params.set("status", filtros.situacao);
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

/**
 * Filtro local, espelho do `WHERE` do servidor. Serve para não mostrar cartão
 * que a leitura não pediu enquanto a nova resposta não chega.
 */
export function filtrarIntegracoes(itens: Item[], filtros: Filtros): Item[] {
  return itens.filter((item) => {
    if (filtros.provedor && String(item.provider ?? "") !== filtros.provedor) return false;
    if (filtros.situacao && String(item.status ?? "") !== filtros.situacao) return false;
    return true;
  });
}

export function validarNome(valor: unknown): string | null {
  const nome = String(valor ?? "").trim();
  if (nome.length < LIMITES.nomeMin || nome.length > LIMITES.nomeMax) return ERROS.invalid_name;
  return null;
}

export function podeEscrever(papel: unknown): boolean {
  return (PAPEIS_DE_ESCRITA as readonly string[]).includes(String(papel ?? ""));
}

/** Par chave/valor legível; o servidor já manda segredo como `[redacted]`. */
export function mascararConfig(config: unknown): Array<{ chave: string; valor: string }> {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  return Object.entries(config as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([chave, valor]) => {
      const texto = typeof valor === "string"
        ? valor
        : valor === null || valor === undefined
          ? "—"
          : JSON.stringify(valor);
      const seguro = /redacted/i.test(texto) ? "[redacted]" : texto;
      return {
        chave,
        valor: seguro.length > LIMITES.valorConfigMax ? `${seguro.slice(0, LIMITES.valorConfigMax)}…` : seguro,
      };
    });
}

export function rotuloProvedor(valor: unknown): string {
  const chave = String(valor ?? "");
  return ROTULO_PROVEDOR[chave as Provedor] ?? (chave || "—");
}

export function rotuloSituacao(valor: unknown): string {
  const chave = String(valor ?? "");
  return ROTULO_SITUACAO[chave as SituacaoIntegracao] ?? (chave || "—");
}

/** Data em pt-BR, ou `—` quando o campo nunca foi preenchido. */
export function formatarQuando(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const data = new Date(String(valor));
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR");
}

export function resumo(itens: Item[]): { total: number; configuradas: number; emFalha: number; naoConfiguradas: number } {
  const contar = (situacao: string) => itens.filter((item) => String(item.status ?? "") === situacao).length;
  return {
    total: itens.length,
    configuradas: contar("configured"),
    emFalha: contar("failure"),
    naoConfiguradas: contar("not_configured"),
  };
}

/**
 * O que dizer ao operador sobre o resultado do teste. O servidor devolve o item
 * atualizado; a tela não inventa "configurado" a partir de HTTP 200.
 */
export function descreverTeste(status: number, corpo: unknown): { ok: boolean; mensagem: string; item: Item | null } {
  const item = (corpo as { integration?: unknown } | null)?.integration;
  const integracao = item && typeof item === "object" ? (item as Item) : null;
  if (status < 200 || status >= 300) {
    const codigo = typeof (corpo as { error?: unknown } | null)?.error === "string" ? String((corpo as { error: string }).error) : "";
    return { ok: false, mensagem: traduzirErroIntegracao(status, codigo), item: null };
  }
  if (!integracao) return { ok: false, mensagem: "O teste respondeu sem o registro da integração. Nada foi confirmado.", item: null };
  const situacao = rotuloSituacao(integracao.status);
  const erro = typeof integracao.last_error_sanitized === "string" && integracao.last_error_sanitized
    ? ` Motivo: ${integracao.last_error_sanitized}`
    : "";
  return { ok: true, mensagem: `Teste concluído: ${situacao}.${erro}`, item: integracao };
}

/** O teste SMTP abre conexão de verdade; os demais provedores não são testados. */
export function testeConectaDeVerdade(provedor: unknown): boolean {
  return String(provedor ?? "") === "smtp";
}
