// Ponto de entrada da Academia Seg System Segurança (módulo isolado, em construção).
// Uso: npm start   (variáveis: PORT, HOST, ACADEMIA_DATA, ACADEMIA_DEMO_PASSWORD,
//                   ACADEMIA_ADMIN_EMAIL, ACADEMIA_ADMIN_PASSWORD)
// A conta de gestão (Marcelo) é criada no primeiro start; a senha aparece uma única vez aqui.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.mjs';
import { createSessions } from './src/auth.mjs';
import { createStore } from './src/store.mjs';
import { ensureAdminAccount, adminEmail, adminPassword } from './src/admin-users.mjs';
import { ensureConteudo } from './src/conteudo-gestao.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.ACADEMIA_DATA || path.join(here, 'data', 'academia.json');

const store = createStore({ file: DATA_FILE });

// Conta de gestão (Marcelo). A senha não é versionada: vem de ACADEMIA_ADMIN_PASSWORD ou,
// fora de produção, é sorteada agora e mostrada uma única vez neste terminal.
const credencial = adminPassword();
const conta = ensureAdminAccount(store.state, { password: credencial.password, email: adminEmail() });
if (conta.created) {
  store.save();
  console.log('');
  console.log('  Conta de gestão criada (administrador da Academia).');
  console.log(`  Login: ${conta.user.email}`);
  console.log(`  Senha: ${credencial.password}`);
  console.log('  Guarde agora: a senha não fica gravada — apenas o hash. Troque com');
  console.log('  `node scripts/definir-senha-admin.mjs` ou por ACADEMIA_ADMIN_PASSWORD.');
  console.log('');
} else if (credencial.gerada) {
  console.log(`[academia] conta de gestão já existe (${conta.user ? conta.user.email : adminEmail()}); senha inalterada.`);
}

// Garante a camada de conteúdo no estado já existente (aditivo: só cria o que faltar).
ensureConteudo(store.state);
store.save();

const app = createApp({ store, sessions: createSessions() });

http.createServer(app).listen(PORT, HOST, () => {
  console.log(`Academia Seg System Segurança em http://${HOST}:${PORT} (dados: ${DATA_FILE})`);
});
