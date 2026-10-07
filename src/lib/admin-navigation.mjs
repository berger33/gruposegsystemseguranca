// UX-02. Groups organize the existing visual destinations; they never grant access.
export const ADMIN_GROUPS = Object.freeze([
  { id: 'visao', label: 'Visão e pendências', hrefs: ['/admin/marcelo', '/admin/analytics', '/admin/relatorios'] },
  { id: 'comercial', label: 'Clientes e comercial', hrefs: ['/admin/crm', '/admin/carteira', '/admin/leads', '/admin/inteligencia', '/admin/expansao', '/admin/satisfacao'] },
  { id: 'entrega', label: 'Entrega de serviços', hrefs: ['/admin/contratos', '/admin/operacao', '/admin/patrimonio', '/admin/frota', '/admin/terceiros', '/admin/qualidade', '/admin/emergencial'] },
  { id: 'pessoas', label: 'Pessoas', hrefs: ['/admin/funcionarios'] },
  { id: 'gestao', label: 'Financeiro e conformidade', hrefs: ['/admin/financeiro', '/admin/compliance', '/admin/licitacoes', '/admin/fornecedores'] },
  { id: 'portais', label: 'Portais e conhecimento', hrefs: ['/admin/clientes', '/admin/conhecimento', '/admin/portal'] },
  { id: 'sistema', label: 'Sistema', hrefs: ['/admin/ti', '/admin/aparencia', '/admin/visual'] },
]);

export function groupAdminModules(modules) {
  const byHref = new Map(modules.map(module => [module.href, module]));
  const used = new Set();
  const groups = ADMIN_GROUPS.map(group => ({
    id: group.id,
    label: group.label,
    modules: group.hrefs.map(href => byHref.get(href)).filter(Boolean).filter(module => {
      if (used.has(module.href)) return false;
      used.add(module.href);
      return true;
    }),
  })).filter(group => group.modules.length);
  const remaining = modules.filter(module => !used.has(module.href));
  if (remaining.length) groups.push({ id: 'outros', label: 'Outros módulos', modules: remaining });
  return groups;
}

export function searchAdminGroups(groups, term) {
  const query = String(term || '').trim().toLocaleLowerCase('pt-BR');
  if (!query) return groups;
  return groups.map(group => ({
    ...group,
    modules: group.label.toLocaleLowerCase('pt-BR').includes(query)
      ? group.modules
      : group.modules.filter(module => module.label.toLocaleLowerCase('pt-BR').includes(query)),
  })).filter(group => group.modules.length);
}
