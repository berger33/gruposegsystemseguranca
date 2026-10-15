import {describeContinuityError,continuityServerMessage,type ContinuityErrorDescriptor} from './continuity-vocabulary.mjs';
export type ContinuityResult<T>={ok:true;status:number;data:T}|{ok:false;status:number;error:ContinuityErrorDescriptor;payload:unknown};
export async function continuityRequest<T=unknown>(url:string,init:RequestInit={}):Promise<ContinuityResult<T>>{
 let response:Response;try{response=await fetch(url,{cache:'no-store',credentials:'same-origin',...init,headers:{accept:'application/json',...(init.body?{'content-type':'application/json'}:{}),...(init.headers||{})}});}catch{return{ok:false,status:0,error:describeContinuityError(null,0),payload:null};}
 let payload:unknown=null;try{payload=await response.json();}catch{}
 if(!response.ok){const code=payload&&typeof payload==='object'&&typeof (payload as {error?:unknown}).error==='string'?(payload as {error:string}).error:null;return{ok:false,status:response.status,error:describeContinuityError(code,response.status),payload};}
 return{ok:true,status:response.status,data:payload as T};
}
export {continuityServerMessage};
export type {ContinuityErrorDescriptor };
// UX-PRO-07L — leitura honesta (aditivo): 2xx sem a forma canônica nunca é
// ausência de plano. `continuityRequest` acima permanece INTACTO. O código
// abaixo é diagnóstico desta tela (o servidor nunca o devolve), fora do
// vocabulário anti-deriva. Mesma decisão das fatias 07F-07K.
export const INVALID_CONTINUITY_RESPONSE='invalid_continuity_response';
export function invalidContinuityResponse(status:number):ContinuityErrorDescriptor{return{kind:'unavailable',title:'A resposta de continuidade não pôde ser lida',detail:'O servidor respondeu sem os dados esperados. Isto não significa que não existam planos, simulados ou eventos registrados.',code:INVALID_CONTINUITY_RESPONSE,status,canRetry:true};}
export async function continuityRead<T>(url:string,isValid:(data:unknown)=>boolean):Promise<ContinuityResult<T>>{const result=await continuityRequest<T>(url);if(!result.ok)return result;if(!isValid(result.data))return{ok:false,status:result.status,error:invalidContinuityResponse(result.status),payload:result.data};return result;}
