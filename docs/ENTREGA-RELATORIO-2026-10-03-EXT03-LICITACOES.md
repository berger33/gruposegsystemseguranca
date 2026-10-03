# EXT-03 — Licitações ligadas ao backend canônico real

**Data:** 2026-10-03 · **Base:** `main` em `4518b3f` (após o merge do PR #97 / EXT-02) ·
**Migração:** 149 (aditiva; 001–148 imutáveis) · **Branch:** `arena/01a1026a-gruposegsystemseguranca`

**Classificação honesta desta entrega:** *implementação local + validação automática + gate
dedicado HTTP/DB*. **Não** é bateria pesada integral homologada, **não** é aceite humano, **não**
é homologação em Windows e **não** é implantação no alvo. Esses quatro continuam pendentes.

---

## 0. A condição do critério: "se mercado relevante"

O critério do plano (PLANO-MESTRE, linha 422) é **condicional**:

> | EXT-03 | Licitações | Edital, prazos, documentos, responsáveis, proposta e resultado; **se mercado relevante** | Checklist e alerta por edital, dossiê versionado |

A condição foi **avaliada com evidência do repositório, não presumida**:

| Pergunta | Resposta apurada |
| --- | --- |
| Há evidência de que o mercado é relevante? | **Sim, indicada.** `docs/referencias-marca.md:20` registra: *"Segmentos citados: condomínios residenciais/comerciais, empresas, indústrias, comércios, instituições e **órgãos públicos**."* Atender órgão público no Brasil implica licitação. |
| Essa evidência é confirmada? | **Não.** A linha está na seção *"Informações apresentadas no site atual — **confirmar antes da nova publicação**"*. É leitura do site, não confirmação do proprietário. |
| Existe dado canônico de licitação hoje? | **Não.** Nenhum edital, proposta ou contrato de origem pública existe no banco. |
| Decisão tomada | Implementar a jornada canônica e **declarar a condição como `indicada_nao_confirmada`** em API, tela e documentação. O módulo **não afirma** que a empresa participa de licitações e **não semeia** edital algum. |

A declaração é parte do contrato da API (`MARKET_RELEVANCE`) e aparece na listagem, no dossiê e na
tela. **Pendência registrada para o proprietário:** confirmar se a empresa participa (ou pretende
participar) de licitações públicas. Se a resposta for não, o módulo permanece inerte — nenhuma tela
ou rota inventa atividade — e o esforço fica disponível sem custo de dado falso.

---

## 1. As 9 lacunas reproduzidas antes de implementar

Reproduzidas **contra o código real** (`src/server/ext-api.mjs`, handlers `handleBiddingNotices` /
`handleBiddingDocuments`), com saída observada — não por leitura:

| # | Lacuna | Prova obtida |
| --- | --- | --- |
| 1 | Autorização confunde anônimo com papel sem direito | anônimo ⇒ `401 {"error":"unauthorized"}`; papel `rh` ⇒ **também** `401`. Não existia 403 por papel. |
| 2 | Auditoria indisponível **não** impedia a gravação | a exceção propagava **depois** do `INSERT` ter gravado; `BEGIN presente? false`. Sem transação, sem rollback, sem 503. |
| 3 | Retry idêntico duplicava | 2 `INSERT`s para a mesma requisição, respostas `201/201`, ids distintos. Sem `Idempotency-Key`, sem ledger. |
| 4 | `PATCH` aceitava id fora de formato e **reabria** licitação homologada | `200` para `homologado → rascunho`, com `id: "nao-e-uuid"` vindo do corpo. Sem máquina de estados. |
| 5 | Resultado sobrescrito sem histórico | `UPDATE ... SET status=$2, result=$3` direto; 0 `INSERT`s em qualquer tabela de histórico. |
| 6 | Prazos sem derivação; listagem sem escopo/fonte/data-base | resposta `["items","note"]` com `note` fixa; prazo `2020-01-01` devolvido cru, sem vigente/vencido. |
| 7 | Documento: `bidding_id` do corpo sem validação; versão fora de transação | `201` com `bidding_id: "nao-e-uuid"`; `BEGIN presente? false` — `MAX(version)+1` sem lock permite duas versões iguais em corrida. |
| 8 | "Proposta" do critério **não existia** como registro canônico | `ext_bidding_proposals` ausente da 085; só havia o campo texto livre `result`. |
| 9 | "Responsáveis" era texto livre | `responsible_name TEXT`, sem vínculo com `auth_identities` nem histórico de troca. |

---

## 2. O que foi construído

### Migração 149 (aditiva, `NOT VALID` onde aplicável)

| Objeto | Papel |
| --- | --- |
| `ext_bidding_notices` + colunas | `origin`, `responsible_identity`, `responsible_assigned_at/by`, `result_recorded_at/by`, `result_justification`, `closed_at` + 5 CHECKs `NOT VALID`. `publication_date`, `deadline_date`, `responsible_name` marcados **LEGADO** por COMMENT. |
| `ext_bidding_deadlines` **(nova)** | Um prazo vigente por tipo e edital, com **fonte declarada** (`edital_publicado` / `retificacao_publicada` / `registro_interno`) e substituição explícita. Índice único parcial `WHERE superseded_at IS NULL`. |
| `ext_bidding_proposals` **(nova)** | Proposta versionada. **O CHECK `ext_bidding_proposals_within_deadline_check` impõe no próprio banco** `submitted_on <= deadline_date_at_submission`. |
| `ext_bidding_responsible_assignments` **(nova)** | Histórico de responsáveis; papel copiado de `auth_staff_profiles` **no ato**, para a trilha não depender de papel que muda depois. |
| `ext_bidding_checklist_items` **(nova)** | Checklist exigido por edital; item é desativado com autor e motivo, nunca apagado. |
| `ext_bidding_alert_rules` **(nova)** | Antecedência de alerta explícita. **Sem regra não existe "a vencer".** |
| `ext_bidding_events` **(nova)** | Histórico apenas-acréscimo + ledger de idempotência, único por `(created_by_identity, idempotency_key)`. |
| `ext_bidding_documents` + colunas | `origin`, `checklist_item_id`, `supersedes_document_id`, `superseded_at`, `deactivated_at/by/reason`, `storage_kind`. |
| 5 gatilhos | `ext_bidding_history_immutable`, `ext_bidding_deadline_guard`, `ext_bidding_proposal_guard`, `ext_bidding_notice_guard`, `ext_bidding_responsible_guard`. |

### Módulo canônico `src/server/ext-bidding-api.mjs`

Mesma disciplina provada em EXT-01 (frota) e EXT-02 (terceiros):

- **Ordem das guardas:** 401 anônimo → 403 `forbidden_role` → (escrita) 403 `origin_forbidden` →
  401 identidade não-UUID. **Zero instruções SQL** em qualquer negativa.
- **`runMutation`:** `BEGIN` → replay `SELECT … FOR UPDATE` por `(identidade, chave)` → divergência
  de impressão ⇒ `409 idempotency_key_reused` → trabalho → `INSERT INTO audit_log` → `COMMIT`.
  Falha da auditoria ⇒ `ROLLBACK` + `503 audit_unavailable`. Corrida `23505` na mesma chave devolve
  o replay.
- **Derivações puras exportadas:** `deriveDeadlineSituation`, `deriveProposalWindow`,
  `deriveChecklistStatus`, `summarizeChecklist`.

### Rotas canônicas `/api/ext/bidding/*`

`GET|POST /notices` · `GET|PATCH /notices/<uuid>` · `POST /notices/<uuid>/responsible` ·
`GET|POST /notices/<uuid>/deadlines` · `POST /deadlines/<uuid>/supersede` ·
`GET|POST /notices/<uuid>/proposals` · `POST /proposals/<uuid>/withdraw` ·
`POST /notices/<uuid>/result` · `GET|POST /notices/<uuid>/documents` ·
`POST /documents/<uuid>/deactivate` · `GET|POST /notices/<uuid>/checklist` ·
`POST /checklist/<uuid>/deactivate` · `GET|POST /notices/<uuid>/alert-rules`

**Rotas legadas** (`/api/ext/bidding-notices`, `/api/ext/bidding-documents` e os prefixos
`/api/admin/hr`, `/api/crm/hr`, `/api/hr`): leitura autorizada preservada com o alias `items` e o
campo `canonical`; **mutação aposentada com 410** — e o 410 vem **depois** das guardas, de modo que
anônimo continua recebendo 401, não 410.

### Tela `/admin/licitacoes`

Carregamento, vazio declarado, erro com retry, confirmação **somente** após resposta real do
servidor, e **chave de idempotência preservada em falha** (repetir não duplica). A condição de
mercado e a fronteira externa são exibidas como o servidor as declara.

---

## 3. O critério, imposto em dois níveis

> *"Edital, prazos, documentos, responsáveis, proposta e resultado."*

| Regra | Imposta na aplicação | Imposta no banco |
| --- | --- | --- |
| Proposta só dentro do prazo de entrega registrado | `deriveProposalWindow` ⇒ `409 proposal_prazo_encerrado` com janela e data-base declaradas | `CHECK ext_bidding_proposals_within_deadline_check` |
| Edital encerrado não reabre | `BIDDING_STATUS_TRANSITIONS` ⇒ `409 invalid_status_transition` | `ext_bidding_notice_guard` |
| Resultado só com edital encerrado, imutável depois | `409 bidding_not_closed` / `409 result_already_recorded` | `CHECK …result_requires_closed` + `ext_bidding_notice_guard` |
| Prazo não se edita: substitui-se | `POST /deadlines/<id>/supersede` | `ext_bidding_deadline_guard` |
| Responsável é identidade canônica de equipe | `404 responsible_identity_not_found`, `409 responsible_not_staff`, `409 responsible_not_active` | FK + `ext_bidding_responsible_guard` |
| Checklist é derivado, nunca marcado à mão | `deriveChecklistStatus` sobre documentos ativos | — (não existe campo "atendido") |
| "A vencer" só com regra explícita | `alert_rule_absence: "sem_regra_de_antecedencia"` | `ext_bidding_alert_rules` |
| Histórico é apenas-acréscimo | — | `ext_bidding_history_immutable` |

---

## 4. Um bug real que o gate pegou — e que teria passado numa revisão por leitura

Na **primeira execução** do gate dedicado o resultado foi **22/26, com 4 reprovações**. Três delas
eram o **mesmo defeito meu**, não do teste:

```
operator does not exist: ext_bidding_status = text
```

O gatilho `ext_bidding_notice_guard` comparava `OLD.status` (do tipo enum `ext_bidding_status`) com
um `TEXT[]`. O PostgreSQL recusa essa comparação, de modo que **toda** atualização de um edital
canônico — transição de situação, designação de responsável, registro de resultado — morria em
`503 bidding_unavailable`.

A causa foi **isolada em laboratório** antes de qualquer correção, com um PostgreSQL descartável
reproduzindo só o padrão do gatilho:

```
SEM CAST falha => operator does not exist: st = text
COM CAST ::text: passou (correto)
```

Correção: `OLD.status::text = ANY (terminais)`. O mesmo cuidado foi aplicado ao filtro `stage` da
listagem, que usava um encadeamento de casts frágil — e que **não tinha teste**. Passou a ter:
o caso de listagem agora exercita `?stage=em_andamento` e `?stage=encerrado` de verdade, nos dois
sentidos, para que o cast não volte a quebrar em silêncio.

A quarta reprovação era do **próprio teste**: ele tentava empurrar um prazo para o passado com
`UPDATE`, e o gatilho `ext_bidding_deadline_guard` — corretamente — bloqueou. O teste foi corrigido
para registrar o prazo já vencido **pela API** (registrar um edital cujo prazo já passou é
legítimo), de modo que a prova continua sendo sobre a derivação, sem burlar a trava.

Nenhuma asserção foi enfraquecida, nenhum caso foi pulado e nenhum timeout foi aumentado.

**Segunda execução: 26/26, 0 pulados, exit 0.**

---

## 5. Os 26 casos do gate dedicado (HTTP real contra PostgreSQL real)

`npm run test:ext03-biddings:pg` sobe um cluster descartável, aplica 001–149, executa o
`server.mjs` de verdade e exercita a jornada por HTTP com sessão staff real via
`/api/admin/session`.

1. trava anti-skip · 2. anônimo 401 · 3. papel `rh` 403 (leitura e escrita) · 4. mutação sem
same-origin recusada · 5. mutação sem `Idempotency-Key` 400 · 6. corpo forjado ignorado (protocolo,
situação, resultado e autoria vêm do servidor) · 7. retry idêntico 200 `replayed` + chave reusada
409 · 8. número de edital duplicado 409 · 9. **CRITÉRIO** proposta dentro do prazo aceita e copia
prazo-base e fonte · 10. **CRITÉRIO** prazo encerrado recusa e nada é gravado · 11. **CRITÉRIO** o
**banco** recusa proposta posterior ao prazo · 12. sem prazo registrado a proposta é recusada ·
13. substituir prazo preserva o anterior; o banco recusa editar e apagar · 14. prazo repetido
aponta a rota de substituição · 15. proposta retirada permanece no histórico e não pode ser
apagada · 16. **CRITÉRIO** edital encerrado não reabre, nem pela API nem pelo banco ·
17. **CRITÉRIO** resultado só com edital encerrado, com autoria, imutável depois (API e banco) ·
18. **CRITÉRIO** responsável é identidade canônica validada, papel copiado, histórico preservado ·
19. **CRITÉRIO** checklist derivado do dossiê, nunca marcado à mão · 20. dossiê versionado com
substituição declarada e documento de outro edital recusado · 21. **CRITÉRIO** "a vencer" só com
regra registrada · 22. auditoria indisponível ⇒ 503 e nada persistido · 23. histórico
apenas-acréscimo · 24. dossiê declara fonte, data-base, condição de mercado e fronteira ·
25. listagem escopada, filtros validados, `stage` exercitado nos dois sentidos · 26. rota legada
com leitura autorizada e mutação 410.

**Trava anti-skip, verificada nos dois sentidos:** o gate exporta `QA_EXT03_REQUIRE_DB=1`; sem banco
real o primeiro caso **reprova** (`not ok 1`) em vez de pular; e o harness `auditTapSummary()`
rejeita qualquer `fail`/`skipped`/`todo`, resumo TAP ausente ou menos de `MINIMUM_CASES = 25`
aprovações. Um CI verde sem banco real é impossível por construção.

---

## 6. Validação executada

| Verificação | Resultado | Base anterior |
| --- | --- | --- |
| `node scripts/qa-wave0-static.mjs` | **5/5**, 001–149 | 5/5 em 001–148 |
| `npm run typecheck` | limpo | limpo |
| `tests/ext03-biddings.test.mjs` (em `test:unit`) | **67/67**, 0 pulados | — |
| `npm test` | **382/382**, 0 pulados | 315/315 |
| `npm run build` | **88 páginas**, com `/admin/licitacoes` | 87 |
| `npm run test:migrations:pg` | **149/149 ×2**, replay OK, `006-admin-identities.sql` adulterada rejeitada com `migration_checksum_mismatch` | 148/148 |
| `npm run test:ext03-biddings:pg` | **26/26**, 0 pulados (após 22/26 na primeira execução, com o defeito corrigido) | — |

### Guard de migração atualizado em conjunto

Conforme a lição do PR #95, os três pontos foram atualizados **no mesmo commit**: o manifesto e o
guard de `scripts/migrate-site-visual.mjs` (contagem 149 e log `001–149`) **e** `latestMigration`
em `scripts/qa-wave0-static.mjs`.

### Cascata de regressão — 17 gates, PostgreSQL descartável

Todos os gates `test:*:pg|rag` do repositório foram executados sobre esta branch, já com a
migração 149 aplicada. **14 PASS, 3 não-PASS, nenhum deles causado por EXT-03:**

| Gate | Resultado |
| --- | --- |
| `rag`, `tenant:pg`, `demo-local:pg`, `client-access:pg`, `migrations:pg`, `staff-auth:pg`, `l02`, `l03`, `l04`, `l06`, `l07`, `l08` | PASS |
| `ext02-third-parties:pg` | **PASS 22/22** — EXT-02 segue íntegra sob a 149 |
| `ext03-biddings:pg` | **PASS 26/26** |
| `cli-v2:pg` | FAIL — **pré-existente na `main`**, reproduzido idêntico no commit base: `/api/client/charges-v2` devolve 401 onde o teste espera 403. Não tocado aqui. |
| `backup-restore:pg` | exit 2 — **recusa de ambiente**, não veredito: exige `pg_dump`/`pg_restore` 17, ausentes nesta máquina; nenhum banco é criado. |
| `l05-delivery:pg` | FAIL na cascata, **PASS 2× ao ser repetido integral** |

Sobre o `l05`: a falha na cascata foi `server_did_not_start`, com `waitForServer` esgotando a
janela de 45 s (180 × 250 ms) logo após o `l04`, que consumiu 195 s na mesma máquina. Repetido
**integral e isolado duas vezes, passou 1/1 nas duas**, com o servidor respondendo em **11,7 s** na
primeira repetição — menos de um terço da janela. É contenção de arranque da máquina, da mesma família do flake de timing do Chromium já
registrado no `l06` (que, nesta rodada, passou). **O timeout não foi aumentado, nenhum assert foi
enfraquecido e nada foi mascarado** — o gate foi repetido, como manda a regra.

Isto é uma **cascata de regressão**, não a bateria pesada integral homologada.

### O componente órfão de `/admin/ti`

`src/app/admin/ti/ExtClient.tsx` contém uma seção de licitações (criar edital, criar documento de
dossiê) que fala com as rotas legadas. Ele **continua órfão e não foi promovido**, mantendo a mesma
decisão tomada em EXT-01 e EXT-02: nenhuma rota do app o renderiza — `grep` por `ExtClient` em
`src/app` não encontra nenhum importador —, de modo que ele não é alcançável por usuário algum e
não pode induzir ninguém a erro. Ele **não** é contado como jornada, não é apresentado como tela de
EXT-03, e a tela real desta entrega é `/admin/licitacoes`. Como as rotas legadas de mutação agora
devolvem 410, os botões daquele componente morto passariam a recusar escrita se algum dia fossem
alcançados. Removê-lo é limpeza de código morto que afeta também EXT-01, EXT-02 e EXT-04..06 no
mesmo arquivo: fica registrado como **decisão para o proprietário**, fora do escopo desta fatia.

---

## 7. O que esta entrega **não** prova

- **Não** é a bateria pesada integral homologada. A cascata de regressão executada é ampla, mas
  continua sendo cascata, com as ressalvas já registradas em `docs/EVIDENCIAS-ENTREGA-LOCAL.md`.
- **Não** há aceite humano de EXT-03. O aceite de Marcelo e Andreia vale **apenas para L07**.
- **Não** há homologação em Windows.
- **Não** há implantação no alvo.
- **Não** confirma relevância de mercado (ver seção 0) — isso depende do proprietário.
- **Não** existe portal público integrado (ComprasNet, BEC/SP, PNCP), importação automática de
  edital, envio de proposta a órgão nem upload real de arquivo. `file_url` e `storage_key` são
  **referências declaradas pela equipe**, e a API nunca afirma que o arquivo foi recebido ou
  verificado.

## 8. Preservação do que já existia

CLI-01..15, EXT-01 (frota) e EXT-02 (terceiros) permanecem intactos: nada foi reaberto nem
enfraquecido. As migrações 001–148 continuam imutáveis. As tabelas de segurança v2 continuam **não**
sendo fonte de autenticação. Falha de auditoria continua devolvendo **503 com rollback**.
EXT-04..17 seguem pendentes.
