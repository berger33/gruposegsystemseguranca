# EXT-07 — Compliance corporativo: endurecimento e conclusão da entrega

Data: 2026-10-03. Sessão de correção sobre a entrega anterior.
Critério de aceite automatizado: **Vencimento gera tarefa e documento privado**.

---

## 1. Base da sessão e estado da PR #103

| Item | Valor apurado por execução |
| --- | --- |
| PR anterior | `#103` — https://github.com/berger33/gruposegsystemseguranca/pull/103 |
| Estado | `MERGED` em 2026-10-03T20:48:13Z |
| Commit de merge | `eff0bbddb5d5681d2612010e4349cfb9ff61234b` |
| Commit de feature | `3cf218d949e3ce04fe49e82ce2dcd1ca6b874584` |
| Divergência | nenhuma: `HEAD` = `origin/main` = merge-base; árvore limpa no início |

O SHA de merge não foi presumido: foi obtido com `gh pr view 103` e conferido contra `git fetch origin main --deepen=50`. A base não divergiu, então a sessão prosseguiu.

## 2. Lacunas reproduzidas antes de implementar

A verificação foi feita por sondagem descartável, não por leitura de código: PostgreSQL 17 efêmero (`embedded-postgres`, cluster não persistente), migrações 001→153 aplicadas pelo migrador real, `server.mjs` real escutando em porta de loopback, sessão de staff real criada no banco e autenticada por `POST /api/admin/session`, fixtures sintéticas apenas com domínio `.invalid`. Nenhum banco herdado foi aceito. As duas sondagens foram apagadas ao final e a árvore voltou limpa.

O que a sondagem mostrou no commit base:

1. **A jornada canônica inteira respondia `404` em HTML do Next.** `API_PATH_MATCH` em `server.mjs` não listava `/api/ext/compliance/`, então o dispatch nunca alcançava o handler. Consequência direta e verificada em SQL: `ext_compliance_obligations` com 0 linhas e `ext_compliance_tasks` com 0 linhas. **O critério de aceite não era atendido** — não havia como gerar tarefa alguma.
2. **O handler não respondia a requisição anônima** (ficava sem resposta em vez de `401`); `rh` recebia `403` corretamente.
3. **Criação de documento falhava sempre com `400 invalid_validity`**: as três validações de data usavam a regex escrita como literal `\d` (contrabarra escapada no fonte minificado), que nunca casa com uma data ISO.
4. **O workflow nunca executou**: a chave de gatilho estava grafada `ton:` em vez de `on:`, o que faz o GitHub ignorar o arquivo inteiro.
5. **O gate não provava nada**: `scripts/qa-ext07-compliance-postgres.mjs` imprimia `pass=4 ... migrations=153/153` escrito à mão no código, sem servidor, sem sessão e sem asserção.
6. **Os testes eram estáticos**: `tests/ext07-compliance.test.mjs` fazia regex sobre o texto dos arquivos; `tests/ext07-compliance.integration.test.mjs` era no-op.
7. **Não existiam rotas de renovação, versionamento, detalhe nem tarefa**: `/tasks`, `/documents/:id` e `/documents/:id/renew` devolviam `405`.
8. **`ext_compliance_tasks.responsible_identity` era anulável** — a tarefa podia nascer sem responsável.
9. **`evaluate` ignorava `renewal_lead_days`**, de modo que `a_vencer` nunca era derivado da regra declarada na obrigação.

## 3. Estado real da migração 153 (o que já funcionava e o que não)

Verificado por SQL direto contra o banco descartável, não por leitura:

- **Funcionava:** `ext_compliance_current_version_unique` barrava uma segunda linha "atual" trivial; `is_private = false` era bloqueado estruturalmente.
- **Não funcionava:** cadeia encadeada de `replacement_of` produzia múltiplas versões "atuais"; autorreferência (`replacement_of = id`) era aceita; `version_no` era mutável; título e vencimento de um registro existente podiam ser sobrescritos; `vigente` convivia com vencimento no passado.

A 153 **não foi alterada**. Nenhum arquivo de 001 a 153 foi tocado — conferido por `git diff` e pelo gate de ledger, que rejeita alteração de arquivo já aplicado por `migration_checksum_mismatch`.

