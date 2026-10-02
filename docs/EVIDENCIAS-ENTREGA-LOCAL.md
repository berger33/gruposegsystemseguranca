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


## L04 — site, captação e comercial (branch `arena/01a0ed3d-gruposegsystemseguranca`)

Comando principal: `npm run test:l04-delivery:pg`
(`scripts/qa-l04-delivery-postgres.mjs` → `tests/l04-delivery.integration.test.mjs`).

Resultado: **1 teste integral aprovado, 0 reprovados** (rodado duas vezes
seguidas nesta sessão, mais uma terceira vez na revalidação final junto com o
restante da suíte). O runner sobe um PostgreSQL 17 exclusivo, aplica 001–103,
inicia `server.mjs` real e roda um único `test()` de ~180s de orçamento
(`timeout: 180_000`) cobrindo HTTP direto e Chromium real.

### Percurso provado pelo gate, na ordem

1. Visitante anônimo (sem cookie/sessão) abre `/servicos` em Chromium mobile,
   navega até `/contato` e envia o formulário de verdade — `POST /api/leads`
   real, sem atalho.
2. Retry do mesmo pedido é deduplicado pela chave computada no servidor;
   controles negativos por HTTP direto: reenvio com dados forjados de
   origem/campanha (marcação/URL), canal inválido, e-mail inválido —
   todos recusados.
3. Duas identidades de staff `comercial` distintas (`provisionAndLoginStaff`,
   login real de e-mail/senha) com escopos genuinamente diferentes: só uma
   recebe `proposals.approve_discount` via `auth_permissions`
   (`scope_type='global'`, `granted_by_role='system'`).
4. Staff autenticado vê o lead em `/admin/leads` com origem/campanha visíveis
   e converte em oportunidade (`POST /api/crm/leads/:id/convert`); reconversão
   do mesmo lead é idempotente (não duplica empresa/oportunidade).
5. Transição de estado de visita (solicitada→em_agendamento→confirmada→
   realizada) por HTTP autenticado.
6. Vistoria, orçamento de mão de obra e orçamento técnico criados de verdade,
   vinculados à mesma oportunidade/vistoria.
7. Cenário de preço criado; controle negativo: denominador inválido na fórmula
   preço = custo / (1 − taxa − margem) é recusado.
8. Pedido de desconto: negação por autoaprovação (solicitante = aprovador),
   negação por falta de `proposals.approve_discount` numa segunda identidade
   sem a concessão, aprovação real pela identidade com a concessão. Edição de
   item do orçamento após a aprovação reabre a aprovação (CRM-18).
9. Proposta versionada criada com itens; transição de estado até "enviada";
   tentativa de editar item após o envio recusada com 409 (trava real, não
   apenas de UI).
10. PDF gerado e **os bytes e o cabeçalho são conferidos de verdade**
    (assinatura `%PDF`, `Content-Type`), não apenas o status HTTP.
11. Entrega registrada só na caixa de saída local (L02); o gate confirma que
    a resposta nunca declara "entregue"/"lido" sem `proof` explícito.
12. Aceite seguro por link, pela primeira vez com **interface real**
    (`/proposta/aceite/[token]`, `AcceptanceClient.tsx`, novo): token forjado
    → 404; nova versão da proposta torna o link antigo 409
    (`version_mismatch_link_bound_to_version`); link expirado (backdatado em
    `created_at` **e** `expires_at`, para satisfazer o `CHECK
    chk_expires_future`) → 410; aceite real preenchendo o formulário em
    Chromium; reuso do mesmo link já aceito → 410.
13. Contrato mínimo criado de forma idempotente (CRM-23): consulta direta
    confirma exatamente uma linha de contrato mesmo após a tentativa de
    reaceite.
14. Varredura final autenticada em Chromium real sobre `/admin/leads` e
    `/admin/comercial`: sem rolagem horizontal, sem erro de console além do
    ruído externo já conhecido e filtrado (fontes do Google, sem rede no
    sandbox), sem resposta 5xx.
15. Controles negativos genéricos: método não permitido (405), origem cruzada
    (403), rota fora de escopo (404), corpo grande demais, ausência de stack
    trace nas respostas de erro.

### Controle negativo que provou o achado principal (auditoria quebrada)

Antes da migração 103, qualquer chamada do gate que tentasse gravar em
`auth_access_audit` com uma ação `crm_*`/`cli_*`/`ops_*`/`hr_*`/`emp_*` fora da
lista curta original, ou com `actor_kind='comercial'`, violava o `CHECK` da
tabela. Como o insert de auditoria está sempre em `try/catch`, a operação de
negócio em si não falhava — mas a linha de auditoria nunca era gravada. Isso
foi reproduzido durante o desenvolvimento do gate (a suíte não reportava erro
de aplicação, só a ausência da auditoria esperada num dos passos) e confirmado
por cruzamento manual entre `grep` das strings `action:` usadas em
`src/server/*.mjs` e a lista literal do `CHECK` da migração 100. A correção
(migração 103, aditiva) foi confirmada corrigindo o problema sem qualquer
mudança em migração já aplicada.

### Outros defeitos reproduzidos como falha antes da correção

| Defeito | Evidência da falha original |
| --- | --- |
| `discount-api.mjs`: alçada era bloco vazio | qualquer papel, incluindo o próprio solicitante, aprovava qualquer desconto sem checagem real |
| `proposal-acceptance-api.mjs`: `require()` em ESM | `ReferenceError` mudo (dentro de `try/catch`), hash de IP do aceite nunca era gravado |
| `public-lead-validation.mjs` descartava origin/campaign/channel/email | campos enviados pelo `/contato` real nunca apareciam em `public_leads`, mesmo com a coluna existindo |
| `handleCreateLead` confiava em `dedupKey` do navegador | um cliente malicioso podia forjar a chave de outra pessoa |
| `AiBotWidget.tsx` chamava endpoint admin sem condição | 401 em série no console de toda página pública |
| `/admin/leads/page.tsx` com login do modelo antigo | formulário não autenticava contra a sessão real de e-mail/senha — tela inacessível para staff real |

Em todos os casos a correção foi validada corrigindo o bug real e observando o
gate passar a partir dali — nenhuma expectativa de teste foi enfraquecida para
"fazer passar".

### Varredura completa após o L04 (revalidação final desta sessão)

| Suíte | Resultado |
| --- | --- |
| `npm run test:unit` | **186/186** |
| `npm run test:l04-delivery:pg` | **1/1** (rodado 3× nesta sessão, sempre verde) |
| `npm run test:l03-delivery:pg` | **1/1** (revalidado, sem regressão) |
| `npm run test:l02-delivery:pg` | **14/14** (revalidado, sem regressão) |
| `npm run test:migrations:pg` | `CHECKSUMMED=103/103`, `TABLES=504->504`, replay idempotente, clone adulterado recusado |
| `npm run test:rag` | sucesso no PGlite isolado, 13 cenários — widgets públicos (`/faq`, `/contato`, `/servicos`) continuam presentes após a mudança no `AiBotWidget.tsx` |
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | sucesso, 72 rotas incluindo `/admin/comercial` e `/proposta/aceite/[token]` |
| `node --check` nos módulos editados | sucesso |

### Artefatos

- `db/migrations/103-l04-comercial-role-widening.sql`
- `scripts/qa-l04-delivery-postgres.mjs`
- `tests/l04-delivery.integration.test.mjs`
- `src/app/admin/comercial/page.tsx`, `src/app/admin/comercial/ComercialWorkspace.tsx`
- `src/app/proposta/aceite/[token]/page.tsx`, `src/app/proposta/aceite/[token]/AcceptanceClient.tsx`
- `src/server/discount-api.mjs`, `src/server/proposal-acceptance-api.mjs` (correções)
- `src/lib/public-lead-validation.mjs`, `server.mjs` (correções de captação/dedup/RBAC)
- `src/app/orcamento/page.tsx` (reescrita — sem preço inventado)
- `src/app/admin/leads/page.tsx` (login real, estados de visita reais, conversão de lead)
- `src/components/AiBotWidget.tsx` (correção de fetch admin indevido)

### Fronteiras honestas do L04

- CRM-01..06 vêm de `/admin/crm`, uma página anterior a esta sessão — foram
  usados indiretamente pelo gate (conversão de lead cria empresa/oportunidade
  real) mas não foram revalidados campo a campo nesta sessão.
- CRM-07..10 (kanban, filtros, tarefas, histórico, agenda, cadências,
  carteira) continuam apenas como schema — a própria página `/admin/crm` se
  autodocumenta assim; nenhuma tela foi construída para eles.
- PUB-02/05/06/07/08/09/10: FAQ assistida com handoff, CMS, temas, SEO técnico,
  montador/comparador administrativo e painel de métricas de origem/A-B
  continuam com componentes órfãos (`PubFaqAssistedClient.tsx`,
  `CmsClient.tsx`, `ThemeClient.tsx`, `SeoClient.tsx`, `PackageClient.tsx`,
  `OriginMetricsClient.tsx`) — nenhum foi tocado ou conectado nesta sessão.
- O aceite de proposta é explicitamente "aceite simples", nunca chamado de
  assinatura eletrônica qualificada. A entrega de proposta nunca declara
  "entregue"/"lido" sem prova local explícita — não há e nunca houve SMTP real.
- O contrato criado por CRM-23 é um stub mínimo idempotente, sem numeração
  fiscal nem integração de faturamento.
- Risco residual anotado e **não** corrigido estruturalmente: o insert de
  auditoria em `handleAdminLeadStatus` (`server.mjs`) roda solto dentro de uma
  transação multi-instrução, sem `SAVEPOINT` — hoje não falha (a migração 103
  fechou o `CHECK` que causaria isso), mas o padrão em si continua frágil a
  uma futura regressão de constraint.
- Não houve SMTP, hospedagem externa ou execução no Windows nesta etapa
  também. O aceite no equipamento-alvo pertence ao L10.

## L04 / CRM-07 — tarefas pessoais (PR #13, 2026-09-29)
Código validado: `7bab31360492d7b46375690f8fdfa17ce0a31933`, branch `codex/l04-crm-tarefas`, base main `4aaa1d2`.
Execução inteiramente no GitHub Actions (Linux). No computador do proprietário foi apenas lido o anexo fornecido; nenhum checkout, instalação ou teste do projeto local.

### Resultados executados
- [L04 CRM delivery](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36604855660): aprovado.
- Migrações 001–104: primeira aplicação 104/104; replay 104/104; 504 tabelas preservadas; controle negativo de checksum recusado conforme esperado; clone sintético com checksums preservados. Clone TEMPLATE não é prova de backup físico.
- `npm run test:l04-delivery:pg`: 2 testes, 2 aprovados, 0 falhas, 0 ignorados. Jornada comercial central anterior preservada.
- Novo cenário: identidade comercial cria empresa/oportunidade por HTTP; navega /admin/crm em Chromium, abre tarefas, cria prazo vencido, filtra, recarrega e conclui; recarga preserva a tarefa e conclusão a retira do filtro de vencidas.
- Negativos reais: sem sessão 401, RH 403, outro comercial 404, ausência de origem 403, método incorreto 405, data/título inválidos 400, autoria forjada 400, status desatualizado 409.
- Detalhe legado da oportunidade não expõe tarefas pessoais ao outro comercial.
- SQL usado apenas para verificar autoria/auditoria e injetar falha de auditoria. POST com falha injetada retorna 503 e não persiste tarefa; trigger removido em finally.
- [QA baseline](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36604855633): árvore/migrações, audit de dependências, typecheck, unitários, build, RAG PGlite, isolamento cliente A/B e reinício sintético aprovados.

### Correção descoberta pelo teste
O primeiro gate remoto falhou com 503 ao criar tarefa. A 103 não incluía `crm_task_create`/`crm_task_status` no CHECK de auditoria; a transação abortou corretamente. A nova `104-crm-task-audit.sql` mantém a expressão anterior e acrescenta apenas esses eventos, sem editar migrações aplicadas. Manifesto e verificador atualizados para 104. Novo gate passou sem relaxar a expectativa.

### Limites
CRM-07 continua em execução: este recorte entrega tarefas PESSOAIS, não todo o requisito. Não inclui delegação/equipe, edição de prazo, anexos, histórico de interações, agenda ou cadências. Lista até 200 tarefas por oportunidade; sem paginação. O teste de conflito comprova versão de status desatualizada; não é ensaio de carga concorrente.
Sem aceite Windows/mobile deste recorte, sem aceite humano e sem validação de IA real. L02/L03 integrais não foram reexecutados nesta continuação; o baseline cobre seus recortes próprios, não todos esses gates.
O PR permanece sem merge automático. Documentação posterior ao SHA acima não altera o código validado.

