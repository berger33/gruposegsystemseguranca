// Setores (alçadas) da Academia. Um usuário pertence a exatamente um setor.
// Trilhas declaram quem pode vê-las: "todos" ou uma lista de setores.
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
});

// Administração enxerga todas as trilhas (governança do conteúdo).
export function canSeeTrack(track, sector) {
  if (!Object.prototype.hasOwnProperty.call(SECTORS, sector)) return false;
  if (sector === 'admin') return true;
  return track.audiences.includes('todos') || track.audiences.includes(sector);
}
