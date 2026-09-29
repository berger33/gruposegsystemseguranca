// CRM-09 — cadências de prospecção "inicialmente como tarefas".
//
// Importante (escopo honesto): NÃO existe automação de mensagens aqui. A
// adesão a uma cadência apenas materializa tarefas reais com prazo calculado,
// para uma pessoa executar. Disparo automático de e-mail/WhatsApp depende de
// autorização do titular, opt-out e provedor contratado — nada disso está no
// escopo local desta entrega.

export const COMMERCIAL_CADENCES = Object.freeze({
  "prospeccao-inicial": Object.freeze({
    key: "prospeccao-inicial",
    name: "Prospecção inicial",
    description:
      "Primeiro contato com empresa nova: confirmar necessidade, decisor e interesse em vistoria.",
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
    description: "Sequência após vistoria realizada, até a decisão sobre a proposta.",
    steps: Object.freeze([
      Object.freeze({ step: 1, offsetDays: 0, priority: "alta", title: "Consolidar dados da vistoria e abrir orçamento" }),
      Object.freeze({ step: 2, offsetDays: 3, priority: "alta", title: "Apresentar proposta ao decisor" }),
      Object.freeze({ step: 3, offsetDays: 7, priority: "media", title: "Follow-up de decisão — registrar objeções no histórico" }),
    ]),
  }),
  "reativacao-carteira": Object.freeze({
    key: "reativacao-carteira",
    name: "Reativação de carteira",
    description: "Retomada de cliente inativo, sem oportunidade aberta.",
    steps: Object.freeze([
      Object.freeze({ step: 1, offsetDays: 0, priority: "media", title: "Ligação de reaproximação — levantar motivo de saída" }),
      Object.freeze({ step: 2, offsetDays: 5, priority: "media", title: "Enviar novidades de serviço aplicáveis ao perfil" }),
      Object.freeze({ step: 3, offsetDays: 10, priority: "baixa", title: "Registrar decisão do cliente e encerrar ou reabrir oportunidade" }),
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
  if (typeof key !== "string") return null;
  return COMMERCIAL_CADENCES[key] || null;
}
