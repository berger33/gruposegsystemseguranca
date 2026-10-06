// UX-07 / EXT-02 — vocabulário da jornada de terceiros. Valores futuros
// desconhecidos passam crus: apresentação não pode inventar semântica.
export const ABSENT = 'Dado ausente';
export const EXTERNAL_BOUNDARY = 'Não existe ator externo “terceiro” autenticado. Esta área é interna; escopo e janela são impostos pelo servidor canônico.';

const definitions = {
  access_grant_already_revoked: ['Acesso já revogado','Esta janela já foi revogada.'], access_grant_not_found: ['Acesso não encontrado','A janela informada não existe.'],
  access_window_already_ended: ['Janela já encerrada','O término informado é anterior à data do servidor.'], audit_unavailable: ['Auditoria indisponível','A operação não foi confirmada porque a auditoria falhou.'],
  body_too_large: ['Conteúdo muito grande','O corpo ultrapassa o limite do servidor.'], contract_not_bound_to_third_party: ['Contrato não vinculado','Vincule o contrato ao terceiro antes de conceder acesso.'],
  contract_not_found: ['Contrato não encontrado','O contrato informado não existe.'], contract_not_grantable: ['Contrato bloqueia concessão','A situação canônica do contrato não permite acesso.'],
  contract_rebind_blocked_by_active_grant: ['Troca de contrato bloqueada','Há uma janela ativa ligada ao vínculo atual.'], document_already_inactive: ['Documento já desativado','O documento já está inativo.'],
  document_not_found: ['Documento não encontrado','O documento informado não existe.'], evaluated_on_in_future: ['Data de avaliação futura','A avaliação não pode ser posterior à data do servidor.'],
  forbidden_role: ['Papel sem autorização','Quem autoriza é o servidor; o papel desta sessão foi recusado.'], idempotency_key_required: ['Chave de idempotência inválida','A escrita exige a chave no formato canônico.'],
  idempotency_key_reused: ['Chave reutilizada com outro conteúdo','Repita somente a mesma operação com esta chave.'], invalid_access_end: ['Fim de acesso inválido','Informe uma data final válida.'],
  invalid_access_start: ['Início de acesso inválido','Informe uma data inicial válida.'], invalid_access_window: ['Janela de acesso inválida','O fim não pode anteceder o início.'],
  invalid_alert_before_days: ['Antecedência inválida','Informe de 1 a 365 dias.'], invalid_category: ['Categoria inválida','A categoria não atende ao tamanho aceito.'],
  invalid_contract_id: ['Contrato inválido','Informe um UUID de contrato válido.'], invalid_document: ['Identificação inválida','A identificação não atende ao tamanho aceito.'],
  invalid_document_number: ['Número de documento inválido','O número não atende ao tamanho aceito.'], invalid_document_type: ['Tipo de documento inválido','O tipo não atende ao tamanho aceito.'],
  invalid_evaluated_on: ['Data de avaliação inválida','Informe uma data válida.'], invalid_expiry_date: ['Validade inválida','Informe uma data válida ou declare a ausência.'],
  invalid_file_name: ['Nome de arquivo inválido','O nome não atende ao limite aceito.'], invalid_justification: ['Justificativa inválida','Preencha a justificativa exigida pelo servidor.'],
  invalid_name: ['Nome inválido','O nome precisa ter de 3 a 200 caracteres.'], invalid_notes: ['Observações inválidas','As observações precisam ter de 10 a 1000 caracteres.'],
  invalid_reason: ['Motivo inválido','Preencha o motivo exigido pelo servidor.'], invalid_reference: ['Referência inválida','O identificador da URL não é válido.'],
  invalid_request: ['Conteúdo ilegível','O servidor não conseguiu interpretar o JSON enviado.'], invalid_responsible_name: ['Responsável inválido','O nome não atende ao tamanho aceito.'],
  invalid_scope_id: ['Escopo inválido','Informe um UUID de escopo válido.'], invalid_scope_kind: ['Tipo de escopo inválido','Use contrato ou ordem de serviço.'],
  invalid_score: ['Nota inválida','A nota deve ser um inteiro entre 0 e 10.'], invalid_status: ['Situação inválida','Use uma situação aceita pelo servidor.'],
  invalid_third_party_id: ['Terceiro inválido','O filtro legado não contém UUID válido.'], legacy_route_retired: ['Escrita legada aposentada','A rota continua viva para leitura; use a rota canônica indicada no payload.'],
  method_not_allowed: ['Operação não permitida','O método não existe para este recurso.'], origin_forbidden: ['Origem recusada','A escrita só é aceita pela própria aplicação.'],
  service_order_not_found: ['Ordem de serviço não encontrada','A ordem informada não existe.'], service_order_not_grantable: ['Ordem bloqueia concessão','A situação da ordem não permite acesso.'],
  service_order_outside_contract: ['Ordem fora do contrato','A ordem não pertence ao contrato vinculado.'], third_party_not_active: ['Terceiro não ativo','A situação atual bloqueia nova janela.'],
  third_party_not_found: ['Terceiro não encontrado','O cadastro informado não existe.'], third_party_unavailable: ['Jornada indisponível','A consulta não foi concluída; isto não significa lista vazia.'],
  unauthorized: ['Sessão necessária','Entre com uma sessão interna válida.'],
};
export const ERROR_MESSAGES = Object.freeze(definitions);

