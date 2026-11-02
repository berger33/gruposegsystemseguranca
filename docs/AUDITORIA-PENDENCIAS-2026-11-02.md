# Auditoria de pendências — 02/11/2026 (por fatia)

**Data:** 02/11/2026 (America/Sao_Paulo)
**Base auditada:** `a46bd884d40fdb371bfc57e79b23f86ab4601db6` — merge da PLT-12 em `main` (commit `39fdc74`, 01/11 → merge 02/11)
**Branch desta sessão:** `arena/6e1e3051-gruposegsystemseguranca`
**Natureza:** retrato de auditoria desta data. **Não** substitui [`STATUS-VIGENTE.md`](STATUS-VIGENTE.md) como fonte única de estado e **não** declara aceite, homologação nem prontidão de produção.

> Antecessor imediato: [`AUDITORIA-FATIAS-PENDENTES-2026-10-28.md`](AUDITORIA-FATIAS-PENDENTES-2026-10-28.md) (fotografia de 28/10). Este documento **reconcilia** aquela fila com o HEAD de hoje: o que fechou, o que continua, o que apareceu.

---

## 0. Veredito em uma linha

**Produção: NO-GO.** O repositório compila, tipa e passa **1.415/1.415** asserções com árvore limpa, mas **0 dos 222 requisitos tem aceite humano**, **0 tem reauditoria integral**, **nenhuma rota tem estados exercitados em navegador**, o **backup é 503 por construção** e **5 PRs estão abertas esperando decisão** (duas delas verdes).

---

## 1. O que foi medido nesta auditoria (comando → resultado)

| Comando / prova | Resultado medido hoje |
|---|---|
| `npm ci` | OK |
| `npm test` (suíte unitária) | **1.415/1.415, exit 0** · 0 fail · 0 skip · 0 todo |
| `npm run typecheck` | exit **0** |
| `npm run build` | exit **0** |
| `node scripts/qa-wave0-static.mjs` | **5/5** — migrações **001–181** contínuas, únicas e registradas no migrador |
| `npm run reaudit:sec` | **35/35** âncoras SEC conferem |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK — **101** rotas `page.tsx` |
| `node scripts/ux-pro-03-ti-inventory.mjs --check` | OK — **84** componentes, **32** abas, **19** promoções, **27** órfãos |
| `node scripts/requisitos-222-inventory.mjs --check` | OK — **222** IDs, **13** `a_revalidar` sem gate, **1.699** arquivos varridos |
| `node scripts/ux-pro-10b-contrast-inventory.mjs --check` | OK |
| `npm run test:plt01-access-review-coverage:pg` | **12/12, exit 0** (PostgreSQL 17 descartável) |
| `npm run test:plt06-observability:pg` | **23/23, exit 0** |
| `npm run test:plt12-incidents:pg` | **20/20, exit 0** |
| `git status` após a bateria | **limpo** |

**Fotografia física do HEAD**

| Item | Valor |
|---|---|
| Rotas (`page.tsx`) | **101** (14 públicas · 44 staff · 14 entrada do cliente · 16 portal do cliente · 1 portal do funcionário · 11 prévias · 1 homologação) |
| Migrações | **001–181** imutáveis · próxima livre **182** |
| Módulos de API (`src/server/`) | **137** |
| `server.mjs` | **6.272 linhas** (despacho manual) |
| Testes | **241** arquivos em `tests/` · **175** listados no `test:unit` |
| Workflows | **49** (só `ci.yml` roda a bateria base) |
| Documentos | **411** `.md` na raiz de `docs/` (**434** contando subpastas) |
| ZIPs versionados (`downloads/` + `dist/`) | **16 arquivos, 171 MB** |
| PRs abertas / issues abertas | **5 / 0** |

---

## 2. LISTA A — P0: bloqueios de entrega (nada disso fechou)

