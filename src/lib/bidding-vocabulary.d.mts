export type BiddingErrorKind = 'denied'|'invalid'|'conflict'|'not_found'|'unavailable'|'network'|'error';
export interface BiddingErrorDescriptor { code: string|null; status: number; kind: BiddingErrorKind; title: string; detail: string; canRetry: boolean }
export const ERROR_MESSAGES: Readonly<Record<string, Readonly<{kind:BiddingErrorKind;title:string;detail:string;canRetry:boolean}>>>;
export function describeBiddingError(code:string|null|undefined,status?:number):BiddingErrorDescriptor;
export function biddingErrorVariant(error:BiddingErrorDescriptor):'denied'|'error';
export function biddingErrorFootnote(error:BiddingErrorDescriptor):string;
export function biddingLabel(value:unknown):string;
export const biddingStatusLabel: typeof biddingLabel;
export const deadlineKindLabel: typeof biddingLabel;
export const deadlineSourceLabel: typeof biddingLabel;
export const deadlineSituationLabel: typeof biddingLabel;
export const proposalDecisionLabel: typeof biddingLabel;
export const checklistStatusLabel: typeof biddingLabel;
export function honestText(value:unknown):string;
export function honestDate(value:unknown):string;
export function honestDateTime(value:unknown):string;
export function honestMoney(value:number|null|undefined):string;
export function count(value:number|null|undefined,singular:string,plural:string):string;
export const EXTERNAL_BOUNDARY:string;
