export type ThirdPartyErrorDescriptor={kind:string;title:string;detail:string;status:number;code:string|null;canRetry:boolean};
export declare const ABSENT:string;
export declare const EXTERNAL_BOUNDARY:string;
export declare const ERROR_MESSAGES:Readonly<Record<string,readonly [string,string]>>;
export declare function labelThirdParty(group:string,value:unknown):string;
export declare function honestText(value:unknown):string;
export declare function honestDate(value:unknown):string;
export declare function describeThirdPartyError(code:unknown,status?:number):ThirdPartyErrorDescriptor;
