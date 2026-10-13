// Conta de gestão (administrador) da Academia — a conta do Marcelo.
// Diferente dos usuários de demonstração: é uma conta real, de uso permanente, entregue
// com o sistema. O setor é `marcelo` (Gestão), que já tem acesso total às trilhas e
// permissão de gestão em access.mjs.
//
// A senha NUNCA é gravada no repositório: vem de ACADEMIA_ADMIN_PASSWORD ou, fora de
// produção, é sorteada na primeira execução e mostrada uma única vez no terminal.
import crypto from 'node:crypto';
import { hashPassword } from './auth.mjs';
import { userIdFor } from './demo-users.mjs';

export const ADMIN_NAME = 'Marcelo';
export const ADMIN_EMAIL = 'marcelo@gruposegsystemseguranca.com.br';
export const ADMIN_SECTOR = 'marcelo';

export const ADMIN_ENV_EMAIL = 'ACADEMIA_ADMIN_EMAIL';
export const ADMIN_ENV_PASSWORD = 'ACADEMIA_ADMIN_PASSWORD';

// Senha legível para digitar/conferir: 20 caracteres base64url (~120 bits).
export function gerarSenha() {
  return crypto.randomBytes(15).toString('base64url');
}

export function adminEmail(env = process.env) {
  return String(env[ADMIN_ENV_EMAIL] || ADMIN_EMAIL).trim().toLowerCase();
}

// Produção exige senha explícita: nada de senha sorteada e apenas impressa em produção.
export function adminPassword(env = process.env, { generate = gerarSenha } = {}) {
  const definida = String(env[ADMIN_ENV_PASSWORD] || '').trim();
  if (definida) return { password: definida, gerada: false };
  if (env.NODE_ENV === 'production') {
    throw new Error(`Defina ${ADMIN_ENV_PASSWORD} antes de criar a conta de gestão em produção.`);
  }
  return { password: generate(), gerada: true };
}

export function adminUserId(env = process.env) {
  return userIdFor(adminEmail(env));
}

// Cria a conta se ainda não existir. Idempotente: nunca sobrescreve a senha de uma conta
// já criada (para trocar a senha use scripts/definir-senha-admin.mjs).
export function ensureAdminAccount(state, { password, email = ADMIN_EMAIL, name = ADMIN_NAME, now = new Date().toISOString() } = {}) {
  state.users = state.users || [];
  const alvo = String(email).trim().toLowerCase();
  const id = userIdFor(alvo);
  const porId = state.users.find(u => u.id === id);
  const porEmail = state.users.find(u => String(u.email || '').trim().toLowerCase() === alvo);
  const existente = porId || porEmail;
  if (existente) {
    // Nunca promover ou reparar silenciosamente uma conta preexistente: ela pode
    // ser uma conta de demonstração com credencial conhecida. Só reutilize uma
    // conta de gestão já vinculada exatamente a este ID e e-mail.
    if (existente.id !== id || String(existente.email || '').trim().toLowerCase() !== alvo ||
        existente.kind !== 'gestao' || existente.sector !== ADMIN_SECTOR) {
      throw new Error(`Conflito na conta de gestão da Academia para ${alvo}; nenhuma conta existente foi alterada.`);
    }
    return { created: false, user: existente, id };
  }
  if (!password) return { created: false, user: null, id };
  const user = {
    id,
    name,
    email: alvo,
    sector: ADMIN_SECTOR,
    kind: 'gestao',
    createdAt: now,
    ...hashPassword(password),
  };
  state.users.push(user);
  return { created: true, user, id };
}

// Troca a senha de uma conta de gestão existente (usada pelo script de redefinição).
export function setAdminPassword(state, password, { email = ADMIN_EMAIL } = {}) {
  const id = userIdFor(String(email).trim().toLowerCase());
  const user = (state.users || []).find(u => u.id === id);
  if (!user) return { ok: false, error: 'conta_nao_encontrada' };
  const { salt, hash } = hashPassword(password);
  user.salt = salt;
  user.hash = hash;
  user.passwordChangedAt = new Date().toISOString();
  return { ok: true, email: user.email };
}
