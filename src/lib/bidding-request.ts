// UX-08 / EXT-03 — transporte seguro. Não reescreve URL, método, corpo ou
// Idempotency-Key. O payload cru de erro é preservado para apresentação.
import { describeBiddingError, type BiddingErrorDescriptor } from './bidding-vocabulary.mjs';
export type BiddingResult<T> =
  | { ok:true; status:number; data:T }
  | { ok:false; status:number; error:BiddingErrorDescriptor; payload:unknown };
export async function biddingRequest<T=unknown>(url:string, init:RequestInit={}):Promise<BiddingResult<T>> {
  let response:Response;
  try {
    response=await fetch(url,{cache:'no-store',credentials:'same-origin',...init,headers:{accept:'application/json',...(init.body?{'content-type':'application/json'}:{}),...(init.headers||{})}});
  } catch { return {ok:false,status:0,error:describeBiddingError(null,0),payload:null}; }
  let payload:unknown=null;
  try { payload=await response.json(); } catch { payload=null; }
  if (!response.ok) {
    const code=payload && typeof payload==='object' && typeof (payload as {error?:unknown}).error==='string' ? (payload as {error:string}).error : null;
    return {ok:false,status:response.status,error:describeBiddingError(code,response.status),payload};
  }
  return {ok:true,status:response.status,data:payload as T};
}
export type { BiddingErrorDescriptor };
