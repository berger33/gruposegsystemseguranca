/**
 * Estado da FAQ assistida, da transferência humana e dos segmentos publicados
 * (PUB-02/PUB-05). Puro: sem React, sem DOM, sem `fetch`.
 *
 * O que o protótipo escondia e o servidor não sustentava:
 *
 *  1. `catch{}` em `load()`: negação, falha e resposta torta apareciam como
 *     quatro listas vazias — o operador não sabia se não havia registro ou se
 *     a leitura tinha sido negada;
 *  2. uma única `msg` para erro e sucesso, e o motivo gravado no histórico vinha
 *     **fixo no código** — o texto do operador nunca chegava ao banco;
 *  3. as três situações (`em_revisao`, `aprovado`, `publicado`) eram oferecidas
 *     em **qualquer** linha, inclusive em regra já publicada ou rejeitada;
 *  4. publicar mandava `is_approved`/`is_published` calculados na tela; o
 *     servidor aceitava `{status:'publicado', is_approved:false}` e gravava uma
 *     linha publicada sem aprovação;
 *  5. o handoff era concluído com uma resposta fixa ("Atendimento humano
 *     concluído…") e um responsável fixo ("Responsável comercial") — nada do
 *     que o operador escreveu era gravado;
 *  6. `session_token`/`visitor_contact` dos visitantes apareciam crus na lista:
 *     esta tela mascara o contato e não exibe o token.
 */

export type Situacao = "ok" | "vazio" | "negado" | "falha" | "invalido";

export type Item = Record<string, unknown>;

export type ResultadoLista = {
  situacao: Situacao;
  itens: Item[];
  mensagem: string;
  status: number;
};

/** Espelho do enum `pub_faq_assisted_status` (migração 094). */
export const SITUACOES_REGRA = [
  "rascunho", "em_revisao", "aprovado", "publicado", "arquivado", "rejeitado",
] as const;
export type SituacaoRegra = (typeof SITUACOES_REGRA)[number];

/** Espelho do enum `pub_segment_type` (migração 094). */
export const TIPOS_SEGMENTO = [
  "condominio", "empresa", "industria", "instituicao", "comercio", "outro",
] as const;

/** Espelho do enum `pub_faq_session_status` (migração 094). */
export const SITUACOES_SESSAO = [
  "ativa", "em_handoff", "encerrada", "cancelada", "transferida_humano",
] as const;

/** Espelho do enum `pub_handoff_status` (migração 094). */
export const SITUACOES_HANDOFF = [
  "pendente", "em_atendimento", "concluido", "cancelado", "expirado",
] as const;

/**
 * Política **desta tela**. O servidor confere o valor da situação, a coerência
 * entre `status`/`is_approved`/`is_published` e o motivo; a **ordem** do ciclo
 * é decisão local declarada aqui.
 */
export const TRANSICOES_REGRA: Readonly<Record<SituacaoRegra, readonly SituacaoRegra[]>> =
  Object.freeze({
    rascunho: ["em_revisao", "arquivado", "rejeitado"],
    em_revisao: ["aprovado", "arquivado", "rejeitado"],
    aprovado: ["publicado", "arquivado", "rejeitado"],
    publicado: ["arquivado"],
    arquivado: ["rascunho"],
    rejeitado: ["rascunho"],
  });

/** Política desta tela para o pedido de transferência humana. */
export const TRANSICOES_HANDOFF: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    pendente: ["em_atendimento", "cancelado", "expirado"],
    em_atendimento: ["concluido", "cancelado"],
    concluido: [],
    cancelado: [],
    expirado: [],
  });

/**
 * Guardrails do PUB-05 espelhados do servidor (`pub-faq-assisted-api.mjs`):
 * o bot não inventa preço, cobertura, licença ou prazo. Cada padrão aqui tem
 * um código correspondente no servidor — o teste focal compara as duas listas
 * para que não divirjam em silêncio.
 */
export const DETECCOES: readonly { codigo: string; termo: string; padrao: RegExp }[] = Object.freeze([
  { codigo: "price_invention_detected", termo: "R$", padrao: /R\$\s*\d+/i },
  { codigo: "coverage_invention_detected", termo: "cobertura garantida", padrao: /cobertura garantida/i },
  { codigo: "license_invention_detected", termo: "licença garantida", padrao: /licen[çc]a garantida/i },
  { codigo: "deadline_invention_detected", termo: "prazo garantido", padrao: /prazo garantido/i },
]);