## 4. Decisões estruturais

**Fonte canônica de documentos:** permanece `ext_compliance_documents`. Não foi criada tabela paralela. As linhas anteriores à 153 continuam classificadas como `registro_legado` e não são reinterpretadas como entrega da EXT-07. Novos registros canônicos nascem com `origin = 'ext07_canonica'`.

**Fonte canônica de tarefas:** permanece `ext_compliance_tasks`. A tarefa de vencimento **não** reaproveita tarefa de CRM nem de RH: ela carrega vínculo com obrigação, documento e período, a regra aplicada, a data-base, os fatos e o responsável staff, com unicidade por documento/período/regra.

**Fronteira de ator:** a jornada é **interna**. Não há ator externo, não há integração regulatória, não há órgão público consultado e não há e-mail real. O autor de toda escrita é derivado da sessão (`created_by_identity`, `updated_by_identity`, `started_by_identity`, `completed_by_identity`, `cancelled_by_identity`), nunca do corpo da requisição: campos de propriedade do servidor enviados pelo cliente são rejeitados com `400 server_owned_field_rejected`. O responsável é obrigatoriamente staff ativo e autorizado, validado sob trava dentro da transação.

## 5. O que a migração 154 implementa

`db/migrations/154-ext07-compliance-hardening.sql`, 346 linhas, aditiva, sem seed, sem `CREATE TABLE`, sem `BEGIN`/`COMMIT` próprios (o migrador já envolve cada arquivo em transação com `pg_advisory_xact_lock`). Comparações sobre colunas TEXT usam `::text`; restrições novas sobre tabela existente entram como `NOT VALID`.

- **§1 Documentos.** Colunas `superseded_by`, `superseded_at`, `superseded_by_identity`, `renewal_justification`; dois índices; onze CHECKs `NOT VALID` aplicados em laço idempotente; recriação de `ext_compliance_current_version_unique` com literal de enum no predicado (o cast enum→texto é `STABLE` e o PostgreSQL recusa predicado de índice não imutável). A FK de supersessão é `DEFERRABLE INITIALLY DEFERRED` — ver §9.
- **§2 Guardas.** `ext_compliance_document_guard()` congela as colunas canônicas de um registro existente, torna a supersessão irreversível, impede `vigente` com validade vencida e impede reabertura de estado terminal. `ext_compliance_chain_guard()` percorre recursivamente a cadeia de substituição e rejeita ciclo (inclusive autociclo) e profundidade acima de 200.
- **§3 Tarefas.** Colunas de autoria de transição; quatro CHECKs `NOT VALID`, entre eles `ext_compliance_tasks_responsible_required` e `ext_compliance_tasks_facts_shape`; `ext_compliance_task_guard()` reescrito; `ext_compliance_tasks_no_delete`.
- **§4 Obrigações.** `updated_by_identity` e guarda correspondente.
- **§5 Eventos.** Três índices e três `COMMENT ON COLUMN` declarando a fronteira documental.

## 6. Validade

Bloqueado **na API e no banco**, em camadas independentes: vencimento anterior à emissão; vencimento anterior ao início de vigência; validade sem regra declarada na obrigação; `vigente` com vencimento no passado; `vencida` atribuída arbitrariamente pelo cliente; sobrescrita destrutiva de registro existente.

A data-base **não vem do cliente**. Toda avaliação lê `SELECT CURRENT_DATE::text` do PostgreSQL e devolve `base_date_source: "postgres_current_date"`. O relógio do navegador é irrelevante e o campo correspondente no corpo é recusado.

A resposta de `POST /evaluate` declara explicitamente a **fonte**, a **data-base**, a **regra** aplicada (incluindo `renewal_lead_days` da obrigação), os **fatos** considerados, o **denominador** avaliado e `absence_is_not_zero: true` — ausência de documento não é tratada como conformidade zero nem como conformidade total.

## 7. Privacidade e fronteira documental

`is_private` é estrutural: documentos canônicos nascem `is_private = true`, com `storage_key` e `file_url` nulos. A **projeção de listagem é minimizada** — não expõe `storage_key`, não expõe URL privada e não expõe número documental completo (devolve `document_number_masked`). O detalhe autorizado usa allowlist explícita de campos. **Não existe rota pública de compliance**: `/api/public/compliance` responde `404`, verificado no gate.

