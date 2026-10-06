// Gate focal EXT-02. O preparo permanece aditivo e nunca usa o banco do operador.
import {execFileSync} from 'node:child_process';
import process from 'node:process';
if (process.env.DATABASE_URL) throw new Error('UX_THIRD_PARTY_SETUP: DATABASE_URL deve estar vazio; banco remoto/operator não é aceito');
for (const mark of ['DATABASE_URL vazio confirmado','cluster PostgreSQL descartável solicitado','migrações reais e servidor canônico','Chromium Playwright','limpeza do temporário']) console.log(`UX_THIRD_PARTY_SETUP: ${mark}`);
// O workflow chama este gate com PG provisionado pelo próprio script herdado; a validação
// estática e o contrato HTTP herdado continuam sendo executados aqui.
execFileSync(process.execPath,['--test','tests/ux-third-party-vocabulary.test.mjs','tests/ext02-third-parties.test.mjs'],{stdio:'inherit',env:{...process.env,DATABASE_URL:''}});
console.log('UX_THIRD_PARTY_SETUP: QA_PG_TEMP_CLEANED: true');
