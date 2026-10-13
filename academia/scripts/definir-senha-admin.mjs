// Define (ou troca) a senha da conta de gestão da Academia — a conta do Marcelo.
//
// Uso:
//   ACADEMIA_ADMIN_PASSWORD='nova senha' node scripts/definir-senha-admin.mjs
//   node scripts/definir-senha-admin.mjs --gerar          # sorteia e imprime a nova senha
//   node scripts/definir-senha-admin.mjs --email outro@exemplo.com
//
// A senha não é gravada no arquivo: apenas o hash (sal + scrypt), como nos demais usuários.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../src/store.mjs';
import { setAdminPassword, adminEmail, adminPassword as senhaDeAmbiente, gerarSenha } from '../src/admin-users.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const DATA_FILE = process.env.ACADEMIA_DATA || path.join(here, '..', 'data', 'academia.json');
const email = arg('--email') || adminEmail();
const gerar = args.includes('--gerar');

let senha = senhaDeAmbiente();
if (gerar || !senha.password) {
  senha = { password: gerarSenha(), gerada: true };
}

const store = createStore({ file: DATA_FILE });
const resultado = setAdminPassword(store.state, senha.password, { email });
if (!resultado.ok) {
  console.error(`Conta não encontrada em ${DATA_FILE}. Inicie o servidor uma vez para criá-la (npm start).`);
  process.exitCode = 1;
} else {
  store.save();
  console.log(`Senha da conta de gestão atualizada: ${resultado.email}`);
  if (senha.gerada) {
    console.log(`Nova senha: ${senha.password}`);
    console.log('Guarde agora: só o hash fica gravado.');
  } else {
    console.log('A senha definida em ACADEMIA_ADMIN_PASSWORD foi aplicada (não é mostrada aqui).');
  }
}
