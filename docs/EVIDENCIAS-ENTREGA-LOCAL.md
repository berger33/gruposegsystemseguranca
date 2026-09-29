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


## L02 — arquivos, fila e caixa local (commit `4b95616`)

Comando: `npm run test:l02-delivery:pg`
(servidor real com `--dev`, PostgreSQL descartável `embedded-postgres`,
migrações 001–101, `MAIL_HOST` e `MAIL_FROM` vazios de propósito).

Resultado: **14 aprovados, 0 reprovados**.

| # | Cenário | Verificação |
| --- | --- | --- |
| 1 | Upload grava bytes reais | arquivo lido do disco é idêntico ao enviado; chave `^[0-9a-f]{48}$`; `content_sha256` confere; autor é a identidade |
| 2 | Travessia de caminho | `../../../../etc/passwd` não gera arquivo fora de `docsDir` |
| 3 | Download autenticado | sem cookie 401; com cookie os bytes exatos, `nosniff` e `no-store` |
| 4 | Integridade | arquivo trocado em disco ⇒ 409 `document_integrity_failed`, nada é servido |
| 5 | Isolamento entre contas | documento da conta A negado pela rota do cliente |
| 6 | UUID canônico aceito | regressão do regex de 4 grupos |
| 7 | Deduplicação | mesma `dedup_key` duas vezes ⇒ 1 linha na fila |
| 8 | Concorrência | dois `process` simultâneos ⇒ nenhuma notificação entregue duas vezes |
| 9 | Caixa local | status `local_outbox`, `sent_at` nulo, mensagem gravada |
| 10 | Honestidade da resposta | nenhuma resposta contém "enviado", "entregue", "sent" ou "delivered" |
| 11 | Sigilo da listagem | sem sessão 401; listagem não traz corpo nem token |
| 12 | Leitura auditada | 401 sem sessão; `read_count` 1 e 2; duas linhas `local_outbox_read` na auditoria |
| 13 | Expiração | mensagem vencida ⇒ 410 e conteúdo não vaza |
| 14 | Convite de cliente | `emailStatus = local_outbox`, `inviteUrl` ausente, link recuperável na caixa local |

### Controles negativos executados

Um teste verde não prova que havia defeito. Os dois defeitos centrais do L02
foram reintroduzidos e a suíte reexecutada:

| Defeito reintroduzido | Resultado |
| --- | --- |
| `isValidUuid` com 4 grupos | 13 aprovados, **teste 6 reprovado** com `invalid_recipient_id_uuid_format` |
| `SELECT ... FOR UPDATE SKIP LOCKED` fora de transação | 13 aprovados, **teste 8 reprovado**: `notificação cb7d1c8f-... foi entregue 2 vezes` |

Em ambos os casos o código correto foi restaurado e a suíte voltou a 14/14.

### Varredura completa após o L02

| Suíte | Resultado |
| --- | --- |
| `test:unit` | 177 aprovados |
| `test:staff-auth:pg` | 21 aprovados |
| `test:l02-delivery:pg` | 14 aprovados |
| `test:tenant:pg` | 9 aprovados |
| `test:client-access:pg` | 15 aprovados |
| `test:cli-v2:pg` | 9 aprovados |
| `test:cli-v2:pg:objects` | 1 aprovado |
| `test:migrations:pg` | `CHECKSUMMED=101/101`, `TABLES=500->500`, replay idempotente, adulteração recusada |
| `test:demo-local:pg` | QA-HOM-008/009 completos, incluindo backup frio e restauração isolada verificada por HTTP |
| `npx tsc --noEmit` | 0 erros |
| `npx next build` | sucesso |

### Suíte que NÃO pôde ser executada

`npm run test:backup-restore:pg` e `:clusters` recusam com
`QA_RESTORE_CLIENT_MISSING_OR_INCOMPATIBLE: requires pg_dump and pg_restore
version 17`. Os binários não existem neste sandbox e não há pacote instalável.
A suíte **não cria banco e não reporta sucesso** — a ausência fica visível.
Deve ser executada no alvo Windows, onde o PostgreSQL 17 instala essas
ferramentas.


## L03 — funcionário e RH (patchset da branch `arena/01a0eba8-gruposegsystemseguranca`)

Comando principal: `QA_VERBOSE=1 npm run test:l03-delivery:pg`.

Resultado final: **1 teste integral aprovado, 0 reprovados, 0 ignorados**. O
runner criou um PostgreSQL 17 exclusivo, aplicou 001–102, iniciou o servidor
HTTP real, executou o percurso de API e o percurso de interface em Chromium e
removeu o cluster (`QA_L03_PG_TEMP_CLEANED: true`).