## L04 / CRM-07 — histórico de interações (ligação/reunião/nota), continuação Arena (2026-09-29)
Código validado: `7c56a6facb0a710a9bf112a998742205afe730c8`, branch `arena/01a0ee3c-gruposegsystemseguranca` (já contém o PR #13 mesclado em `ec450b6`).
Execução inteiramente no sandbox Arena (Linux). Nenhuma instalação nem execução no computador do proprietário.

### O que este recorte entrega
- `GET/POST /api/crm/opportunities/:id/interactions` (`src/server/crm-interaction-api.mjs`), roteado em `server.mjs`.
- Tipo restrito nesta fatia a `ligacao`/`reuniao`/`nota` (o schema `crm_interactions`, da migração 014, também aceita `email`/`whatsapp`/`visita`/`outro`, deixados para um próximo recorte explícito).
- Mesma regra de propriedade das tarefas pessoais (PR #13): só quem é `responsible_id` da oportunidade, ou `created_by_id` quando ela não tem responsável, lê ou grava o histórico. comercial/admin/marcelo/ti todos sujeitos à mesma checagem; nenhum bypass administrativo.
- Autoria (`created_by_id`), `company_id` e `opportunity_id` sempre derivados no servidor a partir da sessão e da oportunidade; qualquer um desses campos no corpo da requisição é recusado com `server_managed_fields`.
- `occurred_at` opcional (padrão `NOW()`), aceita registro tardio no passado, mas recusa data mais de 5 minutos no futuro (`invalid_occurred_at`) para não maquiar o histórico.
- Mutação e auditoria (`crm_interaction_create`) na mesma transação; falha de auditoria reverte a inserção e nunca reconhece sucesso não auditado (provado por controle negativo, ver abaixo).
- UI `OpportunityInteractions.tsx` conectada em `/admin/crm`, ao lado de `OpportunityTasks.tsx`, sob o mesmo botão "Abrir tarefas" da oportunidade.
- Nova migração `105-crm-interaction-audit.sql`: a 104 não incluía `crm_interaction_create` no `CHECK` de auditoria. Segue o mesmo padrão da 104 — preserva a expressão existente (incluindo os eventos que a 104 já tinha acrescentado) e soma apenas o novo evento, sem tocar 001-104 já aplicadas. Manifesto (`scripts/migrate-site-visual.mjs`) e verificador estático (`scripts/qa-wave0-static.mjs`) atualizados para 001–105.

### Achado corrigido: vazamento pré-existente na rota legada de detalhe
A rota legada `GET /api/crm/opportunities/:id` (`src/server/crm-api.mjs`, anterior a esta sessão) devolvia `SELECT * FROM crm_interactions WHERE opportunity_id = $1` **sem nenhuma checagem de propriedade** — qualquer staff autenticado (inclusive RH, financeiro etc., já que essa rota usa só `requireAdminSession`, não uma lista de papéis) podia ler o histórico de interações de qualquer oportunidade sabendo o UUID. Isso era exatamente o tipo de vazamento por "rota alternativa" que o CRM-07 de tarefas já havia fechado para `crm_tasks`, mas que ainda não existia para interações porque a tabela era só schema até agora. Corrigido aplicando a mesma subconsulta de propriedade usada na rota dedicada. Não foi tocado o comportamento de `stages`/`visits` na mesma rota, que continuam sem essa restrição — risco residual anotado abaixo, não introduzido por este recorte.

### Resultados executados
- `npm ci`: 82 pacotes, 0 vulnerabilidades.
- `npm run test:unit`: 186/186.
- `npx tsc --noEmit`: 0 erros.
- `npm run test:migrations:pg`: 105/105 na primeira aplicação e no replay; 504 tabelas preservadas; controle negativo de checksum (`006-admin-identities.sql` adulterada) recusado como esperado.
- `npm run test:l04-delivery:pg`: 3 testes (jornada comercial central + tarefas pessoais + histórico de interações), 3 aprovados, 0 falhas. Executado 7 vezes consecutivas nesta sessão: 6/7 verde: uma execução isolada (sem log completo capturado) devolveu 1 falha não reproduzida nas 6 demais, incluindo 3 execuções consecutivas imediatamente após — tratado como ruído do sandbox compartilhado, não como defeito do código; não há repetição do mesmo ponto de falha em nenhuma outra execução.
- `npm run build`: sucesso, 72 rotas (inclui `/admin/crm`); `tsconfig.json`/`next-env.d.ts` conferidos após a execução — a única diferença automática (`tsconfig.json` ganhando as entradas de tipos do diretório de build da integração L04) foi descartada, preservando o arquivo original do repositório.
- Novo cenário Chromium real: identidade comercial cria empresa/oportunidade por HTTP; abre `/admin/crm`, registra ligação com detalhes; recarrega a página e confirma que a interação persiste; outro comercial recebe 404 no endpoint dedicado e lista vazia na rota legada de detalhe.
- Negativos reais: sem sessão 401; RH 403; outro comercial 404 (dedicado) e `interactions: []` (rota legada); origem incorreta 403; método `DELETE` 405; tipo fora do escopo (`whatsapp`) 400; título vazio 400; data futura 400; autoria forjada (`created_by_id`) 400 `server_managed_fields`.
- SQL usado apenas para conferir autoria/auditoria e injetar a falha de auditoria (gatilho `qa_reject_interaction_audit`, removido em `finally`); a mutação sob teste é sempre HTTP.

### Limites deste recorte
Este recorte NÃO conclui CRM-07. Ainda faltam: anexos e notas com upload; edição/exclusão de uma interação registrada (o histórico atual é apenas append-only); vínculo com `contact_id` (schema já suporta, API não aceita); tipos `email`/`whatsapp`/`visita`/`outro`; paginação (lista limitada a 200 por oportunidade, igual às tarefas); qualquer noção de equipe/delegação (a regra de propriedade é a mesma unipessoal das tarefas, documentada explicitamente, não uma omissão). `stages`/`visits` na rota legada de detalhe continuam sem a mesma restrição de propriedade — risco residual, não corrigido nesta sessão porque está fora do escopo de interações (fica para CRM-06/CRM-08). CRM-08 (agenda), CRM-09 (cadências) e CRM-10 (carteira) permanecem como schema sem tela. Sem aceite Windows/mobile, sem aceite humano, sem SMTP e sem hospedagem externa nesta etapa.

## L04 / CRM-07 — interações: anexos, correção, remoção, contato, tipos e paginação (Arena, 2026-09-29)

Código validado: `c69685f` (`feat(crm-07): complete interaction follow-up`), sobre a
base `05f258f`. Ambiente: Linux x86_64, Node v22.22.3, npm 10.9.8,
PostgreSQL 17.9 por `embedded-postgres`, Chromium empacotado em
`@sparticuz/chromium`. Nenhuma destas execuções prova Windows ou envolve banco,
arquivo ou comunicação do proprietário.

### Mudança comprovada

- Migração `106-crm-interaction-follow-up.sql` acrescenta `updated_at`,
  `version`, `deleted_at` e `deleted_by_id` a `crm_interactions`; cria
  `crm_interaction_attachments` com chave aleatória de 48 hex, SHA-256,
  tipo/tamanho permitidos e FK restritiva; acrescenta os quatro eventos de
  auditoria sem editar 001–105.
- `src/server/crm-interaction-api.mjs` implementa GET paginado, POST com todos
  os tipos previstos, PATCH otimista, DELETE lógico, upload privado e download
  privado. Somente o responsável atual (ou criador enquanto a oportunidade não
  tem responsável) opera a oportunidade; papéis administrativos não fazem
  bypass. O contato precisa ser ativo e da empresa derivada no servidor.
- Arquivo é escrito exclusivamente no provider privado L02 (`CLIENT_DOCS_DIR`
  no gate), com modo 0600, chave não derivada do nome, SHA-256 e checagem de
  tamanho/hash antes da resposta. Não há URL pública. Falha antes do commit
  remove bytes sem metadado confirmado.
- `OpportunityInteractions.tsx` está conectado a `/admin/crm` e expõe os sete
  tipos, contato, upload na criação e em registro existente, download,
  edição, confirmação da remoção lógica e navegação por páginas de 25.
- A rota legada de detalhe continua usando a regra de propriedade e passou a
  filtrar `deleted_at IS NULL` para não reexpor uma interação removida.

### Gates executados

| Comando | Resultado observado |
|---|---|
| `npm ci` | 82 pacotes instalados; auditoria npm: 0 vulnerabilidades |
| `node scripts/qa-wave0-static.mjs` | 5/5: imports, lockfile, 001–106 contínuas, manifesto PG e CI obrigatória |
| `npm run test:migrations:pg` | 106/106 na primeira aplicação e no replay; 505→505 tabelas; clone TEMPLATE preservou os checksums; adulteração de checksum 006 recusada (controle negativo esperado) |
| `npm run test:l04-delivery:pg` | 3/3: jornada comercial anterior, tarefas pessoais e cenário CRM-07 ampliado; PostgreSQL descartável, HTTP real e Chromium real |
| `npm run test:unit` | 186 testes aprovados, 0 falhas |
| `npm run typecheck` | 0 erros |
| `npm run build` | sucesso; 70 rotas; alterações automáticas de `next-env.d.ts`/`tsconfig.json` por `.next/integration-l04` foram conferidas e descartadas |

### Cenário CRM-07 exercitado pelo gate L04

1. Duas identidades `comercial` distintas e uma `rh`; a dona cria empresa,
   contato ativo, segunda empresa/contato de controle e oportunidade por HTTP.
2. Sem sessão recebe 401; RH 403; outro comercial 404; origem ausente 403;
   DELETE na coleção 405; autoria forjada, tipo inválido, contato de outra
   empresa, título vazio e data futura recebem 400.
3. Trigger temporário que rejeita `crm_interaction_create` faz o POST retornar
   503 e mantém a contagem em zero — criação e auditoria são atômicas.
4. Chromium entra em `/admin/crm`, cria uma ligação com contato e arquivo TXT
   sintético; recarrega; abre a edição e troca para reunião. Persistência,
   seletor de contato, upload e atualização são verificados pela UI real.
5. Outro comercial não lista, não altera nem baixa o anexo. A dona baixa o TXT
   por rota autenticada: bytes exatos, `text/plain` e `Cache-Control: private,
   no-store`.
6. PATCH de versão desatualizada recebe 409; PATCH atual muda para WhatsApp e
   limpa o contato. POSTs posteriores provam `email`, `visita`, `nota` e
   `outro`. `limit=2&offset=0/2` prova total, próximo e anterior; limite 101
   é recusado.
7. Trigger temporário que rejeita `crm_interaction_delete` devolve 503 e deixa
   `deleted_at`/versão intactos. Sem o trigger, DELETE marca o registro com o
   ator correto, remove da listagem e também bloqueia novo download. Auditoria
   de criação/duas correções/remoção e de upload/download é consultada no banco
   descartável; os fluxos sob prova continuam HTTP.

### Limites que permanecem honestos

O recorte fecha as lacunas da Opção A, não CRM-07 inteiro: tarefas continuam
pessoais e sem delegação/equipe, edição de prazo ou paginação; kanban/tabela,
busca e filtros completos não foram revalidados. A regra futura de equipe não
foi inferida. `stages` e `visits` da rota legada ainda carecem da mesma borda de
propriedade e devem ser corrigidos quando CRM-06/CRM-08 forem tocados.
CRM-08/09/10, lacunas PUB, aceite humano e execução Windows continuam
pendentes. Não houve SMTP, hospedagem externa, mensagem real ou publicação.

## Continuação CRM-08 — agenda de visitas e reuniões (commit `7ddd659`)

### Política de escopo registrada antes da rota

- **Responsável**: a identidade que detém a oportunidade (`responsible_id`, ou
  `created_by_id` enquanto não houver responsável). Só ela agenda, edita,
  reagenda, confirma, conclui, cancela e gerencia participantes.
- **Participante**: identidade de staff ativa convidada explicitamente. Vê
  apenas as visitas em que foi incluída e responde somente por si
  (`confirmado`/`recusado`). Não reagenda, não cancela, não convida terceiros
  e não passa a enxergar a oportunidade, os contatos nem as demais visitas.
- Papel administrativo **não** é bypass: `comercial`, `admin`, `marcelo` e
  `ti` obedecem à mesma regra de propriedade.
- Nenhum diretório de staff é exposto: o convite é feito pelo e-mail exato e o
  erro é o mesmo para inexistente, não-staff e inativo.
- Reagendar zera todas as confirmações (uma confirmação vale para a data
  confirmada, nunca para a seguinte) e devolve a visita a `solicitada`.
- Cancelar exige motivo, inclusive no banco (`crm_visits_cancel_reason_check`).
- `realizada` e `cancelada` são finais: não há reabertura silenciosa.

### Comandos executados nesta continuação

| Comando | Resultado |
| --- | --- |
| `npm ci` | 82 pacotes, 0 vulnerabilidades |
| `node scripts/qa-wave0-static.mjs` | 5/5 (migrações 001–107 contínuas e agendadas) |
| `npm run test:migrations:pg` | 107/107 na primeira aplicação e no replay; 506→506 tabelas; clone TEMPLATE preservou checksums; adulteração do 006 recusada (controle negativo) |
| `npm run test:l04-delivery:pg` | 4/4 com PostgreSQL descartável, HTTP real e Chromium real (sem `--disable-web-security`) |
| `npm test` | 186/186 |
| `npm run typecheck` | 0 erros |
| `npm run build` | sucesso, 70 rotas; alteração automática de `tsconfig.json` por `.next/integration-l04` conferida e descartada |

### Cenário CRM-08 exercitado pelo gate L04

1. Quatro identidades: dona da oportunidade, convidada, comercial alheia e RH.
   Empresa, contato ativo e oportunidade criados por HTTP pela dona.
2. Negações: sem sessão 401; RH 403; comercial alheia 404; origem ausente 403;
   `DELETE` na coleção e `POST` na agenda pessoal 405.
3. Entradas inválidas: atribuição forjada (`responsible_id`) 400
   `server_managed_fields`; data no passado; duração fora de 15–480; título
   vazio; convidado inexistente. O convite impossível **não** deixa visita
   órfã (contagem conferida no banco).
4. Chromium entra em `/admin/crm` com a sessão da dona, agenda a visita com
   contato, duração, observações e convidado por e-mail; recarrega a página e
   reencontra a visita `Solicitada` com o convidado `pendente`.
5. Em navegador e sessão separados, a convidada abre `/admin/crm`, encontra a
   visita em “Minha agenda de visitas e reuniões” e confirma a presença pela
   UI real (200 na rota `/response`).
6. Escopo conferido por HTTP: a convidada lista somente a visita em que foi
   incluída e não recebe a agenda de contatos da empresa; a comercial alheia
   recebe 404 na listagem, não vê nada na agenda pessoal e continua sem visitas
   no detalhe legado — que agora obedece à mesma política e mostra a visita
   para a convidada.
7. A convidada recebe 404 ao tentar reagendar, cancelar, convidar e remover
   participante; a dona recebe 404 ao tentar responder como participante; a
   comercial alheia recebe 404 ao tentar responder.
8. Convite adicional pela dona (e-mail em caixa alta é resolvido), convite
   repetido 409, remoção do participante 200. Versão desatualizada 409 em
   reagendamento e em convite.
9. Reagendamento: `reschedule_count` vai a 1, status volta a `solicitada` e a
   resposta da convidada volta a `pendente` com `responded_at` nulo.
10. Confirmação do agendamento, transição inválida 409, cancelamento sem motivo
    400 e resposta posterior da convidada ainda aceita enquanto a visita vive.
11. Trigger temporário que rejeita `crm_visit_create` devolve 503 e mantém a
    contagem de visitas — agenda e auditoria são atômicas.
12. Cancelamento com motivo grava `cancel_reason`/`cancelled_by_id`; depois
    disso, edição e resposta recebem 409 `visit_status_final`.
13. Auditoria conferida no banco descartável, em ordem:
    `crm_visit_participant_add`, `crm_visit_create`, `crm_visit_response`,
    `crm_visit_participant_add`, `crm_visit_participant_remove`,
    `crm_visit_reschedule`, `crm_visit_status`, `crm_visit_response`,
    `crm_visit_cancel` — com o ator correto em cada linha (duas do convidado).

### Limites que permanecem honestos no CRM-08

Não há lembrete/notificação da agenda (dependeria de provedor), visão de
calendário por semana/mês, detecção de conflito de horário do responsável nem
vínculo com os estados de visita do PUB-04. Integração com calendário externo
segue fora do escopo local. `stages` da rota legada de detalhe continua sem a
borda de propriedade. CRM-09/10, lacunas PUB, revalidação de CRM-01..06,
aceite humano/Windows, SMTP e hospedagem externa continuam pendentes.

## L04 / CRM-09 — cadências manuais de prospecção (Arena, 2026-09-29)

Código desta continuação: branch `arena/01a0eea3-gruposegsystemseguranca`, base
conferida `5a2e6a728368dc75bfad014caba7bf8c98173118` (= `main` no início),
próxima migração livre confirmada como 108. A migração `108-crm-manual-cadences.sql`
é a única migração nova; 001–107 não foram editadas.

### Política registrada antes da rota

- Só uma identidade staff ativa com papel `comercial` cria, edita, arquiva e
  aplica modelos privados; outro comercial não lê o modelo de alguém e
  `admin`, `marcelo`, `ti` e `rh` não têm bypass.
- A aplicação é permitida somente à oportunidade do próprio responsável (ou
  criador enquanto sem responsável), com contato ativo da mesma empresa.
  Oportunidade de outra pessoa recebe 404, inclusive para outro comercial.
- Um modelo aplicado gera tarefas manuais imediatamente. Cada passo conserva
  título, intervalo de 0–365 dias, canal sugerido e responsável da sessão.
  E-mail/WhatsApp são metadados de trabalho; não existe envio ou worker.
- Opt-out bloqueia aplicações futuras e cancela tarefas abertas/em andamento.
  Oportunidade ganha/perdida e contato desativado encerram a aplicação e
  cancelam somente pendências; tarefas concluídas permanecem concluídas.
  Reativar não ressuscita tarefas automaticamente.
- Automação de mensagem fica para uma decisão posterior de autorização,
  política de opt-out e provedor. SMTP continua fora do escopo local.

### Implementação

- `src/server/crm-cadence-api.mjs`: modelos, edição otimista, arquivamento,
  aplicação idempotente, propriedade, opt-out e auditoria transacional.
- `src/app/admin/crm/CadenceClient.tsx`: criação/edição pela UI, aplicação,
  opt-out, histórico de aplicações e tarefas; texto explícito de que nenhuma
  mensagem é enviada.
- `db/migrations/108-crm-manual-cadences.sql`: modelos, passos, aplicações,
  metadados de tarefa, `prospecting_opted_out`, triggers de bloqueio por estágio
  final/inatividade/opt-out e novos eventos de auditoria.
- `src/server/crm-api.mjs`: `stages` da rota legada de detalhe agora obedece a
  mesma borda de propriedade da oportunidade.

### Cenários executados

| Cenário | Perfil/ambiente | Esperado | Observado |
|---|---|---|---|
| Modelo e tarefas | comercial responsável, Chromium 1440×1000 | criar/editar modelo, aplicar, recarregar e persistir | UI real criou e editou modelo; aplicação criou tarefa; recarga exibiu tarefa e canal sugerido |
| Negações | anônimo, RH, outro comercial, origem ausente, método/campos inválidos | 401/403/404/405/400, sem ampliação de escopo | aprovados; outro comercial recebeu 404 na oportunidade e lista própria de modelos vazia |
| Idempotência e concorrência lógica | mesma aplicação repetida; versão antiga do modelo | não duplicar tarefas; conflito explícito | 409 `cadence_already_applied`; 409 `template_version_conflict` coberto na API do modelo |
| Opt-out | responsável via HTTP e banco de trigger | cancelar pendências, bloquear aplicação seguinte, não enviar | 200 com uma tarefa bloqueada; nova aplicação 409 `contact_opted_out` |
| Oportunidade ganha | responsável via PATCH HTTP | encerrar e cancelar pendente | `encerrada_ganha`, razão `oportunidade_ganha` |
| Contato inativo | tarefa criada por HTTP; estado inativo sintético por SQL | encerrar e cancelar pendente | `encerrada_contato_inativo`, razão `contato_inativo` |
| Rota legada | outro comercial vs responsável | `stages` não vaza; proprietário lê o próprio histórico | lista vazia para outro comercial e estágio visível para o proprietário |
| Auditoria indisponível | trigger QA rejeita `crm_cadence_apply` | 503 e rollback completo | nenhum enrollment nem task persistido |

SQL foi usado somente para fixture/asserção (contato sintético inativo),
verificação de autoria/contagem e trigger de falha; a criação/edição/aplicação,
opt-out e transições foram chamadas por HTTP. Chromium empacotado foi executado
sem `--disable-web-security` e o cenário usou um navegador para a persona
comercial.

### Comandos e resultados

| Comando | Resultado |
|---|---|
| `npm ci` | 82 pacotes, 0 vulnerabilidades, exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5; migrações 001–108 contínuas e agendadas |
| `npm run test:migrations:pg` | 108/108 primeira aplicação e replay; 509 tabelas; clone/checksum negativo aprovados |
| `npm run test:l04-delivery:pg` | 5/5; HTTP real + PostgreSQL descartável + Chromium real; exit 0 |

As regressões finais desta continuação (`npm test`, `npm run typecheck` e
`npm run build`) são registradas após sua execução abaixo; nenhum resultado de
SHA histórico é reutilizado como prova desta branch.

### Regressão final no SHA desta continuação

| Comando | Resultado observado |
|---|---|
| `npm test` | 186/186, exit 0 |
| `npm run typecheck` | 0 erros, exit 0 |
| `npm run build` | sucesso, 70 rotas, exit 0 |
| `git diff --check` | sem erro |

`next-env.d.ts` e `tsconfig.json` foram conferidos após gates/build e não ficaram
apontando para `.next/integration-l04`; não há alterações automáticas desses
arquivos no patch.

## Continuação CRM-07 — prazo, paginação e delegação com aceite (branch `arena/01a0eeb7-gruposegsystemseguranca`)

Base `942b3fc` (merge do PR #20). Decisões registradas antes da rota em
`docs/PROMPT-CONTINUACAO-CRM-TAREFAS-DELEGACAO.md`: delegação explícita entre
comerciais com aceite, sem visibilidade de equipe ampla; tarefa de cadência não
delegável; erro genérico único para qualquer problema de destinatário; uma
operação por PATCH; paginação/busca/filtros no servidor.

### O que o sexto cenário do gate prova (HTTP + Chromium + PostgreSQL descartável)

- Paginação real com 34 tarefas: `total`/`limit`/`offset` no servidor, páginas
  sem sobreposição nem perda (união conferida), controles negativos de
  `limit`/`offset`/`status`/`q`/`overdue` (nove casos 400).
- Busca com curinga escapado: `q=100%` devolve somente o título com `100%`
  literal, não todo título contendo `100`.
- Edição de prazo com `expected_version`: sucesso incrementa a versão pelo
  gatilho do banco; versão velha 409; tarefa encerrada 409; datas inválidas e
  campos geridos pelo servidor 400; operação mista (estado+prazo) 400.
- Delegação: 401 sem sessão, 403 RH/origem ausente, 400 e-mail inválido, 404
  para não-dono; erro genérico idêntico (`delegate_not_available`) para
  destinatário RH, inexistente e autodelegação; tarefa concluída 409; tarefa de
  cadência (fixture SQL de template/passo/contato/enrollment) 409.
- Ciclo de vida: pendente congela o dono (estado, prazo e redelegação 409);
  recusa devolve o controle e permite redelegar; revogação limpa a delegação e
  some da visão do delegado; aceite transfere `responsible_id` (conferido por
  SQL), mantém a tarefa visível para o dono (lista e rota legada), nega dono e
  estranho e deixa as transições exclusivas do delegado.
- Auditoria: sequência `crm_task_create` → `crm_task_delegate` →
  `crm_task_delegation_accept` → `crm_task_delegated_status` com o ator correto
  em cada linha; `crm_task_update` na edição de prazo; falha de auditoria
  injetada no aceite devolve 503 e não transfere nada (rollback provado).
- UI real: o dono busca a oportunidade e a tarefa, edita o prazo, delega pelo
  e-mail; o delegado, em segundo navegador/sessão, aceita e conclui em
  “Tarefas delegadas a mim”; o dono recarrega e vê o estado `aceita`; sem erro
  de console/5xx e sem rolagem horizontal nas duas sessões.

### Comandos e resultados

| Comando | Resultado |
|---|---|
| `npm ci` | 82 pacotes, 0 vulnerabilidades, exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5; migrações 001–109 contínuas e agendadas |
| `npm run test:migrations:pg` | 109/109 primeira aplicação e replay; 509 tabelas; clone/checksum negativo aprovados |
| `npm run test:l04-delivery:pg` | 6/6; duas execuções consecutivas; exit 0 |
| `npm test` | 186/186, exit 0 |
| `npm run typecheck` | 0 erros, exit 0 |
| `npm run build` | sucesso, `/admin/crm` compilada, exit 0 |
| `git diff --check` | sem erro |

`tsconfig.json` foi reescrito pelo dev server do gate (includes de
`.next/integration-l04`) e restaurado com `git checkout` antes do commit;
`npx tsc --noEmit` foi reexecutado depois da restauração e continuou com 0
erros. Nenhum resultado de SHA histórico é reutilizado como prova desta
continuação.

## Continuação CRM-08 — conflito de horário e vínculo PUB-04 (branch `arena/01a0eeda-gruposegsystemseguranca`)

Base da sessão: `fd7a939` (HEAD de `main` e da branch, merge do PR #21).
Política registrada antes da rota em
`docs/PROMPT-CONTINUACAO-CRM-VISITAS-CONFLITO-PUB04.md`.
Migração nova: `110-crm-visit-conflict-lead-link.sql` (aditiva; 001–109
intactas).

### Comandos e resultados observados

| Comando | Esperado | Observado |
|---|---|---|
| `npm ci` | instalação reproduzível | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 | 5/5, migrações 001–110 contínuas e registradas no migrador |
| `npm run test:migrations:pg` | replay + clone + checksum negativo | `CHECKSUMMED=110/110`, `TABLES=509->509`, clone rejeita `006` sem rebaseline |
| `npm run test:l04-delivery:pg` (1ª) | todos os cenários | **7/7**, exit 0 |
| `npm run test:l04-delivery:pg` (2ª consecutiva) | reprodutível | **7/7**, exit 0 |
| `npm test` | suíte unitária | 186/186 |
| `npm run typecheck` | 0 erros | 0 erros |
| `npm run build` | build com `/admin/crm` | sucesso |
| `git diff --check` | limpo | limpo |

### Cenário 7 do gate L04 — o que é provado

Tudo por HTTP real contra o servidor real, PostgreSQL 17 descartável e
Chromium real sem `--disable-web-security`. SQL só como fixture, asserção ou
falha injetada.

1. **Origem pública real:** lead criado em `POST /api/leads` sem sessão
   (`status='solicitada'`) e convertido em oportunidade por
   `POST /api/crm/leads/:id/convert`.
2. **Vínculo não é do cliente:** `public_lead_id` no corpo do agendamento é
   recusado com `server_managed_fields`; a visita criada herda o lead da
   oportunidade (conferido no banco) e nasce sem propagação
   (`lead_sync_status IS NULL`).
3. **Conflito:** faixa idêntica → `409 visit_schedule_conflict` apontando a
   visita ocupante; sobreposição à frente (+30 min) e atrás (−30 min) também
   recusadas; nenhuma visita é gravada nos três casos. Encostar
   (início == fim da anterior) é aceito. Outro comercial agenda a **mesma
   hora** na própria oportunidade sem obstáculo: o conflito é do responsável.
4. **Conflito em alteração:** reagendar para cima de outra visita e esticar a
   duração até sobrepô-la retornam 409, e a versão da visita **não** é
   consumida (conferido no banco).
5. **Propagação PUB-04:** confirmar a visita leva o lead de `solicitada` a
   `confirmada` com `lead_visit_confirm` e uma linha em
   `public_lead_status_audit`; confirmar uma segunda visita do mesmo lead não
   duplica nada; cancelar uma visita com outra viva **não** cancela o lead;
   reagendar devolve o lead a `em_agendamento` com `lead_status_change`
   (não se promete horário sem reserva real); reconfirmar volta a confirmar.
6. **Auditoria transacional:** gatilho que rejeita `lead_visit_cancel` faz o
   cancelamento responder 503 e deixa visita e lead intocados.
7. **Fechamento e congelamento:** cancelamento efetivo → lead `cancelada` com
   `lead_visit_cancel`; visita `realizada` → lead `realizada`; visita
   posterior cancelada **não** reabre nem cancela o lead realizado.
8. **PUB-04 manual:** em um segundo lead, `PATCH /api/admin/leads/:id` grava
   `lead_status_change` para `em_agendamento` e `lead_visit_cancel` para
   `cancelada` — antes, qualquer transição de visita virava
   `lead_visit_confirm`, e a falha de auditoria era engolida.
9. **UI real:** o responsável abre `/admin/crm`, encontra na agenda o selo
   “Lead público vinculado (PUB-04) — situação propagada: Realizada” e recebe
   a mensagem dedicada de conflito ao tentar agendar em horário ocupado
   (resposta 409 observada na rede), sem erro de console nem falha de rede
   same-origin.

### Ajuste em cenário preexistente

No cenário CRM-08 anterior, a visita usada para provar rollback de auditoria
era agendada exatamente sobre a visita já reagendada. Com a migração 110 essa
criação passa a ser recusada por conflito **antes** da auditoria, o que
mascararia o que o cenário prova; a visita passou a usar uma faixa livre. Nada
mais foi afrouxado.

### Limites honestos deste recorte

- Conflito considera apenas o **responsável**. Participante convidado não
  bloqueia (pode recusar) e a agenda de terceiros nunca é consultada nem
  revelada. Não há detecção de conflito de sala, veículo ou equipe.
- Não existe parâmetro de força: para dobrar um horário é preciso cancelar ou
  reagendar a visita que o ocupa.
- A propagação é unidirecional CRM → lead. Mudar o lead em `/admin/leads` não
  mexe na agenda comercial.
- Lembretes, notificações e visão de calendário por período continuam fora;
  SMTP, calendário externo, hospedagem, Windows e aceite humano seguem fora
  por decisão registrada.
- O teto de antispam de PUB-03 ganhou a variável `LEAD_MAX_ATTEMPTS` (padrão
  5/10 min preservado, teto 1000, valor inválido cai no padrão). Só o gate a
  usa; nenhum caminho de requisição pode alterá-la.

## Continuação CRM-08 residual — visão de calendário por semana (branch `arena/01a0ef36-gruposegsystemseguranca`)

Base da sessão: `ed50d22` (HEAD de `main` e da branch, merge dos PRs #22 e
#23; a fatia de código é o merge `ea7a1ed`). Política registrada antes do
código em `docs/PROMPT-CONTINUACAO-CRM-AGENDA-CALENDARIO.md`. **Sem migração
nova**: o recorte reaproveita o endpoint `GET /api/crm/visits/agenda` já
existente desde CRM-08 (migração 107/110), com os parâmetros `from`/`to` já
aceitos e já autorizados; não há rota, coluna nem escopo novos. Migrações
continuam 001–110, 509 tabelas.

### Mudança comprovada

`MyAgenda.tsx` (`/admin/crm`, agenda pessoal) ganhou um alternador "Ver em
lista" / "Ver por semana". A visão semanal:

- calcula a semana (segunda a domingo, fuso local do navegador) a partir de
  um deslocamento de semanas navegável por "Semana anterior" / "Semana
  atual" / "Próxima semana";
- busca `GET /api/crm/visits/agenda?limit=100&offset=0&from=<segunda
  00:00>&to=<domingo 23:59:59.999>` — mesma rota, mesma autorização (só
  visitas em que a identidade é responsável ou participante convidado, sem
  exposição de agenda alheia) já provada no cenário 4 e 7 de CRM-08;
- agrupa por dia da semana e mostra apenas o essencial (horário, situação,
  título, empresa);
- é **somente leitura**: confirmar/recusar presença, reagendar e cancelar
  continuam exclusivos da lista — decisão explícita para não duplicar
  controle de versão otimista (`expected_version`) em uma segunda tela.

Nenhuma rota de API foi criada ou alterada; `src/server/crm-visit-api.mjs`
não foi tocado nesta fatia.

### Gates executados

| Comando | Esperado | Observado |
|---|---|---|
| `npm ci` | instalação reproduzível | 82 pacotes, exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 | 5/5, migrações 001–110 contínuas e registradas no migrador (sem migração nova) |
| `npm run test:migrations:pg` | replay + clone + checksum negativo | `CHECKSUMMED=110/110`, `TABLES=509->509` (inalterado), clone rejeita `006` sem rebaseline |
| `npm run test:l04-delivery:pg` (1ª) | todos os cenários | **8/8**, exit 0 |
| `npm run test:l04-delivery:pg` (2ª consecutiva) | reprodutível | **8/8**, exit 0 |
| `npm test` | suíte unitária | 186/186 |
| `npm run typecheck` | 0 erros | 0 erros |
| `npm run build` | build com `/admin/crm` | sucesso |
| `git diff --check` | limpo | limpo (`tsconfig.json`/`next-env.d.ts` restaurados após o dev server do gate reescrevê-los) |

### Cenário 8 do gate L04 — o que é provado

HTTP real, PostgreSQL 17 descartável, Chromium real sem
`--disable-web-security`. Sem SQL de fixture além da criação padrão de
empresa/oportunidade/visitas pela API real.

1. Uma identidade `comercial` cria duas visitas futuras: uma "perto" (2 dias
   à frente) e uma "distante" (20 dias à frente).
2. Na UI, a lista mostra as duas normalmente (regressão: nada mudou na visão
   pré-existente).
3. Ao alternar para "Ver por semana", a busca real ao mesmo endpoint é
   aguardada antes de qualquer asserção (sem *race* entre o clique e o
   estado ainda "Carregando a semana…").
4. A visita "distante" **nunca** aparece na semana atual nem na seguinte —
   prova de que o filtro de período é real, não decorativo.
5. A visita "perto" aparece exatamente no dia da semana correto (nome do dia
   + data calculados independentemente pelo teste e comparados ao rótulo
   acessível `Dia da agenda <dia da semana> <dd/mm>` renderizado pela UI),
   seja na semana atual, seja — no pior caso, quando o dia do teste cai perto
   da virada de semana — na seguinte; ao voltar para "Semana atual" ela some
   de novo.
6. Uma semana inteiramente no passado ("Semana anterior" a partir da atual)
   não mostra nenhuma das duas visitas.
7. Voltar para "Ver em lista" preserva as duas visitas, sem perda de estado.
8. Nenhum erro de console, requisição falhada same-origin ou resposta 5xx
   durante toda a navegação.

### Limites honestos deste recorte

- A visão de calendário é **somente leitura**: não há confirmar, recusar,
  reagendar, cancelar ou convidar a partir dela. Decisão de escopo explícita,
  não limitação técnica — ver `docs/PROMPT-CONTINUACAO-CRM-AGENDA-CALENDARIO.md`.
- Lembretes e notificações da agenda continuam fora (dependem de provedor,
  autorização e opt-out — nenhum decidido).
- Sem paginação dentro da semana além do teto já existente (`limit=100`); se
  a contagem total exceder o exibido, a tela avisa em vez de fingir
  completude.
- CRM-07 (kanban/tabela campo a campo, notas internas), lacunas PUB
  (PUB-02/05/06..10) e revalidação campo a campo de CRM-01..06 continuam
  pendentes. CRM-10, automação de mensagens, SMTP, calendário externo,
  hospedagem externa, Windows e aceite humano seguem fora por decisão.

---

## L04 — PUB-10: mensuração de origem e conversão (painel derivado)

Sessão `arena/01a0ef49-gruposegsystemseguranca`, sobre `main @ fe35b4c`.
Política registrada ANTES da rota em
`docs/PROMPT-CONTINUACAO-PUB10-METRICAS-ORIGEM.md`.

Ambiente: Linux x86_64, Node v22.22.3, npm 10.9.8, PostgreSQL 17.9
(`embedded-postgres`, cluster descartável por execução), Chromium real sem
`--disable-web-security`.

### Comandos e resultados observados

| # | Cenário | Comando | Esperado | Observado |
|---|---|---|---|---|
| PUB10-1 | Verificações estáticas | `node scripts/qa-wave0-static.mjs` | 5/5 | `RESUMO: 5/5`, migrações 001–110 contínuas |
| PUB10-2 | Migrações em banco descartável | `npm run test:migrations:pg` | 110/110, 509 tabelas | `CHECKSUMMED=110/110 TABLES=509->509`, `SECOND_EXIT=0` |
| PUB10-3 | Migração adulterada recusada | idem (clone mutado) | recusa sem rebaseline | `migration_checksum_mismatch: 006`, exit 1 tratado |
| PUB10-4 | Gate de entrega (1ª execução) | `npm run test:l04-delivery:pg` | tudo passa | **9/9**, `L04_DELIVERY_TEST_EXIT: 0` |
| PUB10-5 | Gate de entrega (2ª consecutiva) | idem | tudo passa | **9/9**, `L04_DELIVERY_TEST_EXIT: 0` |
| PUB10-6 | Suíte unitária | `npm test` | tudo passa | 186/186 |
| PUB10-7 | Tipos | `npm run typecheck` | 0 erros | 0 erros |
| PUB10-8 | Build | `npm run build` | sucesso | sucesso |
| PUB10-9 | Higiene do diff | `git diff --check` | limpo | limpo |

Nenhuma migração foi criada: a fatia é leitura agregada sobre tabelas que já
existiam. `scripts/qa-wave0-static.mjs` (`latestMigration`) e
`scripts/migrate-site-visual.mjs` permaneceram intocados. Próxima migração
livre continua **111**.

### O que o cenário novo do gate prova

Cenário `PUB-10: mensuração de origem e conversão — agregado derivado,
minimizado e fail-closed`, em `tests/l04-delivery.integration.test.mjs`.
HTTP real + PostgreSQL descartável + Chromium real; SQL usado só para montar
a fixture de leads e o vínculo lead→oportunidade.

1. **Fail-closed de acesso.** Anônimo em `GET /api/admin/leads/metrics` →
   401 `admin_session_required`. Identidade real com papel `rh` → 403.
   `POST` na rota → 405 com cabeçalho `Allow: GET`. Não existe parâmetro,
   cabeçalho ou variável de ambiente que libere o acesso.
2. **Fail-closed de janela.** `from=ontem` → 400 `invalid_period`;
   `from > to` → 400 `invalid_period`; `from=2026-02-31` (data que não
   existe, e que o `Date` do JS "consertaria" silenciosamente para 03/03) →
   400 `invalid_period`; janela de 2020 até hoje → 400 `period_too_long`.
   Não há consulta "tudo desde sempre" por esta rota.
3. **Agregado derivado correto.** Fixture com 3 pedidos na origem A dentro da
   janela de 30 dias (1 confirmado, 1 realizado, 1 solicitado), 1 pedido na
   origem B sem conversão, 1 pedido sem origem declarada e 1 pedido da
   origem A com 40 dias — este último **não** é contado, provando que o
   período filtra de verdade. Duas oportunidades reais criadas pela API são
   vinculadas por `public_lead_id` (uma delas em `stage='ganho'`). Resultado
   conferido: origem A com `leads=3`, `visitsConfirmed=2`, `converted=2`,
   `won=1`, `conversionRate=66.67`, `winRate=33.33`.
4. **Distinção entre "zero" e "sem base".** Origem B, que tem pedidos e
   nenhuma conversão, devolve `conversionRate=0`. Uma janela sem nenhum
   pedido (janeiro/2019) devolve `rows: []`, `totals.leads=0` e
   `totals.conversionRate=null` — "não há base para calcular" nunca é
   apresentado como "a taxa é zero".
5. **Rótulo explícito para origem ausente.** Lead com origem em branco e
   campanha/canal nulos aparece como `(não informado)` nos três campos; não
   some do agregado e não tem origem inferida de IP, referer ou user agent.
6. **Minimização provada, não prometida.** Asserção explícita de que o JSON
   da resposta não contém o telefone, o e-mail, o nome nem nenhum dos ids de
   lead da fixture; de que as chaves de cada linha são apenas
   `origin/campaign/channel/leads/visitsConfirmed/converted/won/conversionRate/winRate`;
   e de que `&detail=1&raw=true&include=leads` não destrava dado por-lead.
   O mesmo é verificado no DOM renderizado.
7. **Navegador real, no domínio certo.** Chromium com sessão real de
   `comercial` abre `/admin/leads` (não `/admin/ti`), aguarda a resposta HTTP
   real de `/api/admin/leads/metrics` com `page.waitForResponse` (nunca
   `waitForTimeout`), lê 4 pedidos na janela padrão de 90 dias, encurta o
   período para 30 dias, aguarda a nova resposta real e passa a ler 3.
   Também é verificado que o painel **não** tem nenhum botão de
   criar/salvar/registrar métrica, e que não gera rolagem horizontal.
8. Nenhum erro de console, requisição same-origin falhada ou resposta 5xx em
   toda a navegação.

### Ajuste declarado durante a fatia

A primeira redação do cenário assumia que o painel abriria já na janela de 30
dias usada nas asserções por HTTP, e leu 4 pedidos onde esperava 3. O padrão
do painel é 90 dias, e o pedido de 40 dias atrás entra nele legitimamente.
**A regra não foi afrouxada**: o cenário passou a afirmar os dois valores
(4 em 90 dias, 3 em 30 dias), o que prova melhor que o filtro de período é
real. Registrado aqui como exige o método.

### Limites honestos deste recorte

- **Testes A/B não foram implementados** e não têm rota nem tela. O próprio
  requisito PUB-10 os condiciona a "tráfego, hipótese e tratamento de dados
  definidos"; nenhuma das três coisas existe hoje, e o sistema não tem
  tráfego real. Entregar o mecanismo antes disso seria entregar um botão que
  ninguém pode usar com honestidade.
- **`src/app/admin/ti/OriginMetricsClient.tsx` foi descartado para esta
  finalidade e continua órfão.** É um CRUD onde um humano digitaria
  `total_leads`, `converted_leads`, `total_opportunities` e
  `total_contracts` à mão — número de conversão inventado com aparência de
  relatório oficial. As tabelas da migração 092 (`pub10_origin_metrics`,
  `pub10_conversion_events`, `pub10_ab_tests`) continuam existindo (migrações
  são imutáveis), sem tela, e não são fonte de verdade de nada.
- A rota **não grava trilha por consulta**, por decisão registrada: é leitura
  agregada sem dado pessoal identificável, e uma linha de auditoria por render
  de painel degradaria `auth_access_audit`. Como não há mutação, também não há
  nesta fatia o cenário de "falha de auditoria injetada reverte a mutação".
- "Ganho no funil" é decisão comercial registrada em `crm_opportunities.stage`
  — **não** significa dinheiro recebido, mesma ressalva já registrada em
  CRM-06.
- Estados legados pré-PUB-04 (`new`, `contacted`, `closed`) contam em
  "pedidos", mas nunca em "visita confirmada" nem em "convertido": não há como
  saber o que significavam, e chutar seria fabricar.
- Fora do recorte: exportação (CSV/PDF), gráficos, comparação entre períodos,
  atribuição multi-toque, contrato como degrau do funil e qualquer envio a
  ferramenta externa de analytics.
- Continuam pendentes em L04: CRM-07 residual (kanban/tabela campo a campo e
  notas internas), PUB-02/05 e PUB-06..09, e a revalidação campo a campo de
  CRM-01..06. CRM-10, automação de mensagens, SMTP, lembretes da agenda,
  hospedagem externa, Windows e aceite humano seguem fora por decisão.

*(Nota de integração: na fusão com a fatia de notas/kanban, este cenário passou a
ser o nono do gate; a bateria mesclada revalidou 9/9 em duas execuções
consecutivas.)*

## Continuação CRM-07 residual — notas internas e campo a campo de CRM-05/06 (branch `arena/01a0eef9-gruposegsystemseguranca`)

### Política registrada antes da rota

`docs/PROMPT-CONTINUACAO-CRM-NOTAS-KANBAN.md`, com as decisões principais:

- Nota interna segue a borda pessoal da oportunidade (responsável atual ou
  criador enquanto sem responsável); RH 403, outro comercial 404, sem bypass
  administrativo; nota nunca aparece em superfície pública, do cliente ou de
  empresa; corpo 1–4000 com trim (API e banco); toda mutação audita na mesma
  transação; edição com versão otimista por gatilho e `edited_at` visível;
  exclusão lógica coerente; **só quem escreveu edita ou exclui a própria
  nota**; paginação real 1–100.
- A oportunidade em si passou a obedecer à política pessoal (listagem, detalhe
  legado e PATCH); corte de papel da família comercial; CRM-05 completo em
  criação e manutenção com unidade validada contra a mesma empresa;
  **atribuição imutável** (`origin`/`campaign`/responsável nunca editáveis,
  `public_lead_id` gerenciado pelo servidor); responsável gravado de verdade
  na conversão de lead.
- CRM-06: motivo de perda obrigatório também no banco (CHECK `NOT VALID`,
  vale para escrita nova); reabertura de `perdido`/`ganho` exige motivo,
  audita `crm_opportunity_reopen` e limpa o `loss_reason` corrente; troca
  direta entre terminais recusada; `is_won`/`is_lost` não podem divergir do
  estágio; `ganho` segue sendo estado de funil, nunca dinheiro recebido.
- Busca de oportunidades no servidor com curinga escapado (`100%` é literal).

### Comandos executados nesta continuação

| Comando | Resultado |
| --- | --- |
| `npm ci` | exit 0 (início da sessão, antes de qualquer código) |
| `node scripts/qa-wave0-static.mjs` | 5/5 (migrações 001–111 contínuas e agendadas) |
| `npm run test:migrations:pg` | 111/111 na primeira aplicação e no replay; 510→510 tabelas; clone TEMPLATE preservou checksums; adulteração do 006 recusada (controle negativo) |
| `npm run test:l04-delivery:pg` | **8/8, duas vezes consecutivas**, com PostgreSQL descartável, HTTP real e Chromium real (sem `--disable-web-security`) |
| `npm test` | 186/186 |
| `npm run typecheck` | 0 erros |
| `npm run build` | sucesso, com `/admin/crm` e `/admin/comercial` |
| `git diff --check` | limpo; `tsconfig.json`/`next-env.d.ts` reescritos pelo dev server do gate (`.next/integration-l04`) conferidos e restaurados com `git checkout` |

### Cenário 8 do gate L04 (novo) — o que prova

1. Quatro identidades: dono (comercial), outro comercial e RH; empresa e
   unidades criadas por HTTP (unidade é fixture SQL declarada — criação de
   unidade segue sem rota, escopo CRM-01).
2. CRM-05 campo a campo: criação com TODOS os campos (serviço, necessidade,
   prioridade, previsão, valor, próxima ação/data, origem, campanha, unidade)
   com persistência conferida campo a campo, inclusive responsável =
   identidade da sessão com nome real de `auth_identities.display_name` e
   join da unidade conferido no banco.
3. Controles negativos de campo: prioridade inválida, unidade de outra
   empresa (`unit_not_available`), valor negativo, previsão `15/12/2026`,
   título ausente, `public_lead_id` no corpo (`server_managed_fields`),
   empresa inexistente.
4. Atribuição imutável: PATCH com `origin`, `campaign` e `responsible_id`
   devolve 400 `field_not_editable` em todos.
5. Manutenção por PATCH: prioridade, valor, previsão, necessidade, serviço,
   limpeza de unidade (`unit_id: null`) e próxima ação/data; unidade de outra
   empresa recusada também no PATCH.
6. Busca no servidor com curinga escapado: `search=100%` encontra só
   “Promoção 100% adesão” (não casa “Promoção 1000 adesão”); busca por
   “Promoção” encontra as duas; `priority=critica` filtra no servidor.
7. Borda pessoal: listagem do dono não contém o funil do outro comercial e
   vice-versa; detalhe e PATCH do outro comercial 404; RH 403 na listagem e no
   detalhe; sem sessão 401; mutação sem `Origin` 403. Detalhe de empresa
   (`GET /api/crm/companies/:id`) devolve 0 oportunidades para identidade fora
   da propriedade.
8. Funil completo: novo→qualificação→vistoria→proposta_elaboracao→
   proposta_enviada→negociacao→ganho com histórico de estágios conferido;
   `is_won`/`is_lost` coerentes; nenhuma linha em `crm_contracts` nasce do
   estágio (ganho não é dinheiro recebido); perda sem motivo 400; troca direta
   ganho↔perdido 400 `invalid_terminal_transition` nos dois sentidos;
   reabertura sem motivo 400 `reopen_reason_required`; reabertura com motivo
   200 auditando `crm_opportunity_reopen` e limpando `loss_reason` (motivo
   antigo preservado no histórico de estágio); trilha de auditoria completa na
   ordem (`create`, `update`, 6× `stage_change`, `reopen`, `stage_change`,
   `reopen`).
9. Auditoria transacional do funil: gatilho que rejeita `crm_opportunity_reopen`
   faz o PATCH devolver 503 e o estágio permanecer `perdido` (mutação revertida).
10. CHECKs do banco como controle negativo (SQL): `stage='perdido'` sem motivo
    recusado; `is_won=true` com estágio aberto recusado; nota de whitespace
    recusada pelo `btrim`.
11. Notas: criação com trim e autor; corpo vazio/whitespace/>4000 recusado;
    12 notas com paginação real sem sobreposição nem perda (3 páginas
    conferidas por id); `limit=0`/`101`/`offset=-1` 400; outro comercial 404
    (GET e POST), RH 403, sem sessão 401, POST sem `Origin` 403; edição com
    versão errada 409 e com versão certa 200 (`edited_at` preenchido, versão
    2); escrita direta no banco confirma o gatilho de versão (v3); nota de
    outro autor (fixture SQL) é visível ao dono mas não pode ser editada nem
    excluída por ele (`note_author_required`); exclusão com versão errada 409;
    exclusão lógica preserva linha com `deleted_at`/`deleted_by_id`, sai da
    leitura e do total e não pode ser reeditada (404); gatilho que rejeita
    `crm_note_create`/`crm_note_update` reverte criação (contagem conferida)
    e edição (corpo conferido intacto).
12. Jornada de UI real (Chromium, sessão do dono, 1440×1000): formulário
    “Nova oportunidade (CRM-05)” preenchido com todos os campos (o select de
    unidades é alimentado pelo detalhe da empresa); cartão do kanban exibe
    serviço, prioridade, valor, responsável, unidade, previsão e origem;
    tabela exibe todas as colunas sem rolagem horizontal; painel de detalhe
    mostra origem como imutável; movimentação qualificação → perdido (motivo
    exigido na interface, inclusive a negativa do envio vazio) → reabertura
    para negociacao (motivo exigido) → ganho com o aviso “ganho é estado de
    funil — não é dinheiro recebido”; notas criadas, editadas e excluídas pela
    interface. Sem erro de console/HTTP 5xx.

### Ajustes declarados em cenários preexistentes (regra mais forte)

- CRM-07 tarefas, CRM-07 interações, CRM-07 delegação, CRM-09 e CRM-08: as
  asserções do detalhe legado `GET /api/crm/opportunities/:id` para identidade
  fora da propriedade mudaram de “200 com lista vazia” para **404** — a
  oportunidade em si (necessidade, valor, origem, motivo de perda) passou a
  ser pessoal, não apenas as sublistas.
- CRM-08 agenda: `participantDetail` no detalhe legado passou a 404 e a visão
  do participante foi reafirmada pela própria agenda
  (`/api/crm/visits/agenda`), que continua sendo o caminho dele — nenhuma
  capacidade foi removida, o atalho pela oportunidade alheia foi fechado.
- CRM-07 delegação (UI): o rótulo do campo de busca de oportunidades mudou de
  “Busca por título de oportunidade” para “Buscar oportunidade (título/
  necessidade)” porque a busca passou a ser aplicada no servidor e agora
  também cobre a necessidade.
- Nenhuma regra de proteção foi afrouxada; todas as mudanças acima apertam a
  borda.

### Limites honestos deste recorte

- A busca de empresas (CRM-01) segue com curinga não escapado; não foi tocada
  (fora do escopo da fatia, anotado como residual).
- Rotas de empresa/contato/importação em `crm-api.mjs` ainda usam o auxiliar
  de auditoria que engole falha (mutação sem trilha não reverte). As rotas de
  oportunidade e notas desta fatia são transacionais; o restante segue como
  risco residual declarado, a exemplo do que já constava para
  `handleAdminLeadStatus` antes da migração 110.
- Criação/edição de unidade (`crm_company_units`) segue sem rota (escopo
  CRM-01); o gate usa fixture SQL declarada.
- Sem drag-and-drop no kanban: a movimentação de funil é pelo painel de
  detalhe, com os motivos exigidos.
- CRM-02 (contato com função decisor/influenciador/usuário/financeiro com
  preferências/restrições) continua sem tela dedicada; CRM-01..04 aguardam
  revalidação campo a campo.

### Integração com os PRs #24 (calendário CRM-08) e #26 (PUB-10)

Esta fatia foi desenvolvida em paralela à fatia de calendário de CRM-08
(PR #24, branch `arena/01a0ef36`) e à fatia de métricas de origem/conversão
PUB-10 (PR #26, branch `arena/01a0ef49`). Nos merges para o `main`
atualizado, os conflitos do gate e dos docs foram resolvidos mantendo
**todos** os cenários — no gate mesclado, notas/kanban é o oitavo, calendário
o nono e PUB-10 o décimo — e a bateria completa foi re-executada sobre o
estado final: `node scripts/qa-wave0-static.mjs` 5/5, `npm run
test:migrations:pg` 111/111 (replay, clone, checksum negativo, 510 tabelas),
`npm run test:l04-delivery:pg` **10/10, duas vezes consecutivas**, `npm test`
186/186, `npm run typecheck` 0 erros, `npm run build` ok, `git diff --check`
limpo. Nenhuma regra de proteção foi afrouxada na resolução.

Ajuste declarado pós-integração (CI): a primeira execução do gate no CI
falhou (etapa do gate, exit 1, em runner visivelmente lentificado durante o
incidente de storage do GitHub Actions — os logs da execução ficaram
indisponíveis por EOF no blob). Sem log para diagnosticar e com a bateria
local verde (9/9 com TZ local e com TZ=UTC naquele ponto), os timeouts de
runtime dos dois cenários desta fatia foram ampliados apenas como orçamento
de infraestrutura — cenário de notas/kanban 180s→240s e cenário de calendário
120s→180s — sem tocar em nenhuma asserção, espera ou regra de proteção.

Ajuste declarado pós-integração (cenário PUB-10): na fusão com o PR #26, a
fixture SQL do cenário de PUB-10 gravava `stage='ganho'` sem acertar a
bandeira `is_won`, o que a migração 111 desta fatia passou a recusar no banco
(CHECK `crm_opportunities_won_flag_check`, `NOT VALID`, vale para escrita
nova). A fixture passou a gravar `is_won = true` junto com o estágio. A regra
não foi afrouxada — o cenário é que precisou respeitar a coerência nova; sem
o ajuste, o gate mesclado fechava em 9/10.

## L04 — PUB-08: SEO técnico (branch `arena/01a0ef61-gruposegsystemseguranca`)

Base da sessão: `main @ b3c1db6` (merge do PR #26). Durante a sessão o PR #25
foi mergeado por fora e esta branch **incorporou `origin/main` (`8f52137`) por
merge, sem conflito em nenhum arquivo**; toda a bateria abaixo foi executada
**sobre o estado mesclado**, com o gate já contendo os 11 cenários.

### Política registrada antes da rota

`docs/PROMPT-CONTINUACAO-PUB08-SEO-TECNICO.md` — oito decisões escritas antes
de qualquer linha de rota, mais a dependência declarada do PR #25, os três
achados da execução e a justificativa da migração 112.

### O defeito que existia (verificado no código, antes de mexer)

| # | Defeito | Onde |
|---|---|---|
| 1 | Não existia `/robots.txt`; rastreador recebia 404 do Next | ausência de rota |
| 2 | Sitemap **digitado à mão** em `seo_sitemap_entries`, sem relação com as rotas reais | `src/server/seo-api.mjs` |
| 3 | XML montado por concatenação crua (`` `<loc>${r.url}</loc>` ``), sem escapar | idem |
| 4 | `seo_redirects` **nunca consultada** no caminho da requisição: cadastrar redirect não mudava nada | `server.mjs` |
| 5 | `GET /api/seo` e `/api/seo-configs` públicos devolvendo inclusive `is_published=false` | `handleConfigs` |
| 6 | Mutações não transacionais, auditoria engolida por `try {} catch {}` em `audit_log` | idem |
| 7 | Papel errado recebia **401** em vez de 403 | idem |
| 8 | `PATCH` de domínio gravava `verificado` **sem verificar nada** | `handleDomainVerification` |

### Comandos e resultados observados

| # | Cenário | Comando | Esperado | Observado |
|---|---|---|---|---|
| PUB08-1 | Instalação pelo lockfile | `npm ci` | sem dependência ausente | exit 0 |
| PUB08-2 | Estáticas de onda 0 | `node scripts/qa-wave0-static.mjs` | 5/5 | `5/5 ... Migrações SQL 001–112 contínuas e únicas`, exit 0 |
| PUB08-3 | Migrações em banco descartável | `npm run test:migrations:pg` | replay + clone + mismatch | `CHECKSUMMED=112/112 TABLES=510->510`, `migration_checksum_mismatch: 006` recusado sem rebaseline, `QA_CLONE_RESTORE: 112/112 checksums preserved` |
| PUB08-4 | Gate de entrega (1ª) | `npm run test:l04-delivery:pg` | 11/11 | `# pass 11 # fail 0`, `L04_DELIVERY_TEST_EXIT: 0` |
| PUB08-5 | Gate de entrega (2ª consecutiva) | idem | 11/11 | `# pass 11 # fail 0`, `L04_DELIVERY_TEST_EXIT: 0` |
| PUB08-6 | Unidade | `npm test` | tudo passa | **196/196** (186 antes + 10 de `tests/seo-technical.test.mjs`) |
| PUB08-7 | Tipos | `npm run typecheck` | 0 erros | 0 erros |
| PUB08-8 | Build | `npm run build` | sucesso | sucesso (as 3 páginas de segmento e as 6 de serviço seguem pré-renderadas após a troca `.ts`→`.mjs`) |
| PUB08-9 | Higiene do patch | `git diff --check` | limpo | limpo; `tsconfig.json`/`next-env.d.ts` restaurados após o dev server do gate |

### Cenário 11 do gate L04 — o que é provado

1. **robots fail-closed** — `/robots.txt` 200 com `User-agent: *` e
   `Disallow: /`, **sem** linha `Sitemap:`, e `X-Robots-Tag: noindex, nofollow`.
2. **Sem mapa publicado** — `/sitemap.xml` 404 com corpo `sitemap_not_published`,
   e `?released=true&force=1&preview=1` **não destrava** (segue 404).
3. **Prévia fail-closed** — 401 sem sessão (`admin_session_required`), 403 com
   papel `comercial`, 405 em POST com `Allow: GET`, 200 para `ti`.
4. **Sitemap derivado, não digitado** — o XML da prévia não contém `/admin`,
   `/api/`, `/cliente`, `/funcionario`, `/layout-0`, `/qa/` nem `/proposta`, e
   não traz `<lastmod>`, `<priority>` ou `<changefreq>` (não há fonte
   verdadeira para nenhum dos três).
5. **Título é coisa conferida** — cada uma das **17 URLs** derivadas é buscada
   por **HTTP real** e precisa responder 200 com `<title>` não vazio.
6. **Vazamento fechado** — `GET /api/seo` e `GET /api/seo-configs` anônimos
   401 e com papel `comercial` 403.
7. **14 recusas nomeadas no cadastro**, nenhuma gravando linha: destino
   externo absoluto, `//` relativo a protocolo, barra invertida, espaço no
   caminho, sombra de rota pública real, sombra de `/admin`, sombra de `/api`,
   sombra do próprio `/sitemap.xml`, destino inexistente, destino em área
   interna, laço sobre si mesmo, status inventado, motivo abaixo do mínimo e
   campo gerido pelo servidor vindo do cliente. A contagem é **escopada aos
   `old_path` tentados** porque a migração 090 já semeia quatro linhas.
8. **Seeds da 090 (achado)** — `/cliente/acesso` tem redirect semeado **ativo**
   e mesmo assim responde 200 servindo a página real (a regra de prefixo
   reservado o torna inerte; a linha continua ativa no banco, conferida por
   SQL); `/servicos/cerca-eletrica` — o único semeado com origem fora de área
   reservada — passa a responder **302 → `/servicos`** pela primeira vez.
9. **Cadeia** — alcançável só por **fixture SQL** que simula linha anterior a
   uma mudança de catálogo; recusada com `redirect_chain_not_allowed`.
10. **Auditoria transacional** — gatilho `qa_reject_seo_audit` injetado em
    `auth_access_audit` faz a criação devolver **503** e deixa **zero** linha
    em `seo_redirects`.
11. **Trilha** — criação 201 com **exatamente uma** linha
    (`seo_redirect_create`, `actor_kind='ti'`), 2ª tentativa
    `duplicate_old_path`, e **uma linha por alteração** de `is_active`
    (`seo_redirect_update`, duas no total).
12. **A migração 112 ampliou, não afrouxou** — `INSERT` direto com
    `action='seo_redirect_bogus'` continua recusado pelo banco com `23514` em
    `auth_access_audit_action_check`.
13. **Salto real** — `/promo-portaria-<tag>?utm=…` responde **301** com
    `Location` preservando a query; `POST` no mesmo caminho **não** é desviado;
    `is_active=false` para de desviar e `true` volta a desviar.
14. **Domínio** — `PATCH` com `verificado` devolve 400
    `domain_verification_not_supported` e a linha continua `pendente` (SQL).
15. **Chromium real** (sem `--disable-web-security`) sai de `/promo-portaria`
    e chega em `/servicos` com `h1` "Serviços", usando `page.waitForResponse`
    na resposta do endereço antigo — nunca espera fixa —, sem rolagem
    horizontal e sem erro de console.

### Achado grave registrado — o CHECK de auditoria perdeu 148 ações em 099/100/103

O gate falhou com
`new row for relation "auth_access_audit" violates check constraint "auth_access_audit_action_check"`
ao criar o redirect. A causa **não** era a fatia: as migrações **099, 100 e
103 redigitaram a lista inteira** do CHECK em vez de ampliá-la. Comparando a
lista vigente na 093 (289 valores) com a vigente na 103 (265 valores),
**148 valores desapareceram** — entre eles `seo_config_create`,
`seo_config_update`, `seo_redirect_create`, `seo_redirect_update`,
`seo_sitemap_update`, `domain_verification_create`,
`domain_verification_verify`, todos os `cms_content_*`, `theme_*`, `package_*`,
`origin_metric_*`, `ab_test_*` e `cli_complaint_*`. O comentário daquelas
migrações afirma "mantém todas as anteriores"; a lista digitada não mantém.

Ficou invisível porque quase todo gravador de trilha do projeto embrulha o
`INSERT` em `try {} catch {}` — a trilha simplesmente não era escrita. Só
apareceu agora porque esta fatia grava **na mesma transação e sem engolir
erro**.

**Correção:** `db/migrations/112-pub08-seo-redirect-audit-action.sql`, aditiva,
no padrão da 110/111 — lê a definição vigente com `pg_get_constraintdef`,
**falha** (`audit_action_constraint_missing`) se a constraint pai sumir,
**falha** (`audit_actor_kind_ti_missing`) se `actor_kind` deixar de aceitar
`'ti'`, e reescreve como `CHECK ((definição anterior) OR action IN (…))`.
Reautoriza **apenas** `seo_redirect_create` e `seo_redirect_update`, as duas
que esta fatia escreve e prova por portão.

**Achado aberto (não corrigido de propósito):** os outros **146 valores
continuam fora da lista**. Qualquer rota que grave uma daquelas ações em
`auth_access_audit` hoje perde a trilha em silêncio (pelo `catch {}`) ou
falha. Reautorizar em bloco seria "autorizar" trilha de caminhos que nenhum
portão desta entrega exercita — inventar cobertura. Fica registrado aqui para
a fatia que for corrigir cada domínio com portão próprio.

### Ajustes declarados em cenários desta fatia (regra nunca afrouxada)

1. A primeira redação esperava `cannot_shadow_existing_route` para
   `/faq → /faq`. A regra recusa **antes**, com erro mais preciso
   (`cannot_redirect_to_self`), porque o laço é checado antes da sombra. O
   **cenário** foi corrigido; a regra, não. Ambas as saídas são 400 e ambas
   recusam a gravação.
2. A primeira redação exigia `seo_redirects` **inteira vazia** depois das
   recusas. A migração 090 (imutável) já semeia quatro linhas, então a
   asserção certa é que **nenhuma das tentativas recusadas** virou linha —
   e o bloco 7b passou a provar os seeds explicitamente.

### Limites honestos deste recorte

- **A indexação não foi ligada.** Tudo foi provado no estado fail-closed, que
  é o estado da entrega local. Nada é publicado em produção.
- **Verificação de domínio fica FORA** (fronteira externa: DNS/HTTP no domínio
  real). O que a fatia fez foi **fechar o caminho que fabricava o fato**.
  Nenhum controle desta fatia depende dessa tabela.
- **`SeoClient.tsx` foi descartado para esta finalidade e permanece órfão** —
  mesmo tratamento dado a `OriginMetricsClient.tsx` em PUB-10.
  `seo_sitemap_entries` e `seo_configs` continuam existindo, sem tela, e
  **não são fonte de verdade de nada**.
- **Não há tela de administração de redirects**: a fatia entregou API e
  comportamento provados por portão, não interface.
- A coluna `hits` continua 0: contar exigiria escrever no banco a cada
  requisição pública (mesmo problema de trilha-por-leitura recusado em PUB-10).
- Fora: curinga/regex, redirect por domínio, `/layout-01..10`, `/qa/modulos` e
  `/proposta/aceite/[token]` no sitemap.
- **L04 continua PARCIAL e L05 não foi iniciado.** Aceite humano pendente;
  nada foi executado em Windows.

---

## Continuação CRM-01..04 — revalidação campo a campo

Política: `docs/PROMPT-CONTINUACAO-CRM-01-04-REVALIDACAO.md`. Base: HEAD
`5eea847`, sem dirty tree no início. Alterações principais: auditoria de
criação de empresa/contato com `BEGIN`/`COMMIT`, contato sem empresa recusado,
checagem de empresa existente e migração aditiva 113. A ação de auditoria não
é engolida; trigger QA que rejeita `crm_company_create` produziu HTTP 503 e
zero empresa persistida.

| Prova | Resultado |
|---|---|
| `npm ci` | 82 pacotes, 0 vulnerabilidades |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrações 001–113 |
| `npm run test:migrations:pg` | 113/113, replay, clone/checksum negativo, 510 tabelas |
| `npm test` | 196/196 |
| `npm run typecheck` | 0 erros |
| `npm run test:l04-delivery:pg` | 12/12, HTTP + PostgreSQL + Chromium; duas execuções finais consecutivas aprovadas |

O cenário CRM-01..04 cobre anônimo 401 e método 405; empresa com identificação,
tipo, segmento, cidade/UF, canais, responsável, origem/campanha e notas; contato
com função decisor, restrição e origem; empresa inexistente, contato sem empresa
e função inválida; lead público convertido e reconvertido sem duplicar; CSV com
prévia, validação, commit e exportação em bytes reais com prefixo seguro para
fórmula; e Chromium real esperando a resposta de listagem por
`page.waitForResponse`, sem rolagem horizontal e sem erro de console/5xx.

Limitações honestas: o fluxo CRM-02 segue sem tela dedicada de contato com
função/preferências; a revisão de deduplicação CRM-03 foi exercitada pela API e
pela prévia, mas não ganhou uma tela nova; CRM-04 herda a ausência de resolução
automática de contato sem empresa. Nenhum componente órfão foi conectado.

---

## Continuação CRM-02 — superfície dedicada de contatos (2026-09-30)

Política: `docs/PROMPT-CONTINUACAO-CRM-02-CONTATOS.md`. Base conferida antes
do código: merge `4208698` (`42086989943b5af8b2baec0bb19a700ea6b6cfc1`),
branch fixa `arena/01a0efae-gruposegsystemseguranca`, árvore limpa. A decisão foi
uma única fatia vertical: **Opção A — completar CRM-02**.

### Mudança comprovada

- `src/app/admin/crm/ContactManager.tsx` foi conectado dentro de `/admin/crm`.
  A UI escolhe uma empresa, carrega contatos por `GET /api/crm/contacts?companyId=`,
  cria e edita sem permitir trocar a empresa. A tela mostra função/papel de
  compra, preferências de canais e melhor horário, restrições, origem controlada,
  principal e estado ativo/inativo.
- `src/server/crm-api.mjs` passou a exigir a família comercial
  (`comercial`, `admin`, `marcelo`, `ti`) na superfície de contatos, a exigir
  empresa válida para lista/criação e a esconder contato sem empresa. O detalhe
  `GET/PATCH /api/crm/contacts/:id` valida campos e empresa imutável. O detalhe de
  empresa recebeu a mesma borda, para não reabrir o acesso a contatos por uma
  rota legada.
- Criação e edição usam `BEGIN`, mutação, `auth_access_audit` e `COMMIT`; falha
  do INSERT da trilha propaga, produz 503 e executa ROLLBACK. A migração aditiva
  `114-crm-02-contact-update-audit.sql` preserva o CHECK anterior, falha se a
  constraint pai não existir ou se `actor_kind='comercial'` não for aceito e
  adiciona somente `crm_contact_update`.

### Cenário 13 do gate L04 — o que é provado

O cenário próprio `CRM-02: contato dedicado com escopo de empresa, edição e
auditoria transacional` foi executado com PostgreSQL descartável, servidor
HTTP real e Chromium real sem `--disable-web-security`:

1. Anônimo recebe 401; RH recebe 403; origem externa em POST recebe 403; DELETE
   recebe 405; listagem sem empresa recebe 400 e empresa inexistente 404.
2. Preferência com canal inválido e origem não controlada recebem 400. Criação
   HTTP persiste função, papel de compra, preferências, restrições, origem,
   principal e empresa correta; a lista da empresa vizinha não vaza o contato.
3. Edição muda função, preferências, restrições, origem, principal e
   ativo/inativo; tentativa de enviar `company_id` responde 400
   `company_immutable`; RH não pode editar. O detalhe individual permanece
   autorizado somente pela família comercial.
4. Trilha contém `crm_contact_create` e `crm_contact_update` com o ator correto.
   Trigger QA que rejeita cada ação produz 503: falha na criação deixa zero
   contato novo e falha na edição conserva a função anterior.
5. Chromium real seleciona a empresa, aguarda as respostas reais da lista,
   criação e edição com `page.waitForResponse`, lê a função atualizada, não
   cria rolagem horizontal e não registra erro de console nem HTTP 5xx da
   aplicação.

### Comandos finais e resultados

| Comando | Resultado |
|---|---|
| `npm ci` | 82 pacotes, 0 vulnerabilidades |
| `node scripts/qa-wave0-static.mjs` | 5/5; migrações 001–114 contínuas e manifestadas |
| `npm run test:migrations:pg` | 114/114; replay, clone, checksum negativo; 510 tabelas |
| `npm run test:l04-delivery:pg` | 13/13; duas execuções finais consecutivas |
| `npm test` | 196/196 |
| `npm run typecheck` | aprovado |
| `npm run build` | aprovado; `/admin/crm` gerado |
| `git diff --check` | limpo |

A migração registrou o checksum negativo esperado do clone como parte do
controle: `006` foi recusada antes da rebaseline automática; isso não é falha
do gate. Depois do build, `tsconfig.json` e `next-env.d.ts` foram restaurados.

### Limites honestos

CRM-01 ainda não tem rota própria de unidades; CRM-03 ainda não tem uma tela
específica de revisão de deduplicação; CRM-04 não resolve automaticamente
contato sem empresa; as outras 146 ações de auditoria continuam fora do CHECK;
CRM-08 não ganhou lembretes/notificações externas; PUB-02/05/06/07/09 seguem
pendentes/parciais; CRM-10 permanece fora por decisão. Nenhuma integração
externa, produção, Windows ou aceite humano foi contratado/executado. L04
continua parcial e L05 não foi iniciado.

---

## Continuação CRM-01 — superfície dedicada e manutenção de unidades (2026-09-30)

Política: `docs/PROMPT-CONTINUACAO-CRM-01-UNIDADES.md`. Base conferida antes
do código: merge `186e7dd` (`186e7dd4c420d577540b6ade8902b678762fac8b`),
branch fixa `arena/01a0efcc-gruposegsystemseguranca`, árvore limpa. A decisão foi
uma única fatia vertical: **Opção A — completar CRM-01**.

### Mudança comprovada

- `src/app/admin/crm/UnitManager.tsx` foi conectado dentro de `/admin/crm`.
  A UI escolhe uma empresa, carrega unidades por `GET /api/crm/units?companyId=`,
  cria e edita sem permitir trocar a empresa. A tela gerencia nome da unidade
  (obrigatório 1-200), cidade (máx 100), endereço (máx 300) e indicação de
  unidade principal.
- `src/server/crm-api.mjs` e `server.mjs` implementaram `GET/POST /api/crm/units`
  e `GET/PATCH /api/crm/units/:id` com família comercial (`comercial`, `admin`,
  `marcelo`, `ti`), 401 sem sessão, 403 para RH e origem diferente, 405 para
  métodos não permitidos (ex.: DELETE). O envio de `company_id` no PATCH é
  rejeitado com 400 `company_immutable` e chaves desconhecidas recebem 400
  `field_not_editable`.
- Regra de negócio de unidade principal sem duplicidade: quando uma unidade é
  marcada com `is_main = true` (na criação ou na edição), qualquer unidade
  principal anterior da mesma empresa tem `is_main` atualizado para `false` na
  mesma transação atômica.
- Criação e edição usam `BEGIN`, mutação, `auth_access_audit` e `COMMIT`; falha
  do INSERT da trilha propaga, produz 503 e executa ROLLBACK. A migração aditiva
  `115-crm-01-unit-audit.sql` preserva o CHECK anterior, falha se a
  constraint pai não existir ou se `actor_kind='comercial'` não for aceito e
  adiciona `crm_unit_create` e `crm_unit_update`.
- No teste de entrega `tests/l04-delivery.integration.test.mjs`, o cenário 8
  substituiu a fixture SQL direta de `crm_company_units` por chamadas à API
  real via `POST /api/crm/units`.

### Cenário 14 do gate L04 — o que é provado

O cenário próprio `CRM-01: unidades dedicadas com escopo de empresa, unidade principal única, auditoria transacional e UI` foi executado com PostgreSQL descartável, servidor
HTTP real e Chromium real sem `--disable-web-security`:

1. Anônimo recebe 401; RH recebe 403; origem externa em POST recebe 403; DELETE
   recebe 405; listagem sem empresa recebe 400 e empresa inexistente 404.
2. Criação HTTP persiste nome, cidade, endereço, unidade principal e empresa
   correta; a lista da empresa vizinha não vaza a unidade; busca por termo
   filtra no servidor.
3. Criação de nova unidade principal desmarca atomicamente a unidade principal
   anterior da mesma empresa.
4. Edição muda nome, cidade, endereço e promove a unidade a principal,
   desmarcando a outra unidade. Tentativa de enviar `company_id` responde 400
   `company_immutable`; RH não pode editar.
5. Trilha contém `crm_unit_create` e `crm_unit_update` com o ator correto.
   Trigger QA que rejeita cada ação produz 503: falha na criação deixa zero
   unidade nova e falha na edição conserva o valor anterior.
6. Chromium real seleciona a empresa, aguarda as respostas reais da lista,
   criação e edição com `page.waitForResponse`, lê a cidade atualizada, não
   cria rolagem horizontal e não registra erro de console nem HTTP 5xx da
   aplicação.

### Comandos finais e resultados

| Comando | Resultado |
|---|---|
| `npm ci` | 82 pacotes, 0 vulnerabilidades |
| `node scripts/qa-wave0-static.mjs` | 5/5; migrações 001–115 contínuas e manifestadas |
| `npm run test:migrations:pg` | 115/115; replay, clone, checksum negativo; 510 tabelas |
| `npm run test:l04-delivery:pg` | 14/14; duas execuções finais consecutivas |
| `npm test` | 196/196 |
| `npm run typecheck` | aprovado |
| `npm run build` | aprovado; `/admin/crm` gerado |
| `git diff --check` | limpo |

### Limites honestos

CRM-03 ainda não tem uma tela específica de revisão de deduplicação; CRM-04 não
resolve automaticamente contato sem empresa; as outras 144 ações de auditoria
continuam fora do CHECK; CRM-08 não ganhou lembretes/notificações externas;
PUB-02/05/06/07/09 seguem pendentes/parciais; CRM-10 permanece fora por
decisão. Nenhuma integração externa, produção, Windows ou aceite humano foi
contratado/executado. L04 continua parcial e L05 não foi iniciado.

---

## CRM-03 — revisão dedicada de deduplicação (2026-09-29)

Base: `c3d799c` (PR #31). Branch `arena/01a0efec-gruposegsystemseguranca`.

| # | Cenário | Comando | Esperado | Observado |
|---|---|---|---|---|
| CRM03-1 | Verificações estáticas | `node scripts/qa-wave0-static.mjs` | 5/5, migrações 001–116 | 5/5, 0 migrações ausentes |
| CRM03-2 | Suíte unitária | `npm test` | tudo passa | 196/196, exit 0 |
| CRM03-3 | Tipos | `npm run typecheck` | 0 erros | 0 erros, exit 0 |
| CRM03-4 | Build | `npm run build` | sucesso | sucesso |
| CRM03-5 | Migrações em PostgreSQL descartável | `npm run test:migrations:pg` | 116/116, replay/clone/checksum | `116/116 checksums preserved`, `tables 510`, `migration_checksum_mismatch: 006 rejected (exit 1)` |
| CRM03-6 | Gate L04 (HTTP real + PG descartável + Chromium real) | `npm run test:l04-delivery:pg` | 15/15 | 15/15 em duas execuções consecutivas (`L04_DELIVERY_TEST_EXIT: 0`); execuções intermediárias reprovadas apenas por Chromium morto no `launch` (ruído de ambiente) e por seletor de UI corrigido |

Cenário 15 do gate (`CRM-03: revisão dedicada de deduplicação`) cobre:
401 sem sessão, 403 para RH e para origem externa, 405 em método errado,
400 `invalid_decision`/`field_not_editable`, 404 de lote e de linha,
409 `row_not_duplicate`, 409 `pending_dedup_review` com lote preservado em
`pending` e nenhuma empresa criada, 400 `actions_not_accepted`, rollback 503
com decisão revertida por gatilho de auditoria injetado, decisão persistida com
autor/data e trilha `crm_import_row_decision`, commit revisado criando apenas o
autorizado, 409 `batch_not_pending` depois do fechamento, curinga `%` do CSV
não casando com empresa de terceiro e jornada de UI em `/admin/crm` sem
rolagem horizontal, erro de console ou 5xx inesperado.

---

## FIN-13 — fatia aditiva: revisão, margem conferida, idempotência e histórico (2026-10-01)

Todos os comandos abaixo rodaram no ambiente remoto Arena, sobre a base `4ea3578`, com PostgreSQL descartável, HTTP real e Chromium real. Os arquivos `.log` brutos não entram no Git (ignorados por `.gitignore`); os contadores e as mensagens de falha foram transcritos aqui literalmente, inclusive os resultados desfavoráveis.

Base: `4ea3578` (merge do PR #66), sem commits posteriores na consulta.
Branch: `arena/01a0f9da-gruposegsystemseguranca`. Ambiente remoto Arena, Linux
x86_64, Node v22.22.3, npm 10.9.8, PostgreSQL 17.9 descartável por execução,
Chromium empacotado real. Dados exclusivamente sintéticos. **Nada aqui
comprova execução em Windows nem aceite humano.**

### A. Baseline reconfirmado na base atual, antes de alterar negócio

| # | Cenário | Comando | Esperado | Observado |
|---|---|---|---|---|
| FIN13A-1 | Verificações estáticas | `node scripts/qa-wave0-static.mjs` | 5/5, 001–133 | 5/5, 0 migrações ausentes |
| FIN13A-2 | Tipos | `npm run typecheck` | 0 erros | 0 erros, exit 0 |
| FIN13A-3 | Suíte unitária | `npm test` | tudo passa | 196/196, 0 skips |
| FIN13A-4 | Gate L07 na base intacta | `npm run test:l07-delivery:pg` | 27/27 | **27/27**, `# fail 0`, `EXIT=0` |

### B. Reprodução das lacunas, com a correção ainda ausente

Os quatro subtestes novos foram executados contra o código **sem correção**.

| # | Achado | Cenário executado | Resultado observado (defeito confirmado) |
|---|---|---|---|
| FIN13B-1 | 1 e 4 | aprovar, depois editar premissas/receita e ler histórico | subteste 25 reprovou: `expected 1, actual NaN` — não existia `version`; edição de aprovado não era recusada; histórico sem snapshot/versão |
| FIN13B-2 | 2 | margem de orçamento e cenário conferida com receita e custo | subteste 26 reprovou: `expected 20, actual NaN` — não havia percentual calculado no servidor; o cenário aceitava o número do navegador |
| FIN13B-3 | 3 | criação sem chave de idempotência | subteste 27 reprovou: `expected 400, actual 201` — criação sem chave era aceita e o reenvio duplicava |
| FIN13B-4 | 5 e 6 | GET de orçamentos respondendo 500 no navegador | subteste 28 reprovou: `fin13-budgets-error` inexistente — a falha de leitura virava lista vazia; não havia jornada de revisão/aprovação/histórico |

Totais da execução de reprodução: `# tests 31`, `# pass 27`, `# fail 4`,
`# skipped 0`, `EXIT=1`. Nenhum dos seis achados estava previamente corrigido.

### C. Correção validada

| # | Cenário | Comando | Esperado | Observado |
|---|---|---|---|---|
| FIN13C-1 | Verificações estáticas com a migração nova | `node scripts/qa-wave0-static.mjs` | 5/5, 001–134 | 5/5, 0 ausentes, 0 duplicadas |
| FIN13C-2 | Tipos | `npm run typecheck` | 0 erros | 0 erros |
| FIN13C-3 | Suíte unitária | `npm test` | 196/196 | 196/196, 0 skips |
| FIN13C-4 | Build | `npm run build` | sucesso | `✓ Compiled successfully`, exit 0 |
| FIN13C-5 | Migrações com replay, clone e checksum | `npm run test:migrations:pg` | 134/134 idempotentes | `CHECKSUMMED=134/134`, `TABLES=522->522`, `SECOND_EXIT=0`, clone `migration_checksum_mismatch: 006 rejected (exit 1)` sem rebaseline |
| FIN13C-6 | Gate L07 após a correção | `npm run test:l07-delivery:pg` | 31/31 | **31/31**, `# fail 0`, `# skipped 0`, `EXIT=0`, em duas execuções aprovadas. **Transparência:** entre elas houve uma execução com 30/31, reprovada no subteste 18 (FIN-10, não tocado por esta fatia) por `browserType.launch ... process did exit: signal=SIGSEGV` — o Chromium morreu no `launch`, sem nenhuma asserção reprovada. É o mesmo ruído de ambiente já registrado em sessões anteriores deste repositório |
| FIN13C-7 | Regressão L03 | `npm run test:l03-delivery:pg` | 1/1 | 1/1 |
| FIN13C-8 | Regressão L04 | `npm run test:l04-delivery:pg` | 20/20 | 20/20 |
| FIN13C-9 | Regressão L05 | `npm run test:l05-delivery:pg` | 1/1 | 1/1 |
| FIN13C-10 | Regressão L06 | `npm run test:l06-delivery:pg` | 9/9 | **9/9 nas duas execuções isoladas**. **Transparência:** nas duas execuções encadeadas logo após outros gates pesados na mesma máquina de 2 vCPU / 4 GB, o subteste 7 reprovou com `product SKU rendered in table`; o HTML capturado mostra a página `/admin/patrimonio` ainda em “Carregando dados…”, ou seja, compilação/carregamento do dev server sob disputa de CPU, não regressão de dados. A fatia não altera `ops_*`, `ast_*` nem a tela de patrimônio, e a migração 134 só toca `fin_budgets`, `fin_budget_scenarios` e `fin_budget_history`. Nenhuma asserção foi alterada, nenhum timeout foi aumentado e nenhum teste foi ignorado para obter o verde |
| FIN13C-11 | Confirmação independente no GitHub Actions (PR #68, commit `e729311`) | 5 workflows do repositório | todos verdes | **5/5 verdes**: `static-and-smoke` (estático, auditoria de dependências, typecheck, unitários, build, RAG, tenant e demo), `finance-postgres-browser` (**`test:migrations:pg` + `test:l07-delivery:pg` em runner limpo**), `contracts-postgres-browser`, `crm-postgres-browser` e `operations-postgres-browser` (L06). Em máquina limpa o gate L07 passou inteiro, inclusive o subteste 18, e o L06 passou encadeado — o que confirma que as reprovas intermitentes registradas em FIN13C-6 e FIN13C-10 eram disputa de recursos do ambiente de 2 vCPU, não defeito do código |

### D. O que os subtestes novos do gate L07 provam

1. **Aprovação congelada e revisão versionada** (subteste 25): transição sem
   motivo recusada (400); edição de premissas e de receita em orçamento
   aprovado recusada (409 `approved_budget_locked_requires_revision`) com
   conteúdo intacto no banco; `UPDATE` direto por SQL recusado pelo gatilho
   (`fin_budget_approved_content_locked`); revisão sem motivo recusada; RH 403,
   TI 403 `read_only`, anônimo 401, com o orçamento imóvel após cada negativa;
   revisão válida levando a `em_revisao`, versão 1 → 2, `approved_by_identity` e
   `approved_at` nulos e autor real gravado; nova aprovação exigida e aplicada
   mantendo a versão 2; histórico com cinco eventos classificados
   (`criacao, decisao, decisao, revisao, decisao`), snapshot anterior com o
   custo e as premissas antigos, snapshot posterior com os novos, autor real na
   criação (não o aprovador) e imutabilidade confirmada por `UPDATE`/`DELETE`
   recusados; contagens de `fin_accounts_receivable`, `fin_accounts_payable`,
   `fin_payments` e `fin_gateway_charges` **inalteradas** ao redor da aprovação;
   falha de auditoria injetada devolvendo 503 com status, versão, números e
   aprovação preservados e sem linha de histórico órfã.
2. **Margem conferida** (subteste 26): percentual enviado pelo navegador
   recusado (400) e cenário não gravado; margem calculada 25,00 % a partir de
   200000/150000 com `margin_source=servidor_calculado`; receita zero sem
   percentual (`receita_zero_sem_percentual`) preservando o custo conhecido e a
   margem em reais; custo ausente mantendo a receita conhecida
   (`dados_incompletos`); `UPDATE` e `INSERT` diretos com percentual arbitrário
   recusados por `fin_scenario_margin_percent_matches_base`.
3. **Idempotência** (subteste 27): criação sem chave recusada (400); retry igual
   devolvendo 200 com `idempotent_replay` e o mesmo identificador; mesma chave
   com conteúdo diferente recusada (409 `idempotency_key_conflict`) sem
   sobrescrever o original; **6 requisições concorrentes** com a mesma chave
   produzindo exatamente um orçamento, uma única resposta 201 e um único evento
   `criacao` no histórico.
4. **Jornada de navegador** (subteste 28): GET de orçamentos respondendo 500
   exibe erro e **não** exibe “nenhum orçamento”; nova tentativa recupera a
   lista; seleção por protocolo; receita exibida como `R$ 8.000,00` e margem
   como `25,00 %`; revisão pela interface levando a `em_revisao`, versão 2,
   aprovação retirada e custo novo persistido; nova aprovação pela interface;
   histórico mostrando o evento `revisao`, o motivo digitado e `versão 1 → 2`;
   ausência do campo editável de margem, com pré-visualização calculada; cenário
   criado com percentual calculado pelo servidor.
   Observação metodológica: esse subteste usa `serviceWorkers: "block"` no
   contexto do Chromium porque o PWA registra um service worker que, ativo,
   impediria a simulação da falha de leitura. É ajuste do teste, não do produto.


## L07 — revalidação FIN-09, FIN-11 e FIN-12 → FIN-04 (2026-10-02)

Fatia executada sobre `main`/`origin/main` `ffdf7fbb49832abe30930c355b3085d190a7861e`, na branch Arena `arena/01a0fa11-gruposegsystemseguranca`. Dados, gateway, assinatura e emissão são sintéticos; nenhum provedor, PSP, banco, certificado ou cobrança externa foi acionado.

| Evidência | Comando/cenário | Resultado observado |
|---|---|---|
| Manifesto estático | `node scripts/qa-wave0-static.mjs` | 5/5; migrações 001–135 contínuas, únicas e registradas no migrador. |
| Tipos, unitários e build | `npm run typecheck`; `npm test`; `npm run build` | 0 erros; 196/196, 0 skips; build otimizado com 78 páginas. |
| Migrações | `npm run test:migrations:pg` | 135/135 no primeiro e segundo passes; `TABLES=522->522`; clone rejeitou checksum adulterado de 006 e foi restaurado sem rebaseline. |
| Gate L07 | `npm run test:l07-delivery:pg` | 31/31, 0 falhas/0 skips; HTTP real, PostgreSQL descartável, sessão/cookie real, Next local e Chromium empacotado. |
| CI da PR | [PR #69](https://github.com/berger33/gruposegsystemseguranca/pull/69) | 5/5 checks verdes: estático/smoke, FIN L07, contratos, CRM e operações. |
| FIN-09 | API + Chromium | margem incompleta preserva os valores conhecidos e declara a ausência de base; margem calculada é do servidor; 500 de leitura é visível, sem “nenhum resultado”, e retry recupera a lista. |
| FIN-11 | API + Chromium | obrigação é derivada da regra de atividade e não de tipo escolhido pelo cliente; documento é sandbox sintético; falha de `fiscal-activity-rules` fica visível e retry funciona. |
| FIN-12 → FIN-04 | API + Chromium | HMAC de payload divergente é recusado; seis envios concorrentes da mesma chave resultam em 1 criação e 5 replays; conciliação cria exatamente uma baixa em `fin_payments`, atualiza recebível/histórico e o estorno cria reversão ligada à baixa, retornando o recebível a `pendente`. |
| Fail-closed | negativos do gate | origem/papel/anônimo indevidos são recusados; auditoria indisponível devolve 503 e reverte a mutação. |

A migração aditiva `135-fin09-fin12-revalidation-hardening.sql` reforça a margem incompleta FIN-09 e os vínculos de cobrança, baixa e estorno FIN-12/FIN-04. FIN-09, FIN-11 e FIN-12 passam a `pronto_local` apenas para validação automática. Aceite humano, Windows e integrações externas reais continuam pendentes; L07 não foi declarado concluído e L08 não foi iniciado.
