export const MANUAL_STATUS_REASON_CATEGORIES = [
  "Mudança de função/vínculo",
  "Afastamento temporário",
  "Segurança",
  "Correção administrativa",
  "Decisão formal",
  "Reativação autorizada",
];

export const STATUS_CHANGE_FAILURE_CATEGORIES = [
  "autorização negada",
  "conta não encontrada no diretório",
  "conta suspensa/desativada",
  "transição inválida",
  "conflito de estado",
  "serviço indisponível",
];

export function evaluateManualStatusChange(currentStatus, requestedStatus) {
  if (currentStatus === requestedStatus) {
    return { outcome: "falhou", failureCategory: "transição inválida" };
  }

  return { outcome: "concluída" };
}

export function shouldNotifyPermissionRestored(previousStatus, nextStatus, hasRetainedPermission) {
  return previousStatus !== "ativa" && nextStatus === "ativa" && hasRetainedPermission;
}
