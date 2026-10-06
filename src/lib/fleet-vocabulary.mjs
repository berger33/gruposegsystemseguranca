// UX-07 / EXT-01 — vocabulário da família FROTA.
//
// LEVANTAMENTO DOS CÓDIGOS (método registrado em
// docs/UX-07-FROTA-2026-10-06.md, seção 3). Três buscas independentes sobre o
// ARQUIVO REAL do servidor canônico `src/server/ext-fleet-api.mjs`:
//
//   1) literais:   grep -o 'error: "[a-z_0-9]*"' src/server/ext-fleet-api.mjs | sort -u
//      => 50 códigos distintos.
//   2) wrappers:   grep -nE 'function (bad|fail|deny)\(|HttpError|throw new' src/server/ext-fleet-api.mjs
//      => NADA. A família não tem wrapper local, não constrói `new HttpError()`
//      e não lança exceção convertida em resposta: `readBody()` devolve
//      `{tooLarge}`/`{invalid}` e quem chama responde com `json(res, …)`.
//   3) não-literais: grep -nE 'error:\s*[^"]' src/server/ext-fleet-api.mjs
//      => só as linhas em que `error:` aparece dentro de template/comparação,
//      nenhuma montando código por concatenação ou variável.
//
// Dois formatos indiretos EXISTEM e foram medidos de propósito, porque o
// extrator ingênuo os perderia:
//   - `onConflict: error => (/plate/i.test(...) ? { code: 409, body: { error: "duplicate_plate" } } : null)`
//     — `duplicate_plate` SÓ aparece dentro de um TERNÁRIO (mesma armadilha da
//     fatia EXT-06, em que três códigos moravam num ternário);
//   - `return { deny: { code, body: { error: "…" } } }` dentro de `work()` —
//     `vehicle_not_found`, `mileage_regression`, `document_not_found` e
//     `document_already_inactive` nunca passam por `json(res, …)` direto.
//
// ORIGENS, e a decisão registrada sobre cada uma:
//
//  1. `src/server/ext-fleet-api.mjs` — servidor canônico, religado em
//     server.mjs (dispatch de `/api/ext/fleet/*` a partir de ~4210). É a
//     ÚNICA origem viva de códigos desta família.
//  2. O recorte LEGADO (`handleLegacyVehicles` e `legacyCollectionHandler`)
//     vive DENTRO do mesmo arquivo canônico e continua RELIGADO em server.mjs
//     (~4229–4240, aliases `/api/admin/hr/ext-fleet-*`, `/api/crm/hr/
//     ext-fleet-*`, `/api/hr/ext-fleet-*` e `/api/ext/fleet-*`; a lista de
//     rotas protegidas repete os mesmos caminhos em ~5937–5953). Ele responde
//     200 na leitura e 410 `legacy_route_retired` com `use: <canônica>` em
//     qualquer mutação.
//     DECISÃO REGISTRADA: por ser rota VIVA, `legacy_route_retired` ENTRA no
//     vocabulário — mesmo critério aplicado a `legacy_mutation_retired` na
//     fatia EXT-06. `invalid_vehicle_id` (filtro `?vehicle_id=` que só a rota
//     legada aceita) também entra, pelo mesmo motivo.
//  3. NÃO existe handler morto nesta família: todos os doze handlers
//     exportados por `createExtFleetApi()` estão no dispatch de server.mjs.
//     Não há, portanto, nenhum código a excluir por morte de rota — diferente
//     de EXT-06 (cli-finance-api) e de Analytics.
//
// Total real: 50 códigos, zero duplicado, zero inventado.
//
// Regras desta camada:
//  - código desconhecido PASSA CRU: nada é inventado;
//  - o código canônico é informação técnica (rodapé/parênteses), nunca o
//    título principal lido por quem opera;
//  - recusa de papel (`forbidden_role`) e sessão ausente (`unauthorized`) são
//    estado NEGADO, distinto de falha de leitura;
//  - ausência nunca vira 0, 0 km, R$ 0,00 ou 01/01/1970 — e o servidor desta
//    família NOMEIA a ausência (`fleet_registered`, `source`, `base_date`,
//    `note`, e o alerta com `status: 'sem_regra' | 'sem_base'`), que é o veio
//    usado aqui;
//  - zero REAL do servidor (quilometragem 0, custo 0 centavos, 0 registros)
//    continua aparecendo como zero: o defeito é transformar AUSÊNCIA em zero.

