import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gate = new URL('../docs/PRODUCAO-GATE.md', import.meta.url);

test('PLT-BAK-001: gate não ensina criar/restaurar backup fictício via API', async () => {
  const content = await readFile(gate, 'utf8');
  const backupSection = content.split('### 8. Backup e restauração')[1]?.split('### 9. ')[0];
  assert.ok(backupSection, 'backup gate section missing');
  assert.match(backupSection, /POST retorna \*\*503\*\*/);
  assert.match(backupSection, /não verificados/);
  assert.match(backupSection, /politica-tecnica-backup-recuperacao\.md/);
  assert.doesNotMatch(backupSection, /curl\s+-X\s+POST/);
  assert.doesNotMatch(backupSection, /# Verificar: backup_jobs is_restore_tested true/);
});
