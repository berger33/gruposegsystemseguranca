import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const catalog = await readFile(new URL('src/app/admin/ti/CatalogClient.tsx', root), 'utf8');
const equipment = await readFile(new URL('src/app/admin/ti/EquipmentClient.tsx', root), 'utf8');
const styles = await readFile(new URL('src/components/ui/CommercialCatalog.module.css', root), 'utf8');
const workspace = await readFile(new URL('src/app/admin/comercial/ComercialWorkspace.tsx', root), 'utf8');
const page = await readFile(new URL('src/app/admin/comercial/page.tsx', root), 'utf8');
const catalogApi = await readFile(new URL('src/server/service-catalog-api.mjs', root), 'utf8');
const equipmentApi = await readFile(new URL('src/server/equipment-api.mjs', root), 'utf8');

test('UX-PRO-03 catalog and equipment remain mounted in the existing commercial navigation', () => {
  assert.match(workspace, /<CatalogClient\s*\/>/);
  assert.match(workspace, /<EquipmentClient\s*\/>/);
  assert.match(workspace, /id: "catalogo", label: "Catálogo & equipamentos"/);
  assert.match(page, /allowedRoles=\{\["comercial", "marcelo", "admin", "ti"\]\}/);
});

test('catalog keeps the public list endpoint and communicates its published/validated scope', () => {
  assert.match(catalog, /\/api\/catalog\?\$\{params\.toString\(\)\}/);
  assert.match(catalog, /params\.set\("includeUnpublished", "false"\)/);
  assert.match(catalogApi, /const onlyValidated = !staff \|\| url\.searchParams\.get\("onlyValidated"\) !== "false"/);
  assert.match(catalog, /somente serviços publicados e validados/);
  assert.match(catalog, /data\.source/);
  assert.match(catalog, /Não informado/);
  assert.doesNotMatch(catalog, /aguardando validação comercial \(D-02, CRM-11\)/);
  for (const type of ['recorrente', 'avulso', 'instalacao', 'manutencao', 'venda', 'locacao', 'comodato', 'outro']) assert.ok(catalog.includes(`"${type}"`));
});

test('equipment UI retains list/create routes, filters and all submitted fields without weakening server guards', () => {
  assert.match(equipment, /fetch\(`\/api\/crm\/equipment\?\$\{params\.toString\(\)\}`/);
  assert.match(equipment, /fetch\("\/api\/crm\/equipment", \{/);
  for (const field of ['id:', 'manufacturer:', 'model:', 'name:', 'category:', 'supplier_name:', 'warranty_months:']) assert.ok(equipment.includes(field), `equipment POST field ${field} must remain`);
  assert.match(equipment, /params\.set\("category"/);
  assert.match(equipment, /params\.set\("search"/);
  assert.match(equipmentApi, /await requireAdminSession\(req, res\)/);
  assert.match(equipmentApi, /if \(!requireSameOrigin\(req, res\)\) return/);
  assert.match(equipmentApi, /is_active, is_validated\)\s*VALUES[\s\S]*true,false/);
  assert.match(equipmentApi, /crm_equipment_create/);
});

test('catalog and equipment label fields, use honest empty/error/loading states, and contain technical details', () => {
  for (const label of ['Filtrar por tipo', 'Identificador', 'Fabricante', 'Modelo', 'Nome para exibição', 'Categoria', 'Fornecedor', 'Garantia (meses)', 'Nome, modelo ou fabricante']) assert.ok(catalog.includes(label) || equipment.includes(label), `expected field label: ${label}`);
  for (const component of [catalog, equipment]) {
    assert.match(component, /<UiState variant="loading"/);
    assert.match(component, /<UiState variant="error"/);
    assert.match(component, /<UiState variant="empty"/);
    assert.match(component, /<details/);
  }
  assert.match(equipment, /setNotice\("Equipamento cadastrado/);
  assert.match(equipment, /A consulta atual mostra no máximo/);
});

test('catalog/equipment presentation is responsive, theme-tokenized and keyboard-visible', () => {
  assert.match(styles, /@media\(max-width:700px\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /var\(--ux-color-surface\)/);
  assert.match(styles, /var\(--ux-color-text\)/);
  assert.match(styles, /var\(--ux-color-success-soft\)/);
  assert.doesNotMatch(styles.replace(/#fff\b/g, ''), /#[0-9a-fA-F]{3,8}\b/);
});
