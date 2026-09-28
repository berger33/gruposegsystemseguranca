import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservability } from '../src/server/observability.mjs';

// PLT-OBS-001: no PostgreSQL real, a telemetria usa o mesmo pool. O wrapper
// não pode instrumentar sua própria escrita (recursão até connection timeout).
test('PLT-OBS-001 one business query schedules only one metrics insert', async () => {
  const queries = [];
  const pool = {
    async query(sql) {
      queries.push(typeof sql === 'string' ? sql : sql.text);
      if (queries.length > 5) throw new Error('recursive observability pool instrumentation');
      return { rows: [] };
    },
  };
  const obs = createObservability({ getPool: () => pool });
  obs.wrapPool(pool);
  await pool.query('SELECT id FROM client_accounts WHERE id=$1', ['synthetic']);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queries.length, 2, 'business query + one observability insert');
  assert.match(queries[1], /^INSERT INTO observability_db_metrics/);
  assert.equal(obs.getMetrics().db_queries_total, 1);
  assert.equal(obs.getMetrics().db_queries_failed, 0);
});

test('PLT-OBS-001 telemetry writes never create nested DB metrics', async () => {
  const queries = [];
  const pool = { async query(sql) { queries.push(sql); return { rows: [] }; } };
  const obs = createObservability({ getPool: () => pool });
  obs.wrapPool(pool);
  await pool.query('INSERT INTO observability_http_requests (path) VALUES ($1)', ['/qa']);
  await pool.query('INSERT INTO observability_alerts (severity) VALUES ($1)', ['warning']);
  assert.equal(queries.length, 2);
  assert.equal(obs.getMetrics().db_queries_total, 0);
});
