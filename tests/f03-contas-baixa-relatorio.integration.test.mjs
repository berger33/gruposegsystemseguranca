import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import packagedChromium from '@sparticuz/chromium';
import { chromium } from 'playwright';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1';
const baseUrl = process.env.F03_BASE_URL;
let credentials, pool;
async function api(path, { method='GET', cookie='', body, headers={}, origin=true }={}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(cookie ? {Cookie:cookie} : {}), ...(origin && method !== 'GET' ? {Origin:baseUrl} : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const setCookie = response.headers.getSetCookie?.() || [];
  return { status: response.status, body: await response.json().catch(()=>({})), cookie: setCookie.map(v=>v.split(';')[0]).join('; ') };
}
async function login(role) {
  const account = credentials.find(item=>item.role===role); assert.ok(account);
  const response = await api('/api/admin/session',{method:'POST',body:{email:account.email,password:account.password}});
  assert.equal(response.status,200,JSON.stringify(response.body)); return response.cookie;
}
before(async()=>{ if(!RUN)return; credentials=JSON.parse(await readFile(process.env.F03_CREDENTIALS_FILE,'utf8')); pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:8}); });
after(async()=>pool?.end());

test('F03: conta → baixa → relatório é escopada, idempotente, transacional e visível na UI', {skip:!RUN,timeout:240000}, async()=>{
  const financeAccount=credentials.find(item=>item.role==='financeiro');
  const tiAccount=credentials.find(item=>item.role==='ti');
  const [{rows:[financeIdentity]},{rows:accounts},{rows:contracts}] = await Promise.all([
    pool.query('SELECT id FROM auth_identities WHERE email=$1',[financeAccount.email]),
    pool.query('SELECT id,display_name FROM client_accounts ORDER BY display_name'),
    pool.query('SELECT id,client_account_id FROM client_contracts ORDER BY title'),
  ]);
  const accountA=accounts[0].id, accountB=accounts[1].id;
  const contractA=contracts.find(c=>c.client_account_id===accountA).id;
  let ti=await login('ti');
  const defaults=await api(`/api/admin/permissions?identity=${financeIdentity.id}`,{cookie:ti});
  assert.equal(defaults.status,200);
  for(const item of defaults.body.permissions.filter(item=>item.permission.startsWith('financeiro.'))){
    const revoked=await api(`/api/admin/permissions/${item.id}`,{method:'DELETE',cookie:ti,body:{reason:'Gate F03 troca concessão organizacional por escopo sintético A.'}});
    assert.equal(revoked.status,200); ti=await login('ti');
  }
  for(const permission of ['financeiro.receivables.read','financeiro.receivables.write','financeiro.reports.read','financeiro.reports.generate']){
    const granted=await api('/api/admin/permissions',{method:'POST',cookie:ti,body:{identityId:financeIdentity.id,permission,scopeType:'account',scopeId:accountA,reason:`Gate F03 sintético: ${permission} somente na conta A.`}});
    assert.ok([201,409].includes(granted.status),JSON.stringify(granted.body)); ti=await login('ti');
  }
  const commercial=await login('comercial');
  assert.equal((await api('/api/admin/finance/f03/receivables',{cookie:commercial})).status,403);
  assert.equal((await api('/api/admin/finance/f03/receivables')).status,401);
  let finance=await login('financeiro');
  const date=new Date().toISOString().slice(0,10);
  const created=await api('/api/fin/receivables',{method:'POST',cookie:finance,body:{client_account_id:accountA,contract_id:contractA,competence_date:date,due_date:date,amount_cents:125000,description:'Recebível inteiramente sintético da jornada F03.'}});
  assert.equal(created.status,201,JSON.stringify(created.body));
  const receivableId=created.body.receivable.id;
  const queue=await api('/api/admin/finance/f03/receivables',{cookie:finance});
  assert.equal(queue.status,200); assert.ok(queue.body.receivables.some(r=>r.id===receivableId)); assert.ok(queue.body.receivables.every(r=>r.client_account_id===accountA));
  const accountBFilter=await api(`/api/admin/finance/f03/receivables?account=${accountB}`,{cookie:finance});
  assert.deepEqual(accountBFilter.body.receivables,[],'escopo A não vaza conta B');
  const createdB=await api('/api/fin/receivables',{method:'POST',cookie:finance,body:{client_account_id:accountB,competence_date:date,due_date:date,amount_cents:5000,description:'Recebível sintético fora do escopo da concessão A.'}});
  assert.equal(createdB.status,201);
  const deniedB=await api(`/api/admin/finance/f03/receivables/${createdB.body.receivable.id}/settlements`,{method:'POST',cookie:finance,body:{amount_cents:5000,reason:'Tentativa fora do escopo concedido para a conta A.'},headers:{'Idempotency-Key':`f03-denied-${randomUUID()}`}});
  assert.equal(deniedB.status,403);
  const legacy=await api('/api/hr/fin-payments',{method:'POST',cookie:finance,body:{account_type:'receber',receivable_id:receivableId,amount_cents:1,reason:'Atalho legado não pode efetuar baixa.'}});
  assert.equal(legacy.status,410); assert.equal(legacy.body.canonical_endpoint,'/api/admin/finance/f03/receivables/:id/settlements');
  const settleKey=`f03-settle-${randomUUID()}`;
  const settlementBody={amount_cents:125000,reason:'Baixa manual integral da conta sintética após conferência.'};
  assert.equal((await api(`/api/admin/finance/f03/receivables/${receivableId}/settlements`,{method:'POST',cookie:finance,body:settlementBody,headers:{'Idempotency-Key':settleKey},origin:false})).status,403);
  const settlements=await Promise.all(Array.from({length:5},()=>api(`/api/admin/finance/f03/receivables/${receivableId}/settlements`,{method:'POST',cookie:finance,body:settlementBody,headers:{'Idempotency-Key':settleKey}})));
  assert.ok(settlements.every(r=>[200,201].includes(r.status)),JSON.stringify(settlements)); assert.equal(settlements.filter(r=>r.status===201).length,1);
  const conflict=await api(`/api/admin/finance/f03/receivables/${receivableId}/settlements`,{method:'POST',cookie:finance,body:{...settlementBody,reason:'Conteúdo divergente sob a mesma chave idempotente.'},headers:{'Idempotency-Key':settleKey}});
  assert.equal(conflict.status,409); assert.equal(conflict.body.error,'idempotency_conflict');
  const effects=await pool.query(`SELECT r.status,r.amount_paid_cents,(SELECT count(*)::int FROM fin_payments p WHERE p.receivable_id=r.id) payments,(SELECT count(*)::int FROM fin_payment_history h WHERE h.receivable_id=r.id AND h.payment_id IS NOT NULL) history,(SELECT count(*)::int FROM audit_log a WHERE a.action='f03_receivable_settle' AND a.target=r.id::text) audits FROM fin_accounts_receivable r WHERE r.id=$1`,[receivableId]);
  assert.deepEqual({...effects.rows[0],amount_paid_cents:Number(effects.rows[0].amount_paid_cents)},{status:'recebido',amount_paid_cents:125000,payments:1,history:1,audits:1});
  const rollbackAccount=await api('/api/fin/receivables',{method:'POST',cookie:finance,body:{client_account_id:accountA,contract_id:contractA,competence_date:date,due_date:date,amount_cents:7000,description:'Recebível sintético para provar rollback da auditoria.'}});
  assert.equal(rollbackAccount.status,201);
  await pool.query('ALTER TABLE audit_log RENAME TO audit_log_f03_fault');
  try {
    const unavailable=await api(`/api/admin/finance/f03/receivables/${rollbackAccount.body.receivable.id}/settlements`,{method:'POST',cookie:finance,body:{amount_cents:7000,reason:'Esta baixa deve reverter sem a auditoria obrigatória.'},headers:{'Idempotency-Key':`f03-audit-fault-${randomUUID()}`}});
    assert.equal(unavailable.status,503);
  } finally { await pool.query('ALTER TABLE audit_log_f03_fault RENAME TO audit_log'); }
  const rolledBack=(await pool.query(`SELECT r.status,r.amount_paid_cents,(SELECT count(*)::int FROM fin_payments p WHERE p.receivable_id=r.id) payments FROM fin_accounts_receivable r WHERE r.id=$1`,[rollbackAccount.body.receivable.id])).rows[0];
  assert.deepEqual({...rolledBack,amount_paid_cents:Number(rolledBack.amount_paid_cents)},{status:'pendente',amount_paid_cents:0,payments:0});
  const reportKey=`f03-report-${randomUUID()}`, reportBody={account_id:accountA,period_start:date,period_end:date};
  const generated=await Promise.all(Array.from({length:4},()=>api('/api/admin/finance/f03/reports',{method:'POST',cookie:finance,body:reportBody,headers:{'Idempotency-Key':reportKey}})));
  assert.ok(generated.every(r=>[200,201].includes(r.status))); assert.equal(generated.filter(r=>r.status===201).length,1);
  const report=generated[0].body.report; assert.equal(Number(report.settled_cents),125000); assert.equal(Number(report.remaining_cents),7000); assert.equal(report.snapshot.external_delivery,false);
  assert.equal((await api('/api/admin/finance/f03/reports',{method:'POST',cookie:finance,body:{...reportBody,period_start:'2026-01-01'},headers:{'Idempotency-Key':reportKey}})).status,409);

  const browser=await chromium.launch({executablePath:await packagedChromium.executablePath(),args:packagedChromium.args.filter(a=>a!=='--disable-web-security'),headless:true});
  try{
    const context=await browser.newContext(); const [name,value]=finance.split('='); await context.addCookies([{name,value,url:baseUrl}]);
    const page=await context.newPage(); const failures=[]; page.on('pageerror',e=>failures.push(e.message)); page.on('response',r=>{if(new URL(r.url()).origin===baseUrl&&r.status()>=500)failures.push(`${r.status()} ${r.url()}`)});
    await page.goto(`${baseUrl}/admin/financeiro`,{waitUntil:'networkidle'}); await page.getByTestId('financeiro-workspace').waitFor();
    // O protocolo aparece duas vezes na tela (célula da tabela e botão "Abrir conta
    // <protocolo>"); mirar a célula mantém a asserção inequívoca sem afrouxá-la.
    await page.getByRole('cell',{name:created.body.receivable.protocol,exact:true}).waitFor(); await page.getByTestId('finance-tab-f03reports').click();
    await page.getByText('Não há integração bancária, baixa automática, SMTP nem envio externo.').waitFor(); assert.deepEqual(failures,[]);
  } finally { await browser.close(); }
});
