import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ERROR_MESSAGES,
  ENUMS,
  describeFleetError,
  enumLabel,
  honestDate,
  honestMoney,
} from "../src/lib/fleet-vocabulary.mjs";
const canonical = readFileSync(
  new URL("../src/server/ext-fleet-api.mjs", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../src/app/admin/frota/FrotaWorkspace.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../src/app/admin/frota/page.tsx", import.meta.url),
  "utf8",
);
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
function extract(source) {
  const cleaned = source
    .replace(/\.includes\(\s*(["'`])[a-z0-9_]+\1\s*\)/g, "")
    .replace(/(?:===|!==|==|!=)\s*(["'`])[a-z0-9_]+\1/g, "");
  const patterns = [
    /\berror\s*:\s*["'`]([a-z0-9_]+)["'`]/g,
    /\b(?:bad|unavailable)\(\s*res\s*,\s*["'`]([a-z0-9_]+)["'`]/g,
    /new (?:HttpError|E)\(\s*\d+\s*,\s*["'`]([a-z0-9_]+)["'`]/g,
    /new Error\(\s*["'`]([a-z0-9_]+)["'`]\s*\)\s*,\s*\{\s*status/g,
  ];
  return new Set(
    patterns.flatMap((pattern) =>
      [...cleaned.matchAll(pattern)].map((match) => match[1]),
    ),
  );
}
const codes = extract(canonical);
test("UX frota: levantamento cobre os 50 códigos reais e nenhum inventado", () => {
  assert.equal(codes.size, 50);
  assert.deepEqual(
    Object.keys(ERROR_MESSAGES).filter((code) => !codes.has(code)),
    [],
  );
  assert.deepEqual(
    [...codes].filter((code) => !(code in ERROR_MESSAGES)),
    [],
  );
  for (const code of codes) {
    const item = describeFleetError(code, 500);
    assert.equal(item.code, code);
    assert.notEqual(item.title, "Falha no servidor");
  }
});
test("UX frota: rota legada viva entra; não há wrappers ou exceções convertidas", () => {
  assert.ok(codes.has("legacy_route_retired"));
  assert.match(canonical, /function handleLegacy/);
  assert.match(server, /extFleetApi\.handleLegacyVehicles/);
  assert.doesNotMatch(canonical, /\b(?:bad|unavailable)\(\s*res\s*,/);
  assert.doesNotMatch(canonical, /new (?:HttpError|E)\(/);
});
test("UX frota: desconhecido passa cru, rede e ausência são honestas", () => {
  const unknown = describeFleetError("codigo_novo", 422);
  assert.match(unknown.detail, /codigo_novo/);
  assert.equal(unknown.code, "codigo_novo");
  assert.equal(describeFleetError(null, 0).kind, "network");
  assert.equal(honestDate(null), "Data ausente");
  assert.equal(honestMoney(null), "Custo ausente");
  assert.equal(honestMoney(0), "R$ 0,00");
});
test("UX frota: ENUM conhecido é traduzido e desconhecido passa cru", () => {
  for (const [group, items] of Object.entries(ENUMS))
    for (const value of Object.keys(items))
      assert.notEqual(enumLabel(group, value), value, `${group}.${value}`);
  assert.equal(enumLabel("vehicleStatus", "situacao_nova"), "situacao_nova");
  assert.equal(enumLabel("fuelType", "combustivel_novo"), "combustivel_novo");
});
test("UX frota: statuses e combustíveis do servidor têm rótulo", () => {
  for (const value of [
    "disponivel",
    "em_uso",
    "em_manutencao",
    "baixado",
    "reservado",
  ]) {
    assert.match(canonical, new RegExp(`"${value}"`));
    assert.notEqual(enumLabel("vehicleStatus", value), value);
  }
  for (const value of [
    "gasolina",
    "etanol",
    "diesel",
    "flex",
    "eletrico",
    "hibrido",
    "outro",
  ]) {
    assert.match(canonical, new RegExp(`"${value}"`));
    assert.notEqual(enumLabel("fuelType", value), value);
  }
  for (const value of ["em_dia", "alerta", "vencida", "sem_base", "sem_regra"])
    assert.notEqual(enumLabel("alertStatus", value), value);
});
test("UX frota: somente módulo compartilhado, sem style inline, placeholder ou classes avulsas", () => {
  assert.doesNotMatch(workspace, /\sstyle\s*=/);
  assert.doesNotMatch(workspace, /\splaceholder\s*=/);
  for (const match of workspace.matchAll(
    /className\s*=\s*["'`]([^"'`]+)["'`]/g,
  ))
    assert.fail(`classe literal avulsa: ${match[1]}`);
  assert.match(workspace, /UiWorkspace\.module\.css/);
});
test("UX frota: AdminGate não é alargado", () => {
  assert.match(page, /allowedRoles=\{\["marcelo", "admin", "ti"\]\}/);
  assert.doesNotMatch(page, /"rh"|"financeiro"|"comercial"/);
});
test("UX frota: somente as nove URLs canônicas do protótipo", () => {
  const uncommented = workspace
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const urls = [
    ...uncommented.matchAll(/["'`]\/api\/ext\/fleet\/([^"'`$]*)/g),
  ].map((match) => `/api/ext/fleet/${match[1]}`);
  const allowed = [
    "/api/ext/fleet/vehicles",
    "/api/ext/fleet/vehicles/",
    "/api/ext/fleet/documents/",
  ];
  assert.ok(urls.length >= 9);
  for (const url of urls)
    assert.ok(
      allowed.some((prefix) => url.startsWith(prefix)),
      `URL inesperada ${url}`,
    );
  for (const suffix of [
    "/responsible",
    "/fuel-logs",
    "/maintenance-logs",
    "/documents",
    "/maintenance-rules",
  ])
    assert.ok(uncommented.includes(suffix));
  assert.match(server, /fleetDocumentMatch/);
});
test("UX frota: abas e UiState estão presentes e chave mantém prefixo real", () => {
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tab"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /ArrowRight/);
  assert.match(workspace, /Home/);
  assert.match(workspace, /End/);
  assert.match(workspace, /<UiState/);
  for (const prefix of [
    "ext01-veh",
    "ext01-resp",
    "ext01-fuel",
    "ext01-main",
    "ext01-doc",
    "ext01-rule",
    "ext01-stat",
    "ext01-docx",
  ])
    assert.ok(workspace.includes(prefix));
});
