// Setores (alçadas) da Academia. Um usuário pertence a exatamente um setor.
// Trilhas declaram quem pode vê-las: "todos" ou uma lista de setores.
// O servidor decide a visibilidade em cada requisição; a tela só reflete isso.
// A regra efetiva de acesso (padrão do setor + liberações − bloqueios) vive em
// access.mjs, compartilhada pelo servidor e pela versão de demonstração.

export const SECTORS = Object.freeze({
  funcionario: 'Funcionário',
  cliente: 'Cliente',
  rh: 'RH',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  supervisor: 'Supervisão (equipe de operação)',
  marcelo: 'Gestão',
  ti: 'TI',
  admin: 'Administração',
  porteiro: 'Portaria',
  controlador_acesso: 'Controle de acesso',
  servicos_gerais: 'Serviços gerais',
  instalador: 'Instalação',
  // Pendente (decisão 1 do plano): o papel "supervisor de posto" entra com o
  // nome que o Marcelo confirmar. A trilha T25 e o setor correspondente ficam
  // de fora até lá.
});

// Cargos de campo: fazem a rotina do funcionário nos postos.
export const FIELD_SECTORS = Object.freeze(['funcionario', 'porteiro', 'controlador_acesso', 'servicos_gerais', 'instalador']);