const ERROR_MESSAGES = Object.freeze({
  audit_unavailable: { kind: 'unavailable', title: 'Auditoria indisponível', detail: 'A operação foi desfeita por inteiro porque a trilha de auditoria não pôde ser gravada na mesma transação. Nada ficou registrado pela metade.', canRetry: true },
  body_too_large: { kind: 'invalid', title: 'Dados muito extensos', detail: 'O conteúdo enviado passou do limite aceito pelo servidor. Reduza o texto e envie de novo.', canRetry: false },
  document_already_inactive: { kind: 'conflict', title: 'Documento já estava desativado', detail: 'O documento já havia sido desativado com autor e motivo registrados. O servidor não desativa duas vezes e não apaga o registro.', canRetry: false },
  document_not_found: { kind: 'not_found', title: 'Documento não encontrado', detail: 'O documento informado não existe na jornada canônica de frota.', canRetry: false },
  duplicate_plate: { kind: 'conflict', title: 'Placa já registrada', detail: 'Já existe veículo canônico com esta placa. A placa é única no banco e o servidor recusa a duplicata antes de qualquer efeito.', canRetry: false },
  fleet_unavailable: { kind: 'unavailable', title: 'Jornada de frota indisponível', detail: 'O servidor não concluiu a operação. Nenhum efeito parcial foi mantido — e isto não é uma frota vazia.', canRetry: true },
  forbidden_role: { kind: 'denied', title: 'Papel sem acesso à jornada de frota', detail: 'A jornada é interna e o servidor a restringe aos papéis de equipe que ele mesmo autoriza. Abrir esta tela pelo menu não concede acesso.', canRetry: false },
  fuel_date_in_future: { kind: 'invalid', title: 'Data de abastecimento no futuro', detail: 'O abastecimento precisa ter acontecido até hoje, pela data do servidor. Registro futuro não é fato canônico.', canRetry: false },
  idempotency_key_required: { kind: 'invalid', title: 'Identificador da operação ausente', detail: 'A operação precisa de uma chave de idempotência válida para que a repetição não duplique efeito.', canRetry: false },
  idempotency_key_reused: { kind: 'conflict', title: 'Chave já usada com dados diferentes', detail: 'A mesma chave de idempotência foi reaproveitada com um conteúdo divergente. O servidor recusa para preservar a idempotência; comece uma operação nova.', canRetry: false },
  interval_required: { kind: 'invalid', title: 'Intervalo da regra obrigatório', detail: 'A regra de manutenção exige pelo menos um intervalo: por dias, por quilometragem, ou os dois. Sem intervalo não existe regra e o alerta não é inferido.', canRetry: false },
  invalid_alert_before_days: { kind: 'invalid', title: 'Antecedência em dias inválida', detail: 'A antecedência do alerta por dias precisa ser um inteiro entre 0 e 365.', canRetry: false },
  invalid_alert_before_km: { kind: 'invalid', title: 'Antecedência em quilômetros inválida', detail: 'A antecedência do alerta por quilometragem precisa ser um inteiro entre 0 e 100.000.', canRetry: false },
  invalid_cost_center: { kind: 'invalid', title: 'Centro de custo inválido', detail: 'O centro de custo, quando informado, precisa ter de 3 a 100 caracteres.', canRetry: false },
  invalid_cost_cents: { kind: 'invalid', title: 'Custo em centavos inválido', detail: 'O custo precisa ser um número inteiro de centavos, igual ou maior que zero. Custo zero é aceito; custo ausente ou fracionado não.', canRetry: false },
  invalid_description: { kind: 'invalid', title: 'Descrição da manutenção inválida', detail: 'A descrição da manutenção precisa ter de 10 a 2000 caracteres, escrita por quem opera.', canRetry: false },
  invalid_document_number: { kind: 'invalid', title: 'Número do documento inválido', detail: 'O número do documento, quando informado, precisa ter de 3 a 200 caracteres.', canRetry: false },
  invalid_document_type: { kind: 'invalid', title: 'Tipo de documento inválido', detail: 'O tipo do documento precisa ter de 3 a 100 caracteres. O servidor não escolhe tipo por conta própria.', canRetry: false },
  invalid_expiry_date: { kind: 'invalid', title: 'Data de vencimento inválida', detail: 'A data de vencimento, quando informada, precisa estar no formato de data aceito pelo servidor.', canRetry: false },
  invalid_file_name: { kind: 'invalid', title: 'Nome de arquivo inválido', detail: 'O nome do arquivo, quando informado, precisa ter de 1 a 500 caracteres. Nesta fatia nenhum arquivo real é armazenado: só o metadado.', canRetry: false },
  invalid_fuel_date: { kind: 'invalid', title: 'Data de abastecimento inválida', detail: 'A data do abastecimento precisa estar no formato de data aceito pelo servidor.', canRetry: false },
  invalid_fuel_type: { kind: 'invalid', title: 'Combustível fora da lista do servidor', detail: 'O combustível precisa ser um dos valores que o próprio servidor aceita. A tela não acrescenta opção nenhuma.', canRetry: false },
  invalid_interval_days: { kind: 'invalid', title: 'Intervalo em dias inválido', detail: 'O intervalo por dias precisa ser um inteiro entre 1 e 3650.', canRetry: false },
  invalid_interval_km: { kind: 'invalid', title: 'Intervalo em quilômetros inválido', detail: 'O intervalo por quilometragem precisa ser um inteiro entre 1 e 1.000.000.', canRetry: false },
  invalid_justification: { kind: 'invalid', title: 'Justificativa da regra obrigatória', detail: 'Registrar a regra de manutenção exige a justificativa escrita por quem opera, com 5 a 500 caracteres. A tela não escreve justificativa no lugar de ninguém.', canRetry: false },
  invalid_liters: { kind: 'invalid', title: 'Litros inválidos', detail: 'A quantidade de litros precisa ser um número maior que zero e até 100.000.', canRetry: false },
  invalid_maintenance_type: { kind: 'invalid', title: 'Tipo de manutenção inválido', detail: 'O tipo da manutenção é texto livre declarado por quem opera, com 3 a 100 caracteres.', canRetry: false },
  invalid_manufacturer: { kind: 'invalid', title: 'Fabricante inválido', detail: 'O fabricante, quando informado, precisa ter de 2 a 200 caracteres.', canRetry: false },
  invalid_mileage: { kind: 'invalid', title: 'Quilometragem inválida', detail: 'A quilometragem precisa ser um número inteiro igual ou maior que zero. Zero é um valor real e aceito.', canRetry: false },
  invalid_model: { kind: 'invalid', title: 'Modelo inválido', detail: 'O modelo do veículo precisa ter de 3 a 200 caracteres.', canRetry: false },
  invalid_next_due_date: { kind: 'invalid', title: 'Próxima manutenção prevista inválida', detail: 'A próxima data prevista, quando informada, precisa estar no formato de data aceito pelo servidor.', canRetry: false },
  invalid_notes: { kind: 'invalid', title: 'Observações inválidas', detail: 'As observações do veículo, quando informadas, precisam ter de 10 a 1000 caracteres.', canRetry: false },
  invalid_performed_at: { kind: 'invalid', title: 'Data da manutenção inválida', detail: 'A data em que a manutenção foi realizada precisa estar no formato de data aceito pelo servidor.', canRetry: false },
  invalid_plate: { kind: 'invalid', title: 'Placa inválida', detail: 'A placa precisa ter de 3 a 20 caracteres. O servidor normaliza para maiúsculas antes de gravar.', canRetry: false },
  invalid_reason: { kind: 'invalid', title: 'Motivo obrigatório', detail: 'O motivo precisa ser escrito por quem opera, com 5 a 500 caracteres. A tela não inventa motivo de atribuição nem de desativação.', canRetry: false },
  invalid_reference: { kind: 'invalid', title: 'Identificador inválido', detail: 'O identificador informado na URL não tem o formato aceito pelo servidor.', canRetry: false },
  invalid_request: { kind: 'invalid', title: 'Conteúdo enviado ilegível', detail: 'O servidor espera um objeto JSON no corpo da requisição e não conseguiu interpretar o que recebeu.', canRetry: false },
  invalid_responsible_name: { kind: 'invalid', title: 'Nome do responsável inválido', detail: 'O nome do responsável precisa ter de 2 a 200 caracteres.', canRetry: false },
  invalid_station: { kind: 'invalid', title: 'Posto inválido', detail: 'O nome do posto, quando informado, precisa ter de 3 a 200 caracteres.', canRetry: false },
  invalid_status: { kind: 'invalid', title: 'Situação fora da lista do servidor', detail: 'A situação do veículo precisa ser um dos valores que o próprio servidor aceita. A tela não cria situação nova.', canRetry: false },
  invalid_vehicle_id: { kind: 'invalid', title: 'Filtro de veículo inválido', detail: 'O filtro por veículo da rota antiga precisa ser um identificador válido. Este código só existe no recorte legado somente-leitura.', canRetry: false },
  invalid_year: { kind: 'invalid', title: 'Ano inválido', detail: 'O ano, quando informado, precisa ser um inteiro entre 1900 e 2100.', canRetry: false },
  legacy_route_retired: { kind: 'conflict', title: 'Escrita pela rota antiga aposentada', detail: 'As rotas antigas de frota continuam respondendo em leitura, mas a escrita por elas foi desligada. O servidor devolve, junto do código, a rota canônica que deve ser usada.', canRetry: false },
  method_not_allowed: { kind: 'invalid', title: 'Operação não permitida', detail: 'Este método não está disponível para o recurso solicitado.', canRetry: false },
  mileage_regression: { kind: 'conflict', title: 'Quilometragem não anda para trás', detail: 'A quilometragem canônica do veículo só avança. O servidor recusou um valor menor que o já registrado, antes de qualquer efeito.', canRetry: false },
  nothing_to_update: { kind: 'invalid', title: 'Nada a atualizar', detail: 'A atualização precisa informar ao menos a situação ou a quilometragem. O servidor não grava transação vazia.', canRetry: false },
  origin_forbidden: { kind: 'denied', title: 'Origem da requisição recusada', detail: 'A escrita só é aceita a partir da própria aplicação. O servidor recusou a origem antes de qualquer efeito.', canRetry: false },
  performed_at_in_future: { kind: 'invalid', title: 'Manutenção datada no futuro', detail: 'A manutenção precisa ter sido realizada até hoje, pela data do servidor. Registro futuro não é fato canônico.', canRetry: false },
  unauthorized: { kind: 'denied', title: 'Sessão de equipe necessária', detail: 'Entre novamente com uma sessão de equipe válida para consultar esta área. Quem autoriza é o servidor, não o menu.', canRetry: true },
  vehicle_not_found: { kind: 'not_found', title: 'Veículo não encontrado', detail: 'O veículo informado não existe na jornada canônica de frota.', canRetry: false },
});

