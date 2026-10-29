# UX-PRO-03 — 9ª aba com prova: central/vídeo, biometria e automações determinísticas

**Data:** 29/10/2026 · **Base:** `a6e9c20211bbe188f7d4630dc5107cdf1db8dfea` (`main`, merge da PR #305) ·
**Branch:** `arena/464a46c1-gruposegsystemseguranca` ·
**Natureza:** entrega local com prova estática, HTTP/PostgreSQL descartável e cenário de navegador. **Não** é
aceite humano, homologação nem autorização de produção (`NO-GO`).

---

## 1. O que foi pedido e o que a auditoria encontrou

O órfão escolhido foi `ExtReportingClient.tsx` (família `EXT-13..17 + AI-10`). Antes de escrever qualquer
linha, o grafo real de rotas foi conferido em `server.mjs` e em cada módulo `src/server/ext-*-api.mjs`.

### 1.1 Achado A — três das seis famílias estão aposentadas no servidor (não é lacuna de UI)

| Família | Rota que o protótipo chamava | Despacho real | Resposta medida (PostgreSQL 17 + HTTP) |
|---|---|---|---|
| Relatórios programados | `POST /api/ext/periodic-reports` | `extReportsApi.handleLegacy` | **410 `legacy_writer_retired`**, `canonical: /api/ext/reports/periodic` |
| Inteligência comercial | `POST /api/ext/commercial-intelligence` | `extIntelApi.handleLegacy` | **410**, `canonical: /api/ext/intel/suggestions` |
| Apoio emergencial | `GET/POST /api/ext/emergency-channels` | `extEmergencyApi.handleLegacy` | **410 `legacy_emergency_read_retired`**, `canonical: /api/ext/emergency/channels` |

As três jornadas canônicas (`/api/ext/reports/*`, `/api/ext/intel/*`, `/api/ext/emergency/*`, migrações 165/167)
existem, têm matriz granular (`reports.*`, `intel.*`, `emergency.*`) e gate próprio
(`tests/ext13-reports.integration.test.mjs`, `ext14`, `ext15`). **Decisão desta fatia:** a aba **não** monta
aquelas três famílias — botão que devolve 410 não é funcionalidade. Elas continuam fora do `TiConsole` e exigem
fatia própria, com a matriz de permissão delas.

### 1.2 Achado B — as três famílias restantes devolviam 500 em toda escrita

Sonda com cluster descartável, migrações 001–181 aplicadas e sessão real de `ti`:

| Requisição | Antes | Causa |
|---|---|---|
| `POST /api/ext/central-projects` | **500** | `INSERT` sem `protocol` (NOT NULL) e com `client_account_id` (coluna inexistente); `privacy_assessment` tratada como opcional, mas é NOT NULL 20..2000 |
| `PATCH /api/ext/central-projects` | **500** | `UPDATE` em `status`, `privacy_approved_at`, `privacy_approved_by_identity` — colunas que a 087 não tem |
| `POST /api/ext/biometry-projects` | **500** | `INSERT` sem `protocol`; faixas de impacto/base legal diferentes do banco; tipo `outra` (enum é `outro`) |
| `PATCH /api/ext/biometry-projects` | **500** | atualizava `collection_active`; a coluna é `is_collection_active`; estados fora do enum `ext_biometry_status` |
| `GET/POST/PATCH /api/ext/ai-automations` | **500** | consultava `ext_ai_deterministic_automations`; a tabela é `ai_deterministic_automations` |
| `GET/POST /api/ext/ai-automation-logs` | **500** | tabela `ext_ai_automation_logs` não existe; campos `success`/`duration_ms` não existem |

Nenhuma dessas rotas tinha teste. O protótipo nunca funcionou: era um formulário em cima de endpoints que
respondiam 500.

### 1.3 Achado C — o protótipo oferecia campos que o banco não guarda

`ext_central_projects` **não tem** coluna de status (só as duas aprovações) e `ai_deterministic_automations`
**não tem** coluna de agendamento (`schedule_cron`) nem `duration_ms` em `ai_automation_logs`. A tela passou a
oferecer apenas o que existe; a dívida está escrita na própria tela e na seção 5.

---

## 2. O que mudou

| Arquivo | Mudança |
|---|---|
| `src/app/admin/ti/ExtReportingClient.tsx` | Reescrito (151 → 641 linhas): 3 famílias vivas, 4 estados de leitura + vazio + estado próprio do registro, `records()`/`s()`/`n()`/`b()` sem `any`, `sequence` na leitura e no histórico de execução, 27 motivos de erro traduzidos, rótulo com `htmlFor`/`aria-describedby` em todo campo, fonte/data-base, drill-down ao JSON canônico e ao histórico, limites declarados |
| `src/app/admin/ti/ExtReportingClient.module.css` (novo) | Tokens `--ux-color-*`, zero hex, `:focus-visible`, breakpoints 900/650 |
| `src/app/admin/ti/TiConsole.tsx` | **21 → 22 abas**: `['monitoramento_ext','Central, biometria e automações']`, novo grupo `Inteligência e monitoramento`, `dynamic()` + render. Nenhuma aba existente tocada |
| `src/server/ext-reporting-api.mjs` | Quatro handlers vivos alinhados à migração 087 (central, biometria, automações, logs). Os quatro handlers legados aposentados foram **preservados como estão** (não são despachados) |
| `tests/ux-pro-03-ti-monitoramento-ext-ui.test.mjs` (novo) | Teste focal 5/5, incluindo a guarda que proíbe formular escrita nas rotas aposentadas |
| `tests/ux-portal-workspace.integration.test.mjs` | Cenário de navegador: papel no servidor, A/B sem resíduo, POST/PATCH medidos em status e corpo, as duas regras de LGPD recusando o caminho inseguro, 503/403 distintos, 4 larguras |
| `tests/ux-pro-03-ti-reaudit.test.mjs` | `EXPECTED_TABS` **21 → 22** |
| `scripts/ux-pro-03-ti-inventory.mjs` | 9ª entrada em `PROMOCOES_COM_PROVA` (manual, de propósito) |
| `package.json` | Teste focal incluído no `test:unit` (154 → 155 arquivos) |
| `docs/STATUS-VIGENTE.md` | §1 ledger, §3 fila e §6 registro desta fatia |

### 2.1 Contratos preservados

- **Permissão**: `requireRole(sess,['admin','ti'])` em todos os handlers — nenhuma permissão foi criada,
  removida ou ampliada. `rh` continua recebendo **401 `unauthorized`** (medido).
- **Papel da UI mais estreito que a API?** Não: aqui a API e a tela têm o mesmo público (`admin|ti`); `rh` não
  vê a aba porque `/admin/ti` é `AdminGate ['ti','admin']`.
- **Escritas**: `POST` de projeto de central, `POST` de projeto de biometria, `POST` de automação e `POST` de
  execução (as quatro do protótipo) continuam existindo; `PATCH` de aprovações/status foi acrescentado porque
  as regras de LGPD do servidor só são alcançáveis por ele.
- **Leituras**: as quatro leituras vivas (`central-projects`, `biometry-projects`, `ai-automations`,
  `ai-automation-logs`) continuam sendo consumo das mesmas rotas, agora com validação de payload.
- **Nada removido**: rotas, migrações, colunas, enums, papéis e as três jornadas canônicas intactas.

---

## 3. Prova (medida, não declarada)

### 3.1 Sonda HTTP/PostgreSQL descartável (migrações 001–181, sessão real)

| Requisição | Resultado |
|---|---|
| `GET /api/ext/central-projects` com `ti` | **200** |
| `GET /api/ext/central-projects` com `rh` | **401 `unauthorized`** |
| `PATCH /api/ext/central-projects` com `rh` | **401**, projeto continua com `is_privacy_approved=false` |
| `POST /api/ext/central-projects` (com avaliação) | **201**, protocolo `CENT-EXT-YYYYMMDD-XXXX` |
| `POST /api/ext/central-projects` (sem avaliação) | **400 `invalid_privacy_assessment`** |
| `PATCH` aprovação geral sem privacidade | **400 `privacy_approval_required_projeto_separado_privacidade_aprovada`** |
| `PATCH` privacidade + aprovação geral | **200**, `approved_at` gravado |
| `POST /api/ext/biometry-projects` | **201**, `is_collection_active=false` |
| `PATCH` coleta sem aprovação | **400 `collection_requires_approval_nao_coletar_biometria_por_padrao`** |
| `PATCH` `ativo` + aprovado + coleta | **200** |
| `GET/POST/PATCH /api/ext/ai-automations` | **200 / 201 / 200** |
| `POST /api/ext/ai-automation-logs` (resultado válido) | **201**, `is_error=false`, contadores atualizados |
| `POST /api/ext/ai-automation-logs` (resultado curto) | **400 `invalid_result`** |
| `GET /api/ext/ai-automation-logs?automation_id=` | **200** |
| `POST /api/ext/periodic-reports` (aposentada) | **410** com `canonical` |

### 3.2 Teste focal (estático, no `test:unit`)

`tests/ux-pro-03-ti-monitoramento-ext-ui.test.mjs` — **RED 0/5 → GREEN 5/5**. Cobre: aba real e grupo próprio,
os quatro endpoints vivos despachados, papel nomeado nos oito handlers, **nenhuma escrita formulada nas rotas
aposentadas**, quatro estados, `sequence`, `Array.isArray`, ausência de `any`/`alert`/`prompt`/`confirm`/hex
inline, tradução das regras de privacidade e biometria, fonte/data-base/drill-down e limites escritos.

### 3.3 Cenário de navegador (gate do portal)

Cenário `browser UX-PRO-03: monitoramento e automação determinística`, no mesmo gate dos portais
(`tests/ux-portal-workspace.integration.test.mjs`), executado com Chromium real e cluster PostgreSQL descartável
por `scripts/qa-ux-portal-postgres.mjs`:

- **isolado:** 1/1;
- **gate completo:** **46/46 em uma execução** (595 s), com `next-env.d.ts` e `tsconfig.json` restaurados
  (`1862ac4b…` / `2128c956…`) pelo guarda E19.

O gate reprovou uma vez e a reprovação valia: a asserção usava o texto da própria seção
("Biometria não coleta por padrão…"), que aparece duas vezes na tela (descrição + mensagem de erro do
servidor). O cenário passou a asserir a frase que só existe na mensagem traduzida
("ativar a coleta exige aprovação registrada do projeto"). Nenhuma verificação foi afrouxada.

---

## 4. Limitações declaradas

- **0/222 requisitos com aceite humano; 0/101 rotas com aceite humano.** Esta fatia não muda esses números.
- **Produção: NO-GO** (`docs/PRODUCAO-GATE.md`, 10 itens).
- **Sem coleta de biometria**: nenhum byte biométrico é capturado, armazenado ou comparado. Aprovar/ativar é
  declaração do operador, não parecer jurídico, RIPD aprovado ou base legal revisada.
- **Sem central de vídeo real**: nenhuma câmera, gravador ou fornecedor é conectado; o registro é o projeto.
- **Sem execução de automação**: não existe worker/agendador durável; o histórico é declaração manual auditável.
- **Relatórios programados, inteligência comercial e apoio emergencial** permanecem fora do console: suas rotas
  canônicas exigem matriz granular própria e merecem fatia dedicada.

## 5. Dívidas registradas (não escondidas)

1. `ai_deterministic_automations` não tem coluna de agendamento; o protótipo oferecia cron e recebia 500. A tela
   deixou de oferecer o campo — se o proprietário quiser agendamento declarativo, é migração nova (próxima livre
   **182**) e decisão dele.
2. `ext_central_projects` não tem coluna de status: o projeto registra duas aprovações. Um ciclo de vida de
   central (análise, implantação, implantado) exige migração e decisão de negócio.
3. `ai_automation_logs.result` é NOT NULL 10..1000 e não guarda duração: a tela não pede duração e exige resultado.
4. Os quatro handlers legados aposentados continuam no módulo `ext-reporting-api.mjs` sem despacho. Não foram
   removidos (regra do `AGENTS.md`); uma fatia de limpeza pode retirá-los com prova de que nada os chama.
5. `client_account_id` não existe em `ext_central_projects` nem em `ext_biometry_projects`: o vínculo com conta
   fica no contrato/projeto correspondente e a tela não pede esse campo.

---

## 6. Bateria de verificação (29/10, nesta sandbox)

| Verificação | Resultado |
|---|---|
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1203/1203**, 0 fail |
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm run test:unit` | **1203/1203**, 0 fail |
| `npm run test:unit` **sem** a variável | 1201/1203 — as 2 falhas são o **E22** (`libnspr4.so`): as asserções do PU4 abrem Chromium e dependem das bibliotecas AL2023 que a variável libera |
| `npx tsc --noEmit` (`npm run typecheck`) | **0 erros** |
| `npm run build` | **OK**, 106/106 páginas |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-03-ti-inventory.mjs --check` | **OK** — 84 componentes, **9 promoções** com relatório |
| `node scripts/requisitos-222-inventory.mjs --check` | **OK** — 222 IDs, **20 `a_revalidar` sem gate** (inalterado) |
| `node scripts/ux-pro-00-inventory.mjs --check` | **OK** — 101 rotas, 101 com gate |
| `node scripts/ux-pro-10b-contrast-inventory.mjs --check` | **OK** |
| `npm run reaudit:sec` | **OK** — 35/35 âncoras, 3 artefatos |
| `npm audit --audit-level=moderate` | **0 vulnerabilidades** |
| gate do portal (`scripts/qa-ux-portal-postgres.mjs`) | **46/46** |
| `git diff --check` | limpo |
| `next-env.d.ts` / `tsconfig.json` | `1862ac4b…` / `2128c956…` **intocados** |
| Migrações | **nenhuma** criada ou alterada: 001–181 seguem imutáveis, próxima livre **182** |

**Nota sobre o E22:** o parágrafo histórico do `STATUS-VIGENTE.md` (7ª promoção) diz que o cenário de navegador
"não executa nesta sandbox". Com `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x` ele **executa sim** — foi assim que
esta fatia mediu 46/46 aqui, incluindo a reprovação inicial que apontou o seletor ambíguo. A limitação real é
apenas do `test:unit` sem a variável.
