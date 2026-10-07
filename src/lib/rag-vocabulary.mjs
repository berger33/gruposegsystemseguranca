// RAG-01 — vocabulário de apresentação do assistente documental.
// O servidor é a autoridade: este módulo só traduz o que ele responde, sem
// inventar estado, sem prometer prazo e sem transformar ausência em zero.
const ERROR_MESSAGES = Object.freeze({
  ai_unavailable:{kind:'unavailable',title:'Modelo local indisponível',detail:'O modelo de linguagem local não respondeu. Nenhuma resposta foi gerada — o que você vê não é um texto simulado.',canRetry:true},
  ai_busy:{kind:'unavailable',title:'Assistente ocupado',detail:'Há outra consulta em andamento no modelo local. Tente novamente em alguns segundos.',canRetry:true},
  embedding_disabled:{kind:'unavailable',title:'Busca semântica desligada',detail:'O provedor de embeddings local não está habilitado; a busca continua textual.',canRetry:false},
  embedding_model_missing:{kind:'unavailable',title:'Modelo de embeddings ausente',detail:'O modelo de embeddings não está instalado no computador. Nada foi baixado automaticamente.',canRetry:false},
  embedding_dimension_mismatch:{kind:'error',title:'Dimensão de vetor incompatível',detail:'O vetor gerado não corresponde à dimensão esperada; o chunk não foi indexado.',canRetry:false},
  embedding_unavailable:{kind:'unavailable',title:'Serviço de embeddings indisponível',detail:'O serviço local de embeddings não respondeu em loopback.',canRetry:true},
  forbidden:{kind:'denied',title:'Acesso negado',detail:'O servidor recusou esta operação para o seu perfil.',canRetry:false},
  invalid_query:{kind:'invalid',title:'Pergunta inválida',detail:'A pergunta precisa ter entre 5 e 500 caracteres.',canRetry:false},
  invalid_rag_key:{kind:'invalid',title:'Área inválida',detail:'A área informada não pertence ao assistente.',canRetry:false},
  method_not_allowed:{kind:'invalid',title:'Método não permitido',detail:'Esta rota não aceita este método.',canRetry:false},
  embedding_configuration_invalid:{kind:'unavailable',title:'Configuração de embeddings inválida',detail:'O endereço do provedor de embeddings precisa ser local (loopback) em http.',canRetry:false},
  embedding_empty_response:{kind:'error',title:'Resposta de embeddings vazia',detail:'O provedor não devolveu vetor; o chunk não foi marcado como indexado.',canRetry:true},
  embedding_http_error:{kind:'unavailable',title:'Falha HTTP nos embeddings',detail:'O provedor local respondeu com erro; nenhum vetor foi gravado para estes chunks.',canRetry:true},
  embedding_invalid_vector:{kind:'error',title:'Vetor inválido recusado',detail:'A resposta continha valor não numérico; o vetor foi descartado em vez de truncado.',canRetry:false},
  feedback_failed:{kind:'unavailable',title:'Feedback não gravado',detail:'O servidor não conseguiu registrar a avaliação; nada foi contabilizado.',canRetry:true},
  same_origin_required:{kind:'denied',title:'Origem recusada',detail:'Escritas só são aceitas a partir da própria aplicação.',canRetry:false},
  no_relevant_source:{kind:'empty',title:'Sem fonte suficiente',detail:'Nenhum trecho publicado atingiu o limiar mínimo de relevância para esta pergunta.',canRetry:true},
  ollama_configuration_invalid:{kind:'unavailable',title:'Configuração do modelo inválida',detail:'O endereço do modelo precisa ser local (loopback) em http.',canRetry:false},
  protocol_not_found:{kind:'not_found',title:'Protocolo não encontrado',detail:'Não existe resposta registrada com este protocolo nesta área.',canRetry:false},
  rag_unavailable:{kind:'unavailable',title:'Recuperação indisponível',detail:'O servidor não conseguiu consultar a base publicada. Isto não significa que não exista conteúdo.',canRetry:true},
  scope_forbidden:{kind:'denied',title:'Fora do seu escopo',detail:'Esta área exige um perfil autorizado. Estar na tela não concede autorização.',canRetry:false},
  ai_unavailable_busy:{kind:'unavailable',title:'Assistente ocupado',detail:'Aguarde alguns segundos e tente novamente.',canRetry:true},
  unauthorized:{kind:'denied',title:'Sessão necessária',detail:'O servidor não reconheceu uma sessão válida para este escopo.',canRetry:true},
  client_session_required:{kind:'denied',title:'Sessão de cliente necessária',detail:'O assistente do cliente exige uma sessão de cliente válida.',canRetry:true},
  staff_session_required:{kind:'denied',title:'Sessão de equipe necessária',detail:'Esta área exige sessão de equipe autorizada.',canRetry:true},
  embedding_backfill_failed:{kind:'unavailable',title:'Indexação não concluída',detail:'A reindexação falhou; nenhum chunk foi marcado como indexado.',canRetry:true},
  retrieval_unavailable:{kind:'unavailable',title:'Recuperação não configurada',detail:'O motor de recuperação não está disponível neste processo.',canRetry:false},
  index_status_unavailable:{kind:'unavailable',title:'Estado de indexação indisponível',detail:'O servidor não conseguiu ler o estado da indexação.',canRetry:true},
});
export const RAG_ERROR_CODES=Object.freeze(Object.keys(ERROR_MESSAGES));
export const RAG_ANSWER_KINDS=Object.freeze(['documental','operacional']);
export const RAG_RETRIEVAL_MODES=Object.freeze(['hybrid','lexical_only']);
export const RAG_VECTOR_BACKENDS=Object.freeze(['pgvector','exact','none']);
export const RAG_NO_SOURCE_DETAILS=Object.freeze(['nothing_found','below_threshold']);
export function describeRagError(code,status=0){
  const d=ERROR_MESSAGES[code];
  if(d) return Object.freeze({code,status,...d});
  if(status===0) return Object.freeze({code:null,status,kind:'unavailable',title:'Rede indisponível',detail:'Não foi possível alcançar o servidor. Isto não é uma resposta sem fonte: a consulta não chegou a ser feita.',canRetry:true});
  return Object.freeze({code:code||null,status,kind:'error',title:'Resposta não reconhecida',detail:code||`O servidor respondeu com HTTP ${status}.`,canRetry:false});
}
export function ragNoSourceMessage(detail){
  if(detail==='below_threshold') return 'Existe conteúdo publicado nesta área, mas nenhum trecho ficou próximo o suficiente da pergunta. Nada foi respondido por suposição.';
  return 'Não há conteúdo publicado que responda a esta pergunta nesta área.';
}
export function ragRetrievalLabel(mode){
  if(mode==='hybrid') return 'Busca híbrida (semântica + textual)';
  if(mode==='lexical_only') return 'Busca textual (semântica indisponível)';
  return 'Modo de busca não informado';
}
export function ragVectorBackendLabel(backend){
  if(backend==='pgvector') return 'Índice vetorial pgvector';
  if(backend==='exact') return 'Vetores com similaridade exata (sem índice ANN)';
  return 'Sem vetores nesta resposta';
}
export function honestDate(value,absent='Data de publicação não informada'){
  if(!value) return absent;
  const d=new Date(value);
  return Number.isNaN(d.getTime())?absent:d.toLocaleDateString('pt-BR',{timeZone:'UTC'});
}
export function honestRelevance(value){
  if(value===null||value===undefined||Number.isNaN(Number(value))) return 'Relevância não informada';
  return `Relevância ${(Number(value)*100).toFixed(0)}%`;
}
export function honestStaleness(source){
  if(!source||typeof source!=='object') return '';
  if(!source.stale) return '';
  const days=Number(source.age_days);
  return Number.isFinite(days) ? `Conteúdo publicado há ${days} dias: confirme antes de decidir.` : 'Conteúdo potencialmente desatualizado: confirme antes de decidir.';
}
export default Object.freeze({ERROR_MESSAGES,RAG_ERROR_CODES,RAG_ANSWER_KINDS,RAG_RETRIEVAL_MODES,RAG_VECTOR_BACKENDS,RAG_NO_SOURCE_DETAILS});