// ENUMs efetivamente usados pela família. Valor desconhecido é preservado cru.
const ENUMS = Object.freeze({
  // Tipo `ext_fleet_status` (migração 085), repetido em VEHICLE_STATUSES no
  // servidor canônico.
  vehicleStatus: {
    disponivel: ['Disponível', 'success'],
    em_uso: ['Em uso', 'info'],
    em_manutencao: ['Em manutenção', 'warning'],
    baixado: ['Baixado', 'neutral'],
    reservado: ['Reservado', 'info'],
  },
  // Tipo `ext_fuel_type` (migração 085), repetido em FUEL_TYPES no servidor.
  fuelType: {
    gasolina: ['Gasolina', 'neutral'],
    etanol: ['Etanol', 'neutral'],
    diesel: ['Diesel', 'neutral'],
    flex: ['Flex', 'neutral'],
    eletrico: ['Elétrico', 'info'],
    hibrido: ['Híbrido', 'info'],
    outro: ['Outro combustível declarado', 'neutral'],
  },
  // Constraint `ext_fleet_vehicles_origin_check` (migração 147).
  vehicleOrigin: {
    jornada_frota: ['Jornada canônica EXT-01', 'success'],
    registro_legado: ['Registro legado', 'warning'],
  },
  // `status` devolvido por deriveMaintenanceAlert() no servidor canônico.
  // `sem_regra` e `sem_base` são AUSÊNCIA NOMEADA pelo servidor: nunca viram
  // "em dia" nem zero.
  alertStatus: {
    em_dia: ['Em dia pela regra registrada', 'success'],
    alerta: ['Dentro da antecedência da regra', 'warning'],
    vencida: ['Manutenção vencida pela regra', 'danger'],
    sem_base: ['Sem base canônica para calcular', 'neutral'],
    sem_regra: ['Nenhuma regra registrada', 'neutral'],
  },
  // `kind` de cada componente do alerta, montado no servidor canônico.
  alertKind: {
    dias: ['Critério por dias', 'neutral'],
    km: ['Critério por quilometragem', 'neutral'],
  },
  // Constraint `event_type IN (…)` de ext_fleet_vehicle_events (migração 147),
  // e exatamente os oito valores que insertEvent() grava.
  fleetEvent: {
    veiculo_criado: ['Veículo registrado', 'neutral'],
    situacao_atualizada: ['Situação ou quilometragem atualizada', 'info'],
    responsavel_atribuido: ['Responsável atribuído', 'info'],
    abastecimento_registrado: ['Abastecimento registrado', 'info'],
    manutencao_registrada: ['Manutenção registrada', 'info'],
    documento_registrado: ['Documento registrado', 'info'],
    documento_desativado: ['Documento desativado', 'neutral'],
    regra_manutencao_registrada: ['Regra de manutenção registrada', 'success'],
  },
  // Situação do documento derivada de `is_active` (migração 085/147).
  documentState: {
    ativo: ['Ativo', 'success'],
    desativado: ['Desativado com autor e motivo', 'neutral'],
  },
});

