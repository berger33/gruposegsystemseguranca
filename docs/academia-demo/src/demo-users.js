// Usuários de DEMONSTRAÇÃO (nomes fictícios). Arquivo sem dependências:
// é usado pelo servidor (seed.mjs) e pela versão estática publicada no GitHub Pages.

// Dois usuários por setor: o primeiro começa do zero; o segundo tem progresso de exemplo.
export const DEMO_USERS = Object.freeze([
  { name: 'Carla Mendes', email: 'carla.mendes@academia.exemplo', sector: 'funcionario', seeded: [] },
  { name: 'Rafael Nunes', email: 'rafael.nunes@academia.exemplo', sector: 'funcionario', seeded: ['fund-acesso', 'fund-progresso', 'func-ponto'] },
  { name: 'Paulo Teixeira', email: 'paulo.teixeira@academia.exemplo', sector: 'cliente', seeded: [] },
  { name: 'Lúcia Andrade', email: 'lucia.andrade@academia.exemplo', sector: 'cliente', seeded: ['cli-convite', 'cli-seguranca'] },
  { name: 'Juliana Prado', email: 'juliana.prado@academia.exemplo', sector: 'rh', seeded: [] },
  { name: 'Marcos Alves', email: 'marcos.alves@academia.exemplo', sector: 'rh', seeded: ['rh-admissao', 'rh-credencial', 'rh-holerite'] },
  { name: 'Renata Costa', email: 'renata.costa@academia.exemplo', sector: 'comercial', seeded: [] },
  { name: 'Bruno Lima', email: 'bruno.lima@academia.exemplo', sector: 'comercial', seeded: ['fund-acesso', 'com-pedido', 'com-funil', 'com-proposta'] },
  { name: 'Fernando Gomes', email: 'fernando.gomes@academia.exemplo', sector: 'financeiro', seeded: [] },
  { name: 'Patrícia Souza', email: 'patricia.souza@academia.exemplo', sector: 'financeiro', seeded: ['fin-receber', 'fin-conciliacao'] },
  { name: 'Eduardo Martins', email: 'eduardo.martins@academia.exemplo', sector: 'supervisor', seeded: [] },
  { name: 'Sandra Pires', email: 'sandra.pires@academia.exemplo', sector: 'supervisor', seeded: ['op-escala', 'op-ocorrencias'] },
  { name: 'Helena Duarte', email: 'helena.duarte@academia.exemplo', sector: 'marcelo', seeded: [] },
  { name: 'Sérgio Faria', email: 'sergio.faria@academia.exemplo', sector: 'marcelo', seeded: ['ges-pendencias', 'ges-aprovacoes', 'ges-relatorios'] },
  { name: 'Tiago Ramos', email: 'tiago.ramos@academia.exemplo', sector: 'ti', seeded: [] },
  { name: 'Vanessa Lopes', email: 'vanessa.lopes@academia.exemplo', sector: 'ti', seeded: ['ti-papeis', 'ti-auditoria'] },
  { name: 'Camila Nogueira', email: 'camila.nogueira@academia.exemplo', sector: 'admin', seeded: [] },
  { name: 'Henrique Brito', email: 'henrique.brito@academia.exemplo', sector: 'admin', seeded: ['fund-acesso'] },
  // Setores de campo (trilhas T21–T24). O segundo de cada setor tem progresso
  // de exemplo nas aulas publicadas que o setor enxerga (T01, T03 e T04).
  { name: 'Jorge Pinto', email: 'jorge.pinto@academia.exemplo', sector: 'porteiro', seeded: [] },
  { name: 'Aline Cardoso', email: 'aline.cardoso@academia.exemplo', sector: 'porteiro', seeded: ['fund-acesso', 'func-ponto'] },
  { name: 'Diego Moraes', email: 'diego.moraes@academia.exemplo', sector: 'controlador_acesso', seeded: [] },
  { name: 'Fernanda Reis', email: 'fernanda.reis@academia.exemplo', sector: 'controlador_acesso', seeded: ['fund-acesso', 'func-ocorrencia'] },
  { name: 'Rosa Lima', email: 'rosa.lima@academia.exemplo', sector: 'servicos_gerais', seeded: [] },
  { name: 'Ivan Barros', email: 'ivan.barros@academia.exemplo', sector: 'servicos_gerais', seeded: ['fund-acesso', 'func-pedidos'] },
  { name: 'Murilo Ferraz', email: 'murilo.ferraz@academia.exemplo', sector: 'instalador', seeded: [] },
  { name: 'Amanda Rocha', email: 'amanda.rocha@academia.exemplo', sector: 'instalador', seeded: ['fund-acesso', 'fund-progresso'] },
]);

export function userIdFor(email) {
  return `u-${email.split('@')[0].replace(/\./g, '-')}`;
}