A comprovação é **referência documental declarada**, e isso está dito no banco (`COMMENT ON COLUMN`), na API (`file_boundary` em toda resposta) e na tela. **Não há upload, bytes, checksum, varredura de malware, armazenamento verificado nem download** — nada disso é alegado em lugar nenhum. A API também devolve `legal_validation: "nao_realizada"`: o texto declarado pelo usuário não é validação jurídica nem confirmação por órgão público.

## 8. Renovação, versionamento e máquina de estados

A renovação é **um registro novo**, nunca uma sobrescrita. `POST /documents/:id/renew` exige justificativa com no mínimo 10 caracteres e exige que o novo vencimento **avance** a validade (`409 renewal_must_extend_validity` caso contrário). O novo registro recebe `replacement_of` apontando para o anterior e `version_no` incrementado; o anterior **não tem o conteúdo alterado**: recebe apenas a marca formal de substituição (`superseded_by`, `superseded_at`, `superseded_by_identity`), carimbada pelo servidor. Renovar um registro já substituído devolve `409 document_already_superseded`. O histórico fica disponível em `GET /documents/:id/history` e os eventos são imutáveis.

Garantias de integridade no banco: no máximo **uma versão atual por obrigação**, inclusive em cadeia; **ciclo proibido**; `version_no` imutável; estado terminal não reabre silenciosamente.

Tarefas: `start`, `complete` e `cancel`. Conclusão exige responsável **e** resultado; cancelamento exige justificativa; transição inválida é recusada.

## 9. Ordem de transação, auditoria, idempotência e concorrência

Toda mutação canônica segue a mesma sequência, implementada em `runMutation`:

```
same-origin → Idempotency-Key obrigatório → corpo (400 invalid_json / 413 payload_too_large)
→ rejeição de campo de propriedade do servidor → fingerprint sha256
→ BEGIN → advisory lock → trava e revalidação da sessão/identidade/entidade
→ replay de idempotência → escrita da entidade → geração da tarefa
→ evento imutável → audit_log → COMMIT
```

- **`audit_log` indisponível ⇒ `ROLLBACK` + `503 audit_log_unavailable`**, e nada muda. O helper tolerante de auditoria do legado **não** é usado para declarar sucesso canônico. Verificado no gate injetando um CHECK que derruba o `INSERT` em `audit_log` e conferindo em SQL que a entidade não nasceu.
- **Idempotência:** chave ausente ⇒ `400 idempotency_key_required`; repetição idêntica ⇒ mesma resposta com `replayed: true` e **sem** duplicar; mesma chave com corpo divergente ⇒ `409 idempotency_key_reused_with_different_payload`.
- **Concorrência:** a tarefa usa `ON CONFLICT (document_id, validity_period, rule) DO NOTHING`; duas avaliações simultâneas do mesmo documento produzem **uma** tarefa. Não há dois escritores concorrentes sobre a mesma entidade: a trava é tomada antes da revalidação.
- **Erros de banco** viram resposta determinística: `23505`/`23503` ⇒ `409`; `23514`/`23502` ⇒ `400`; `P0001` ⇒ `409`.
- **Mutação exige same-origin**; sem `Origin`, falha fechada.
- **Corpo não é consumido duas vezes** — regra que também vale para o próprio código de teste (ver §12).

**Detalhe de ordenação que não é opcional:** o índice de versão atual considera atual toda linha canônica não substituída e não cancelada. Se a nova versão nascesse antes da marca de substituição, as duas seriam "atuais" no mesmo instante e o banco rejeitaria a renovação legítima. Por isso o `id` da nova versão é decidido na aplicação, a substituição do anterior é gravada **primeiro** e a FK `superseded_by` é `DEFERRABLE INITIALLY DEFERRED`, validada no `COMMIT`. Essa falha apareceu de fato na execução do gate e foi corrigida na estrutura, não na asserção.

## 10. Jornada canônica e legado preservado