| # | Fatia | Estado hoje | Evidência no HEAD |
|---|---|---|---|
| **A1** | **Backup e restauração reais** | **Aberto / bloqueado.** Nenhum executor existe. Toda mutação é 503 e toda leitura é marcada `unverified` | `src/server/backup-api.mjs`: `POST /api/admin/backups` → **503** `backup_execution_unavailable`; `POST …/restore` → **503**; `PATCH/DELETE` → **503**; retenção → **503**; GET devolve `recorded_status` + `status:'unverified'`, `is_restore_tested:false`, `verified_artifact:false` |
| **A2** | **F02 — Windows real, EPERM e instalação persistente** | **Aberto.** Depende da máquina do operador | Só E10 (symlinks em teste) foi corrigido; sem UAT em Windows |
| **A3** | **Matriz completa de autorização (conta/unidade/contrato)** | **Aberto.** Gates amostram; não há reteste A/B exaustivo em todos os handlers/downloads | `cli_contact_scopes.role` segue como metadado (não participa da autorização) |
| **A4** | **Segurança e privacidade (bases legais, retenção efetiva, pareceres, segredos por ambiente)** | **Aberto.** Retenção continua declarativa | `CLIENT_MFA_ENCRYPTION_KEY` vazio em `.env.example` ⇒ MFA de cliente **503 fail-closed** por padrão |
| **A5** | **Banco de destino com 001–181 + ensaio de clone** | **Aberto.** Ensaios só em clusters descartáveis | `docs/APLICACAO-BANCO-DESTINO.md` (runbook pronto, não executado no destino) |
| **A6** | **F16 — aceite final por papel** | **Aberto.** 0 aceites | `docs/PRODUCAO-GATE.md` §10: **0/12** itens marcados |

---

## 3. LISTA B — P1: código e cobertura (uma PR por item)

| # | Fatia | Status em 02/11 | Detalhe medido |
|---|---|---|---|
| **B1** | **UX-PRO-03 — componentes órfãos do console de TI** | **Parcial (quase travado).** 40 → **27** órfãos | Dos 27: **10** bloqueados pela borda legada de RH (`authorizeLegacyHrRequest` / `employees.read`) e **17** com segunda superfície viva (`/admin/financeiro`, `/admin/patrimonio`, `/admin/marcelo`, `/admin/publicacao`, `/admin/frota\|terceiros\|satisfacao\|qualidade`, `/admin/analytics\|compliance`, `/admin/contratos/[id]`). Proprietário decidiu **“(c) declarar o console esgotado”** — não haverá 20ª promoção de tela |
| **B2** | **PLT-03 — gate de papel do `IntegrationsClient`** | **Fechado em 01/11** | Promovido como 19ª aba (`integracao_catalogo`); `rh` recebe 403 nas duas escritas; relatório `docs/UX-PRO-03-PROMOCAO-INTEGRACOES-CATALOGO-2026-11-01.md` |
| **B3** | **UX-PRO-04 (restante)** | **Parcial** | Entregues: pendências, relatórios, analytics, Marcelo. Seguem sem tratamento por superfície: CRM, comercial, carteira, expansão, contratos, financeiro |
| **B4** | **UX-PRO-05 (restante)** | **Parcial** | Entregues: solicitações, documentos, ponto/ajustes, fechamento/holerite. Faltam: jornada completa do titular, comprovante/hash/endereço HERE, estados offline/rede, comunicados, cursos, escala, abas de RH não reauditadas |
| **B5** | **UX-PRO-06 (reconciliação por tela)** | **Parcial, com PR travada** | Fila de pedidos (02/11), mensuração de origem (31/10), fila de acesso CLI-13 (31/10) entregues. **PR #321** (estado honesto da Vistoria em `/admin/comercial`) aberta desde 31/10 com **1 check vermelho**: `ux-portal-postgres-browser` |
| **B6** | **UX-PRO-ID3 — resíduo de UI do portal** | **Parcial** | 8 páginas de leitura isoladas por conta; **sem aceite humano** e sem captura “antes”; `/cliente/app/assistente`, `continuidade`, `seguranca` e `portal` ficaram fora da família |
| **B7** | **CLI-03 — UI do detalhe publicado de contrato** | **Fechado em 28/10** | Focal **8/8** (`tests/cli03-contract-published-details-ui.test.mjs`); relatório `docs/CLI-03-UI-DETALHE-PUBLICADO-2026-10-28.md` |
| **B8** | **CLI-02 — enforcement da matriz papel × ação × escopo** | **Aberto, por decisão** | `cli_contact_scopes.role` é metadado; autorização efetiva vem de `client_access_grants`. Proposta em `docs/CLI-02-DECISAO-MATRIZ-PAPEIS-2026-10-28.md` — sem decisão registrada |
| **B9** | **CLI-05..08 — lado staff e ciclo administrativo** | **Parcial** | Lado cliente provado (52/52); UI 10/10. Falta o ciclo staff: criar, revisar, aprovar, publicar |
| **B10** | **Reauditoria dos 222 IDs por família** | **Parcial — faltam 13** | Feitos nesta semana: **PLT-01**, **PLT-02**, **PLT-06**, **PLT-07**, **PLT-12** (todos ganharam gate nomeado). Restam **13 sem nenhum gate**: `PLT-09`, `EXT-16`, `EXT-17`, `AI-01`…`AI-10` |
| **B11** | **WCAG manual (10B/10C + 09E-8)** | **Aberto** | Automatizável entregue (0 pares < 4,5:1). Pendente: **196** amostras `complex_background` indeterminadas, **108** `<option>` não medidos, leitor de tela, UAT |
| **B12** | **Estados e teclado nas rotas** | **Aberto** | **101/101** rotas declaram “estados não exercitados em navegador”; **81** com teclado não verificado; **46** sem nenhuma captura visual; **16** com captura parcial (falta 320/768 px) |
| **B13** | **Academia — integração e conteúdo** | **Aberto** | Subsistema isolado (JSON, porta 3100), **não servido por `server.mjs`** e **não linkado** no menu. Faltam SSO, banco/multi-instância, e-mail, upload/player de vídeo, 137 aulas, trilha T25 (depende do nome do papel) |

