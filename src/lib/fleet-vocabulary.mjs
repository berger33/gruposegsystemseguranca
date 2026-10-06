// UX-07 / EXT-01 — vocabulário de apresentação da frota.
// Fonte: src/server/ext-fleet-api.mjs. O teste anti-deriva extrai todos os
// literais `error:` depois de remover comparações e operandos de `.includes`,
// incluindo os handlers legados vivos. Não há wrapper/HttpError/exceção
// convertida neste servidor. Valor desconhecido sempre passa cru.

const denied = (title, detail) => ({
  kind: "denied",
  title,
  detail,
  canRetry: false,
});
const invalid = (title, detail) => ({
  kind: "invalid",
  title,
  detail,
  canRetry: false,
});
const conflict = (title, detail) => ({
  kind: "conflict",
  title,
  detail,
  canRetry: false,
});
const unavailable = (title, detail) => ({
  kind: "unavailable",
  title,
  detail,
  canRetry: true,
});

export const ERROR_MESSAGES = Object.freeze({
  audit_unavailable: unavailable(
    "Auditoria indisponível",
    "A operação foi desfeita porque a trilha obrigatória não pôde ser gravada.",
  ),
  body_too_large: invalid(
    "Dados muito extensos",
    "Reduza o conteúdo enviado e tente novamente.",
  ),
  document_already_inactive: conflict(
    "Documento já desativado",
    "O documento já está inativo e seu histórico foi preservado.",
  ),
  document_not_found: invalid(
    "Documento não encontrado",
    "O documento solicitado não existe na jornada canônica.",
  ),
  duplicate_plate: conflict(
    "Placa já registrada",
    "Já existe um veículo canônico com esta placa.",
  ),
  fleet_unavailable: unavailable(
    "Frota indisponível",
    "O servidor não concluiu a consulta. Isto não significa ausência de veículos ou custo zero.",
  ),
  forbidden_role: denied(
    "Papel sem acesso à frota",
    "Abrir a tela pelo menu não concede autorização; o servidor recusou este papel.",
  ),
  fuel_date_in_future: invalid(
    "Data de abastecimento no futuro",
    "Informe uma data que não seja posterior à data do servidor.",
  ),
  idempotency_key_required: invalid(
    "Identificador da operação ausente",
    "A mutação exige uma chave de idempotência válida.",
  ),
  idempotency_key_reused: conflict(
    "Chave usada com dados diferentes",
    "A operação foi recusada para impedir efeitos duplicados.",
  ),
  interval_required: invalid(
    "Intervalo obrigatório",
    "Informe intervalo em dias, em quilômetros ou ambos.",
  ),
  invalid_alert_before_days: invalid(
    "Antecedência em dias inválida",
    "Informe uma antecedência em dias dentro do limite aceito.",
  ),
  invalid_alert_before_km: invalid(
    "Antecedência em quilômetros inválida",
    "Informe uma antecedência em quilômetros dentro do limite aceito.",
  ),
  invalid_cost_center: invalid(
    "Centro de custo inválido",
    "Revise o centro de custo informado.",
  ),
  invalid_cost_cents: invalid(
    "Custo inválido",
    "Informe o custo em centavos, como inteiro não negativo.",
  ),
  invalid_description: invalid(
    "Descrição inválida",
    "Revise a descrição da manutenção.",
  ),
  invalid_document_number: invalid(
    "Número do documento inválido",
    "Revise o número do documento.",
  ),
  invalid_document_type: invalid(
    "Tipo de documento inválido",
    "Revise o tipo do documento.",
  ),
  invalid_expiry_date: invalid(
    "Vencimento inválido",
    "Informe uma data válida no formato esperado.",
  ),
  invalid_file_name: invalid(
    "Nome de arquivo inválido",
    "Revise o nome do arquivo informado.",
  ),
  invalid_fuel_date: invalid(
    "Data de abastecimento inválida",
    "Informe uma data válida.",
  ),
  invalid_fuel_type: invalid(
    "Combustível inválido",
    "Escolha um combustível aceito pelo servidor.",
  ),
  invalid_interval_days: invalid(
    "Intervalo em dias inválido",
    "Revise o intervalo em dias.",
  ),
  invalid_interval_km: invalid(
    "Intervalo em quilômetros inválido",
    "Revise o intervalo em quilômetros.",
  ),
  invalid_justification: invalid(
    "Justificativa inválida",
    "A justificativa deve ser escrita por quem opera e respeitar o tamanho exigido.",
  ),
  invalid_liters: invalid(
    "Quantidade de litros inválida",
    "Informe uma quantidade positiva dentro do limite aceito.",
  ),
  invalid_maintenance_type: invalid(
    "Tipo de manutenção inválido",
    "Revise o tipo de manutenção.",
  ),
  invalid_manufacturer: invalid(
    "Fabricante inválido",
    "Revise o fabricante informado.",
  ),
  invalid_mileage: invalid(
    "Quilometragem inválida",
    "Informe uma quilometragem inteira não negativa.",
  ),
  invalid_model: invalid("Modelo inválido", "Revise o modelo informado."),
  invalid_next_due_date: invalid(
    "Próxima data inválida",
    "Informe uma data válida para a próxima manutenção.",
  ),
  invalid_notes: invalid(
    "Observações inválidas",
    "Revise as observações informadas.",
  ),
  invalid_performed_at: invalid(
    "Data da manutenção inválida",
    "Informe uma data válida.",
  ),
  invalid_plate: invalid("Placa inválida", "Revise a placa informada."),
  invalid_reason: invalid(
    "Motivo inválido",
    "O motivo deve ser escrito por quem opera e respeitar o tamanho exigido.",
  ),
  invalid_reference: invalid(
    "Identificador inválido",
    "O identificador da URL não tem o formato aceito.",
  ),
  invalid_request: invalid(
    "Conteúdo ilegível",
    "O servidor não conseguiu interpretar o objeto JSON enviado.",
  ),
  invalid_responsible_name: invalid(
    "Responsável inválido",
    "Revise o nome do responsável.",
  ),
  invalid_station: invalid("Posto inválido", "Revise o posto informado."),
  invalid_status: invalid(
    "Situação inválida",
    "Escolha uma situação aceita pelo servidor.",
  ),
  invalid_vehicle_id: invalid(
    "Veículo inválido",
    "O filtro da rota legada não tem um identificador válido.",
  ),
  invalid_year: invalid(
    "Ano inválido",
    "Informe um ano inteiro dentro do limite aceito.",
  ),
  legacy_route_retired: conflict(
    "Escrita pela rota antiga aposentada",
    "A rota legada viva aceita apenas leitura. Use a rota canônica indicada pelo servidor.",
  ),
  method_not_allowed: invalid(
    "Operação não permitida",
    "Este método não está disponível para o recurso.",
  ),
  mileage_regression: conflict(
    "Quilometragem menor que a registrada",
    "A jornada canônica não aceita regressão de quilometragem.",
  ),
  nothing_to_update: invalid(
    "Nenhuma alteração informada",
    "Informe situação, quilometragem ou ambas.",
  ),
  origin_forbidden: denied(
    "Origem da requisição recusada",
    "O servidor recusou a escrita antes de qualquer efeito.",
  ),
  performed_at_in_future: invalid(
    "Manutenção no futuro",
    "A data da manutenção não pode ser posterior à data do servidor.",
  ),
  unauthorized: denied(
    "Sessão de equipe necessária",
    "Entre novamente com uma sessão de equipe.",
  ),
  vehicle_not_found: invalid(
    "Veículo não encontrado",
    "O veículo não existe na jornada canônica.",
  ),
});