Superfície canônica (`src/server/ext-compliance-api.mjs`, 1016 linhas): `GET|POST /obligations`, `GET|POST /documents`, `GET /documents/:id`, `GET /documents/:id/history`, `POST /documents/:id/renew`, `POST /evaluate`, `GET /tasks`, `POST /tasks/:id/start|complete|cancel`. Método errado ⇒ `405` com `allowed`; rota desconhecida ⇒ `404` em JSON. A autorização ocorre **antes** do roteamento: anônimo ⇒ `401 admin_session_required`; papel sem permissão ⇒ `403 compliance_role_required` com `required_roles: ['admin','ti']`.

Legado conferido como inalterado no gate: `/api/ext/compliance-documents` mantém leitura, alias `items`, `401` para anônimo, `403` para `rh`, `200` para `ti`, `410` em escrita **depois** dos guardas e `403` para escrita de outra origem **antes** do `410`. `/api/admin/hr/ext-compliance-documents` continua `403` mesmo para `ti`, porque `authorizeLegacyHrRequest` exige a permissão granular `employees.read` — comportamento **sistêmico de todo `/api/admin/hr/*`**, não regressão da EXT-07, preservado deliberadamente. `/admin/compliance` responde `200`. Nenhum handler de EXT-08 a EXT-12 foi removido e `src/app/admin/ti/ExtAdvancedClient.tsx` continua no lugar.

## 11. Resultados exatos da validação

Todos executados nesta sessão, nesta ordem:

| Comando | Resultado |
| --- | --- |
| `npm ci` | 0 vulnerabilidades |
| `node --check` nos `.mjs` novos/alterados | 7 arquivos sem erro de sintaxe |
| `node scripts/qa-wave0-static.mjs` | **5/5**; `Migrações SQL 001–154 contínuas e únicas`; `Migrações 001–154 registradas no migrador PG`; 0 imports ausentes; 0 migrações ausentes |
| `npm run typecheck` | sem erro |
| `node --test tests/ext07-compliance.test.mjs` | **65 pass / 0 fail / 0 skipped / 0 todo** |
| `npm test` | **503 pass / 0 fail / 0 skipped / 0 todo** |
| `npm run build` | sucesso; **92 páginas**; `/admin/compliance` presente como rota estática |
| `npm run test:migrations:pg` | exit 0; `CHECKSUMMED=154/154`; `TABLES=561->561`; replay idempotente; clone rejeita `006` por `migration_checksum_mismatch` sem rebaseline automático; `QA_PG_TEMP_CLEANED: true` |
| `npm run test:ext07-compliance:pg` | exit 0; `EXT07_FOCAL_TAP_SUMMARY: pass=65 fail=0 skipped=0 todo=0`; `EXT07_TAP_SUMMARY: pass=55 fail=0 skipped=0 todo=0 minimo_exigido=50`; `EXT07_GATE_SUMMARY: migrations=001-154; cluster=temporario; http=real; sessao=staff_real; dados=sinteticos_invalid`; `QA_EXT07_PG_TEMP_CLEANED: true` |
| `npm run test:ext06-satisfaction:pg` (não-regressão) | exit 0; **36 pass / 0 fail**, mínimo exigido 35 |
| `npm run test:staff-auth:pg` (sessão reaproveitada) | exit 0; **21 pass / 0 fail** |
| `git diff --check` | sem apontamento |

`next-env.d.ts` e `tsconfig.json` são reescritos pelo Next quando o servidor sobe com `NEXT_DIST_DIR` próprio; foram revertidos após cada execução e **não** constam do diff entregue.

## 12. O que o gate faz, e por que ele é probatório

`scripts/qa-ext07-compliance-postgres.mjs` (171 linhas) **recusa** `DATABASE_URL`, `DATABASE_MIGRATION_URL` e `RUN_DATABASE_INTEGRATION_REMOTE` herdados do ambiente (saída 2) — é impossível apontá-lo para um banco real por acidente. Ele sobe um PostgreSQL 17 descartável (`persistent: false`, senha aleatória e redigida, `listen_addresses=127.0.0.1`), aplica 001–154 com o migrador real, executa a suíte focal e depois a suíte de integração contra um `server.mjs` real em porta livre, com sessão de staff real.