---

## 4. LISTA C — P2: dívida e polish

| # | Item | Estado |
|---|---|---|
| **C1** | **D7** — inline dinâmico do Layout 09 e foco do atalho público | **Bloqueado** por decisão do proprietário |
| **C2** | **C11** — escopo financeiro + os 2 hits de dados em `FiscalWorkspace.tsx` e `ExpenseWorkspace.tsx` (as linhas citadas na auditoria de 28/10 já não correspondem ao HEAD) | **Bloqueado** por decisão do proprietário |
| **C3** | **E15** — `server.mjs` monolítico | **Aberto e piorando**: 6.208 → **6.272** linhas, **137** módulos, despacho em dois lugares |
| **C4** | **E16** — worker/scheduler durável | **Aberto, com PR pronta**: **#318** verde **46/46**, cria a **migração 182**; não mergeada (esperando decisão). EXT-07 é o único agendador, in-process, desligado por padrão |
| **C5** | **E13** — pacotes obsoletos versionados | **Aberto**: **16 arquivos / 171 MB** em `downloads/` + `dist/`, com ~65 migrações de defasagem. Só o aviso foi resolvido (E21) |
| **C6** | **E7** — demo PGlite com schema real | **Fechado em 30/10**: PGlite aplica **001–181** (581 tabelas), fail-closed, legado recusado |
| **C7** | **E12/E20** — deriva do ledger | **Reincidiu**, ver achado **N1** |
| **C8** | **E22** — hermeticidade da suíte | **Fechado em 30/10**: a suíte passa 1.415/1.415 sem navegador do sistema; o gate de navegador é job separado (`test:ux-pro-09e-pu4:browser`) onde skip é falha |

---

## 5. LISTA E — dívidas e defeitos, estado por código

