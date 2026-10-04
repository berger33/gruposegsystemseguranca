# EXT-07 — Compliance corporativo: prova ponta a ponta por HTTP real

**Data local:** 2026-10-04
**Branch Arena desta sessão:** `arena/01a1046a-gruposegsystemseguranca`
**Escopo:** transformar o gate dedicado da EXT-07 em prova real por HTTP contra PostgreSQL 17
descartável, sem alterar as migrações 001–154 e sem criar migração paralela.

---

## 1. Base pós-PR #113 (passo zero verificado com `gh` e `git`)

| Item | Valor confirmado |
| --- | --- |
| PR de hardening #113 | `MERGED` (`mergedAt` 2026-10-04T00:48:00Z) |
| URL da PR #113 | https://github.com/berger33/gruposegsystemseguranca/pull/113 |
| Merge commit real da PR #113 | `cda0c184afe5c39a0742df5518bd14a14aaa64a2` |
| `git fetch origin main` | executado |
| `origin/main` | `cda0c184afe5c39a0742df5518bd14a14aaa64a2` |
| `HEAD` na partida | `cda0c184afe5c39a0742df5518bd14a14aaa64a2` |
| merge-base `HEAD`/`origin/main` | `cda0c184afe5c39a0742df5518bd14a14aaa64a2` |
| Divergência (`rev-list --left-right --count`) | `0 0` |
| Árvore no início | limpa |
| Branch Arena atual | `arena/01a1046a-gruposegsystemseguranca` |
| `154-ext07-compliance-hardening.sql` em `origin/main` | presente (`git cat-file -e` OK) |
| Última migração real em disco | **154** (`db/migrations` tem exatamente 154 arquivos `.sql`) |

A base era exatamente a esperada; nenhum SHA foi inventado.

---

## 2. Estado real da 154 e política de migrações

- Migrações 001–154 **não foram alteradas**.
- **A migração 155 não foi criada.** A pendência era exclusivamente probatória e de borda HTTP:
  o schema 153/154 já suportava obrigação, documento privado, tarefa única, evento imutável,
  `replacement_of`, versionamento e os guardas de estado terminal.
  Nenhuma correção de schema foi necessária, portanto
  `db/migrations/155-ext07-compliance-proof-hardening.sql` **não existe**.
- O gate confere o ledger em tempo de execução: `applied=154 on_disk=154 expected=154` e
  exige a linha `154-ext07-compliance-hardening.sql` em `__migrations`, falhando caso contrário.

---

## 3. O que o gate era e o que passou a ser

**Antes (herdado da sessão anterior):** `scripts/qa-ext07-compliance-postgres.mjs` subia
PostgreSQL descartável, aplicava 001–154 e então executava **apenas o TAP focal estático**
(4 casos que liam arquivos `.sql`/`.mjs`). Não havia requisição HTTP, sessão, identidade,
transação de aplicação nem rollback real. Não constituía prova.

**Agora:** o gate é autoauditável e executa prova real:

- recusa `DATABASE_URL`, `DATABASE_MIGRATION_URL` e `RUN_DATABASE_INTEGRATION_REMOTE` herdados
  (saída `QA_PG_REFUSED`, exit 2);
- sobe cluster **PostgreSQL 17.9** temporário exclusivo em porta livre sorteada, usuário `seg_qa`
  e segredo aleatório (sempre redigido nos logs);
- aplica as migrações 001–154 e **verifica o ledger** (`applied`/`on_disk`/`expected`);
- executa a suíte focal estática **e** a suíte de integração HTTP no mesmo TAP;
- a suíte de integração sobe **servidor HTTP real** (`node server.mjs --dev`) ligado em
  `0.0.0.0` numa porta temporária, cria identidades staff sintéticas e faz **login real**
  por `POST /api/admin/session` para obter o cookie de sessão;
- autoaudita o TAP: rejeita `fail`, `skipped`, `todo` e exige **mínimo de 74 casos aprovados**;
- limpa servidor, cluster e diretórios temporários **sempre** (`finally`), emitindo
  `QA_EXT07_PG_TEMP_CLEANED: true`;