const enums = {
 status: { ativo:'Ativo', inativo:'Inativo', suspenso:'Suspenso', encerrado:'Encerrado' },
 scope: { contrato:'Contrato', ordem_servico:'Ordem de serviço' },
 window: { vigente:'Acesso vigente', expirado:'Expirado', nao_iniciado:'Janela futura', revogado:'Revogado' },
 situation: { sem_janela_registrada:'Sem janela registrada', bloqueado_por_situacao_do_terceiro:'Bloqueado pela situação do terceiro', com_acesso_vigente:'Com acesso vigente', janela_futura:'Janela futura', revogado:'Revogado', sem_acesso_vigente:'Sem acesso vigente' },
 expiry: { vigente:'Vigente', a_vencer:'A vencer', vencido:'Vencido', sem_data_declarada:'Sem data declarada', desativado:'Desativado', sem_regra_de_antecedencia:'Sem regra de antecedência' },
 event: { terceiro_criado:'Terceiro criado', situacao_atualizada:'Situação atualizada', contrato_vinculado:'Contrato vinculado', acesso_concedido:'Acesso concedido', acesso_revogado:'Acesso revogado', documento_registrado:'Documento registrado', documento_desativado:'Documento desativado', regra_documento_registrada:'Regra de documento registrada', avaliacao_registrada:'Avaliação registrada' },
 authorization: { terceiro_inexistente:'Terceiro inexistente', terceiro_nao_ativo:'Terceiro não ativo', escopo_nao_autorizado:'Escopo não autorizado', autorizado:'Autorizado' },
};
export function labelThirdParty(group, value) { return value == null || value === '' ? ABSENT : (enums[group]?.[value] ?? String(value)); }
export function honestText(value) { return value == null || String(value).trim() === '' ? ABSENT : String(value); }
export function honestDate(value) { if (!value) return ABSENT; const d=new Date(`${String(value).slice(0,10)}T12:00:00Z`); return Number.isNaN(d.valueOf()) ? String(value) : d.toLocaleDateString('pt-BR',{timeZone:'UTC'}); }
export function describeThirdPartyError(code, status=0) {
 const normalized=typeof code==='string'&&code.trim()?code.trim():null;
 if(status===0) return {kind:'network',title:'Servidor não respondeu',detail:'A leitura falhou; isto não é ausência nem zero.',status,code:normalized,canRetry:true};
 const found=normalized?definitions[normalized]:null;
 return {kind: normalized==='forbidden_role'||normalized==='unauthorized'?'denied':'error', title:found?.[0] ?? (normalized || 'Falha sem código do servidor'), detail:found?.[1] ?? 'Código preservado sem tradução inventada.', status, code:normalized, canRetry:status>=500};
}
