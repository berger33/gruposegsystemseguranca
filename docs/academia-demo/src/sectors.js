// Setores (alçadas) da Academia. Um usuário pertence a exatamente um setor.
// Trilhas declaram o padrão de visibilidade por setor ("todos" ou uma lista).
// Liberações e bloqueios individuais ficam em access.mjs.
// O servidor decide a visibilidade em cada requisição; a tela só reflete isso.

export const SECTORS = Object.freeze({
  funcionario: 'Funcionário',
  cliente: 'Cliente',
  rh: 'RH',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  supervisor: 'Operação e supervisão',
  marcelo: 'Gestão',
  ti: 'TI',
  admin: 'Administração',
  porteiro: 'Portaria',
  controlador_acesso: 'Controle de acesso',
  servicos_gerais: 'Serviços gerais',
  instalador: 'Instalação de segurança',
});

export const isKnownSector = sector => Object.prototype.hasOwnProperty.call(SECTORS, sector);