export const ENUMS = Object.freeze({
  vehicleStatus: {
    disponivel: ["Disponível", "success"],
    em_uso: ["Em uso", "info"],
    em_manutencao: ["Em manutenção", "warning"],
    baixado: ["Baixado", "neutral"],
    reservado: ["Reservado", "info"],
  },
  fuelType: {
    gasolina: ["Gasolina", "neutral"],
    etanol: ["Etanol", "neutral"],
    diesel: ["Diesel", "neutral"],
    flex: ["Flex", "neutral"],
    eletrico: ["Elétrico", "success"],
    hibrido: ["Híbrido", "success"],
    outro: ["Outro", "neutral"],
  },
  alertStatus: {
    em_dia: ["Em dia", "success"],
    alerta: ["Atenção", "warning"],
    vencida: ["Vencida", "danger"],
    sem_base: ["Sem base canônica", "neutral"],
    sem_regra: ["Sem regra registrada", "neutral"],
  },
  alertKind: { dias: ["Por dias", "info"], km: ["Por quilometragem", "info"] },
  origin: {
    jornada_frota: ["Jornada canônica da frota", "info"],
    registro_legado: ["Registro legado", "neutral"],
  },
  maintenanceType: {
    preventiva: ["Preventiva", "info"],
    corretiva: ["Corretiva", "warning"],
    revisao: ["Revisão", "info"],
    troca_oleo: ["Troca de óleo", "info"],
    outro: ["Outro tipo", "neutral"],
  },
  documentType: {
    crlv: ["CRLV", "info"],
    seguro: ["Seguro", "info"],
    licenciamento: ["Licenciamento", "info"],
    laudo: ["Laudo", "info"],
    outro: ["Outro documento", "neutral"],
  },
  eventType: {
    veiculo_criado: ["Veículo criado", "info"],
    situacao_atualizada: ["Situação atualizada", "info"],
    responsavel_atribuido: ["Responsável atribuído", "info"],
    abastecimento_registrado: ["Abastecimento registrado", "info"],
    manutencao_registrada: ["Manutenção registrada", "info"],
    documento_registrado: ["Documento registrado", "info"],
    documento_desativado: ["Documento desativado", "warning"],
    regra_manutencao_registrada: ["Regra de manutenção registrada", "info"],
  },
});

