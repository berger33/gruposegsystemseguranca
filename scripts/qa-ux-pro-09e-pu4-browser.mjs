#!/usr/bin/env node
// Gate hermético de navegador do PU4 (UX-PRO-09E): executa a suíte em subprocesso
// com UX_PU4_REQUIRE_BROWSER=1 e audita o resumo TAP (piso medido = 5, 0 skip,
// 0 falha, 0 todo). Qualquer skip silencioso reprova mesmo que o processo saia 0.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';

const root = path.resolve(import.meta.dirname, '..');
const target = process.argv[2] || 'tests/ux-pro-09e-pu4.test.mjs';

const child = spawn(process.execPath, ['--test', target], {
  cwd: root,
  env: {
    ...process.env,
    UX_PU4_REQUIRE_BROWSER: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const journey = await collectTap(child);
const tap = assertTapSummary(journey.output, {
  minimum: 5,
  truncated: journey.truncated,
  label: 'UX-PRO-09E PU4 browser',
});
process.exit(journey.code === 0 && tap.ok ? 0 : (journey.code || 1));
