import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// This focal contract is run by the PostgreSQL/HTTP/Chromium gate. These checks
// keep the browser proof honest without replacing that gate with a unit stub.
test('EXT-04 workspace declares the canonical surface and distinct states',()=>{
 const ui=fs.readFileSync('src/app/admin/fornecedores/FornecedoresWorkspace.tsx','utf8');
 assert.match(ui,/<h1>EXT-04 — Fornecedores<\/h1>/); assert.match(ui,/role="tablist"/); assert.match(ui,/data-ui-state="denied"/); assert.match(ui,/supplierRequest/); assert.match(ui,/Sem upload real/);
});
test('EXT-04 browser failure injection contract is explicit',()=>{const gate=fs.readFileSync('scripts/qa-ux-supplier-postgres.mjs','utf8');assert.match(gate,/page\.addInitScript/);assert.match(gate,/Chromium|chromium|playwright/i);assert.match(gate,/finally/);});