/** Faixas do CHECK/enums da migração 094. */
export const LIMITES = Object.freeze({
  chaveMin: 3, chaveMax: 100,
  perguntaMin: 5, perguntaMax: 500,
  respostaMin: 20, respostaMax: 5000,
  categoriaMin: 3, categoriaMax: 100,
  palavrasMax: 20, palavraMax: 50,
  motivoMin: 10, motivoMax: 1000,
  retornoMin: 10, retornoMax: 2000,
});

export const AVISO_PUBLICO =
  "O atendimento público da FAQ assistida continua fechado: o roteador exige sessão de equipe em /api/faq-assisted*, porque sessão e mensagem de visitante são dado pessoal. Esta tela administra as regras, os segmentos e os pedidos de transferência — não abre a porta pública.";

export const AVISO_HISTORICO =
  "Toda mudança de situação grava o motivo digitado em pub_faq_assisted_history, com versão anterior e próxima. O motivo é obrigatório (10 a 1.000 caracteres) no servidor: a tela não preenche texto por você.";

export const AVISO_MINIMIZACAO =
  "O contato do visitante aparece mascarado e o token da sessão não é exibido: a lista serve para atender o pedido de transferência, não para copiar dado pessoal.";

export const AVISO_SENSIVEL =
  "Preço, cobertura, licença e prazo são sensíveis: exigem transferência humana marcada e motivo. Publicar só acontece depois de aprovar — o servidor recusa com 409 quando alguém tenta pular a etapa.";

export const AVISO_SEGMENTO =
  "A página pública do segmento só existe com publicado E validado. Publicar antes de validar é recusado (409) em vez de deixar a tela dizendo \"publicado\" e o site fora do ar.";

export const FORA_DESTA_TELA: readonly { nome: string; rota: string; tabela: string }[] = Object.freeze([
  { nome: "Mensagens da sessão", rota: "/api/admin/faq-assisted-messages", tabela: "pub_faq_messages" },
  { nome: "Desempenho das páginas", rota: "/api/admin/pub-performance", tabela: "pub_page_performance_metrics" },
  { nome: "Checagens de acessibilidade", rota: "/api/admin/pub-accessibility", tabela: "pub_accessibility_checks" },
]);

const FALLBACK_ERRO = "O servidor recusou a operação. Confira os campos e tente novamente.";