- falha claramente se PostgreSQL/embedded-postgres não estiver disponível — não pula.

### Probe HTTP real (evidência do run final)

```
QA_PG_READY: 127.0.0.1:<porta>/seg_qa_ext07; cluster PostgreSQL 17 temporário exclusivo; segredo omitido.
EXT07_MIGRATIONS: applied=154 on_disk=154 expected=154
EXT07_PG_VERSION: PostgreSQL 17.9 on x86_64-pc-linux-gnu
Grupo SEG System dev listening on http://0.0.0.0:<porta>
EXT07_TAP_SUMMARY: pass=74 fail=0 skipped=0 todo=0 minimo_exigido=74
EXT07_GATE_SCOPE: http_real=true pg17_temporario=true migracoes=154/154 dados=.invalid
EXT07_COMPLIANCE_TEST_EXIT: 0
QA_EXT07_PG_TEMP_CLEANED: true
```

### Identidade e sessão staff sintéticas

- Três identidades `kind='staff'` criadas no cluster descartável: papéis `admin`, `ti` e `rh`.
- E-mails exclusivamente em `.invalid` (`ext07-<papel>-<8hex>@example.invalid`), senha sintética,
  hash via `hashPassword` do próprio projeto.
- Sessão obtida por **login HTTP real**; o cookie `seg_admin_session` é a única fonte de autoria.
- Permissões granulares sintéticas `employees.read`/`employees.write` concedidas a `admin`/`ti`
  porque as rotas legadas `/api/admin/hr/*` e `/api/crm/hr/*` passam pelo RBAC antes do 410.
- Nenhum dado real, nenhum SMTP, nenhum armazenamento externo, nenhuma integração regulatória.

---

## 4. Defeitos reais encontrados pela prova HTTP (e corrigidos)

A prova real revelou que a EXT-07 **não funcionava por HTTP**. Estes são achados concretos,
não ajustes de teste:

1. **A API canônica era inalcançável (404).**
   `server.mjs` tinha o roteamento `if (url.pathname.startsWith("/api/ext/compliance/"))`,
   mas o prefixo **não constava na allowlist do dispatcher** que decide o que o servidor
   custom atende; todo `/api/ext/compliance/*` caía no Next e retornava 404.
   Correção: `|| pathname.startsWith("/api/ext/compliance/")` adicionado à allowlist.
   *(Com o gate antigo isso jamais apareceria: nenhuma requisição HTTP era feita.)*

2. **Validação de datas quebrada por escape duplo.**
   Em `ext-compliance-api.mjs` as expressões eram `/^\\d{4}-\\d{2}-\\d{2}$/` (barra invertida
   literal + `d`), logo **nunca** casavam: a criação de documento retornava sempre
   `invalid_validity` e o caminho de data do cliente em `evaluate` era código morto.
   Correção: `/^\d{4}-\d{2}-\d{2}$/` mais verificação de data real (`2026-13-45` é recusada).

3. **`validity_period` da tarefa era construído com `Date` cru.**
   Produzia `Sat Aug 30 2025 00:00:00 GMT+0000 (...):Tue Sep 29 2026 ...` como chave do
   `UNIQUE(document_id,validity_period,rule)`. Correção: normalização ISO (`YYYY-MM-DD`)
   no período, nos fatos e na projeção HTTP.

4. **413 envenenava a conexão keep-alive.**
   Ao recusar corpo acima do limite, o stream da requisição ficava parcialmente consumido e a
   conexão era reaproveitada em estado inválido. Correção: a resposta 413 passa a enviar
   `Connection: close`.

5. **EXT-10 (`/api/ext/continuity-plans`) derrubava a requisição com rejeição não tratada.**
   `SELECT cp.*, ca.name ...` — `client_accounts` não tem coluna `name` (é `display_name`).
   O erro virava `unhandledRejection` e a requisição **ficava pendurada para sempre**.
   Correção mínima: `ca.display_name as client_name`. Defeito **pré-existente na `main`**,
   descoberto pela verificação de regressão EXT-08..12 desta prova.

