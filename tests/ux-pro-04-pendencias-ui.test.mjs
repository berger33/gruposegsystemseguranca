import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../src/app/admin/pendencias/PendencyWorkspace.tsx", import.meta.url), "utf8");

test("UX-PRO-04 pendências distingue carregamento, vazio e falha inicial", () => {
  assert.match(component, /data-pendency-state="loading"/);
  assert.match(component, /data-pendency-state="empty"/);
  assert.match(component, /Não foi possível carregar/);
  assert.match(component, /Tentar novamente/);
});

test("UX-PRO-04 releitura com falha mantém a lista e informa a última atualização", () => {
  assert.match(component, /data-pendency-state=\{loadState === "stale" \? "stale"/);
  assert.match(component, /última atualização/i);
  assert.match(component, /setItems\(\[\]\)/); // somente negação/autorização limpa dado pessoal anterior
  assert.match(component, /catch\s*\{/);
  assert.match(component, /!Array\.isArray\(payload\.items\)/);
  assert.match(component, /A resposta do serviço não foi reconhecida/);
});

test("UX-PRO-04 apresenta estados e criticidade sem enums técnicos", () => {
  for (const label of ["Não lida", "Lida", "Arquivada", "Alta", "Média", "Baixa"]) {
    assert.ok(component.includes(label), `rótulo ausente: ${label}`);
  }
  assert.doesNotMatch(component, />\{item\.status\}</);
  assert.match(component, /priorityOrder:[\s\S]*critica: 0, alta: 1, media: 2, baixa: 3/);
  assert.match(component, /sortedItems\.map/);
  assert.match(component, /Próxima ação:/);
});

test("UX-PRO-04 justificativa de arquivamento tem rótulo persistente", () => {
  assert.match(component, /<label[^>]*>Justificativa do arquivamento/i);
  assert.match(component, /htmlFor=/);
});

test("UX-PRO-04 estilos da tela usam tokens, foco visível e grades móveis", async () => {
  const styles = await readFile(new URL("../src/app/admin/pendencias/PendencyWorkspace.module.css", import.meta.url), "utf8");
  assert.match(styles, /--ux-color-surface/);
  assert.ok(styles.includes('html[data-admin-theme="night"]'));
  assert.match(styles, /focus-visible/);
  assert.match(styles, /max-width: 720px/);
  assert.match(styles, /max-width: 420px/);
});
