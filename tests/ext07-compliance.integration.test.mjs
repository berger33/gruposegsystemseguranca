import test from 'node:test';
import assert from 'node:assert/strict';

// A integração é opt-in: o gate PostgreSQL dedicado fornece o cluster e a sessão.
// Sem DATABASE_URL não há fallback para fake pool nem banco herdado.
test('EXT-07 integração exige banco explicitamente quando habilitada', async () => {
  if (process.env.RUN_DATABASE_INTEGRATION !== '1') return;
  assert.ok(process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL, 'DATABASE_URL explícita é obrigatória');
  assert.match(process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL, /^postgres(?:ql)?:\/\/[^.\s]+(?:\.[^\s/]+)*\.invalid|^postgres(?:ql)?:\/\//);
});
