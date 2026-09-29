// CRM-09 — cadências de prospecção.
//
// O requisito é explícito: cadência "inicialmente como tarefas". Não há disparo
// automático de mensagem aqui — automação dependeria de autorização do titular,
// opt-out registrado e provedor contratado, nada disso está no escopo local.
// Cada passo vira uma tarefa real em crm_tasks, com responsável derivado da
// sessão e prazo calculado a partir da data de adesão.
//
// Os modelos são definidos em código (e não em tabela editável) pelo mesmo
// motivo do catálogo de serviços: são conteúdo revisado, não dado operacional.

export const COMMERCIAL_CADENCES = Object.freeze({
  "prospeccao-inicial": Object.freeze({
    key: "prospeccao-inicial",
    name: "Prospecção inicial",
    description:
      "Primeiro contato com empresa ainda não qualificada. Encerra em arquivamento se não houver resposta.",
    steps: Object.freeze([
      Object.freeze({ step: 1, offsetDays: 0, priority: "alta", title: "Ligação inicial de prospecção — confirmar necessidade e decisor" }),
      Object.freeze({ step: 2, offsetDays: 2, priority: "media", title: "Follow-up por WhatsApp — contato humano, sem disparo automático" }),
      Object.freeze({ step: 3, offsetDays: 4, priority: "media", title: "Enviar apresentação institucional (registro na caixa local, sem promessa de entrega)" }),
      Object.freeze({ step: 4, offsetDays: 7, priority: "alta", title: "Segunda ligação — decidir agendamento de vistoria" }),
      Object.freeze({ step: 5, offsetDays: 12, priority: "baixa", title: "Tentativa final de contato antes de arquivar a prospecção" }),
    ]),
  }),
  "pos-vistoria": Object.freeze({
    key: "pos-vistoria",
    name: "Pós-vistoria",
    description:
      "Sequência após vistoria realizada, até a decisão do cliente sobre a proposta.",
    steps: Object.freeze([
      Object.freeze({ step: 1, offsetDays: 0, priority: "alta", title: "Consolidar dados da vistoria e abrir orçamento" }),
      Object.freeze({ step: 2, offsetDays: 3, priority: "alta", title: "Apresentar proposta ao decisor" }),
      Object.freeze({ step: 3, offsetDays: 7, priority: "media", title: "Follow-up de decisão — registrar objeções no histórico" }),
    ]),
  }),
  "reativacao-carteira": Object.freeze({
    key: "reativacao-carteira",
    name: "Reativação de carteira",
    description:
      "Retomada de cliente inativo: entender o motivo da saída antes de qualquer oferta.",
    steps: Object.freeze([
      Object.freeze({ step: 1, offsetDays: 0, priority: "media", title: "Ligação de reaproximação — levantar motivo de saída" }),
      Object.freeze({ step: 2, offsetDays: 5, priority: "media", title: "Enviar condições de retorno revisadas pela alçada competente" }),
      Object.freeze({ step: 3, offsetDays: 10, priority: "baixa", title: "Decidir entre reabrir oportunidade ou encerrar a reativação" }),
    ]),
  }),
});

export function listCadences() {
  return Object.values(COMMERCIAL_CADENCES).map((c) => ({
    key: c.key,
    name: c.name,
    description: c.description,
    steps: c.steps.map((s) => ({ ...s })),
  }));
}

export function getCadence(key) {
  return COMMERCIAL_CADENCES[String(key || "").trim()] || null;
}
