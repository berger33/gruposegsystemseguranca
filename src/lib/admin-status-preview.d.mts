export type AdminAccountStatus = "ativa" | "suspensa" | "desativada";

export declare const MANUAL_STATUS_REASON_CATEGORIES: readonly [
  "Mudança de função/vínculo",
  "Afastamento temporário",
  "Segurança",
  "Correção administrativa",
  "Decisão formal",
  "Reativação autorizada",
];

export declare const STATUS_CHANGE_FAILURE_CATEGORIES: readonly [
  "autorização negada",
  "conta não encontrada no diretório",
  "conta suspensa/desativada",
  "transição inválida",
  "conflito de estado",
  "serviço indisponível",
];

export type ManualStatusChangeResult =
  | { outcome: "concluída"; failureCategory?: never }
  | { outcome: "falhou"; failureCategory: "transição inválida" };

export declare function evaluateManualStatusChange(
  currentStatus: AdminAccountStatus,
  requestedStatus: AdminAccountStatus,
): ManualStatusChangeResult;

export declare function shouldNotifyPermissionRestored(
  previousStatus: AdminAccountStatus,
  nextStatus: AdminAccountStatus,
  hasRetainedPermission: boolean,
): boolean;