/** Texto único para toda ausência de dado. Nunca zero, nunca data inicial. */
export const ABSENT = 'Dado ausente';

/** Nenhum responsável canônico registrado — e isso não é "ninguém responde". */
export const NO_RESPONSIBLE = 'Sem responsável canônico registrado';

/** Frota própria não registrada: condição do plano declarada pelo servidor. */
export const FLEET_NOT_REGISTERED = 'Frota própria não registrada no backend canônico';

/**
 * `Intl.NumberFormat('pt-BR')` separa grupos com U+00A0/U+202F. Os espaços
 * rígidos quebram asserção literal em teste e colagem de texto, sem
 * acrescentar informação: são normalizados para espaço comum.
 */
const normalizeSpaces = (value) => String(value).replace(/[\u00a0\u202f]/g, ' ');

export function describeFleetError(code, status = 0) {
  const normalized = code == null || String(code).trim() === '' ? null : String(code).trim();
  // `status: 0` é a falha de rede — o servidor não chegou a responder.
  if (status === 0) {
    return {
      kind: 'network',
      title: 'Servidor não respondeu',
      detail: 'A leitura não foi concluída. Isto não é uma frota vazia nem um custo zero.',
      status,
      canRetry: true,
      code: normalized,
    };
  }
  // Respondeu com erro, mas sem código legível: nenhum código é inventado.
  if (normalized === null) {
    return {
      kind: 'error',
      title: 'Falha sem código do servidor',
      detail: `O servidor respondeu ${status} e não devolveu um código. A leitura não foi concluída; isto não é frota vazia nem custo zero.`,
      status,
      canRetry: status >= 500,
      code: null,
    };
  }
  const found = ERROR_MESSAGES[normalized];
  // Desconhecido passa cru: o código aparece como informação técnica e
  // nenhuma frase é inventada para ele.
  if (!found) {
    return {
      kind: 'error',
      title: 'Falha no servidor',
      detail: `O servidor devolveu o código ${normalized}, ainda sem tradução nesta tela.`,
      status,
      canRetry: status >= 500,
      code: normalized,
    };
  }
  return { ...found, status, code: normalized };
}