const ERROS: Readonly<Record<string, string>> = {
  unauthorized: "Sessão expirada ou sem papel administrativo (admin ou ti).",
  session_required: "Sessão expirada. Entre novamente para administrar a FAQ assistida.",
  role_required: "Seu papel não administra a FAQ assistida (admin ou ti).",
  forbidden: "Sua sessão não pode executar esta operação.",
  same_origin_required: "A escrita precisa vir da própria origem do painel.",
  method_not_allowed: "O servidor não aceita este método nesta rota.",
  internal_error: "O servidor falhou. Nada foi confirmado — confira antes de repetir.",
  not_found: "Registro não encontrado — pode ter sido removido.",
  missing_id: "Falta o identificador do registro.",
  invalid_id: "Identificador inválido (não é UUID).",
  no_fields: "Nenhum campo para atualizar.",
  invalid_segment_key: "A chave do segmento precisa ter de 3 a 100 caracteres.",
  invalid_name: "O nome do segmento precisa ter de 3 a 200 caracteres.",
  invalid_description: "A descrição do segmento precisa ter de 10 a 2.000 caracteres.",
  invalid_audience: "O público-alvo precisa ter de 10 a 1.000 caracteres.",
  invalid_benefits: "Os benefícios precisam ter de 10 a 2.000 caracteres.",
  invalid_segment_type: "Tipo de segmento fora do enum do banco.",
  duplicate_segment_key: "Já existe um segmento com essa chave.",
  segment_must_be_validated_before_publish: "Valide o segmento antes de publicar: a página pública exige publicado e validado.",
  invalid_rule_key: "A chave da regra precisa ter de 3 a 100 caracteres.",
  invalid_question_pattern: "O padrão da pergunta precisa ter de 5 a 500 caracteres.",
  invalid_answer_template: "A resposta precisa ter de 20 a 5.000 caracteres.",
  invalid_category: "A categoria precisa ter de 3 a 100 caracteres.",
  invalid_keywords: "As palavras-chave são até 20 itens de 50 caracteres.",
  invalid_handoff_reason: "O motivo da transferência precisa ter de 10 a 1.000 caracteres.",
  invalid_reason: "O motivo da mudança precisa ter de 10 a 1.000 caracteres.",
  invalid_status: "Situação fora do enum do banco.",
  duplicate_rule_key: "Já existe uma regra com essa chave.",
  price_invention_detected: "A resposta cita valor em R$: marque preço sensível e a transferência humana.",
  sensitive_template_states_price: "Regra de preço sensível não pode trazer valor em R$ nem promessa de preço no texto.",
  coverage_invention_detected: "A resposta promete cobertura garantida: marque cobertura sensível e a transferência humana.",
  license_invention_detected: "A resposta promete licença garantida: marque licença sensível e a transferência humana.",
  deadline_invention_detected: "A resposta promete prazo garantido: marque prazo sensível e a transferência humana.",
  sensitive_requires_handoff: "Regra sensível exige transferência humana marcada.",
  handoff_reason_required: "Transferência humana exige motivo de 10 a 1.000 caracteres.",
  must_be_approved_before_publish: "Aprove a regra antes de publicar: o servidor recusa publicar sem aprovação.",
  published_status_requires_publish: "Situação publicado com is_published=false não existe: publique de verdade.",
  publish_requires_published_status: "Ligar is_published exige a situação publicado.",
  approval_status_conflict: "Aprovar e recusar a aprovação no mesmo pedido é contraditório.",
  invalid_visitor_name: "O nome do visitante precisa ter de 2 a 100 caracteres.",
  invalid_visitor_contact: "O contato do visitante precisa ter de 5 a 200 caracteres.",
  invalid_question: "A pergunta precisa ter de 5 a 1.000 caracteres.",
  invalid_response: "A resposta ao visitante precisa ter de 10 a 2.000 caracteres.",
  response_required: "Concluir a transferência exige a resposta escrita ao visitante.",
  missing_session_id: "Falta o identificador da sessão.",
  session_not_found: "Sessão não encontrada.",
  invalid_sender_type: "Remetente fora da lista aceita.",
  invalid_message: "A mensagem precisa ter de 1 a 5.000 caracteres.",
  bot_cannot_invent_price: "O bot não pode responder com valor em R$.",
  invalid_path: "O caminho medido precisa ter de 1 a 500 caracteres.",
  invalid_metric_name: "O nome da métrica precisa ter de 3 a 100 caracteres.",
  invalid_metric_value: "O valor da métrica precisa ser numérico.",
  invalid_source: "A fonte da medição precisa ter de 3 a 200 caracteres.",
  invalid_check_type: "O tipo de checagem precisa ter de 3 a 100 caracteres.",
  invalid_result: "O resultado da checagem é pass, fail ou warning.",
  invalid_details: "Os detalhes precisam ter de 10 a 2.000 caracteres.",
};

export function traduzirErroPub(_status: number, codigo: string): string {
  return ERROS[codigo] ?? FALLBACK_ERRO;
}

/** `negado` nunca vira lista vazia; chave errada é resposta inválida. */
export function classificarLista(status: number, corpo: unknown, chave: string, rotulo: string): ResultadoLista {
  if (status === 401 || status === 403) {
    return { situacao: "negado", itens: [], status, mensagem: `A leitura de ${rotulo} foi negada. Isso não é uma lista vazia: o servidor recusou o acesso.` };
  }
  if (status === 0) {
    return { situacao: "falha", itens: [], status, mensagem: `Falha de rede ao ler ${rotulo}. Nada foi confirmado.` };
  }
  if (status < 200 || status >= 300) {
    const codigo = typeof (corpo as { error?: unknown } | null)?.error === "string" ? String((corpo as { error: string }).error) : "";
    return { situacao: status >= 500 ? "falha" : "invalido", itens: [], status, mensagem: traduzirErroPub(status, codigo) };
  }
  const itens = (corpo as Record<string, unknown> | null)?.[chave];
  if (!Array.isArray(itens)) {
    return { situacao: "invalido", itens: [], status, mensagem: `A resposta de ${rotulo} não trouxe a lista esperada (${chave}).` };
  }
  if (itens.length === 0) {
    return { situacao: "vazio", itens: [], status, mensagem: `Nenhum registro em ${rotulo}.` };
  }
  return { situacao: "ok", itens: itens as Item[], status, mensagem: `${itens.length} registro(s) em ${rotulo}.` };
}