| # | Situação em 02/11 |
|---|---|
| E1, E2, E3/E4, E5, E6, E10, E11, E17, E18, E19 | **Corrigidos** (não reabrir) |
| **E7** | **Fechado** (30/10) — demo com migrações reais |
| **E8** | **Aberto** — `pg_dump`/`postgresql-client-17` ausentes neste sandbox (`command -v pg_dump` → vazio); a bateria de backup/restore não roda aqui |
| **E9** | **Parcial** — 3 de 4 frentes de flakiness fechadas |
| **E12** | **Parcial** — documentos históricos datados, mas o ledger reincidiu (N1) |
| **E13** | **Aberto** — 171 MB de ZIPs ainda no índice |
| **E14** | **Parcial** — 27 órfãos, todos bloqueados por decisão/borda |
| **E15** | **Aberto** — `server.mjs` 6.272 linhas |
| **E16** | **Aberto** — PR #318 pronta e não mergeada |
| **E18 residual** | **Aberto** — 196 indeterminadas + 108 `<option>`; sem revisão WCAG manual |
| E20, E21, E22, E23, E25 | **Fechados** |
| **E24** | **Aberto** — 101/101 rotas sem estados exercitados |
| **E26** | **Aberto (decisão)** — aliases `/api/hr/cli-*` mortos para `ti`/`admin` na borda legada de RH; só `ops-`/`fin-`/`adm-` são isentos |

---

## 6. Matriz dos 222 requisitos — por família (medido hoje)

**Classes de evidência:** `gate_nomeado` **26** · `mencionado_em_gate` **124** · `somente_documento` **72**
**Aceite humano:** **0/222** · **Reauditoria integral:** **0/222** · **46** declarados `a_revalidar`

| Família | gate_nomeado | mencionado | somente documento | Total |
|---|---:|---:|---:|---:|
| SEC | 0 | 15 | 0 | 15 |
| PUB | 0 | 8 | 2 | 10 |
| CRM | 0 | 13 | 14 | 27 |
| CON | 0 | 2 | 9 | 11 |
| EMP | 0 | 4 | 15 | 19 |
| HR | 0 | 7 | 17 | 24 |
| OPS | 0 | 16 | 0 | 16 |
| CLI | **8** | 7 | 0 | 15 |
| FIN | 0 | 16 | 0 | 16 |
| AST | 0 | 12 | 0 | 12 |
| ADM | 0 | 12 | 0 | 12 |
| PLT | 3 | 12 | **3** | 18 |
| EXT | **15** | 0 | **2** | 17 |
| AI | 0 | 0 | **10** | 10 |

**13 IDs sem nenhum gate (fila B10):** `PLT-09` · `EXT-16` · `EXT-17` · `AI-01`…`AI-10`

**72 IDs só com documento (sem prova executável):**
`PUB-07, PUB-09` · `CRM-10, CRM-12…CRM-17, CRM-19…CRM-22, CRM-24, CRM-26, CRM-27` · `CON-02…CON-10` · `EMP-02…EMP-11, EMP-13…EMP-17` · `HR-02, HR-04, HR-05, HR-06, HR-08, HR-09, HR-11, HR-12, HR-14…HR-16, HR-18…HR-20, HR-22…HR-24` · `PLT-04, PLT-08, PLT-09` · `EXT-16, EXT-17` · `AI-01…AI-10`

> “Mencionado em gate” **não** é prova de jornada nem de aceite; “gate nomeado” **não** é reauditoria integral.

---

## 7. O que simplesmente não existe no sistema (fora de tela/API)

