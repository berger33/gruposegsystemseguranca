// Tipos do vocabulário UX-07 / EXT-01 (família FROTA).
export type FleetErrorKind =
  | 'network' | 'error' | 'invalid' | 'conflict' | 'denied' | 'not_found' | 'unavailable';

export type FleetErrorDescriptor = {
  kind: FleetErrorKind | string;
  title: string;
  detail: string;
  status: number;
  canRetry: boolean;
  code: string | null;
};

export type FleetTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const ABSENT: string;
export const NO_RESPONSIBLE: string;
export const FLEET_NOT_REGISTERED: string;

export function describeFleetError(code: string | null | undefined, status?: number): FleetErrorDescriptor;
export function fleetErrorMessage(code: string | null | undefined, status?: number): string;
export function fleetErrorVariant(descriptor: FleetErrorDescriptor): 'denied' | 'error';
export function fleetErrorFootnote(descriptor: FleetErrorDescriptor): string;

export function enumLabel(group: string, value: unknown): string;
export function enumTone(group: string, value: unknown): FleetTone;

export function vehicleStatusLabel(value: unknown): string;
export function vehicleStatusTone(value: unknown): FleetTone;
export function fuelTypeLabel(value: unknown): string;
export function fuelTypeTone(value: unknown): FleetTone;
export function vehicleOriginLabel(value: unknown): string;
export function vehicleOriginTone(value: unknown): FleetTone;
export function alertStatusLabel(value: unknown): string;
export function alertStatusTone(value: unknown): FleetTone;
export function alertKindLabel(value: unknown): string;
export function fleetEventLabel(value: unknown): string;
export function fleetEventTone(value: unknown): FleetTone;
export function documentStateLabel(value: unknown): string;
export function documentStateTone(value: unknown): FleetTone;

export function honestDate(value: unknown): string;
export function honestDateTime(value: unknown): string;
export function count(value: unknown): string;
export function honestNumber(value: unknown, maximumFractionDigits?: number): string;
export function honestMoneyFromCents(value: unknown): string;
export function honestMileage(value: unknown): string;
export function honestLiters(value: unknown): string;
export function honestText(value: unknown): string;
export function responsibleLabel(value: unknown): string;
export function ruleSummary(rule: unknown): string;
export function alertComponentSummary(component: unknown): string;

export const ERROR_MESSAGES: Readonly<Record<string, {
  kind: string; title: string; detail: string; canRetry: boolean;
}>>;
export const ENUMS: Readonly<Record<string, Record<string, [string, FleetTone]>>>;