export function ehUuid(valor: unknown): boolean {
  return typeof valor === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
}

export function proximosEstados(atual: unknown): SituacaoRegra[] {
  const transicoes = TRANSICOES_REGRA[atual as SituacaoRegra];
  return transicoes ? [...transicoes] : [];
}

export function proximosHandoff(atual: unknown): string[] {
  return [...(TRANSICOES_HANDOFF[String(atual)] ?? [])];
}

/** Primeiro termo proibido encontrado na resposta, no formato do servidor. */
export function detectarInvencao(resposta: string): string | null {
  for (const deteccao of DETECCOES) {
    if (deteccao.padrao.test(resposta)) return deteccao.codigo;
  }
  return null;
}

export function sensivel(form: {
  price?: boolean; coverage?: boolean; license?: boolean; deadline?: boolean;
}): boolean {
  return Boolean(form.price || form.coverage || form.license || form.deadline);
}

export type FormRegra = {
  chave: string;
  pergunta: string;
  resposta: string;
  categoria: string;
  palavras: string;
  price: boolean;
  coverage: boolean;
  license: boolean;
  deadline: boolean;
  handoff: boolean;
  motivo: string;
};

export function validarRegra(form: FormRegra): { ok: boolean; erros: Record<string, string>; payload?: Record<string, unknown> } {
  const erros: Record<string, string> = {};
  const chave = form.chave.trim().toLowerCase();
  if (chave.length < LIMITES.chaveMin || chave.length > LIMITES.chaveMax) erros.chave = ERROS.invalid_rule_key;
  else if (!/^[a-z0-9_-]+$/.test(chave)) erros.chave = "A chave aceita apenas letras minúsculas, números, hífen e sublinhado.";
  const pergunta = form.pergunta.trim();
  if (pergunta.length < LIMITES.perguntaMin || pergunta.length > LIMITES.perguntaMax) erros.pergunta = ERROS.invalid_question_pattern;
  const resposta = form.resposta.trim();
  if (resposta.length < LIMITES.respostaMin || resposta.length > LIMITES.respostaMax) {
    erros.resposta = ERROS.invalid_answer_template;
  } else {
    const invencao = detectarInvencao(resposta);
    // Espelho do CHECK `no_invented_price`: preço sensível não traz R$ no texto.
    if (invencao) erros.resposta = ERROS[invencao === "price_invention_detected" && form.price ? "sensitive_template_states_price" : invencao];
  }
  const categoria = form.categoria.trim().toLowerCase();
  if (categoria.length < LIMITES.categoriaMin || categoria.length > LIMITES.categoriaMax) erros.categoria = ERROS.invalid_category;
  const palavras = form.palavras.split(",").map((item) => item.trim()).filter(Boolean);
  if (palavras.length > LIMITES.palavrasMax || palavras.some((item) => item.length > LIMITES.palavraMax)) erros.palavras = ERROS.invalid_keywords;
  const motivo = form.motivo.trim();
  if (form.handoff && (motivo.length < LIMITES.motivoMin || motivo.length > LIMITES.motivoMax)) erros.motivo = ERROS.handoff_reason_required;
  if (sensivel(form) && !form.handoff) erros.handoff = ERROS.sensitive_requires_handoff;
  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    erros,
    payload: {
      rule_key: chave,
      question_pattern: pergunta,
      answer_template: resposta,
      category: categoria,
      keywords: palavras,
      is_price_sensitive: form.price,
      is_coverage_sensitive: form.coverage,
      is_license_sensitive: form.license,
      is_deadline_sensitive: form.deadline,
      is_human_handoff_required: form.handoff,
      handoff_reason: form.handoff ? motivo : null,
    },
  };
}

/**
 * Transição de situação: só o próximo passo do ciclo é oferecido, o motivo é do
 * operador e publicar exige a regra já aprovada (política local; o servidor
 * recusa a mesma incoerência com 409).
 */
export function validarTransicaoRegra(
  id: string,
  destino: string,
  atual: unknown,
  motivo: string,
): { ok: boolean; erros: Record<string, string>; payload?: Record<string, unknown> } {
  const erros: Record<string, string> = {};
  if (!ehUuid(id)) erros.id = "Identificador de regra inválido.";
  if (!proximosEstados(atual).includes(destino as SituacaoRegra)) erros.status = `A regra em ${String(atual)} não vai para ${destino}: esse não é o próximo passo do ciclo.`;
  if (destino === "publicado" && atual !== "aprovado") erros.status = "Publicar exige a regra aprovada antes.";
  const texto = motivo.trim();
  if (texto.length < LIMITES.motivoMin || texto.length > LIMITES.motivoMax) erros.motivoTransicao = ERROS.invalid_reason;
  if (Object.keys(erros).length) return { ok: false, erros };
  const payload: Record<string, unknown> = { id, status: destino, reason: texto };
  if (destino === "aprovado") payload.is_approved = true;
  return { ok: true, erros, payload };
}

