// Ponto de entrada da Academia Seg System Segurança (módulo isolado, em construção).
// Uso: npm start   (variáveis: PORT, HOST, ACADEMIA_DATA, ACADEMIA_DEMO_PASSWORD)
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.mjs';
import { createSessions } from './src/auth.mjs';
import { createStore } from './src/store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.ACADEMIA_DATA || path.join(here, 'data', 'academia.json');

const store = createStore({ file: DATA_FILE });
const app = createApp({ store, sessions: createSessions() });

http.createServer(app).listen(PORT, HOST, () => {
  console.log(`Academia Seg System Segurança em http://${HOST}:${PORT} (dados: ${DATA_FILE})`);
});
