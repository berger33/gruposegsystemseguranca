import test from 'node:test';
test('EXT-07 integração é executada pelo gate PostgreSQL dedicado',()=>{if(!process.env.RUN_DATABASE_INTEGRATION) return; throw new Error('use npm run test:ext07-compliance:pg');});
