# EXT-02 — terceiros ligados ao backend canônico real

Data: 2026-10-03. Base confirmada: `main` após a PR #96 (`48aa7a43251a8b5affcb6627b0096c14cf15aa3a`), estado `MERGED`, divergência inicial 0/0 verificada **antes** de qualquer edição. Branch desta sessão: `arena/01a1026a-gruposegsystemseguranca`.

Critério do plano para esta fatia: **"terceiro acessa só OS/contrato autorizado e perde acesso ao término"**.

## Fronteira declarada — leia antes do resto

**Não existe hoje ator externo "terceiro" autenticado neste sistema.** Nenhuma sessão, login, convite ou canal externo de terceiro foi criado nesta fatia, e nada disso foi simulado. As sessões canônicas existentes continuam sendo três: `auth_staff_sessions` (staff), `auth_sessions` (cliente) e `auth_employee_sessions` (colaborador).

O que esta fatia entrega é a **imposição canônica** do critério: a janela de acesso e o escopo autorizado passam a viver em registros canônicos e a decidir toda consulta derivada do lado staff. O acesso do próprio terceiro permanece **PENDENTE** e é declarado como tal pela API (`external_actor_boundary`, devolvido na autorização, no dossiê, nas janelas e na listagem) e pela tela. O ponto de imposição é explícito e consultável: `GET /api/ext/third-party/parties/<id>/authorization?scope_kind=&scope_id=`.

## Lacunas reproduzidas antes de implementar

A migração 085 criou `ext_third_parties`, `ext_third_party_documents` e `ext_third_party_access_logs`, e `src/server/ext-api.mjs` expunha `handleThirdParties`/`handleThirdPartyDocuments`. Isso **não** era jornada funcional — o componente `ExtClient.tsx` em `/admin/ti` é órfão (nenhuma página o renderiza) e a API administrativa não foi classificada como jornada sem prova. As 12 lacunas foram reproduzidas por execução direta contra o código anterior:

1. autorização confundia os códigos: anônimo **e** papel `rh` recebiam o mesmo `401 unauthorized`; não existia `403` por papel;
2. `contract_id` vindo do corpo era persistido sem nenhuma validação em `crm_contracts` (um UUID inventado `9999…9999` era gravado);
3. `evaluation_score=10` era aceito direto do corpo, sem autor, data ou justificativa;
4. a janela de acesso era par de campos livres (`access_start`/`access_end`) em `ext_third_parties`, sem derivação;
5. com auditoria indisponível a rota ainda respondia **201** — não havia sequer `BEGIN`;
6. o PATCH usava o `id` do corpo sem validação, fazia `UPDATE` direto e não registrava histórico imutável;
7. `access_end=2020-01-01` retroativo era aceito: "perder acesso" era um campo livre;
8. retry idêntico produzia **2** INSERTs — não havia `Idempotency-Key`, ledger nem 409;
9. `third_party_id: "nao-e-uuid"` seria escrito sem validação de formato;
10. a listagem devolvia apenas `["items","note"]`: sem escopo, sem fonte, sem data-base, sem vigência;
11. a `note` do GET era string fixa, não derivação;
12. documentos devolviam apenas `["items"]`: vencimento sem situação derivada, sem fonte e sem data-base.

## Implementação