6. **O workflow `ext07-delivery.yml` nunca rodava:** o arquivo começava com `ton:` em vez de
   `on:`, portanto o check da EXT-07 **não existia** na PR #113 (coerente com a lista de checks
   registrada). O workflow foi corrigido e alinhado ao padrão EXT-06 (sem service container,
   porque o gate recusa URLs herdadas e sobe o próprio cluster), incluindo `git diff --exit-code`.

---

## 5. Casos executados — 74 aprovados, 0 reprovados, 0 pulados, 0 todo

**Contagem exata:** `pass=74 fail=0 skipped=0 todo=0` (mínimo exigido pelo gate: 74).
Composição: 4 casos focais estáticos + 70 casos da suíte de integração HTTP/PostgreSQL
(1 deles é a própria trava que exige banco real e falha se `RUN_DATABASE_INTEGRATION`/`DATABASE_URL`
não estiverem presentes quando `QA_EXT07_REQUIRE_DB=1`).

### Autenticação e autorização
- anônimo recebe 401 na leitura canônica;
- papel autenticado não autorizado (`rh`) recebe 403;
- `admin` e `ti` autorizados;
- cookie forjado e sessão inexistente recusados (401);
- mutações exigem same-origin (origem estrangeira, ausente e malformada → 403);
- detalhe de documento: 401 anônimo, 403 papel errado, 200 staff;
- nenhuma rota pública de documentos responde 200; `server.mjs` e a API não contêm rota `/api/public/*compliance*`.

### Entrada e protocolo
- JSON inválido → 400; corpo não-objeto (array) → 400;
- corpo acima do limite → 413 (com fechamento de conexão);
- `Idempotency-Key` ausente → 400; curta (<8) e longa (>200) → 400;
- UUID inválido em corpo, detalhe e transição de tarefa → 400;
- rota desconhecida → 405 e o processo segue respondendo (corpo não é consumido duas vezes).

### Obrigações
- campos declarados preservados (tipo, título, descrição, fonte, escopo, justificativa, regra, criticidade);
- autoria e timestamps derivados do servidor;
- `created_by_identity`, `status` e `id` forjados são **ignorados** (verificado também no PostgreSQL);
- todos os campos obrigatórios validados individualmente (7 campos);
- responsável precisa ser staff **ativo e autorizado** (UUID aleatório, papel `rh` e lixo → 400);
- a listagem declara fonte, denominador e `absence_is_not_zero`, e o texto afirma explicitamente
  que a fonte declarada **não é validação jurídica nem confirmação por órgão público**.

### Documentos
- fonte canônica é `ext_compliance_documents` com `origin='ext07_canonica'`;
- documento nasce **privado** (`is_private=true`), confirmado por consulta direta ao PostgreSQL;
- criação sem obrigação relacionada → 400; obrigação inexistente → 404;
- forjar responsável, estado, contador (`version_no`), autoria, `origin`, `protocol`, `id`,
  `replacement_of`, `is_private`, `storage_key` e `file_url` → **400 `server_owned_fields_rejected`** (11 variações);
- listagem não expõe `storage_key`, `file_url`, `file_name`, `declared_reference`,
  `document_number` nem `responsible_name`;
- detalhe usa **allowlist** fechada (todo campo retornado é verificado contra a lista);
- a resposta diferencia referência documental de arquivo real e **não declara** upload, bytes,
  checksum, malware scan, storage verificado ou download;
- registros anteriores permanecem `registro_legado` e não aparecem na projeção canônica;
- sobrescrita destrutiva recusada pelo banco (`UPDATE` de `expiry_date` e de `storage_key` → `immutable`).

