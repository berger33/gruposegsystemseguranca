// L01 — auxiliar de teste: provisiona uma conta de staff INDIVIDUAL e faz login
// pelo fluxo real de e-mail/senha.
//
// Antes do L01 as suítes de integração obtinham sessão administrativa com o
// token compartilhado (SITE_ADMIN_TOKEN_TI). Esse caminho agora é recusado por
// padrão (SEC-05), e a sessão passou a ter estado no servidor (SEC-04), então
// forjar cookie também não funciona. Os testes usam o caminho de verdade.

import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/lib/client-auth-core.mjs';

export const STAFF_TEST_PASSWORD = 'Integracao-Sintetica-7!';

/**
 * Cria identidade + credencial + perfil de staff diretamente no banco.
 * Isso representa o provisionamento administrativo, não o login: o login
 * continua sendo exercitado por HTTP.
 */
export async function provisionStaff(pool, { role = 'ti', status = 'active', email } = {}) {
  const id = randomUUID();
  const address = email || `qa-staff-${role}-${id.slice(0, 8)}@exemplo.invalid`;
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status)
     VALUES ($1,'staff',$2,$3,$4)`,
    [id, address, `QA Staff ${role}`, status],
  );
  await pool.query(
    `INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)`,
    [id, await hashPassword(STAFF_TEST_PASSWORD)],
  );
  await pool.query(
    `INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1,$2,'admin_system')`,
    [id, role],
  );
  return { id, email: address, password: STAFF_TEST_PASSWORD, role };
}

/**
 * Faz login por HTTP e devolve o cabeçalho Cookie pronto para reuso.
 * `api` é a função de requisição da própria suíte (mantém baseUrl/Origin).
 */
export async function loginStaff(api, { email, password = STAFF_TEST_PASSWORD }) {
  const res = await api('/api/admin/session', { method: 'POST', body: { email, password } });
  if (res.status !== 200) {
    throw new Error(`staff_login_failed status=${res.status} body=${JSON.stringify(res.body)}`);
  }
  return res.setCookie.map(item => item.split(';')[0]).join('; ');
}

/** Atalho: provisiona e autentica em um passo. */
export async function provisionAndLoginStaff(pool, api, options = {}) {
  const staff = await provisionStaff(pool, options);
  const cookie = await loginStaff(api, staff);
  return { ...staff, cookie };
}