- **Migração aditiva única `148-ext02-third-parties-canonical-journey.sql`** (001–147 imutáveis; constraints novas `NOT VALID`; sem autoria retroativa; sem dado real):
  - `ext_third_parties` ganha `origin` (`registro_legado`/`jornada_terceiros`), `contract_verified_at`, `contract_verified_by_identity`, `contract_verified_status` e `evaluation_source_id`, com CHECKs que exigem autoria na jornada canônica, proíbem contrato vinculado sem prova de verificação e proíbem nota sem avaliação canônica de origem. `access_start`/`access_end` recebem `COMMENT` marcando-os **LEGADO**: nenhuma derivação da jornada os lê.
  - `ext_third_party_access_grants` — a janela que **decide** o acesso, sempre presa a **um** escopo autorizado (`crm_contracts` **ou** `ast_service_orders`), com início e fim obrigatórios e revogação declarada (autor + motivo). Não existe campo livre de "liberado/bloqueado".
  - `ext_third_party_evaluations` — avaliação com autor, data e justificativa obrigatórios (apenas-acréscimo).
  - `ext_third_party_document_rules` — regra explícita de antecedência, uma ativa por terceiro; sem ela nenhum "a vencer" é inferido.
  - `ext_third_party_events` — histórico imutável por terceiro e **ledger da idempotência** (chave + fingerprint, unicidade parcial por identidade staff).
  - `ext_third_party_documents` ganha `document_number` e desativação declarada (`deactivated_at`/`_by_identity`/`deactivate_reason`, CHECK `NOT VALID`).
  - Triggers: `ext_third_party_history_immutable()` recusa `UPDATE`/`DELETE` em avaliações e eventos; `ext_third_party_access_grant_guard()` aceita **uma única** transição na janela — a revogação declarada — e recusa DELETE, reabertura, troca de escopo e esticar o término.
  - `ext_third_party_access_logs` é declarada **legado** por `COMMENT`: a jornada não escreve nela e não deriva acesso dela.
- **API canônica nova `src/server/ext-third-party-api.mjs`** em `/api/ext/third-party/*` (11 rotas): papéis **admin/marcelo/ti**; ordem de guarda 401 anônimo → 403 `forbidden_role` → 403 `origin_forbidden` nas mutações, **antes de qualquer consulta**; `Idempotency-Key` obrigatória em toda mutação (replay idêntico devolve o registro com `replayed: true`; reuso divergente devolve `409 idempotency_key_reused`). Autoria sempre da sessão, vínculo sempre da URL: `id`, `created_by_identity`, `origin`, `contract_id`, janela e nota enviados no corpo do cadastro são **ignorados**. Toda mutação é **uma transação**: negócio + evento imutável + `audit_log`; falha da auditoria devolve `503 audit_unavailable` com **rollback**.
- **Vínculo de contrato** só após validação canônica no servidor: `404 contract_not_found` se não existir; registra quem verificou, quando e a situação observada; trocar de contrato com janela viva devolve `409 contract_rebind_blocked_by_active_grant` para não deixar acesso órfão.
- **Concessão de acesso** recusa, de forma declarada, o que não autoriza: `third_party_not_active`, `contract_not_bound_to_third_party`, `contract_not_grantable`, `service_order_not_found`, `service_order_not_grantable`, `service_order_outside_contract` e `access_window_already_ended` (janela que já nasceria vencida).
- **"Perde acesso ao término"** é derivação determinística de `access_end` (`deriveGrantWindow` ⇒ `revogado`/`nao_iniciado`/`expirado`/`vigente`), não marcação manual. Encerrar o terceiro (`PATCH status=encerrado`) revoga **na mesma transação** todas as janelas ainda vivas, com autor e motivo, e a resposta declara `revoked_grants`.
- **Vencimento de documento** derivado só da data registrada (`vencido`/`vigente`/`sem_data_declarada`/`desativado`); `a_vencer` **só** existe com regra ativa registrada, caso contrário a resposta declara `alert_rule_absence: "sem_regra_de_antecedencia"`. Toda resposta derivada carrega `source` e `base_date`.
- **Rotas legadas** deixaram de ser atalho: leitura passa pela mesma autorização e declara fonte/data-base; mutação responde `410 legacy_route_retired` apontando a rota canônica. `handleThirdParties`/`handleThirdPartyDocuments` foram **removidos** de `ext-api.mjs` (383 → 304 linhas) para que nenhuma rota alcance caminho sem transação, idempotência ou validação canônica. O componente órfão de `/admin/ti` **segue órfão** e não foi promovido.
- **UI real `/admin/terceiros`** (`TerceirosWorkspace.tsx`): carregamento, vazio declarado, erro com retry e confirmação somente após resposta real do servidor; cada formulário mantém a própria chave de idempotência e a **preserva em falha**, para que o retry não duplique; a tela traz o verificador de autorização por escopo, o dossiê com janelas/documentos/avaliações/eventos e o **banner da fronteira externa declarada**. O registro de documento é de metadados sintéticos (sem upload real nesta fatia, declarado na tela).

