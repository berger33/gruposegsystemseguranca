// F01 — política pura da entrada/navegação central de staff.
// Sem servidor, banco ou rede: todo veredito vem das funções de
// src/lib/admin-entry.mjs. Par âncora: os papéis deste mapa precisam cobrir
// exatamente os STAFF_ROLES do servidor (testado por paridade abaixo).

import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_HOME_FALLBACK,
  ROLE_HOME,
  legacyLoginEnabled,
  loginErrorMessage,
  resolvePostLoginTarget,
  roleHome,
  roleLabel,
  sanitizeAdminNext,
} from "../src/lib/admin-entry.mjs";
import { STAFF_ROLES } from "../src/server/staff-session.mjs";

test("próximo interno válido é preservado", () => {
  assert.equal(sanitizeAdminNext("/admin"), "/admin");
  assert.equal(sanitizeAdminNext("/admin/marcelo"), "/admin/marcelo");
  assert.equal(sanitizeAdminNext("/admin/crm?tab=agenda&dia=2026-10-04"), "/admin/crm?tab=agenda&dia=2026-10-04");
  assert.equal(sanitizeAdminNext("/admin/marcelo#indicadores"), "/admin/marcelo#indicadores");
  assert.equal(sanitizeAdminNext("/admin/contratos/1b2c3d4e-0000-4000-8000-abcdefabcdef"), "/admin/contratos/1b2c3d4e-0000-4000-8000-abcdefabcdef");
});

test("próximo com URL absoluta, host ou esquema cai no fallback", () => {
  for (const evil of [
    "https://evil.example/admin",
    "http://evil.example",
    "//evil.example/admin",
    "///evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
  ]) {
    assert.equal(sanitizeAdminNext(evil), ADMIN_HOME_FALLBACK, `deveria rejeitar ${evil}`);
  }
});

test("próximo fora do namespace /admin cai no fallback", () => {
  for (const out of ["", "   ", "/", "/cliente/app", "/funcionario", "/administrador", "/API/admin"]) {
    assert.equal(sanitizeAdminNext(out), ADMIN_HOME_FALLBACK, `deveria rejeitar ${JSON.stringify(out)}`);
  }
});

test("próximo com controle, barra invertida ou tamanho abusivo cai no fallback", () => {
  assert.equal(sanitizeAdminNext("/admin/marcelo\r\nLocation: https://evil.example"), ADMIN_HOME_FALLBACK);
  assert.equal(sanitizeAdminNext("/admin\\..\\evil"), ADMIN_HOME_FALLBACK);
  assert.equal(sanitizeAdminNext(`/admin/${"a".repeat(300)}`), ADMIN_HOME_FALLBACK);
  assert.equal(sanitizeAdminNext("/admin/marcelosed"), ADMIN_HOME_FALLBACK);
});

test("próximo apontando para a própria entrada não gera loop", () => {
  assert.equal(sanitizeAdminNext("/admin/entrar"), ADMIN_HOME_FALLBACK);
  assert.equal(sanitizeAdminNext("/admin/entrar?next=/admin/marcelo"), ADMIN_HOME_FALLBACK);
  assert.equal(sanitizeAdminNext("/admin/entrar#x"), ADMIN_HOME_FALLBACK);
});

test("tipos não-string e nulos caem no fallback", () => {
  assert.equal(sanitizeAdminNext(null), ADMIN_HOME_FALLBACK);
  assert.equal(sanitizeAdminNext(undefined), ADMIN_HOME_FALLBACK);
  assert.equal(sanitizeAdminNext(42), ADMIN_HOME_FALLBACK);
  assert.equal(sanitizeAdminNext({ toString: () => "/admin/marcelo" }), ADMIN_HOME_FALLBACK);
});

