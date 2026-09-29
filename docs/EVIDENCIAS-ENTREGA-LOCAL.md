# Evidências — entrega local integral

Cada linha registra cenário, perfil, comando, resultado observado e commit.
Evidência de lote antigo não vale para SHA novo: reexecutar após alterações.

Ambiente desta sessão: Linux x86_64, Node v22.22.3, npm 10.9.8, PostgreSQL 17.9
(`embedded-postgres`, cluster temporário por execução). **O equipamento-alvo é
Windows**; nada aqui comprova execução em Windows.

---

## L00 — Base íntegra e controle confiável

Commit verificado: `931e028`.

| # | Cenário | Comando | Esperado | Observado |
|---|---|---|---|---|
| L00-1 | Instalação reproduzível pelo lockfile | `npm ci` | sem dependência ausente | 62 pacotes, 0 vulnerabilidades, exit 0 |
| L00-2 | Tipos | `npx tsc --noEmit` | 0 erros | 0 erros, exit 0 |
| L00-3 | Build | `npx next build` | sucesso | sucesso |
| L00-4 | Suíte unitária | `npm run test:unit` | tudo passa | 157/157, exit 0 |
| L00-5 | Migrações em banco vazio | `npm run test:migrations:pg` | 001–098 aplicam | `CHECKSUMMED=98/98`, `TABLES=498` |
| L00-6 | Repetição do runner | idem (segunda passagem) | idempotente | `SECOND_EXIT=0`, `498->498` |
| L00-7 | Migração adulterada | idem (clone mutado) | recusa sem rebaseline | `migration_checksum_mismatch: 006`, exit 1 tratado |
| L00-8 | Inventário de IDs | extração do checklist | 222 únicos | 222 únicos (CRM 27, HR 24, EMP 19, PLT 18, EXT 17, OPS 16, FIN 16, SEC 15, CLI 15, AST 12, ADM 12, CON 11, PUB 10, AI 10) |

### L00-9 — Componentes administrativos desconectados

Comando:

```bash
for f in src/app/admin/ti/*Client.tsx; do b=$(basename $f .tsx); \
  grep -rqE "(from \"[./]*.*$b\"|import $b )" --include=*.tsx --include=*.ts src/ \
  || echo "ORPHAN $b"; done | wc -l
```

Resultado observado: **82 órfãos de 82 componentes**. Nenhum é importado por
página alguma. `src/app/admin/ti/page.tsx` tem 28 linhas e é um protótipo
descritivo autodeclarado.

Consequência registrada: existem ~1.400 rotas `/api/*` e 499 tabelas sem
caminho de navegação até elas. Isso **não** é "módulo entregue" pelo critério
do roteiro (§8: "componente não montado como módulo entregue").

### L00-10 — Achados do plano mestre revalidados como já corrigidos

| Achado citado no plano | Estado real em `931e028` |
|---|---|
| `migrate-site-visual.mjs` lista só 001–004 | falso hoje: listava 001–098 |
| `client-security-api.mjs` usa `req.json`/`res.status` | falso hoje: 0 ocorrências |
| Sem desafio MFA no login de cliente | falso hoje: 202 + `mfaRequired` implementado |
| `006` recria constraint já existente | falso hoje: usa `DROP CONSTRAINT IF EXISTS` |
| `embedded-postgres` não declarado | falso hoje: devDependency `17.9.0-beta.17` |

Achados **confirmados** e corrigidos no L01: tokens compartilhados
administrativos; ausência de login/autorização individual comprovada.

---

## L01 — Identidade, autorização e integridade básica

Commit: `6b117f0`.
Comando único do gate:

```bash
npm run test:staff-auth:pg
```

Harness: `scripts/qa-staff-auth-postgres.mjs` sobe cluster PostgreSQL
descartável, aplica 001–099, inicia `server.mjs` de verdade e exercita **HTTP
real**. Nenhum veredito vem de SQL simulando a API.

Resultado: **21/21**, `STAFF_AUTH_L01_TEST_EXIT: 0`.

### Falhas reproduzidas ANTES da correção

| Defeito | Evidência da falha original |
|---|---|
| `rec.role \|\| "admin"` em `server.mjs` | identidade de staff sem linha em `auth_staff_profiles` recebia papel `admin` |
| `status !== "active" && status !== "pending_email"` | identidade `pending_email` recebia sessão privilegiada |
| `createSession()` sem estado | cookie assinado válido por 8 h sobrevivia a suspensão e rebaixamento |
| `createSession(match[0])` no fluxo de token | sessão sem `identityId`: auditoria não identificava pessoa |
| ausência de desafio MFA no staff | senha sozinha emitia sessão privilegiada |
| `DELETE /api/admin/session` | apagava o cookie sem revogar: uma cópia continuava válida |

### Cenários verificados

