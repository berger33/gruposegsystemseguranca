import { describeThirdPartyError, type ThirdPartyErrorDescriptor } from './third-party-vocabulary.mjs';
export type ThirdPartyResult<T>={ok:true;status:number;data:T}|{ok:false;status:number;error:ThirdPartyErrorDescriptor;payload:unknown};
export async function thirdPartyRequest<T=unknown>(url:string,init:RequestInit={}):Promise<ThirdPartyResult<T>>{
 let response:Response;
 try { response=await fetch(url,{cache:'no-store',credentials:'same-origin',...init,headers:{accept:'application/json',...(init.body?{'content-type':'application/json'}:{}),...(init.headers||{})}}); }
 catch { return {ok:false,status:0,error:describeThirdPartyError(null,0),payload:null}; }
 let payload:unknown=null; try { payload=await response.json(); } catch {}
 if(!response.ok){const code=payload&&typeof payload==='object'&&typeof (payload as {error?:unknown}).error==='string'?(payload as {error:string}).error:null;return {ok:false,status:response.status,error:describeThirdPartyError(code,response.status),payload};}
 return {ok:true,status:response.status,data:payload as T};
}