### Prova pela interface, não por tela demonstrativa

O próprio gate abre `/admin/funcionarios` em 1440×1000 e `/funcionario` em
390×844. Pela interface ele:

1. cria o cadastro profissional fictício e o fluxo de admissão;
2. gera acesso individual de funcionário e captura a credencial temporária;
3. publica uma versão de escala e um próximo plantão;
4. entra no portal móvel, troca a senha temporária e autentica novamente;
5. envia um arquivo privado; RH o localiza e aprova;
6. dá ciência na escala, solicita correção de ponto e informa ausência;
7. coloca uma ciência de procedimento na fila com o navegador offline,
   restaura a rede e espera o recebimento pelo servidor;
8. fecha competência demonstrativa, publica holerite de fonte autorizada e
   confirma que o link próprio inicia download;
9. abre os sete grupos de processos HR-01..24, exigindo cabeçalhos reais e
   nenhuma resposta inesperada das APIs;
10. conclui desligamento e comprova que a sessão employee existente foi
    materialmente revogada.

O percurso também recusa rolagem horizontal na largura móvel e na largura do
painel RH. `playwright` usa o Chromium local de `@sparticuz/chromium`; o gate
não depende de download externo do navegador.

### Isolamento e controles negativos por HTTP

O mesmo teste usa dois funcionários distintos A/B e comprova que o servidor
ignora `employee_id` malicioso vindo do navegador. B recebe 404 ao tentar
alcançar documento, comprovante de curso, ponto, recibo de EPI e holerite de A.
Perfil, escala e listagens são sempre derivados do cookie employee.

Também ficaram provados:

- cookie de staff não autentica funcionário e cookie employee não concede RH;
- mudança de papel revoga sessão de staff já emitida;
- troca de senha employee revoga a sessão usada na própria troca;
- suspensão/desligamento e bloqueio de identidade revogam no banco por trigger;
- aliases `/api/hr`, `/api/admin/hr` e `/api/crm/hr` passam pela mesma borda
  granular; supervisor sem concessão recebe 403;
- RH sem `employees.compensation.*` vê salário mascarado e não abre/publica
  folha; após concessão explícita, a operação é permitida;
- saúde ocupacional usa `employees.health.read/write`, separada do cadastro;
- fila offline é limitada a tipos aprovados, separa horário do dispositivo e
  recebimento do servidor, deduplica retry e registra conflito de chave/payload;
- o service worker exclui portal/API employee e conteúdo salarial/médico de
  cache.

### Artefatos

- `db/migrations/102-l03-employee-self-service-security.sql`
- `src/server/employee-session.mjs`
- `src/server/employee-api.mjs`
- `src/app/funcionario/EmployeePortal.tsx`
- `src/app/admin/funcionarios/RhWorkspace.tsx`
- `tests/l03-security.test.mjs`
- `tests/l03-delivery.integration.test.mjs`
- `scripts/qa-l03-delivery-postgres.mjs`

### Regressões executadas

| Gate | Resultado |
|---|---|
| `npm run test:unit` | **180/180** |
| `npm run test:l03-delivery:pg` | **1/1**, HTTP + navegador + PostgreSQL |
| `npm run test:l02-delivery:pg` | **14/14** |
| `npm run test:migrations:pg` | **102/102**, replay idempotente, clone adulterado recusado, 504 tabelas |
| `npm run test:rag` | sucesso no PGlite isolado; bootstrap QA explícito e sessão staff endurecida |
| `npm run typecheck` | 0 erros |
| `npm run build` | sucesso, 69 páginas, incluindo `/funcionario` e `/admin/funcionarios` |
| `node --check` nos módulos editados | sucesso |
| GitHub `QA baseline` (PR #10) | sucesso: static, audit, typecheck, unit, build, RAG, tenant A/B e restart sintético |

### Fronteiras honestas

- “Fonte autorizada”, fechamento e integrações de DP permanecem fluxos locais
  demonstrativos; não significam cálculo trabalhista oficial, envio eSocial,
  entrega de fornecedor ou validação contábil.
- A confirmação de uniforme/EPI é recibo operacional, não assinatura
  eletrônica qualificada.
- O canal confidencial é restrito, mas não anônimo; pedido de anonimato falha
  explicitamente com `anonymous_not_supported`.
- Não houve SMTP, hospedagem externa ou execução no Windows. O aceite no
  equipamento-alvo pertence ao L10.
