import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateManualStatusChange,
  MANUAL_STATUS_REASON_CATEGORIES,
  shouldNotifyPermissionRestored,
  STATUS_CHANGE_FAILURE_CATEGORIES,
} from "../src/lib/admin-status-preview.mjs";

test("records a same-status request as an invalid transition", () => {
  assert.deepEqual(evaluateManualStatusChange("suspensa", "suspensa"), {
    outcome: "falhou",
    failureCategory: "transição inválida",
  });
});

test("allows a requested status that differs from the current status", () => {
  assert.deepEqual(evaluateManualStatusChange("ativa", "suspensa"), {
    outcome: "concluída",
  });
  assert.deepEqual(evaluateManualStatusChange("desativada", "ativa"), {
    outcome: "concluída",
  });
});

test("notifies only when a retained permission becomes usable after reactivation", () => {
  assert.equal(shouldNotifyPermissionRestored("suspensa", "ativa", true), true);
  assert.equal(shouldNotifyPermissionRestored("desativada", "ativa", true), true);
  assert.equal(shouldNotifyPermissionRestored("suspensa", "ativa", false), false);
  assert.equal(shouldNotifyPermissionRestored("ativa", "ativa", true), false);
  assert.equal(shouldNotifyPermissionRestored("ativa", "suspensa", true), false);
});

test("keeps the approved manual reason and failed-attempt categories", () => {
  assert.deepEqual(MANUAL_STATUS_REASON_CATEGORIES, [
    "Mudança de função/vínculo",
    "Afastamento temporário",
    "Segurança",
    "Correção administrativa",
    "Decisão formal",
    "Reativação autorizada",
  ]);
  assert.deepEqual(STATUS_CHANGE_FAILURE_CATEGORIES, [
    "autorização negada",
    "conta não encontrada no diretório",
    "conta suspensa/desativada",
    "transição inválida",
    "conflito de estado",
    "serviço indisponível",
  ]);
});
