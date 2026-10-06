export type FleetErrorDescriptor = {
  code: string | null;
  status: number;
  kind: string;
  title: string;
  detail: string;
  canRetry: boolean;
};
export const ERROR_MESSAGES: Readonly<
  Record<
    string,
    { kind: string; title: string; detail: string; canRetry: boolean }
  >
>;
export const ENUMS: Readonly<
  Record<string, Record<string, readonly [string, string]>>
>;
export function describeFleetError(
  code?: string | null,
  status?: number,
): FleetErrorDescriptor;
export function fleetErrorVariant(
  item: FleetErrorDescriptor,
): "denied" | "error";
export function fleetErrorFootnote(item: FleetErrorDescriptor): string;
export function enumLabel(group: string, value?: string | null): string;
export function enumTone(group: string, value?: string | null): string;
export function vehicleStatusLabel(value?: string | null): string;
export function fuelTypeLabel(value?: string | null): string;
export function alertStatusLabel(value?: string | null): string;
export function alertKindLabel(value?: string | null): string;
export function originLabel(value?: string | null): string;
export function maintenanceTypeLabel(value?: string | null): string;
export function documentTypeLabel(value?: string | null): string;
export function eventTypeLabel(value?: string | null): string;
export function honestText(value: unknown, absence?: string): string;
export function honestDate(value: unknown, absence?: string): string;
export function honestDateTime(value: unknown, absence?: string): string;
export function honestMoney(value: unknown, absence?: string): string;