### Validade
- vencimento anterior à emissão → 400 `expiry_before_issue`;
- vencimento anterior ao início de vigência → 400;
- início de vigência anterior à emissão → 400 `effective_start_before_issue`;
- data malformada/ausente → 400 `invalid_validity` (5 variações);
- validade sem regra é impossível: a regra vem da obrigação e é preservada no documento;
- estado `vigente` com data vencida é **corrigido** para `vencida` pela regra declarada;
- estado vencido arbitrário não é aceito na criação (campo forjado rejeitado);
- data do cliente **não** controla a avaliação; a data-base é `CURRENT_DATE` do PostgreSQL
  (enviar `1999-01-01` devolve `client_date_ignored: true` e a data real do servidor);
- a avaliação informa fonte (`server_date`), data-base, regra, fatos, denominador e
  `absence_is_not_zero` — ausência é diferente de zero.

### Idempotência e concorrência
- retry idêntico não duplica (201 → 200 `replayed`, mesmo `id`, 1 evento);
- mesma chave com corpo divergente → 409 `idempotency_key_reused`;
- chave vinculada à identidade correta (mesma chave por `ti` e `admin` gera dois registros distintos, autoria própria);
- concorrência real com a mesma chave (3 requisições paralelas) → `[200,200,201]` e **1** evento;
- concorrência real de avaliação (3 paralelas) → **1** tarefa e **1** documento;
- evento histórico imutável: `UPDATE` e `DELETE` rejeitados pelo gatilho.

### Tarefas
- fonte continua `ext_compliance_tasks` (declarada na resposta);
- a tarefa nasce **na mesma transação** da avaliação — provado comparando
  `created_at` do evento e da tarefa (mesmo timestamp transacional);
- a tarefa contém obrigação, documento, período de validade, regra, data-base e fatos;
- responsável é staff canônico (`responsible_identity` = identidade real);
- **ausência de responsável ativo falha fechado**: a avaliação devolve
  `fail_closed: [{document_id, reason: "responsible_staff_missing"}]` e **nenhuma** tarefa é criada;
- tarefa única por documento/período/regra: três avaliações seguidas → 1 tarefa;
- conclusão exige responsável **e** resultado (sem resultado → 409; resultado curto → 409);
- cancelamento exige justificativa (curta → 400);
- estado terminal não reabre nem por HTTP (409) nem por SQL (gatilho `terminal`);
- avaliar documento vencido gera exatamente a tarefa esperada e corrige o estado do documento;
- tarefa inexistente → 404.

### Renovação e versionamento
- renovação cria **novo** registro com `replacement_of` explícito e `version_no` incrementado;
- registro anterior **não é sobrescrito** (comparação campo a campo antes/depois no PostgreSQL);
- histórico preservado e exposto no detalhe (`history` com versões 1 e 2);
- autor, timestamp e justificativa preservados (autoria verificada no banco, fora da projeção mínima);
- bifurcação/ciclo rejeitados: renovar duas vezes o mesmo registro → 409 `document_already_replaced`;
  há ainda guarda anticiclo que percorre a cadeia ascendente;
- cadeia legítima v1 → v2 → v3 permitida;
- no máximo **uma versão atual por obrigação**: segundo documento “atual” → 409 e o banco
  confirma `count = 1`;
- renovação exige justificativa, validade coerente e recusa campos forjados; alvo inexistente → 404.

### Auditoria, transação e rollback
- falha **real** de `audit_log` induzida por gatilho sintético (`RAISE EXCEPTION`) no próprio gate:
  - resposta **503 `audit_unavailable`**;
  - **rollback** completo: nenhuma obrigação, nenhum evento, nenhum registro de auditoria;
  - **retry posterior** com a mesma `Idempotency-Key` é processado corretamente (201, exatamente 1 linha);
- o mesmo exercício para documento comprova que não há entidade parcialmente criada
  (0 documentos, 0 eventos, 0 tarefas) e que o retry funciona;
- auditoria canônica registra o ator da sessão (`audit_log.actor = identityId` da sessão);
- nenhum helper legado tolerante a falhas foi usado para declarar sucesso canônico.

