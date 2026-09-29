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