## Validação automática executada

- `npm ci`: OK, 0 vulnerabilidades.
- `node scripts/qa-wave0-static.mjs`: **5/5**, migrações **001–148** contínuas e registradas. A lista e a guarda de manifesto de `scripts/migrate-site-visual.mjs` (contagem 148 e log final "001–148") e o `latestMigration` de `scripts/qa-wave0-static.mjs` foram atualizados **juntos** com a migração — a defasagem dessa guarda derrubou a primeira CI da PR #95; a atualização conjunta manteve a CI da PR #96 verde na primeira rodada.
- `npm run typecheck`: OK (0 erros).
- `node --test tests/ext02-third-parties.test.mjs`: **50/50** (registrado em `test:unit`).
- `npm test`: **315/315** (baseline anterior 265/265; +50 desta fatia).
- `npm run build`: exit 0, **87 páginas** (baseline 86), rota `/admin/terceiros` listada.
- `npm run test:migrations:pg`: **148/148** em PostgreSQL descartável, dois passes (replay integral "Already applied"), checksum negativo deliberado rejeitado (`006` recusado, sem rebaseline automático) e clone TEMPLATE preservado (539 tabelas).
- **`npm run test:ext02-third-parties:pg`: 22/22 — gate dedicado desta jornada, por HTTP real contra PostgreSQL real descartável** (detalhe abaixo).
- `npm run test:l08-delivery:pg`: **51/51** — aplica 001–148 e preserva CLI-01..05; **este gate não cobre a jornada EXT-02 e não é apresentado como prova dela**.
- `npm run test:demo-local:pg` (QA-HOM-008/009): passou; **também não cobre a jornada EXT-02**.

Sem skip, sem assert enfraquecido, sem timeout aumentado, sem dado real e sem SMTP real.

### Prova HTTP/DB da jornada (gate dedicado)

`scripts/qa-ext02-third-parties-postgres.mjs` sobe um cluster PostgreSQL **descartável**, aplica 001–148, executa o **servidor de verdade** (`server.mjs`) e exercita a jornada por HTTP com sessão staff canônica real (login em `/api/admin/session`). Nenhum veredito funcional vem de SQL que simule o que a API deveria fazer: o SQL só semeia fixtures sintéticos, confere o que ficou gravado e prova as travas do banco. Os 21 casos cobrem:

- anônimo 401 e papel `rh` **403** (não 401) em leitura e escrita, sem gravar nada;
- mutação sem same-origin recusada mesmo com sessão válida;
- corpo forjado ignorado: `id`, `created_by_identity`, `origin`, `contract_id`, `access_start/end` e `evaluation_score` enviados juntos não entram — o banco mostra id gerado no servidor, autoria da sessão, `origin='jornada_terceiros'` e os demais campos nulos;
- retry idêntico devolve o mesmo registro (1 linha no banco), reuso divergente 409, ausência de chave 400;
- contrato inexistente 404 **sem** persistir o vínculo; contrato válido grava quem verificou, quando e a situação observada;
- **CRITÉRIO DO PLANO (escopo)**: janela concedida sobre o contrato vinculado autoriza aquele escopo e **só** ele — outro contrato e OS não concedida respondem `escopo_nao_autorizado`; concessão sobre contrato não vinculado 409 e sobre contrato encerrado 409, sem gravar janela;
- **CRITÉRIO DO PLANO (término)**: janela com término no passado responde `authorized: false` / `janela_encerrada` / `window.status: expirado`, com a derivação citando as datas; e a API recusa criar janela já vencida (`access_window_already_ended`);
- a janela **não é campo livre**: o banco recusa esticar o término, trocar o escopo e apagar a janela (trigger);
- revogação declarada corta o acesso (`janela_revogada`), preserva início e término originais no histórico e a segunda revogação responde 409;
- encerrar o terceiro revoga as janelas vivas na mesma transação (`revoked_grants: 1`, zero janelas vivas no banco) e a autorização passa a `terceiro_nao_ativo`;
- **auditoria indisponível** (falha injetada por trigger em `audit_log`) devolve **503 `audit_unavailable`** e o banco mostra **nada persistido** — nem cadastro, nem evento; restaurada a auditoria, a mesma jornada volta a 201;
- vencimento derivado (`vencido`, `sem_data_declarada`, `vigente`) e `a_vencer` surgindo **somente** após registrar a regra explícita de 30 dias, com a derivação citando a regra;
- documento desativado com autor e motivo, nunca apagado, saindo do controle de vencimento mas seguindo visível;
- avaliação recusada sem justificativa e com data futura; aceita, grava autor da sessão e vira a **fonte** da nota do cadastro; `UPDATE`/`DELETE` recusados pelo banco;
- histórico de eventos apenas-acréscimo (trigger);
- dossiê e listagem declarando fonte, data-base, escopo de leitura, ausência (`third_parties_registered: false`) e a fronteira externa pendente; filtros validados no servidor (`invalid_status`, `invalid_contract_id`);
- rota legada: leitura segue autorizada e **preserva a chave `items`**, mutação 410 com ponteiro canônico, e nada é gravado por ela.

O gate **audita o próprio resumo TAP** antes de devolver verde: reprova se houver qualquer caso pulado, qualquer `todo`, ou menos de 21 casos aprovados — e a suíte carrega um caso que **reprova** quando o banco real não está presente (`QA_EXT02_REQUIRE_DB`). Um CI verde sem banco real, que não provaria jornada nenhuma, é impossível por construção; a guarda foi verificada nos dois sentidos (sem banco sob o gate ⇒ `not ok`; execução avulsa fora do gate ⇒ pula sem mascarar).

Esse gate entrou na CI como `.github/workflows/ext02-delivery.yml` (migrações 001–148 + jornada EXT-02), seguindo o padrão dos workflows de entrega já existentes.

### Correção encontrada pela prova HTTP

A primeira execução do gate real reprovou 7 casos. Seis eram defeitos do próprio teste (leitura dupla do corpo da resposta, comparação de `Date` consigo mesma, filtro dependente da ordem dos testes) e foram corrigidos no teste. **Um era defeito do produto**: ao delegar a rota legada para o handler canônico, a resposta passou a sair em `third_parties` e a chave `items`, que a rota legada sempre usou, sumiu — quebrando em silêncio qualquer leitor legado. O handler passou a devolver o alias `items` **apenas** na rota legada (com `canonical` apontando a rota nova), e um teste unitário fixa as duas pontas do contrato: `items` presente no legado, ausente no canônico. Nenhum assert foi enfraquecido para fechar a conta.

## Cascata de regressão em PostgreSQL descartável (16 gates)

Executada **após** a PR #97 abrir verde, para responder a uma pergunta
específica: a migração 148 e a jornada EXT-02 quebraram alguma entrega
anterior? Os 16 gates do repositório foram rodados em sequência, cada um com
seu próprio cluster descartável.

| Gate | Resultado | Observação |
|---|---|---|
| `test:migrations:pg` | PASS | 148/148, dois passes |
| `test:staff-auth:pg` | PASS 21/21 | L01 |
| `test:tenant:pg` | PASS 22/22 | |
| `test:client-access:pg` | PASS 27/27 | |
| `test:cli-v2:pg` | **FAIL 7/2** | **pré-existente — reproduzido idêntico na base `48aa7a4`** |
| `test:backup-restore:pg` | **exit 2** | **recusa de ambiente: exige `pg_dump`/`pg_restore` 17; nenhum banco criado** |
| `test:rag` | PASS | |
| `test:l02-delivery:pg` | PASS 14/14 | |
| `test:l03-delivery:pg` | PASS 1/1 | |
| `test:l04-delivery:pg` | PASS 20/20 | |
| `test:l05-delivery:pg` | PASS 1/1 | |
| `test:l06-delivery:pg` | **FAIL 8/1 (intermitente)** | **flake de timing do Chromium, reproduzido na base** |
| `test:l08-delivery:pg` | PASS 51/51 | |
| `test:ext02-third-parties:pg` | PASS 22/22 | jornada desta fatia |
| `test:demo-local:pg` | PASS | QA-HOM-008/009 |
| `test:l07-delivery:pg` | PASS 43/43 | |