| # | Cenário | Perfil | Esperado | Observado |
|---|---|---|---|---|
| 1 | Staff sem perfil tenta logar | staff sem `auth_staff_profiles` | 403, sem cookie | 403 `staff_profile_missing`, sem cookie |
| 2 | Identidade `pending_email` | staff | 401, sem cookie | 401 `identity_not_active` |
| 3 | Identidade `suspended` | staff | 401 | 401, sem cookie |
| 4 | Senha errada | staff `ti` | 401 | 401, sem cookie |
| 5 | Login válido | staff `rh` | 200, papel do banco, auditoria com pessoa | 200 `role=rh`; 1 linha `staff_login` com `actor_id` = identidade |
| 6 | Suspender após login | staff `ti` | sessão morre na hora | 200 → `UPDATE status='suspended'` → 401 |
| 7 | Rebaixar papel após login | `admin`→`rh` | sessão de admin morre | 200 → 401 |
| 8 | Remover perfil após login | staff `ti` | sessão morre, não vira admin | 401 |
| 9 | `session_epoch + 1` | staff `ti`, 2 sessões | ambas morrem | as duas → 401 |
| 10 | Logout | staff `ti` | cópia do cookie morre | `DELETE` 200 → reuso 401 |
| 11 | Token compartilhado configurado | anônimo | recusado por padrão | 403 `legacy_admin_tokens_disabled`, sem cookie |
| 12 | Cookies forjados (3 formas) | anônimo | todos negados | 3× 401 |
| 13 | Cookie no formato antigo `{role,identityId,exp}` | anônimo | negado | 401 |
| 14 | 15 endpoints administrativos sem sessão | anônimo | nenhum 200 | nenhum 200 |
| 15 | MFA ativo, só senha | staff `admin` | 202 com desafio, **sem cookie** | 202 `mfaRequired`, sem cookie; desafio como cookie → 401; código errado → 401 |
| 16 | Desafio inexistente | anônimo | 401 | 401 |
| 17 | `Origin` de outro site | anônimo | 403 | 403 `same_origin_required` |
| 18 | TOTP correto e replay | staff `admin` | sessão; replay negado | 200 com cookie; replay do desafio 401; mesmo TOTP em novo desafio 401 |
| 19 | Código de recuperação | staff `ti` | vale uma vez | 1ª 200; 2ª 401 |
| 20 | Limite e expiração do desafio | staff `ti` | morre após 5 erros; expirado nega | 6ª tentativa `mfa_challenge_invalid`; expirado 401 |
| 21 | Rate limiting de login | anônimo | 429 com `Retry-After` | 429, `Retry-After: 900`; credencial válida também bloqueada |

### Guarda contra regressão de bypass

`tests/staff-session-await-guard.test.mjs` — 4 testes.

Validação da própria guarda (teste negativo do teste):

```bash
sed -i '0,/await requireSession(req)/s//requireSession(req)/' src/server/ops-api.mjs
node --test tests/staff-session-await-guard.test.mjs
# not ok 1 — src/server/ops-api.mjs:29: const sess = requireSession(req);
```

A guarda acusou a violação injetada; o arquivo foi restaurado e a suíte voltou
a 4/4. Isso confirma que o teste não é vacuoso.

### Regressão das suítes existentes

Suítes que obtinham sessão pelo token compartilhado ou por cookie forjado foram
migradas para **login individual real** (`tests/helpers/staff-login.mjs`), em
vez de relaxar a autorização para o teste passar.

| Suíte | Antes | Depois |
|---|---|---|
| `test:unit` | 157/157 | **177/177** (+20 do L01) |
| `test:staff-auth:pg` | não existia | **21/21** |
| `test:tenant:pg` | 9/9 | **9/9** |
| `test:client-access:pg` | 15/15 | **15/15** |
| `test:cli-v2:pg` | 9/9 | **9/9** |
| `test:cli-v2:pg:objects` | 1/1 | **1/1** |
| `test:migrations:pg` | 98/98, 498 tabelas | **99/99, 499 tabelas** |
| `test:demo-local:pg` | passa | passa |
| `test:backup-restore:pg` | passa | passa |
| `test:backup-restore:pg:clusters` | passa | passa |
| `tsc --noEmit` | 0 erros | 0 erros |
| `next build` | sucesso | sucesso |

Ajuste registrado: `tests/cli-v2.integration.test.mjs` esperava
`audit_log.actor === 'ti'` (o papel). Com identidade individual o ator passou a
ser o `identityId`. A expectativa foi **fortalecida** para exigir a identidade
da pessoa, não removida.

Ajuste registrado: contagens fixas `98` em `scripts/qa-migrations-postgres.mjs`
e `tests/qa-cli-v2-object-pg.integration.test.mjs` passaram a ser lidas do
diretório `db/migrations`, para não quebrarem a cada migração nova.

### Limitações honestas do L01

- O gate cobre SEC-02/04/05/06 e a base de sessão. Os demais itens do L01
  (RBAC por escopo, máscara de remuneração, outbox de auditoria, unificação dos
  papéis operacionais) **não** foram atacados e seguem pendentes.
- A validação de sessão faz uma consulta por requisição. Não foi medido impacto
  de latência sob carga.
- Nenhum teste foi executado em Windows.
- Nenhuma verificação em navegador real: os 21 cenários são HTTP.
