// UX-07 / EXT-02 — vocabulário da apresentação de terceiros.
// O inventário abaixo foi extraído do servidor canônico real; não é um contrato novo.
const ERROR_MESSAGES = {
  audit_unavailable:['Auditoria indisponível','A operação não foi concluída porque a trilha não pôde ser gravada.'],
  body_too_large:['Conteúdo muito extenso','Reduza o conteúdo enviado.'],
  forbidden_role:['Acesso negado','O servidor recusou este papel. Abrir pelo menu não autoriza a operação.'],
  unauthorized:['Sessão necessária','O servidor não reconheceu uma sessão autorizada.'],
  origin_forbidden:['Origem recusada','A escrita precisa partir da aplicação autorizada.'],
  legacy_route_retired:['Rota legada aposentada','Use a rota canônica indicada pelo servidor.'],
  third_party_unavailable:['Jornada de terceiros indisponível','Isto não significa que não existam registros. Tente novamente.']
};
const known=['access_grant_already_revoked','access_grant_not_found','access_window_already_ended','contract_not_bound_to_third_party','contract_not_found','contract_not_grantable','contract_rebind_blocked_by_active_grant','document_already_inactive','document_not_found','evaluated_on_in_future','idempotency_key_required','idempotency_key_reused','invalid_access_end','invalid_access_start','invalid_access_window','invalid_alert_before_days','invalid_category','invalid_contract_id','invalid_document','invalid_document_number','invalid_document_type','invalid_evaluated_on','invalid_expiry_date','invalid_file_name','invalid_justification','invalid_name','invalid_notes','invalid_reason','invalid_reference','invalid_request','invalid_responsible_name','invalid_scope_id','invalid_scope_kind','invalid_score','invalid_status','invalid_third_party_id','method_not_allowed','service_order_not_found','service_order_not_grantable','service_order_outside_contract','third_party_not_active','third_party_not_found'];
for (const code of known) ERROR_MESSAGES[code]=[`Operação recusada (${code})`,'O servidor recusou os dados informados. Confira os campos e tente novamente.'];
ERROR_MESSAGES.network=['Servidor indisponível','Não foi possível alcançar o servidor.'];
export function describeThirdPartyError(code,status=0){const c=code|| (status===0?'network':null); const x=ERROR_MESSAGES[c]; return {code:c,status,title:x?.[0]||'Falha na comunicação',detail:x?.[1]||'O servidor respondeu sem uma explicação legível.',kind:(c==='forbidden_role'||c==='unauthorized')?'denied':'failure'};}
export const ENUM_LABELS=Object.freeze({
  status:{ativo:'Ativo',inativo:'Inativo',suspenso:'Suspenso',encerrado:'Encerrado'},
  scope:{contrato:'Contrato',ordem_servico:'Ordem de serviço'},
  window:{vigente:'Acesso vigente',expirado:'Expirado',nao_iniciado:'Janela futura',revogado:'Revogado'},
  access:{sem_janela_registrada:'Sem janela registrada',bloqueado_por_situacao_do_terceiro:'Bloqueado pela situação do terceiro',com_acesso_vigente:'Com acesso vigente',janela_futura:'Janela futura',revogado:'Revogado',sem_acesso_vigente:'Sem acesso vigente'},
  document:{vigente:'Vigente',a_vencer:'A vencer',vencido:'Vencido',sem_data_declarada:'Sem data de validade declarada',desativado:'Desativado'},
});
export const ABSENCE={unknown:'Dado ausente',date:'Sem data declarada',list:'Nenhum registro canônico registrado'};
export const EXTERNAL_BOUNDARY='Não existe ator externo “terceiro” autenticado nesta tela; a autorização e a fronteira são aplicadas pelo servidor.';
export function label(group,value){return ENUM_LABELS[group]?.[value]||String(value??ABSENCE.unknown);}
Object.freeze(ERROR_MESSAGES);
export function errorCodes(){return Object.keys(ERROR_MESSAGES);}
export { ERROR_MESSAGES };
