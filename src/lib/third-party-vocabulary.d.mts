export type ThirdPartyErrorDescriptor={code:string|null,status:number,title:string,detail:string,kind:'denied'|'failure'};
export function describeThirdPartyError(code:string|null,status?:number):ThirdPartyErrorDescriptor;
export function label(group:string,value:unknown):string;
export const ENUM_LABELS: Record<string,Record<string,string>>;
export const ABSENCE: Record<string,string>;
export const EXTERNAL_BOUNDARY:string;
