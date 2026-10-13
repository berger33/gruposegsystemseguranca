import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const technical = await readFile(new URL('src/app/admin/ti/TechnicalBudgetClient.tsx', root), 'utf8');
const labor = await readFile(new URL('src/app/admin/ti/LaborBudgetClient.tsx', root), 'utf8');
const reports = await readFile(new URL('src/app/admin/ti/ReportClient.tsx', root), 'utf8');
const styles = await readFile(new URL('src/components/ui/CommercialEstimate.module.css', root), 'utf8');
const workspace = await readFile(new URL('src/app/admin/comercial/ComercialWorkspace.tsx', root), 'utf8');

test('UX-PRO-03 commercial budgets remain mounted and preserve API routes and payload fields', () => {
  assert.match(workspace, /<TechnicalBudgetClient\s*\/>/);
  assert.match(workspace, /<LaborBudgetClient\s*\/>/);
  assert.match(technical, /\/api\/crm\/technical-budgets\?limit=50/);
  assert.match(technical, /\/api\/crm\/technical-budgets\/\$\{selected\}\/items/);
  for (const field of ['company_id', 'warranty_description', 'maintenance_description', 'unit_cost', 'unit_price', 'supplier_name']) assert.ok(technical.includes(field), `technical budget field ${field} must remain`);
  assert.match(labor, /\/api\/crm\/labor-budgets\?limit=50/);
  assert.match(labor, /\/api\/crm\/labor-budgets\/\$\{selected\}\/items/);
  for (const field of ['company_id', 'coverage', 'role_name', 'shift_type', 'substitution_cost', 'supervision_cost', 'uniform_cost', 'displacement_cost', 'materials_cost', 'indirect_cost']) assert.ok(labor.includes(field), `labor budget field ${field} must remain`);
});

test('UX-PRO-03 budget forms keep categories and use explicit, associated labels', () => {
  for (const category of ['material', 'equipamento', 'mao_obra', 'instalacao', 'deslocamento', 'infraestrutura', 'licenca', 'garantia', 'manutencao', 'outro']) assert.ok(technical.includes(`"${category}"`));
  for (const label of ['Identificador da empresa (UUID)', 'Título do orçamento', 'Quantidade', 'Custo unitário (R$)', 'Preço unitário (R$)', 'Cobertura da operação (JSON)']) assert.ok(technical.includes(label) || labor.includes(label), `expected visible field label: ${label}`);
  assert.match(labor, /JSON\.parse\(form\.coverage\)/);
  assert.match(labor, /<details>/);
  assert.match(technical, /<UiState variant="empty"/);
  assert.match(labor, /<UiState variant="error"/);
});

test('UX-PRO-03 reports keep seven endpoints and show request failures honestly', () => {
  for (const endpoint of ['reports', 'reports/conversion', 'reports/sales-cycle', 'reports/overdue-tasks', 'reports/loss-reasons', 'reports/pipeline', 'reports/weighted-forecast']) assert.ok(reports.includes(`/api/crm/${endpoint}`), `report endpoint ${endpoint} must remain`);
  assert.match(reports, /if \(!response\.ok\) throw new Error/);
  assert.match(reports, /<UiState variant="error"/);
  assert.match(reports, /<UiState variant="loading"/);
  assert.match(reports, /<UiState variant="empty"/);
  assert.match(reports, /Estimativa baseada nas probabilidades/);
  assert.match(reports, /Cenários alternativos \(não somar entre si\)/);
  assert.doesNotMatch(reports, /\.toFixed\(/);
});

test('UX-PRO-03 budgets and reports share responsive, theme-aware, keyboard-visible presentation', () => {
  assert.match(styles, /@media\(max-width:700px\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /var\(--ux-color-surface\)/);
  assert.match(styles, /var\(--ux-color-text\)/);
  assert.match(styles, /var\(--ux-color-warning-soft\)/);
  assert.match(styles, /min-width:780px/);
  assert.doesNotMatch(styles.replace(/#fff\b/g, ''), /#[0-9a-fA-F]{3,8}\b/);
});