**13 PASS, 3 não-PASS — nenhum deles causado por EXT-02**, e cada classificação
foi provada, não suposta:

- **`test:cli-v2:pg`** — falha determinística em `signed RH staff session cannot
  read/list/write v2 documents via any alias`: `/api/client/charges-v2` devolve
  `401 client_session_required` onde o teste espera `403`. Um clone do commit
  base `48aa7a4` (sem a 148, sem `ext-third-party-api.mjs`) reproduz a **mesma**
  assinatura — mesmo subteste, mesmo `401 !== 403`, mesmos 7 pass / 2 fail.
  Pré-existente na `main`; **não foi tocado nesta fatia** para não reabrir CLI.
- **`test:backup-restore:pg`** — não chegou a rodar: o script recusa o ambiente
  (`QA_RESTORE_CLIENT_MISSING_OR_INCOMPATIBLE`, exige `pg_dump`/`pg_restore` 17,
  ausentes nesta máquina) e declara que nenhum banco foi criado. Limitação de
  ambiente, não resultado de teste — **não pode ser contado como verde nem como
  vermelho de EXT-02**.
- **`test:l06-delivery:pg`** — flake de timing do Chromium: a asserção
  `product SKU rendered in table` encontra a tela ainda em `Carregando dados...`.
  Repetido **integral**, sem mascarar e sem aumentar timeout: no branch, 1 PASS
  e 1 FAIL em duas repetições; na base `48aa7a4`, 1 FAIL e 2 PASS em três. Flake
  pré-existente nos dois lados.

**Achado colateral para o proprietário:** seis gates não são executados por
nenhum workflow — `test:cli-v2:pg`, `test:staff-auth:pg`, `test:client-access:pg`,
`test:backup-restore:pg`, `test:l02-delivery:pg` e `test:l03-delivery:pg`. É por
isso que a falha determinística do `cli-v2` convive com a `main` verde. Corrigir
isso está **fora do escopo de EXT-02** e não foi feito aqui; fica registrado como
decisão para o proprietário.

Classificação honesta: isto é uma **cascata de regressão**, não a bateria pesada
integral homologada — dois gates não produziram veredito verde nesta máquina
(um por falha pré-existente, outro por ambiente) e o L06 é intermitente. O que
está provado é que **EXT-02 não introduziu regressão** em nenhuma entrega
anterior.

## Fronteiras e aceite

Classificação: **implementação local + validação automática rápida + gate dedicado HTTP/DB da jornada EXT-02**. Isto **não** é a bateria pesada integral, **não** é aplicação em destino, **não** é aceite humano e **não** é homologação Windows — todos permanecem pendentes por decisão do proprietário. Nenhum aceite humano é inventado aqui: o aceite anterior de Marcelo e Andreia refere-se **somente ao L07** e não é renovado por esta fatia.

CLI-01..15 e EXT-01 foram preservadas e não foram reabertas nem enfraquecidas: `/api/ext/fleet/*`, `/admin/frota` e a migração 147 seguem intactos; `auth_sessions` continua a única sessão de cliente; as tabelas v2 não autenticam; o RH segue recebendo só o envelope mínimo de `cli_employee_complaint_hr_shares`. As migrações 001–147 permanecem imutáveis e a próxima livre passa a ser **149**.

Após EXT-02 permanecem pendentes **EXT-03..17**, a bateria pesada integral, a aplicação final em destino e a homologação Windows.
