#!/usr/bin/env node
// Gate focal UX-11. O cluster real e descartável é delegado ao gate herdado;
// nunca aceita o banco do operador e a falha de leitura deve ser injetada no browser.
import {spawn} from 'node:child_process';
if(process.env.DATABASE_URL||process.env.DATABASE_MIGRATION_URL||process.env.RUN_DATABASE_INTEGRATION_REMOTE==='1'){console.error('QA_PG_REFUSED: banco do operador não é aceito');process.exit(2)}
const root=new URL('..',import.meta.url).pathname;
const child=spawn(process.execPath,['--test','--test-concurrency=1','tests/ext10-continuity.integration.test.mjs'],{cwd:root,env:{...process.env,DATABASE_URL:'',DATABASE_MIGRATION_URL:'',RUN_DATABASE_INTEGRATION:'1',QA_UX_CONTINUITY:'1',NEXT_TELEMETRY_DISABLED:'1'},stdio:'inherit'});
child.on('exit',code=>process.exit(code??1));
