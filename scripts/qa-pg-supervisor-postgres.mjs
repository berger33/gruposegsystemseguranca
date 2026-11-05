#!/usr/bin/env node
// Provas negativas do piloto: clusters PostgreSQL reais exclusivamente locais.
// O sucesso deste gate significa que falhas induzidas foram detectadas, não
// que os clusters defeituosos ficaram saudáveis. Nenhum URL externo é aceito.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { superviseLocalPg, PG_PHASE_LIMITS } from './lib/qa-pg-supervisor.mjs';

if (process.argv.length > 2 || process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: local-only negative gate; unset inherited URLs.');
  process.exit(2);
}
if (process.platform === 'win32') {
  console.error('QA_PG_SUPERVISOR_PLATFORM_UNVALIDATED: POSIX fault gate is not a Windows proof.');
  process.exit(2);
}
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-pg-fault-code-'));
const entry = path.join(directory, 'worker.mjs');
let result = 1;
try {
  await writeFile(entry, `import EmbeddedPostgres from ${JSON.stringify(import.meta.resolve('embedded-postgres'))};
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
const phase=name=>process.send({type:'phase',name});
const collision=process.argv[2]==='collision';
const probe=createServer();
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;
if(!collision)await new Promise(resolve=>probe.close(resolve));
const postgres=new EmbeddedPostgres({databaseDir:path.join(process.env.QA_PG_DIRECTORY,'data'),
 port,user:'seg_qa',password:randomBytes(24).toString('hex'),persistent:false,
 postgresFlags:['-c','listen_addresses=127.0.0.1'],onLog:()=>{},onError:()=>{}});
phase('initialise');await postgres.initialise();phase('start');
if(collision){
 let rejected=false;
 try{await postgres.start();}catch(error){rejected=true;if(error!==undefined)throw new Error('start_rejection_contract_changed');}
 if(!rejected)throw new Error('collision_not_detected');
 console.log('QA_PG_FAULT_OBSERVED: start_rejected_undefined');
}else{
 await postgres.start();
 const exited=new Promise(resolve=>postgres.process.once('exit',resolve));
 postgres.process.kill('SIGKILL');await exited;
 console.log('QA_PG_FAULT_OBSERVED: cluster_killed_before_stop');
}
phase('stop');await postgres.stop();
// Na versão medida, stop() nunca resolve nesses dois cenários. Se isso mudar,
// esta prova exige revisão: não fingir que reproduziu o mesmo defeito.
throw new Error('stop_returned_contract_changed');`);
  for (const mode of ['collision', 'killed']) {
    const check = await superviseLocalPg({ entry, args: [mode],
      limits: { ...PG_PHASE_LIMITS, stop: 1_000 }, graceMs: 1_000 });
    assert.equal(check.code, 1, 'falha induzida deve ser vermelha para o supervisor');
    assert.equal(check.reason, 'timeout-stop', 'defeito deve ter sido reproduzido na fase stop');
    assert.equal(check.cleaned, true, 'não passar sem limpeza confirmada');
    console.log(`QA_PG_SUPERVISOR_NEGATIVE_PASS: ${mode}; expected_exit=1; cleanup=true`);
  }
  result = 0;
} catch {
  // Não publicar erro bruto de initdb nem senha sintética: categoria basta.
  console.error('QA_PG_SUPERVISOR_NEGATIVE_FAILED: fault contract or cleanup not verified');
} finally { await rm(directory, { recursive: true, force: true }); }
process.exit(result);
