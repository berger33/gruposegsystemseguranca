// Persistência em arquivo JSON (escrita atômica). Sem banco, sem dependências.
import fs from 'node:fs';
import path from 'node:path';
import { buildSeedState, migrateState } from './seed.mjs';

export function createStore({ file, seed = buildSeedState } = {}) {
  let state = null;
  if (file && fs.existsSync(file)) {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  if (!state) state = seed();
  else migrateState(state);
  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  };
  if (!file || !fs.existsSync(file)) save();
  return { state, save };
}