export function validarHandoff(
  id: string,
  protocolo: string,
  atual: unknown,
  destino: string,
  resposta: string,
): { ok: boolean; erros: Record<string, string>; payload?: Record<string, unknown> } {
  const erros: Record<string, string> = {};
  if (!ehUuid(id)) erros.id = "Identificador de transferência inválido.";
  if (!proximosHandoff(atual).includes(destino)) erros.status = `A transferência em ${String(atual)} não vai para ${destino}.`;
  if (destino === "concluido") {
    const texto = resposta.trim();
    if (texto.length < LIMITES.retornoMin || texto.length > LIMITES.retornoMax) erros.retorno = ERROS.response_required;
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  const payload: Record<string, unknown> = { id, protocolo, status: destino };
  if (destino === "concluido") payload.response = resposta.trim();
  return { ok: true, erros, payload };
}

export function validarSegmento(
  id: string,
  acao: "validar" | "publicar" | "despublicar",
  segmento: { is_validated?: unknown; is_published?: unknown },
): { ok: boolean; erros: Record<string, string>; payload?: Record<string, unknown> } {
  const erros: Record<string, string> = {};
  if (!ehUuid(id)) erros.id = "Identificador de segmento inválido.";
  const validado = segmento.is_validated === true;
  if (acao === "publicar" && !validado) erros.acao = ERROS.segment_must_be_validated_before_publish;
  if (acao === "validar" && validado) erros.acao = "Este segmento já está validado.";
  if (acao === "publicar" && segmento.is_published === true) erros.acao = "Este segmento já está publicado.";
  if (acao === "despublicar" && segmento.is_published !== true) erros.acao = "Este segmento não está publicado.";
  if (Object.keys(erros).length) return { ok: false, erros };
  const payload: Record<string, unknown> = { id };
  if (acao === "validar") payload.is_validated = true;
  if (acao === "publicar") payload.is_published = true;
  if (acao === "despublicar") payload.is_published = false;
  return { ok: true, erros, payload };
}

/** Contato do visitante mascarado: só os dois últimos caracteres aparecem. */
export function mascararContato(valor: unknown): string {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto) return "não informado";
  const visivel = texto.slice(-2);
  const escondido = texto.slice(0, -2);
  return `${escondido.replace(/[^\s@.]/g, "•")}${visivel}`;
}

export function simNao(valor: unknown): string {
  if (valor === true) return "sim";
  if (valor === false) return "não";
  return "não informado";
}

export function rotuloSituacao(valor: unknown): string {
  const mapa: Readonly<Record<string, string>> = {
    rascunho: "Rascunho",
    em_revisao: "Em revisão",
    aprovado: "Aprovado",
    publicado: "Publicado",
    arquivado: "Arquivado",
    rejeitado: "Rejeitado",
    ativa: "Ativa",
    em_handoff: "Em transferência",
    encerrada: "Encerrada",
    cancelada: "Cancelada",
    transferida_humano: "Transferida ao humano",
    pendente: "Pendente",
    em_atendimento: "Em atendimento",
    concluido: "Concluído",
    cancelado: "Cancelado",
    expirado: "Expirado",
  };
  return mapa[String(valor)] ?? String(valor ?? "—");
}

function slug(valor: unknown): string {
  return String(valor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function chaveRegra(item: Item): string {
  return slug(item.rule_key) || "sem-chave";
}

export function chaveSegmento(item: Item): string {
  return slug(item.segment_key) || "sem-segmento";
}

export function chaveHandoff(item: Item): string {
  return slug(item.protocol) || "sem-protocolo";
}

export function chaveSessao(item: Item): string {
  return slug(item.protocol) || "sem-sessao";
}

export function dataCurta(valor: unknown): string {
  if (typeof valor !== "string" || !valor) return "sem data";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "sem data";
  return `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")} ${String(data.getHours()).padStart(2, "0")}:${String(data.getMinutes()).padStart(2, "0")}`;
}
