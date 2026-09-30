// Shared fail-closed transport and transactional audit for L04 publishing.
export const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function fail(status, error) { throw Object.assign(new Error(error), { status }); }
export function textField(v, min, max, name) {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max) fail(400, 'invalid_' + name);
  return v.trim();
}
export async function body(req) {
  let size = 0; const parts = [];
  for await (const part of req) { size += part.length; if (size > 64000) fail(413, 'body_too_large'); parts.push(part); }
  try { const b = JSON.parse(Buffer.concat(parts).toString()); if (!b || typeof b !== 'object' || Array.isArray(b)) fail(400, 'invalid_json'); return b; }
  catch { fail(400, 'invalid_json'); }
}
export function send(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(data));
}
export function endpoint(fn) { return async (req,res,...args) => {
  try { await fn(req,res,...args); } catch(e) { if(!e.status)console.error('L04_ERROR',JSON.stringify({code:e.code,constraint:e.constraint,detail:['42804','42P08','42703','42702','42601'].includes(e.code)?e.message:undefined})); send(res,e.status || 503,{error:e.status ? e.message : 'operation_unavailable'}); }
}; }
export async function authorize(req, {sameOrigin, requireSession, requireRole}, roles=['admin','marcelo','ti']) {
  if (req.method !== 'GET' && !sameOrigin(req)) fail(403,'same_origin_required');
  const s=await requireSession(req);
  if (!s?.identityId) fail(401,'session_required');
  if (!requireRole(s,roles)) fail(403,'role_required');
  return s;
}
export async function transaction(pool, fn) {
  const c=await pool.connect();
  try { await c.query('BEGIN'); const result=await fn(c); await c.query('COMMIT'); return result; }
  catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
export async function audit(c,s,action,target) {
  await c.query("INSERT INTO auth_access_audit(actor_kind,actor_id,action,target,result,detail_category) VALUES($1,$2,$3,$4,'allowed','none')",[s.role,s.identityId,action,target]);
}