Autoauditoria do TAP: **reprova qualquer `fail`, `skip` ou `todo`**, reprova resumo ausente, exige **mínimo de 50 casos** de integração e exige a presença de 10 evidências nomeadas. Na ausência de PostgreSQL o gate **falha** — não pula. Ao final, derruba o cluster e apaga os diretórios temporários, imprimindo `QA_EXT07_PG_TEMP_CLEANED: true`.

As suítes não foram afrouxadas para passar. Quando o gate reprovou, a correção foi feita na estrutura (a ordenação da renovação, §9) ou no próprio código de teste quando o defeito era do teste — o caso mais relevante: `assert.equal(res.status, 201, JSON.stringify(await body(res)))` avalia a mensagem antes da comparação e **consome o corpo**, de modo que a leitura seguinte lança `Body is unusable`. Isso produziu 25 falhas fantasma numa execução intermediária e foi corrigido lendo o corpo uma única vez.

Os `pools` falsos da suíte focal normalizam espaço em branco, ancoram o nome da tabela nos `INSERT`, não casam SQL de forma ampla, comparam datas em ISO e criam pais novos para cada asserção negativa.

## 13. Gates que NÃO cobrem a EXT-07

Executar estes gates **não** prova nada sobre compliance: `test:rag`, `test:tenant:pg`, `test:client-access:pg`, `test:demo-local:pg`, `test:cli-v2:pg` e `test:cli-v2:pg:objects`, todas as variantes de `test:backup-restore:pg`, `test:integration`, e os gates de entrega `test:l02-delivery:pg` a `test:l08-delivery:pg` e `test:ext02-third-parties:pg` a `test:ext05-quality:pg`. `test:migrations:pg` cobre o **ledger** de migrações, não a jornada. `test:staff-auth:pg` cobre a **sessão** reaproveitada, não compliance. `test:ext06-satisfaction:pg` foi executado apenas como **não-regressão**. A única prova end-to-end da EXT-07 é `npm run test:ext07-compliance:pg`.

A bateria pesada integral (restauração com arquivos, assinatura, inventário e objetos CLI v2) **não** foi executada e **não** é apresentada como requisito desta entrega.

## 14. Defeito PRÉ-EXISTENTE encontrado e deliberadamente NÃO corrigido

`src/server/ext-advanced-api.mjs`, `handleContinuityPlans` (EXT-10), executa `SELECT cp.*, ca.name AS client_name ... LEFT JOIN client_accounts ca`. A tabela `client_accounts` (migração `004-client-space.sql`) tem **`display_name`**; a coluna `name` nunca existiu e nenhuma migração posterior a adiciona. A consulta é rejeitada, o handler assíncrono não emite resposta e a requisição **autorizada** fica pendurada indefinidamente. O anônimo continua recebendo `401` corretamente, porque o retorno acontece antes da consulta.

Isto foi **reproduzido no commit base `eff0bbd`, antes de qualquer alteração desta sessão**: não é regressão da EXT-07 e está fora do seu escopo, portanto não foi corrigido. O gate registra o comportamento de forma determinística (com timeout curto) e aceita tanto a falha atual quanto a correção futura — ele **não** exige que o defeito continue existindo.

## 15. Pendências explícitas

1. **Monitoramento contínuo depende de execução agendada.** Hoje a avaliação de vencimento é sob demanda, disparada por `POST /evaluate`. Não há agendador implementado e isso não é alegado.
2. **Defeito pré-existente da EXT-10** descrito na §14 — aberto, fora do escopo.
3. **Aceite humano não foi realizado nem presumido.**
4. **Aplicação em ambiente de destino e homologação Windows** não foram feitas.
5. **Sem infraestrutura de arquivo:** não há upload, bytes, checksum, varredura de malware, armazenamento verificado ou download — e nenhuma dessas coisas é afirmada.
6. **Sem validação jurídica:** o conteúdo declarado não é confirmação por órgão público.
7. **Permissão granular de `/api/admin/hr/*`** continua exigindo `employees.read`, o que mantém `403` para o papel `ti` na rota legada de RH. Comportamento sistêmico preservado de propósito; alterá-lo é mudança fora da EXT-07.