/** Frase completa com o código canônico apenas entre parênteses, no fim. */
export function fleetErrorMessage(code, status = 0) {
  const descriptor = describeFleetError(code, status);
  return `${descriptor.title}: ${descriptor.detail}${descriptor.code ? ` (${descriptor.code})` : ''}`;
}

/** Recusa de permissão é um estado próprio, distinto de falha de leitura. */
export function fleetErrorVariant(descriptor) {
  return descriptor.kind === 'denied' ? 'denied' : 'error';
}

export function fleetErrorFootnote(descriptor) {
  return descriptor.code ? `Código técnico: (${descriptor.code})` : 'Código técnico: indisponível';
}

export function enumLabel(group, value) {
  if (value == null || value === '') return ABSENT;
  return ENUMS[group]?.[String(value)]?.[0] ?? String(value);
}

export function enumTone(group, value) {
  return ENUMS[group]?.[String(value)]?.[1] ?? 'neutral';
}

export const vehicleStatusLabel = (value) => enumLabel('vehicleStatus', value);
export const vehicleStatusTone = (value) => enumTone('vehicleStatus', value);
export const fuelTypeLabel = (value) => enumLabel('fuelType', value);
export const fuelTypeTone = (value) => enumTone('fuelType', value);
export const vehicleOriginLabel = (value) => enumLabel('vehicleOrigin', value);
export const vehicleOriginTone = (value) => enumTone('vehicleOrigin', value);
export const alertStatusLabel = (value) => enumLabel('alertStatus', value);
export const alertStatusTone = (value) => enumTone('alertStatus', value);
export const alertKindLabel = (value) => enumLabel('alertKind', value);
export const fleetEventLabel = (value) => enumLabel('fleetEvent', value);
export const fleetEventTone = (value) => enumTone('fleetEvent', value);
export const documentStateLabel = (value) => enumLabel('documentState', value);
export const documentStateTone = (value) => enumTone('documentState', value);