| Fatia | Situação verificada no código |
|---|---|
| **Executor de backup** | Não existe. 503 deliberado em todas as escritas; catálogo é metadado histórico `unverified` |
| **Upload real de arquivos** | **Nenhum handler `multipart`/`formData`** em `server.mjs` ou `src/server/`. `file_url`/`storage_key` são **referência declarada** (`referencia_declarada_nao_arquivo_verificado`). `CLIENT_DOCS_DIR` só serve downloads de arquivos já presentes |
| **Atores externos** | Não há sessão/login/grant de **fornecedor**, **terceiro** ou **central 24h**. Os únicos cookies de sessão que existem são `admin_session`/`seg_admin_session` (staff), `seg_client_session` (cliente) e `seg_employee_session` (funcionário) — nenhum ator externo. A API declara `external_actor_boundary` em vez de simular o ator |
| **Provedores** | Todos vazios/desligados em `.env.example`: `MAIL_HOST` (fila → `local_outbox`, nunca `sent`), `HERE_API_KEY`, `OLLAMA_ENABLED=false` (fallback, nunca inferência), sem gateway de pagamento, sem emissor fiscal, sem eSocial/relógio, sem CFTV/biometria, sem storage remoto/KMS. **E mais: ver achado N7** |
| **Worker/scheduler durável** | Só EXT-07 in-process opt-in (`EXT07_EVALUATE_INTERVAL_SECONDS` + `EXT07_EVALUATE_IDENTITY`), desligado por padrão. `notification_queue` só é drenada quando alguém chama `processNext` pela API administrativa — não há timer nem worker (o único `setInterval` do servidor é o do EXT-07) |
| **IA real** | Escopo `cliente` do RAG responde **403 `tenant_scope_not_implemented`**; AI-01..10 sem jornada |
| **Academia integrada** | Isolada na porta 3100, JSON single-instance, sem SSO |

---

## 8. PRs abertas — decisão pendente do proprietário (05/11/2026)

| PR | Título | Checks | Situação |
|---|---|---|---|
| **#318** | `feat(e16)`: worker durável EXT-07, fila com lease, retomada exactly-once (**migração 182**) | **46/46 verdes** | Pronta há 3 dias. Se mergear, **182 deixa de ser “próxima livre”** e o ledger muda |
| **#321** | `feat(ux-pro-06)`: estado de leitura honesto da Vistoria em `/admin/comercial` | **91/92** — falha `ux-portal-postgres-browser` | Travada por 1 check |
| **#308** | `feat(ux-pro-03)`: jornada do RH em reclamações compartilhadas | **46/47** — falha `ux-hr-postgres-browser` | Travada por 1 check |
| **#310** | `docs`: apresentação do ERP, lacunas vs. Omie, relatório semanal | **0/2** — `static-and-smoke` falha | Travada |
| **#324** | `docs`: reconcilia o ledger após a PR #323 | 2/2 verdes, mas **base obsoleta** (`3ebdef5…`) | Decisão: mergear, reescrever ou fechar |

---

## 9. Cobertura de gates — o CI não pega tudo

`ci.yml` (o único job de bateria) roda: wave0, `reaudit:sec`, `npm audit --audit-level=moderate`, `typecheck`, `npm test`, `test:ux-pro-09e-pu4:browser`, `test:pglite-schema`, `ux-pro-00-precision`, `admin-navigation`, `build`, `test:rag`, `test:tenant:pg`, `test:demo-local:pg`, `test:cli-v2:pg`, `client-security.integration`.

Dos **80 scripts de teste** do `package.json`, **23 não são referenciados por nenhum workflow** — só rodam na mão:

`test:integration` · `test:staff-auth:pg` · `test:client-access:pg` · `test:cli-v2:pg:objects` · `test:l02-delivery:pg` · `test:l03-delivery:pg` · `test:ext08-knowledge:pg` · `test:ext11-analytics:pg` · `test:ext12-visual:pg` · `test:ext13-reports:pg` · `test:ext14-intel:pg` · `test:ext15-emergency:pg` · `test:f03-lead-to-implementation:pg` · `test:f03-employee-request-rh-return:pg` · `test:f03-client-ticket-acceptance:pg` · `test:f03-contas-baixa-relatorio:pg` · `test:pendencies:pg` · `test:ux-public-routes:pg` · `test:ux-pro-09e-7` · `test:ux-pro-09e-pu6` · `test:ux-pro-04-reports` · `test:ux-pro-10b-keyboard`

