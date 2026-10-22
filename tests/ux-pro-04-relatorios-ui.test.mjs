import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../src/app/admin/relatorios/", import.meta.url);
const component = await readFile(new URL("ReportsWorkspace.tsx", root), "utf8");
const styles = await readFile(new URL("ReportsWorkspace.module.css", root), "utf8");
const page = await readFile(new URL("page.tsx", root), "utf8");

test("UX-PRO-04 relatórios distingue carga, vazio confirmado e falha", () => {
  for (const state of ["loading", "empty", "ready", "failed", "stale", "refreshing"]) {
    assert.ok(component.includes(`"${state}"`), `estado ausente: ${state}`);
  }
  assert.match(component, /readAt/);
  assert.match(component, /Tentar novamente/);
  assert.match(component, /Array\.isArray\(payload\.items\)/);
  assert.match(component, /phase: "empty"|data-report-state="empty"/);
});

test("UX-PRO-04 falha transitória mantém dados e negação descarta acesso", () => {
  assert.match(component, /phase === "stale"/);
  assert.match(component, /phase === "denied"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /role="status"/);
});

test("UX-PRO-04 detalhe apresenta campos canônicos sem despejo JSON", () => {
  assert.match(component, /Fontes e contagens/);
  assert.match(component, /Trilha imutável/);
  assert.doesNotMatch(component, /JSON\.stringify\(detail/);
  assert.doesNotMatch(component, /\{report\.report_type\}|\{report\.status\}/);
});

test("UX-PRO-04 estilos locais preservam a alçada atual e acessibilidade básica", () => {
  assert.match(component, /ReportsWorkspace\.module\.css/);
  assert.doesNotMatch(component, /style=\{/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media/);
  assert.match(component, /useCallback\(async \(\) =>/);
  assert.match(component, /useEffect\(\(\) => \{ void loadReports\(\); \}, \[loadReports\]\)/);
  assert.match(page, /allowedRoles=\{\["ti", "admin"\]\}/);
});

test("UX-PRO-04 mantém endpoints e Idempotency-Key canônicos", () => {
  for (const contract of [
    '"/api/ext/reports/periodic"',
    '"/transition"',
    '"/generate"',
    '"/send"',
    '"Idempotency-Key"',
  ]) assert.ok(component.includes(contract), `contrato ausente: ${contract}`);
});