/** Data sem hora. Ausência nunca vira 01/01/1970. */
export function honestDate(value) {
  if (value == null || value === '') return ABSENT;
  const date = new Date(String(value).length === 10 ? `${String(value)}T00:00:00Z` : String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return normalizeSpaces(new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date));
}

/** Data com hora, para a trilha imutável. Ausência continua ausência. */
export function honestDateTime(value) {
  if (value == null || value === '') return ABSENT;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return normalizeSpaces(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short',
  }).format(date));
}

/**
 * Contagem. `0` vindo do servidor é um zero REAL e aparece como `0` (a
 * resposta canônica devolve `fuel_entries`/`maintenance_entries` verdadeiros);
 * ausência (`null`/`undefined`/não numérico) aparece como ausência.
 */
export function count(value) {
  if (value == null || value === '') return ABSENT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ABSENT;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR').format(numeric));
}

/** Número com casas limitadas. Mesma regra de `count` para ausência. */
export function honestNumber(value, maximumFractionDigits = 2) {
  if (value == null || value === '') return ABSENT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ABSENT;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(numeric));
}

/**
 * Dinheiro, a partir dos CENTAVOS que o servidor devolve. Custo 0 centavos
 * vindo do servidor é zero real e sai como R$ 0,00; ausência continua
 * ausência e NUNCA vira R$ 0,00.
 */
export function honestMoneyFromCents(value) {
  if (value == null || value === '') return ABSENT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ABSENT;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numeric / 100));
}

/**
 * Quilometragem. `0` é um odômetro real e continua sendo `0 km`; ausência é
 * dita como ausência, nunca como `0 km`.
 */
export function honestMileage(value) {
  if (value == null || value === '') return ABSENT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ABSENT;
  return `${count(numeric)} km`;
}

/** Litros declarados no abastecimento. Mesma regra de ausência. */
export function honestLiters(value) {
  if (value == null || value === '') return ABSENT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ABSENT;
  return `${honestNumber(numeric, 2)} L`;
}

/** Texto curto para valor de texto ausente, sem inventar conteúdo. */
export function honestText(value) {
  if (value == null) return ABSENT;
  const text = String(value).trim();
  return text.length ? text : ABSENT;
}

/** Responsável do veículo: a ausência é nomeada, não deixada em branco. */
export function responsibleLabel(value) {
  if (value == null || String(value).trim() === '') return NO_RESPONSIBLE;
  return String(value).trim();
}

/**
 * Regra explícita registrada. O servidor grava
 * `{ interval_days, interval_km, alert_before_days, alert_before_km,
 * justification }`; ausência continua ausência e a tela não deduz intervalo
 * nenhum.
 */
export function ruleSummary(rule) {
  if (!rule || typeof rule !== 'object') return ABSENT;
  const days = rule.interval_days;
  const km = rule.interval_km;
  if (days == null && km == null) return ABSENT;
  const partes = [];
  if (days != null) partes.push(`a cada ${count(days)} dia(s), avisando ${count(rule.alert_before_days)} dia(s) antes`);
  if (km != null) partes.push(`a cada ${count(km)} km, avisando ${count(rule.alert_before_km)} km antes`);
  return `Regra registrada: ${partes.join(' e ')}`;
}

/**
 * Componente do alerta derivado pelo servidor. Nenhum número é estimado: o
 * que o servidor não calculou aparece como ausência declarada, com o motivo
 * que ele próprio devolveu em `detail`.
 */
export function alertComponentSummary(component) {
  if (!component || typeof component !== 'object') return ABSENT;
  const cabeca = `${alertKindLabel(component.kind)}: ${alertStatusLabel(component.status)}`;
  if (component.status === 'sem_base') {
    return `${cabeca}. ${honestText(component.detail)}`;
  }
  if (component.kind === 'dias') {
    return `${cabeca}. Base ${honestDate(component.base_performed_at)}; vence em ${honestDate(component.due_date)}; aviso a partir de ${honestDate(component.alert_from)}.`;
  }
  if (component.kind === 'km') {
    return `${cabeca}. Base ${honestMileage(component.base_mileage)}; vence aos ${honestMileage(component.due_mileage)}; faltam ${honestMileage(component.remaining_km)}.`;
  }
  return cabeca;
}

export { ERROR_MESSAGES, ENUMS };
