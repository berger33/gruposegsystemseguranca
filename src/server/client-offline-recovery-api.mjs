import { createHash, randomBytes, randomUUID } from "node:crypto";

const TTL_MS = 15 * 60 * 1000;
const METHODS = new Set(["presencial", "retorno_contato_conhecido"]);
const hash = value => createHash("sha256").update(String(value)).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));

export function createClientOfflineRecoveryApi(ctx) {
  const json = ctx.json;
  async function body(req, res) {
    try { return JSON.parse(await new Promise((resolve, reject) => { let value=""; req.on("data",c=>{value+=c;if(value.length>20_000)reject(new Error("large"));});req.on("end",()=>resolve(value||"{}"));req.on("error",reject); })); }
    catch { json(res,400,{error:"invalid_json"}); return null; }
  }
  function sameOrigin(req,res) { return ctx.sameOrigin(req,res); }
  async function audit(db, actorKind, actorId, action, target, result="allowed", category="none") {
    await db.query(`INSERT INTO auth_access_audit(actor_kind,actor_id,action,target,result,detail_category) VALUES($1,$2,$3,$4,$5,$6)`,[actorKind,actorId,action,target,result,category]);
  }
  async function manager(req,res) {
    const s=await ctx.readAdminSession(req); if(!s){json(res,401,{error:"admin_session_required"});return null;}
    if(s.role!=="ti"||!s.identityId){json(res,403,{error:"individual_ti_required"});return null;}
    const db=ctx.getPool();
    const allowed=await db.query(`SELECT 1 FROM auth_permissions WHERE identity_id=$1 AND permission='client_recovery.manage' AND revoked_at IS NULL AND scope_type='global'`,[s.identityId]);
    if(!allowed.rowCount){json(res,403,{error:"forbidden"});return null;} return {s,db};
  }
  async function publicRequest(req,res) {
    if(req.method!=="POST") return json(res,405,{error:"method_not_allowed"},{Allow:"POST"});
    if(!sameOrigin(req,res))return; const b=await body(req,res);if(!b)return;
    const email=String(b.email||"").trim().toLowerCase(); const generic={ok:true,delivery:"manual_review",message:"Se a conta for elegível, a equipe autorizada poderá validar o pedido por um canal conhecido."};
    if(!email||email.length>254||!email.includes("@"))return json(res,202,generic);
    const db=ctx.getPool(); let c;
    try { c=await db.connect();await c.query("BEGIN");
      const found=await c.query(`SELECT id FROM auth_identities WHERE kind='client' AND email=$1 AND status='active' FOR SHARE`,[email]);
      if(found.rowCount){const id=found.rows[0].id;
        await c.query(`UPDATE client_access_recovery_requests SET status='expirada' WHERE identity_id=$1 AND status='autorizada' AND expires_at<=NOW()`,[id]);
        await c.query(`UPDATE auth_email_tokens SET superseded_at=NOW() WHERE identity_id=$1 AND kind='password_reset' AND expires_at<=NOW() AND used_at IS NULL AND superseded_at IS NULL`,[id]);
        await c.query(`INSERT INTO client_access_recovery_requests(identity_id,requested_email_hash,origin_hash) VALUES($1,$2,$3) ON CONFLICT (identity_id) WHERE status IN ('pendente','autorizada') DO NOTHING`,[id,hash(email),hash(req.socket?.remoteAddress||"unknown")]);await audit(c,"client",id,"client_recovery_request",id);}
      await c.query("COMMIT");return json(res,202,generic);
    } catch(e){if(c)await c.query("ROLLBACK").catch(()=>{});return json(res,503,{error:"recovery_unavailable"});} finally{c?.release();}
  }
  async function list(req,res) {
    if(req.method!=="GET")return json(res,405,{error:"method_not_allowed"},{Allow:"GET"}); const m=await manager(req,res);if(!m)return;
    try {const q=await m.db.query(`SELECT r.id,r.status,r.requested_at,r.authorized_at,r.expires_at,i.email,i.display_name FROM client_access_recovery_requests r JOIN auth_identities i ON i.id=r.identity_id WHERE r.status IN ('pendente','autorizada') ORDER BY r.requested_at DESC LIMIT 100`);return json(res,200,{items:q.rows,note:"Canal local: nenhum e-mail foi enviado."});}catch{return json(res,503,{error:"recovery_unavailable"});}
  }
  async function authorize(req,res,id) {
    if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"},{Allow:"POST"});if(!sameOrigin(req,res))return;if(!uuid(id))return json(res,400,{error:"invalid_request_id"});
    const m=await manager(req,res);if(!m)return;const b=await body(req,res);if(!b)return;const method=String(b.method||"");const reason=String(b.reason||"").trim();if(!METHODS.has(method)||reason.length<30||reason.length>500)return json(res,400,{error:"invalid_authorization_evidence"});
    let c;try{c=await m.db.connect();await c.query("BEGIN");const q=await c.query(`SELECT r.*,i.email FROM client_access_recovery_requests r JOIN auth_identities i ON i.id=r.identity_id WHERE r.id=$1 FOR UPDATE OF r`,[id]);const r=q.rows[0];if(!r)return await c.query("ROLLBACK"),json(res,404,{error:"recovery_not_found"});if(r.status!=="pendente")return await c.query("ROLLBACK"),json(res,409,{error:"recovery_not_pending"});
      const raw=token(),tokenId=randomUUID(),expires=new Date(Date.now()+TTL_MS);await c.query(`UPDATE auth_email_tokens SET superseded_at=NOW() WHERE identity_id=$1 AND kind='password_reset' AND used_at IS NULL AND superseded_at IS NULL`,[r.identity_id]);await c.query(`INSERT INTO auth_email_tokens(id,identity_id,kind,email,token_hash,expires_at) VALUES($1,$2,'password_reset',$3,$4,$5)`,[tokenId,r.identity_id,r.email,hash(raw),expires]);await c.query(`UPDATE client_access_recovery_requests SET status='autorizada',authorized_by_identity=$2,authorization_method=$3,authorization_reason=$4,token_id=$5,authorized_at=NOW(),expires_at=$6 WHERE id=$1`,[id,m.s.identityId,method,reason,tokenId,expires]);await audit(c,"staff",m.s.identityId,"client_recovery_authorize",id);await c.query("COMMIT");return json(res,200,{ok:true,expiresAt:expires.toISOString(),resetUrl:`${ctx.baseUrl}/cliente/redefinir-senha?token=${raw}`,displayOnce:true,delivery:"manual_restricted_channel"});
    }catch{if(c)await c.query("ROLLBACK").catch(()=>{});return json(res,503,{error:"recovery_unavailable"});}finally{c?.release();}
  }
  async function revoke(req,res,id){if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"},{Allow:"POST"});if(!sameOrigin(req,res))return;const m=await manager(req,res);if(!m)return;let c;try{c=await m.db.connect();await c.query("BEGIN");const q=await c.query(`SELECT status,token_id FROM client_access_recovery_requests WHERE id=$1 FOR UPDATE`,[id]);if(!q.rowCount)return await c.query("ROLLBACK"),json(res,404,{error:"recovery_not_found"});if(!["pendente","autorizada"].includes(q.rows[0].status))return await c.query("ROLLBACK"),json(res,409,{error:"recovery_terminal"});if(q.rows[0].token_id)await c.query(`UPDATE auth_email_tokens SET superseded_at=NOW() WHERE id=$1 AND used_at IS NULL`,[q.rows[0].token_id]);await c.query(`UPDATE client_access_recovery_requests SET status='revogada',revoked_at=NOW() WHERE id=$1`,[id]);await audit(c,"staff",m.s.identityId,"client_recovery_revoke",id);await c.query("COMMIT");return json(res,200,{ok:true});}catch{if(c)await c.query("ROLLBACK").catch(()=>{});return json(res,503,{error:"recovery_unavailable"});}finally{c?.release();}}
  return {publicRequest,list,authorize,revoke};
}
