// F01 — contrato estático da cobertura de entrada administrativa.
// Isto não substitui a autorização no servidor: apenas impede que uma página
// administrativa volte a ficar sem o envelope de sessão central ou receba um
// papel diferente do mapa publicado em AdminGate.

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const protectedPages = new Map([
  ["src/app/admin/analytics/page.tsx", ["admin", "ti", "marcelo"]],
  ["src/app/admin/carteira/page.tsx", ["comercial", "marcelo", "admin", "ti"]],
  ["src/app/admin/comercial/page.tsx", ["comercial", "marcelo", "admin", "ti"]],
  ["src/app/admin/compliance/page.tsx", ["marcelo", "admin", "ti"]],
  ["src/app/admin/conhecimento/page.tsx", ["marcelo", "admin", "ti"]],
  ["src/app/admin/continuidade/page.tsx", ["admin", "ti", "marcelo", "operacao", "supervisor"]],
  ["src/app/admin/expansao/page.tsx", ["comercial", "financeiro", "marcelo", "admin", "ti"]],
  ["src/app/admin/contratos/page.tsx", ["marcelo", "admin", "comercial"]],
  ["src/app/admin/contratos/[id]/page.tsx", ["marcelo", "admin", "comercial"]],
  ["src/app/admin/crm/page.tsx", ["comercial", "marcelo", "admin", "ti"]],
  ["src/app/admin/financeiro/page.tsx", ["financeiro", "marcelo", "admin", "ti"]],
  ["src/app/admin/fornecedores/page.tsx", ["marcelo", "admin", "ti"]],
  ["src/app/admin/frota/page.tsx", ["marcelo", "admin", "ti"]],
  ["src/app/admin/leads/page.tsx", ["comercial", "marcelo", "admin", "ti"]],
  ["src/app/admin/licitacoes/page.tsx", ["marcelo", "admin", "ti"]],
  ["src/app/admin/marcelo/assistente/page.tsx", ["marcelo", "admin"]],
  ["src/app/admin/marcelo/page.tsx", ["marcelo", "admin", "ti"]],
  ["src/app/admin/operacao/page.tsx", ["supervisor", "marcelo", "admin", "ti"]],
  ["src/app/admin/patrimonio/page.tsx", ["supervisor", "marcelo", "admin", "ti"]],
  ["src/app/admin/portal/alertas/page.tsx", ["ti", "admin"]],
  ["src/app/admin/portal/autocadastro/page.tsx", ["ti", "admin"]],
  ["src/app/admin/portal/convites/page.tsx", ["ti", "admin"]],
  ["src/app/admin/portal/page.tsx", ["ti", "admin"]],
  ["src/app/admin/portal/permissoes/page.tsx", ["ti", "admin"]],
  ["src/app/admin/portal/solicitacoes/page.tsx", ["ti", "admin"]],
  ["src/app/admin/publicacao/page.tsx", ["marcelo", "ti", "comercial", "admin"]],
  ["src/app/admin/qualidade/page.tsx", ["marcelo", "admin", "ti"]],
  ["src/app/admin/rh/assistente/page.tsx", ["rh", "admin"]],
  ["src/app/admin/satisfacao/page.tsx", ["marcelo", "admin", "ti"]],
  ["src/app/admin/tema/page.tsx", ["marcelo", "ti", "admin"]],
  ["src/app/admin/terceiros/page.tsx", ["marcelo", "admin", "ti"]],
  ["src/app/admin/ti/page.tsx", ["ti", "admin"]],
  ["src/app/admin/relatorios/page.tsx", ["ti", "admin"]],
  ["src/app/admin/inteligencia/page.tsx", ["ti", "admin"]],
  ["src/app/admin/emergencial/page.tsx", ["ti", "admin"]],
  ["src/app/admin/visual/page.tsx", ["ti", "admin"]],
  ["src/app/admin/clientes/page.tsx", ["marcelo", "ti"]],
  ["src/app/admin/funcionarios/page.tsx", ["rh", "marcelo", "admin", "ti"]],
]);

const deliberateExceptions = new Set([
  "src/app/admin/convite/page.tsx",
  "src/app/admin/verificacao-manual/page.tsx",
]);

async function pageFiles(directory = path.join(root, "src/app/admin"), prefix = "src/app/admin") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await pageFiles(absolute, relative));
    else if (entry.name === "page.tsx") result.push(relative);
  }
  return result;
}

function declaredRoles(source, file) {
  const match = source.match(/allowedRoles\s*=\s*\{\s*\[([\s\S]*?)\]\s*\}/);
  assert.ok(match, `${file} precisa declarar allowedRoles no AdminGate`);
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
}

test("todas as páginas administrativas têm gate e papéis revisados", async () => {
  const pages = new Set(await pageFiles());
  const expected = new Set([...protectedPages.keys(), ...deliberateExceptions, "src/app/admin/page.tsx", "src/app/admin/entrar/page.tsx"]);
  assert.deepEqual([...pages].sort(), [...expected].sort(), "página administrativa nova precisa entrar na matriz de gate");

  for (const [file, roles] of protectedPages) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.match(source, /AdminGate/, `${file} precisa usar AdminGate`);
    assert.deepEqual(declaredRoles(source, file), roles, `${file} tem papéis fora do mapa revisado`);
  }

  for (const file of deliberateExceptions) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /AdminGate/, `${file} é uma exceção deliberada e não deve ganhar o gate central`);
  }

  const hub = await readFile(path.join(root, "src/app/admin/AdminHub.tsx"), "utf8");
  assert.match(hub, /AdminGate/, "/admin deve manter o gate pelo AdminHub");
  const login = await readFile(path.join(root, "src/app/admin/entrar/page.tsx"), "utf8");
  assert.doesNotMatch(login, /AdminGate/, "/admin/entrar é a própria entrada e não pode redirecionar para si");
});