> **Corrigido em 02/11 (PR #330):** os três gates de PLT-01/06/12 saíram dessa lista — passaram a ser executados pelo workflow `plt-jornadas-delivery.yml`, com a guarda `tests/plt-gates-wired.test.mjs` impedindo nova orfandade. O restante continua manual.

---

## 10. Achados novos desta auditoria

| # | Achado | Prova | Risco |
|---|---|---|---|
| **N1** | **O ledger reincidiu (E12/E20).** `STATUS-VIGENTE.md` declara como base o merge da PR #328 (`5fde81d…`), mas o HEAD é `a46bd88…` (merge da PLT-12). A PLT-12 **não** tem seção “Atualização corrente” e **não** tem relatório datado (`docs/PLT-12-*.md` não existe) — só mexeu em 2 linhas do ledger. Quebra o padrão de PLT-01/02/06/07 | `git show --stat 39fdc74` → `docs/STATUS-VIGENTE.md \| 2 +-`; `find docs -iname '*PLT*12*'` → vazio | Próxima sessão não sabe que a PLT-12 foi fechada e pode reimplementá-la |
| **N2** | **`.probe-plt12.mjs`, 288 linhas, commitado na raiz.** O próprio arquivo diz “PROBER TEMPORÁRIO — não será commitado”. Não é referenciado por nada, não está no `.gitignore` | `git log --oneline -- .probe-plt12.mjs` → `39fdc74`; `grep -rn "probe-plt12"` → só ele mesmo | Lixo de depuração versionado, com `embedded-postgres` no topo do clone |
| **N3** | **Os gates nomeados novos não estavam no CI** (`test:plt01…:pg`, `test:plt06…:pg`, `test:plt12-incidents:pg`) → **corrigido em 02/11 pela PR #330** | `grep -rn "plt12" .github/workflows/` → vazio antes; depois, job `plt-gates-postgres` verde (20/20) | Gate que não roda sozinho não protege contra regressão |
| **N4** | **Cobertura real de rotas continua rasa**: 101/101 sem estados, **81** sem teclado, **46** sem captura, **16** com captura parcial | `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` (101 linhas) | “101/101 com gate” significa só *a rota carrega* |
| **N5** | **171 MB de ZIPs obsoletos** seguem versionados (16 arquivos), com ~65 migrações de defasagem | `du -ch $(git ls-files downloads dist)` → **171 MB** | Clone inchado; risco de instalar versão morta |
| **N6** | **3 PRs paradas por 1 check** (#321, #308, #310) e **1 PR verde não mergeada** (#318) | `gh pr view … --json statusCheckRollup` | Trabalho pronto parado; #318 ainda altera o ledger de migrações |
| **N7** | **A fila de notificações do console nunca pode enviar e-mail: `mailer` está literalmente `null`.** `server.mjs:1229` cria `createAdminNotificationsApi({ …, mailer: null })` com o comentário “will be set if nodemailer configured; for now null”. `admin-notifications-api.mjs:140` repassa `mailer: ctx.mailer` ao `processNext`, e `notification-queue.mjs` marca `not_configured` quando não há mailer — o item reteima até `dead`. Configurar `MAIL_HOST` **não** muda esse caminho. (O e-mail de **lead** é outro caminho: `sendLeadEmail` cria o transporte do `nodemailer` a partir do env) | Leitura de `server.mjs:1229`, `src/server/admin-notifications-api.mjs:140`, `src/server/notification-queue.mjs:182-206` | Fila administrativa nasce morta: não é “provedor não escolhido”, é ausência de ligação no servidor. Qualquer tela que prometa aviso por e-mail está prometendo o que o código não faz |

---

## 11. Decisões do proprietário que travam fatias (nenhuma registrada como respondida)

1. Nome do papel **“supervisor”** (trilha T25 e aulas de supervisão).
2. Conteúdo técnico da aula 8 de T24; validação dos procedimentos [P]; visitantes/veículos (T21 aula 2).
3. Relevância de mercado (**EXT-03**) e volume (**EXT-04**).
4. Escopo de **C11** financeiro, os 2 hits de dados e autorização do **D7**.
5. Dono do **inventário de bytes** e do **executor de backup** (trava A1).
6. Provedores: SMTP, WhatsApp, fiscal, pagamento, eSocial/relógio, CFTV/biometria, HERE, Ollama, storage/KMS.
7. **RPO/RTO**, teto de hospedagem (referência R$ 200/mês), domínio, CNPJ, logotipo, política de privacidade aprovada, textos e FAQ.
8. Modo de acesso remoto (historicamente Tailscale Funnel, opção B) — **não ativar** sem autorização.
9. **Matriz papel × ação × escopo** do CLI-02 (B8).
10. Destino das **5 PRs abertas** (§8), especialmente a **#318** (migração 182).
11. Autorização **explícita e por escrito** para publicar em produção.

---

## 12. Produção — checklist (`PRODUCAO-GATE.md` §10): 0/12

Homologação RAG beta com 5 perfis · `is_beta_mode=false` · remoção do `noindex` · hospedagem dimensionada · secrets reais · SMTP real · CNPJ/logo/política aprovada/LGPD · **executor de backup real com restore medido** · observabilidade/healthcheck/flags/env · `npm audit` + CI verdes · autorização por escrito.
**Proibido transformar ZIP de prévia em produção.**

---

## 13. Ordem recomendada (menor risco → maior valor)

**Imediato (destrava leitura do estado):**
1. **N1** — reconciliar `STATUS-VIGENTE.md` com `a46bd88` e publicar o relatório datado da PLT-12 (1 PR docs).
2. **N2** — remover `.probe-plt12.mjs` (1 PR).
3. **N3** — ligar `test:plt01/plt06/plt12:pg` a um workflow (ou declarar por escrito que são manuais).

**Depois, uma PR por fatia:**
4. **N7** — ligar o `mailer` da fila administrativa quando o SMTP estiver configurado (fail-closed: sem provedor, continua `not_configured` e a tela declara isso), **ou** registrar por escrito a decisão de manter a fila declarativa.
5. **#318 (E16)** — decidir mergear; se sim, reconcilia o ledger de migrações para 182.
6. **B10** — próxima família sem gate: **PLT-09** (a menor da lista), depois **EXT-16/17**, depois **AI-01..10** (só após decisão de provedor).
7. **B3/B4/B5** — UX-PRO-04/05/06 por superfície, na ordem de menor risco.
8. **B11/B12** — WCAG manual e estados por família de rotas.
9. **A1–A6** — só com as decisões 5, 6, 7 e 11 respondidas.

---

## 14. Limites desta auditoria

- Executado: `npm ci`, `npm test`, `typecheck`, `build`, wave0, cinco inventários `--check`, `reaudit:sec`, contagens físicas, leitura de histórico via `git` e **três gates PostgreSQL reais** (PLT-01 12/12, PLT-06 23/23, PLT-12 20/20).
- **Correção importante:** a afirmação "gates PostgreSQL não rodam neste ambiente" vale **só para os que exigem o cliente PostgreSQL do sistema** (`pg_dump`/`psql` — `test:backup-restore:pg` e afins). Os gates que sobem o próprio cluster via `embedded-postgres` rodam normalmente e foram executados aqui. Os demais números de gates vêm dos relatórios datados e **precisam ser reconferidos**.
- Não houve: validação em **Windows**, teste com **leitor de tela**, revisão **WCAG** manual, análise de segurança ofensiva, parecer jurídico/contábil, **aceite humano** ou UAT.
- Este documento **não** promove requisito, **não** marca item de produção e **não** substitui `STATUS-VIGENTE.md`.