export function describeFleetError(code, status = 0) {
  if (!code && status === 0)
    return {
      code: null,
      status,
      kind: "network",
      title: "Sem resposta do servidor",
      detail:
        "A consulta falhou antes de receber resposta. Isto não é lista vazia nem indicador zero.",
      canRetry: true,
    };
  if (!code)
    return {
      code: null,
      status,
      kind: "error",
      title: "Resposta sem código técnico",
      detail:
        "O servidor respondeu sem JSON reconhecível. Nenhum dado ausente foi presumido.",
      canRetry: status >= 500,
    };
  const known = ERROR_MESSAGES[code];
  if (known) return { code, status, ...known };
  return {
    code,
    status,
    kind: "error",
    title: "Falha no servidor",
    detail: `O servidor devolveu o código não catalogado ${code}; ele foi preservado sem tradução inventada.`,
    canRetry: status >= 500,
  };
}
export const fleetErrorVariant = (item) =>
  item.kind === "denied" ? "denied" : "error";
export const fleetErrorFootnote = (item) =>
  `Código técnico: ${item.code ? `(${item.code})` : "indisponível"}`;
export function enumLabel(group, value) {
  return ENUMS[group]?.[value]?.[0] ?? value ?? "Dado ausente";
}
export function enumTone(group, value) {
  return ENUMS[group]?.[value]?.[1] ?? "neutral";
}
export const vehicleStatusLabel = (value) => enumLabel("vehicleStatus", value);
export const fuelTypeLabel = (value) => enumLabel("fuelType", value);
export const alertStatusLabel = (value) => enumLabel("alertStatus", value);
export const alertKindLabel = (value) => enumLabel("alertKind", value);
export const originLabel = (value) => enumLabel("origin", value);
export const maintenanceTypeLabel = (value) =>
  enumLabel("maintenanceType", value);
export const documentTypeLabel = (value) => enumLabel("documentType", value);
export const eventTypeLabel = (value) => enumLabel("eventType", value);
export function honestText(value, absence = "Dado ausente") {
  return value === null || value === undefined || value === ""
    ? absence
    : String(value);
}
export function honestDate(value, absence = "Data ausente") {
  if (!value) return absence;
  const text = String(value).slice(0, 10);
  const [y, m, d] = text.split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}
export function honestDateTime(value, absence = "Data e hora ausentes") {
  if (!value) return absence;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("pt-BR");
}
export function honestMoney(cents, absence = "Custo ausente") {
  if (cents === null || cents === undefined || cents === "") return absence;
  const number = Number(cents);
  return Number.isFinite(number)
    ? (number / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })
    : String(cents);
}
