// UX-11 / EXT-10 — tradução de apresentação do contrato canônico de continuidade.
// O servidor continua sendo a autoridade: este módulo apenas explica respostas.
const ERROR_MESSAGES = Object.freeze({
  audit_unavailable:{kind:'unavailable',title:'Auditoria indisponível',detail:'A operação não foi concluída porque a trilha de auditoria não pôde ser gravada.',canRetry:true},
  client_account_not_found:{kind:'invalid',title:'Conta de cliente não encontrada',detail:'A conta informada não existe.',canRetry:false},
  client_account_required:{kind:'invalid',title:'Conta de cliente obrigatória',detail:'Somente um plano vinculado a uma conta pode ser publicado no portal.',canRetry:false},
  client_session_required:{kind:'denied',title:'Sessão de cliente necessária',detail:'O portal exige uma sessão de cliente válida.',canRetry:false},
  continuity_unavailable:{kind:'unavailable',title:'Continuidade indisponível',detail:'O servidor não concluiu a consulta. Isto não significa que não existam planos.',canRetry:true},
  forbidden:{kind:'denied',title:'Acesso negado',detail:'O servidor recusou este grant. Estar no menu não concede autorização.',canRetry:false},
  forbidden_account_scope:{kind:'denied',title:'Conta fora do escopo',detail:'O grant atual não permite operar planos desta conta.',canRetry:false},
  idempotency_conflict_payload_mismatch:{kind:'conflict',title:'Chave já usada com outro conteúdo',detail:'A operação foi recusada para preservar a idempotência.',canRetry:false},
  idempotency_key_required:{kind:'invalid',title:'Chave de operação ausente',detail:'Esta escrita exige uma chave de idempotência válida.',canRetry:false},
  internal_error:{kind:'unavailable',title:'Falha interna',detail:'A operação não foi concluída; nenhum efeito parcial deve ser assumido.',canRetry:true},
  invalid_account_id:{kind:'invalid',title:'Conta inválida',detail:'O identificador da conta não tem formato válido.',canRetry:false},
  invalid_client_account_id:{kind:'invalid',title:'Conta de cliente inválida',detail:'Informe uma conta em formato UUID.',canRetry:false},
  invalid_exercise_fields:{kind:'invalid',title:'Dados do simulado inválidos',detail:'Data, resultado e responsável precisam respeitar os limites do servidor.',canRetry:false},
  invalid_json:{kind:'invalid',title:'Conteúdo ilegível',detail:'O servidor não conseguiu interpretar o corpo como JSON.',canRetry:false},
  invalid_plan_fields:{kind:'invalid',title:'Dados do plano inválidos',detail:'Título, descrição e responsável precisam respeitar os limites do servidor.',canRetry:false},
  invalid_plan_id:{kind:'invalid',title:'Identificador de plano inválido',detail:'O endereço não contém um UUID válido.',canRetry:false},
  invalid_status:{kind:'invalid',title:'Estado inválido',detail:'Esse estado não pertence à máquina de continuidade.',canRetry:false},
  invalid_transition:{kind:'conflict',title:'Transição não permitida',detail:'O estado atual não permite essa passagem.',canRetry:false},
  invalid_visible_flag:{kind:'invalid',title:'Visibilidade inválida',detail:'A visibilidade precisa ser booleana.',canRetry:false},
  justification_required:{kind:'invalid',title:'Justificativa obrigatória',detail:'Esta transição exige justificativa entre 5 e 2000 caracteres.',canRetry:false},
  method_not_allowed:{kind:'invalid',title:'Método não permitido',detail:'A rota canônica não aceita este método.',canRetry:false},
  not_found:{kind:'not_found',title:'Rota não encontrada',detail:'O servidor não reconhece este endereço.',canRetry:false},
  origin_forbidden:{kind:'denied',title:'Origem recusada',detail:'Escritas só são aceitas pela origem da aplicação.',canRetry:false},
  plan_not_found:{kind:'not_found',title:'Plano indisponível neste escopo',detail:'O plano não existe ou não está disponível para o escopo desta sessão. A tela não presume remoção.',canRetry:false},
  plan_not_publishable:{kind:'conflict',title:'Plano ainda não publicável',detail:'Somente planos aprovados, em teste ou testados podem aparecer no portal.',canRetry:false},
  unauthorized:{kind:'denied',title:'Sessão de equipe necessária',detail:'O servidor não reconheceu uma sessão válida.',canRetry:true},
  visibility_note_required:{kind:'invalid',title:'Justificativa de publicação obrigatória',detail:'Explique a publicação com pelo menos 10 caracteres.',canRetry:false},
});
export const CONTINUITY_ERROR_CODES=Object.freeze(Object.keys(ERROR_MESSAGES));
export const CONTINUITY_TRANSITIONS=Object.freeze({rascunho:Object.freeze(['aprovado','arquivado']),aprovado:Object.freeze(['em_teste','desatualizado','arquivado']),em_teste:Object.freeze(['testado','desatualizado']),testado:Object.freeze(['desatualizado','em_teste','arquivado']),desatualizado:Object.freeze(['em_teste','arquivado']),arquivado:Object.freeze(['rascunho'])});
export const CONTINUITY_STATUSES=Object.freeze(['rascunho','aprovado','em_teste','testado','desatualizado','arquivado']);
export const CONTINUITY_GRANTS=Object.freeze(['continuity.read','continuity.write','continuity.activate']);
export const CLIENT_PUBLISHABLE=Object.freeze(['aprovado','em_teste','testado']);
export const READ_SCOPES=Object.freeze(['global','organization','account']);
export function describeContinuityError(code,status=0){const d=ERROR_MESSAGES[code];if(d)return Object.freeze({code,status,...d});if(status===0)return Object.freeze({code:null,status,kind:'unavailable',title:'Rede indisponível',detail:'Não foi possível alcançar o servidor. Isto não é uma lista vazia.',canRetry:true});return Object.freeze({code:code||null,status,kind:'error',title:'Resposta não reconhecida',detail:code||`O servidor respondeu com HTTP ${status}.`,canRetry:false});}
export function continuityErrorFootnote(error){return error?.code?`Código técnico: ${error.code}`:'';}
export function continuityServerMessage(payload){return payload&&typeof payload==='object'&&typeof payload.message==='string'?payload.message.trim():'';}
export const continuityStatusLabels=Object.freeze({rascunho:'Rascunho',aprovado:'Aprovado',em_teste:'Em teste',testado:'Testado',desatualizado:'Desatualizado',arquivado:'Arquivado'});
export const continuityStatusTones=Object.freeze({rascunho:'neutral',aprovado:'success',em_teste:'info',testado:'success',desatualizado:'warning',arquivado:'neutral'});
export const continuityTransitionLabels=Object.freeze({aprovado:'Aprovar',em_teste:'Colocar em teste',testado:'Marcar como testado',desatualizado:'Marcar como desatualizado',arquivado:'Arquivar',rascunho:'Reabrir como rascunho'});
export function honestDate(value, absent='Não informado'){if(!value)return absent;const d=new Date(`${String(value).slice(0,10)}T12:00:00Z`);return Number.isNaN(d.getTime())?absent:d.toLocaleDateString('pt-BR',{timeZone:'UTC'});}
export function honestTestDate(value){return value?honestDate(value):'Simulado nunca realizado';}
export function honestNextTest(value){if(!value)return'Próximo teste não agendado';return honestDate(value);}
export function honestCount(value,label='registro'){return value==null?`Quantidade de ${label} não informada`:String(value);}
export const ABSENT='Não informado';
export const GRANT_SCOPES=READ_SCOPES;
export default Object.freeze({ERROR_MESSAGES,CONTINUITY_ERROR_CODES,CONTINUITY_TRANSITIONS,CONTINUITY_STATUSES,CONTINUITY_GRANTS});