test("home por papel cobre exatamente os STAFF_ROLES do servidor", () => {
  const mapped = Object.keys(ROLE_HOME).sort();
  assert.deepEqual([...mapped], [...STAFF_ROLES].sort(), "todo papel staff reconhecido precisa de destino");
  for (const role of STAFF_ROLES) {
    assert.ok(roleHome(role).startsWith("/admin"), `${role} deve cair dentro de /admin`);
    assert.ok(roleLabel(role).length > 2, `${role} precisa de rótulo humano`);
  }
  assert.equal(roleHome("marcelo"), "/admin/marcelo");
  assert.equal(roleHome("rh"), "/admin/funcionarios");
  assert.equal(roleHome("financeiro"), "/admin/financeiro");
});

test("papel desconhecido ou vazio vai para o hub geral sem quebrar", () => {
  assert.equal(roleHome("ceo"), ADMIN_HOME_FALLBACK);
  assert.equal(roleHome(""), ADMIN_HOME_FALLBACK);
  assert.equal(roleHome(undefined), ADMIN_HOME_FALLBACK);
  assert.equal(roleLabel("ceo"), "Conta de equipe");
});

test("destino pós-login: next válido vence; inválido cai na home do papel", () => {
  assert.equal(resolvePostLoginTarget({ role: "rh", next: "/admin/funcionarios?aba=documentos" }), "/admin/funcionarios?aba=documentos");
  assert.equal(resolvePostLoginTarget({ role: "rh", next: "https://evil.example" }), "/admin/funcionarios");
  assert.equal(resolvePostLoginTarget({ role: "marcelo", next: null }), "/admin/marcelo");
  assert.equal(resolvePostLoginTarget({ role: "ti", next: "" }), "/admin");
  assert.equal(resolvePostLoginTarget({ role: "rh", next: "/admin/marcelo" }), "/admin/marcelo", "next interno é respeitado mesmo fora do papel — a página de destino aplica o gate 403");
});

test("chave legada só é oferecida com a flag literal true E token de tamanho mínimo", () => {
  assert.equal(legacyLoginEnabled({ SITE_ADMIN_LEGACY_TOKENS: "true", SITE_ADMIN_TOKEN_TI: "x".repeat(48) }), true);
  assert.equal(legacyLoginEnabled({ SITE_ADMIN_LEGACY_TOKENS: " true ", SITE_ADMIN_TOKEN_MARCELO: "y".repeat(32) }), true);
  assert.equal(legacyLoginEnabled({ SITE_ADMIN_LEGACY_TOKENS: "true", SITE_ADMIN_TOKEN_TI: "curto" }), false);
  assert.equal(legacyLoginEnabled({ SITE_ADMIN_LEGACY_TOKENS: "true" }), false);
  assert.equal(legacyLoginEnabled({ SITE_ADMIN_LEGACY_TOKENS: "1", SITE_ADMIN_TOKEN_TI: "x".repeat(48) }), false);
  assert.equal(legacyLoginEnabled({ SITE_ADMIN_LEGACY_TOKENS: "yes", SITE_ADMIN_TOKEN_TI: "x".repeat(48) }), false);
  assert.equal(legacyLoginEnabled({ SITE_ADMIN_TOKEN_TI: "x".repeat(48) }), false);
  assert.equal(legacyLoginEnabled({}), false);
  assert.equal(legacyLoginEnabled(null), false);
});

test("mensagens de erro são compreensíveis e não vazam internos", () => {
  assert.match(loginErrorMessage("invalid_credentials"), /E-mail ou senha não conferem/i);
  assert.match(loginErrorMessage("identity_not_active"), /não está ativa|suspensa/i);
  assert.match(loginErrorMessage("staff_profile_missing"), /perfil de equipe/i);
  assert.match(loginErrorMessage("too_many_attempts"), /Muitas tentativas/i);
  assert.match(loginErrorMessage("database_not_configured"), /indisponível/i);
  assert.match(loginErrorMessage("migration_required"), /indisponível/i);
  assert.match(loginErrorMessage("mfa_challenge_invalid"), /Código de verificação/i);
  assert.match(loginErrorMessage("legacy_admin_tokens_disabled", "legacy"), /conta individual/i);
  assert.match(loginErrorMessage("qualquer_coisa", "legacy"), /chave administrativa/i);
  assert.doesNotMatch(loginErrorMessage("database_not_configured"), /DATABASE|postgres|42P01|SQL/i);
});