### Legado
- as quatro rotas legadas exatas respondem leitura autorizada 200 preservando o alias `items`:
  `/api/admin/hr/ext-compliance-documents`, `/api/crm/hr/ext-compliance-documents`,
  `/api/hr/ext-compliance-documents`, `/api/ext/compliance-documents`;
- autenticação antes do 410, com distinção 401 (anônimo) × 403 (papel sem permissão), em GET e POST;
- same-origin antes do 410 em mutações (origem estrangeira → 403);
- escritores legados retornam **410** com `canonical: "/api/ext/compliance/*"` nas quatro rotas;
- a escrita legada **não grava**: contagem de documentos idêntica antes e depois;
- `src/app/admin/ti/ExtAdvancedClient.tsx` permanece presente;
- handlers EXT-08..12 permanecem presentes em `server.mjs` e no `ext-advanced-api.mjs`;
- não existem dois escritores concorrentes para a mesma entidade.

### UI e regressão EXT-08..12
- `/admin/compliance` responde **200** por HTTP real, com o conteúdo esperado e sem vazar `storage_key`;
- `/admin/compliance` está incluída no `npm run build` (92 páginas);
- `/api/ext/knowledge-base`, `/api/ext/expansion-plans`, `/api/ext/expansion-scenarios`,
  `/api/ext/continuity-plans` e `/api/ext/analytics-experiments` respondem 200 com sessão staff
  (o último exigiu a correção descrita no item 5 da seção 4);
- esses handlers continuam negando anônimo (401);
- somente dados `.invalid` foram usados e nenhum documento canônico possui `file_url`/`storage_key`.

---

## 6. Respostas diretas aos pontos exigidos

| Pergunta | Resposta provada |
| --- | --- |
| Fonte canônica | `ext_compliance_documents` com `origin='ext07_canonica'`; linhas da 086 permanecem `registro_legado` |
| Fonte da tarefa | `ext_compliance_tasks` (única por `document_id`+`validity_period`+`rule`) |
| Fronteira documental/armazenamento | referência **declarada e privada**; sem upload, bytes, checksum, malware scan, storage verificado ou download; nenhuma rota pública |
| Renovação/versionamento | novo registro + `replacement_of` + `version_no`; anterior intacto; histórico preservado; ciclo/bifurcação 409; uma versão atual por obrigação |
| Máquina de estados | `aberta → em_andamento → concluida|cancelada`; terminal não reabre (HTTP 409 + gatilho) |
| Geração de tarefa | na mesma transação da avaliação, com obrigação, documento, período, regra, data-base e fatos |
| Fail-closed | sem responsável staff ativo não há tarefa; o motivo é reportado em `fail_closed` |
| Transação | uma transação por mutação, com `pg_advisory_xact_lock` por identidade+chave |
| Auditoria | `audit_log` obrigatório dentro da transação; falha ⇒ 503 + rollback |
| Idempotência | `Idempotency-Key` obrigatória, impressão digital do corpo, replay 200, divergência 409 |
| Concorrência | 3 requisições paralelas (criação e avaliação) sem duplicar entidade |
| Rollback | nenhuma entidade parcial; retry posterior processado |
| Legado | leitura 200 + `items`, 401/403 antes do 410, same-origin antes do 410, escritores 410 |
| UI | `/admin/compliance` 200 por HTTP e presente no build |
| Regressões EXT-08..12 | verificadas por HTTP; uma falha pré-existente corrigida (EXT-10) |
| Aceite humano | **nenhum aceite humano foi inventado ou declarado** |

---

## 7. Gates que NÃO cobrem a EXT-07

Executados nesta sessão e **verdes**, mas que não provam a jornada EXT-07:

- `node scripts/qa-wave0-static.mjs` — 5/5, apenas verificações estáticas de plataforma;
- `npm run typecheck` — tipos, não comportamento;
- `npm test` (`test:unit`) — 442/442, nenhum caso HTTP da EXT-07 (o arquivo focal é estático);
- `npm run build` — 92 páginas, prova empacotamento, não jornada;
- `npm run test:migrations:pg` — ledger 154/154 e detecção de divergência de checksum, não a API;
- `npm run test:ext06-satisfaction:pg` — 36/36, jornada EXT-06;
- `npm run test:staff-auth:pg`, `test:ext05-quality:pg`, `test:ext04-suppliers:pg`,
  `test:ext02-third-parties:pg`, `test:ext03-biddings:pg` — jornadas reutilizadas
  (sessão staff, auditoria, idempotência), não a EXT-07.

O único gate que prova a EXT-07 ponta a ponta é `npm run test:ext07-compliance:pg`.

---

## 8. Pendências reais (não mascaradas)

1. **Sem ator externo e sem arquivo real.** A EXT-07 continua sendo jornada interna de staff com
   *referência documental declarada*. Não há upload, bytes, checksum, antivírus, storage
   verificado nem download — e a API afirma isso explicitamente. Provar manuseio de arquivo
   exigiria outro escopo (armazenamento + contrato de objeto).
2. **Sem integração regulatória.** `declared_source` é declaração do operador. Nenhum órgão
   público é consultado, nada é homologado ou validado juridicamente.
3. **Sem aceite humano.** Nenhuma etapa de aprovação humana foi implementada ou declarada.
4. **Sem SMTP/notificação.** A tarefa de vencimento é criada no banco; não há e-mail, push ou
   lembrete automático.
5. **Avaliação é sob demanda.** Não existe agendador: a varredura de vencimentos só ocorre quando
   `POST /api/ext/compliance/evaluate` é chamado. Não há cron provado.
6. **A UI `/admin/compliance` não expõe renovação nem transição de tarefa.** Os endpoints
   `/documents/:id/renew` e `/tasks/:id/(start|complete|cancel)` estão provados por HTTP, mas o
   workspace React ainda só cria obrigação/documento e dispara a avaliação.
7. **`ext_compliance_obligations.status` permanece `pendente`.** A avaliação corrige o estado do
   *documento*, não o da obrigação; não há máquina de estados de obrigação provada.
8. **Homologação Windows e bateria pesada** continuam fora de escopo.
9. **Correção do EXT-10 é pontual.** Foi corrigida a coluna inexistente que pendurava a rota;
   a jornada EXT-10 em si **não** ganhou gate dedicado nesta sessão.
10. **O check `ext07-delivery` nunca havia executado** (typo `ton:`); a partir desta PR ele passa
    a existir, portanto o histórico de verde da EXT-07 em CI começa aqui.

---

## 9. Arquivos alterados

| Arquivo | Natureza |
| --- | --- |
| `server.mjs` | +1 linha: `/api/ext/compliance/` na allowlist do dispatcher |
| `src/server/ext-compliance-api.mjs` | correções de validade/datas, projeção allowlist, detalhe, renovação versionada, avaliação por data do servidor, fail-closed, 413 com `Connection: close` |
| `src/server/ext-advanced-api.mjs` | 1 coluna: `ca.name` → `ca.display_name` (EXT-10) |
| `tests/ext07-compliance.integration.test.mjs` | suíte real HTTP + PostgreSQL (70 casos) |
| `scripts/qa-ext07-compliance-postgres.mjs` | gate autoauditável com prova HTTP e mínimo de 74 casos |
| `.github/workflows/ext07-delivery.yml` | `ton:` → `on:`, alinhamento ao padrão EXT-06, `git diff --exit-code` |
| `docs/ENTREGA-RELATORIO-2026-10-04-EXT07-COMPLIANCE-PROOF.md` | este relatório |

**Não alterados:** migrações 001–154, `next-env.d.ts`, `tsconfig.json`
(a suíte restaura ambos ao final, já que o Next em modo dev os reescreve),
`src/app/admin/ti/ExtAdvancedClient.tsx` e os handlers EXT-08..12.
