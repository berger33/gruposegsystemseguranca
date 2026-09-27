// Fonte única dos serviços e tipos de imóvel aceitos pelo formulário público.
// O servidor (validação do lead) e as telas do site leem daqui, para que o
// simulador nunca ofereça uma opção que a API vá recusar.
//
// Os textos abaixo vêm do conteúdo já publicado pela empresa. Não anunciar
// preços, licenças, registros, número de clientes ou cases sem confirmação
// específica do responsável.

export const PUBLIC_SERVICES = [
  {
    name: "Segurança Desarmada",
    short: "Presença preventiva, rondas e proteção patrimonial com profissionais preparados.",
    question: "Como é hoje a circulação de pessoas e o acesso ao seu local?",
  },
  {
    name: "Monitoramento 24 Horas",
    short: "Acompanhamento contínuo e apoio operacional na resposta a ocorrências.",
    question: "Existe algum ponto que precisa de atenção fora do horário comercial?",
  },
  {
    name: "Câmeras e CFTV",
    short: "Projetos e instalação de sistemas de câmeras dimensionados para seu espaço.",
    question: "Quais áreas você gostaria de cobrir e o que já existe instalado?",
  },
  {
    name: "Portaria e Controle de Acesso",
    short: "Rotinas de entrada, saída, identificação e atendimento para cada operação.",
    question: "Quantas entradas e saídas recebem maior movimento no dia?",
  },
  {
    name: "Limpeza e Conservação",
    short: "Equipes para ambientes corporativos, condomínios e áreas comerciais.",
    question: "Quais ambientes precisam de manutenção diária?",
  },
  {
    name: "Supervisão e Ronda",
    short: "Acompanhamento dos postos, visitas programadas e apoio às equipes.",
    question: "Você já tem equipes operando e quer acompanhamento da supervisão?",
  },
];

export const PROPERTY_TYPES = [
  {
    name: "Condomínio",
    question: "Quantos blocos ou entradas precisam de atenção?",
  },
  {
    name: "Empresa ou comércio",
    question: "Há horário de pico, estoque ou fluxo de pessoas a considerar?",
  },
  {
    name: "Indústria",
    question: "Quais áreas exigem acesso restrito ou acompanhamento contínuo?",
  },
  {
    name: "Instituição",
    question: "O atendimento ao público e o horário de funcionamento são prioridade?",
  },
  {
    name: "Outro",
    question: "Conte em poucas palavras o tipo de operação.",
  },
];

export function isPublicService(value) {
  return typeof value === "string" && PUBLIC_SERVICES.some(service => service.name === value);
}

export function isPropertyType(value) {
  return typeof value === "string" && PROPERTY_TYPES.some(property => property.name === value);
}

export function findService(value) {
  return PUBLIC_SERVICES.find(service => service.name === value) ?? null;
}

export function findPropertyType(value) {
  return PROPERTY_TYPES.find(property => property.name === value) ?? null;
}

// Monta o resumo que a pessoa revisa antes de continuar pelo WhatsApp.
// `kind` aceita os mesmos valores de `requestKind` usados pela API.
export function buildRequestSummary({ kind, name, phone, city, propertyType, services, visitPreference, details }) {
  const wantsVisit = kind === "visit";
  const chosen = Array.isArray(services) ? services.filter(isPublicService) : [];
  const lines = [
    `Olá! Gostaria de ${wantsVisit ? "solicitar uma visita técnica" : "solicitar um orçamento"} ao Grupo SEG System.`,
    `Nome: ${name ?? ""}`,
    `Telefone: ${phone ?? ""}`,
    `Cidade/bairro: ${city ?? ""}`,
    `Tipo de imóvel: ${propertyType ?? ""}`,
    `Serviços de interesse: ${chosen.length ? chosen.join(", ") : "Gostaria de orientação"}`,
  ];
  if (wantsVisit) lines.push(`Preferência de dia/turno: ${visitPreference || "A combinar"}`);
  if (details) lines.push(`Detalhes: ${details}`);
  return lines;
}
