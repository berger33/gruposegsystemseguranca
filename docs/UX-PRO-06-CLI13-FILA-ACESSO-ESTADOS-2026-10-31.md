# UX-PRO-06 — fila de acesso do portal (CLI-13): jornada alcançável e estado honesto

**Data:** 31/10/2026 · **Base:** `3ebdef50df83be6991d7929c82713fd6b24df4c5` (`origin/main`, merge da PR #323) · **Branch:** `arena/3f450206-gruposegsystemseguranca`
**Superfície:** `/admin/portal/solicitacoes` (`AdminGate` `ti|admin`) · **IDs:** CLI-13 (modos convite / solicitação com aprovação / autocadastro), UX-PRO-06 (estado de leitura e de escrita)
**Produção: NO-GO. 0/222 de aceite humano. Nenhuma reauditoria integral. Nenhuma migração, papel, permissão ou campo novo.**

---

## 1. Escopo e por que esta superfície

A fila de pedidos de acesso ao portal é a única porta de entrada de cliente no produto: sem ela, todo pedido de acesso depende de trabalho manual de TI. A tela já existia, já estava coberta pelo `AdminGate` e já falava com dois endpoints reais (fila + configuração de modos) e duas escritas reais (`PATCH` de decisão e `PATCH` de modo). Não é protótipo, não é demo, não é “em breve”: é o fluxo que o handler de produção autoriza para `["admin","ti"]`.

A fatia **não** criou tela nova e **não** promoveu nada. O que ela fez foi medir a tela viva com sessão real e corrigir o que impedia a jornada existir — e o que fazia a tela mentir sobre o que sabia.

## 2. Estado de partida — medido, não presumido

Sonda em PostgreSQL 17 descartável (as migrações reais) + Chromium empacotado, com sessão `ti` de verdade (`ops-`/`adm-`), **antes** de qualquer mudança. Todas as chamadas com `AbortSignal.timeout(...)` e `redirect:'manual'` (a sonda v3 travou por `fetch` sem timeout; ver §10).

### 2.1 Borda HTTP — a fila administrativa era inalcançável

| Chamada (sessão `ti` real) | Medido antes | Causa |
|---|---|---|
| `GET /api/hr/cli-portal-access-requests` | **403** `individual_staff_required` | `authorizeLegacyHrRequest` → `employees.read` (borda de RH, sem relação com pedido de acesso) |
| `GET /api/admin/hr/cli-portal-access-requests` | **403** | mesma borda |
| `GET /api/crm/hr/cli-portal-access-requests` | **403** | mesma borda |
| `GET /api/cli/portal-access-requests` | **405** | caminho tratado como **público** (só `POST`) |
| `POST /api/public/portal-access-requests` | **404** | despachado em `routeApi`, **ausente** de `API_PATH_MATCH` |

Consequência: os papéis que o handler autoriza (`admin`, `ti`) não conseguiam **ler** a fila por nenhum caminho. O caminho usado pelo formulário público (`/cliente/acesso`) devolvia 404 — o pedido não entrava.

### 2.2 Tela — o que ela dizia sobre o que sabia

Com a leitura negada, a tela exibia **simultaneamente**:

- “Não foi possível carregar a configuração e a fila.” (erro), e
- “Nenhum pedido registrado.” (vazio).

Cinco defeitos adicionais, todos reproduzidos:

| # | Defeito | Medido |
|---|---|---|
| D1 | Falha **aberta**: depois de uma leitura negada, os pedidos anteriores continuavam na tela como se fossem atuais | lista preservada com erro visível |
| D2 | Payload **inválido** publicado como conteúdo: `{}` virava “fila vazia”; item sem UUID era renderizado | `invalid_response` indistinguível de vazio |
| D3 | Escrita morria **em silêncio** quando o corpo não era JSON (`response.json()` lança) | `unhandledrejection` observado, sem mensagem ao usuário |
| D4 | O **código cru** do servidor vazava para a tela | `Decisão recusada: decision_reason_10_500_required` |
| D5 | Dois cliques em “Atualizar” disparavam **quatro** `GET`; botão sempre ativo, sem estado de leitura | contador de requisições = 4 |
| D6 | Respostas fora de ordem podiam sobrescrever a mais nova | sem guarda de sequência |
| D7 | Transbordo horizontal no tablet | **653 px** de `scrollWidth` acima da viewport em 768 px |

## 3. Correção — aditiva, sem tocar papel/permissão/migração

1. **Roteamento (`server.mjs`, duas linhas).** `API_PATH_MATCH` passa a reconhecer `/api/public/portal-access-requests` (o alias documentado volta a existir) e nasce o alias canônico de administração `/api/admin/portal-access-requests` → sessão individual + origem → `ensureAuth(["admin","ti"])`. **Nenhum alias antigo foi removido, alterado ou afrouxado**; `employees.read|write` continua intocado, e o gate prova que o alias de RH **continua 403 para `ti`**.
2. **Módulo puro novo `src/app/admin/portal/solicitacoes/access-queue-state.ts`** — sem React, sem DOM, testável por unidade:
   - `parseModos` / `parsePedidos`: distinguem **inválido** de **vazio** e de **negado**; exigem UUID, enums de modo/status, tipos corretos (`throw invalid_response`);
   - `descreverFalhaLeitura` / `descreverFalhaRede` / `descreverRespostaInvalida`: mensagem para o usuário, sem código cru;
   - `reduzirLeitura`: redutor com **sequência** (`dica`/`descartar`) e `descartar=true` em falha — fecha D1 e D6;
   - `estaVazia`, `rotuloStatus`, `validarMotivo` (10–500 pós-`trim`), `podeDecidir`, `traduzirErroEscrita`, `MOTIVO_MIN/MAX`.
3. **Tela (`page.tsx`).** Duas leituras independentes (`ROTA_FILA = "/api/admin/portal-access-requests"`, `ROTA_MODOS = "/api/cli/portal-mode-configs"`) com refs de sequência; estados explícitos carregando / vazio / falha / **negado** / **desatualizado** com hora da última leitura; “Atualizar” → “Atualizando…” e `disabled` durante a leitura; foco no `role="alert"` **só** em falha por ação; `aria-busy`; erro de escrita traduzido; testids `cli13-fila`, `cli13-fila-erro`, `cli13-fila-negado`, `cli13-fila-desatualizada`, `cli13-fila-vazia`, `cli13-fila-hora`, `cli13-pedido`, `cli13-acao-erro`, `cli13-acao-ok`.
4. **CSS (`AccessRequests.module.css`).** Bloco UX-PRO-06 com quebra das três colunas de modo entre 741 px e ~1100 px (fecha os **653 px**), foco visível de 3 px em toda a `.page`, tema noturno, e — corrigido **durante** o gate — `.demoRequest .decisionGrid{grid-column:1/-1}` com os dois botões de decisão em uma linha (`display:flex`, `min-height:36px`), sem espremer o rótulo em quatro linhas na coluna estreita.

Nada de servidor de dados, migração, papel, permissão ou campo mudou. `EXPECTED_TABS` (24) e `PROMOCOES_COM_PROVA` (11) **não** foram tocados.

## 4. Prova por unidade — focal, RED→GREEN e mutações

`tests/ux-pro-06-cli13-fila-acesso-estados.test.mjs` — **11 testes** (inserido à mão na lista explícita do `test:unit`, que é lista explícita). O módulo é importado via `stripTypeScriptTypes` + `data:` URL (`.mjs` não aceita anotação TS nem `new Set<string>()`).

```
RED  (módulo removido + stash) → # tests 11  # pass 0  # fail 11
GREEN                          → # tests 11  # pass 11 # fail 0
```

Quatro mutações, todas detectadas e revertidas (`sha256sum -c` OK):

| Mutação | Resultado |
|---|---|
| remover a guarda de sequência | `not ok 4` |
| `descartar=false` na falha (falha aberta de volta) | `not ok 6` |
| `ROTA_FILA` → `/api/hr/cli-portal-access-requests` (alias preso) | `not ok 10` |
| parser leniente (aceita item sem UUID) | `not ok 2` |

## 5. Prova de jornada — gate do portal, cenário CLI-13

`tests/ux-portal-workspace.integration.test.mjs` (base 8336 linhas + cenário CLI-13), PostgreSQL 17 descartável + Chromium. Nove fases, 13 estados capturados:

1. **negado** — `403` na fila: erro **e** negado visíveis, “vazio” **não** aparece, nenhum pedido renderizado;
2. **320 / 390 / 768 / 1440** autorizado — sem transbordo (`sobraDocumentoPx: 0` em todos);
3. **noite** — tema noturno autorizado;
4. **falha transitória** — primeiro `GET` 503, segundo passa: retry real, hora da leitura, estado “desatualizada” some;
5. **payload inválido** — `{}`/item sem UUID → “resposta inválida”, **não** vazio;
6. **vazio** — fila vazia legítima;
7. **negado na releitura** — depois de já ter dados, a releitura nega e a lista é **descartada** (D1 fechado);
8. **escrita real** — `PATCH` medido em status/corpo/**banco**: `cli_portal_access_requests` com `status='approved'`, `decision_reason`, `verified_link` persistido, convite canônico emitido, histórico e auditoria gravados;
9. **escrita recusada** — `409` traduzido para o usuário (sem código cru) e **teclado**: o primeiro foco do conteúdo é o retorno declarado (com `href` lido **dentro** do laço de teclado), durante a leitura o botão “Atualizar” fica travado com rótulo “Atualizando…”.

O corpo do `POST` público devolve `{id,protocol,mode,status,created_at}` — **não** `verified_link`; por isso o gate confere o campo **no banco**:
`SELECT … FROM cli_portal_access_requests WHERE id = $1::uuid`.

Resultado da execução final: `ok 1`, `# tests 1 # pass 1 # fail 0`, `EXIT=0`, ~60 s (10ª execução; 7 falhas de seletor/timing do próprio teste e **2 defeitos reais de apresentação** corrigidos no produto — o selo de status duplicado e os botões espremidos).

Evidência: `docs/ux-pro-06-cli13-fila-acesso-evidencias/` — **13 PNGs** + `resumo.json` com `sobraDocumentoPx: 0` e `problems: []` em **todos** os 13 estados.

## 6. Bateria completa (esta fatia)

| Verificação | Resultado medido (31/10, base `3ebdef5…`) |
|---|---|
| `npx tsc --noEmit` | **exit 0**, nenhum erro |
| Lint | **não existe linter no repositório** (sem `eslint`/`biome`/`prettier` em `devDependencies`, sem script `lint`). Em vez de inventar um, `node --check` em `server.mjs`, `src/server/cli-finance-api.mjs`, no focal e no gate: **4/4 ok** |
| `npm run build` (`next build`) | **exit 0** |
| `npm test` **com** `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x` | **1270/1270**, exit 0 (1ª execução: 1269/1270 — a guarda E23 pegou o §2 do relatório de reauditoria citando 1.637 em vez de **1.641** arquivos varridos; corrigido **no relatório**, não no gerador) |
| `npm test` **sem** `AWS_EXECUTION_ENV` | **1270/1270**, exit 0 (E22: a suíte não depende da variável) |
| `npm run test:unit` | **1270/1270** em **164** arquivos, exit 0 |
| `node scripts/requisitos-222-inventory.mjs --check` | OK — 222 IDs, `arquivosVarridos` **1.637 → 1.641**, 20 `a_revalidar` sem gate |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK — CSVs conferem; `/admin/portal/solicitacoes` agora com **2** arquivos no diretório da rota |
| `node scripts/ux-pro-03-ti-inventory.mjs --check` | OK — 84 componentes, 11 promoções com relatório |
| `node scripts/ux-pro-10b-contrast-inventory.mjs --check` | OK — `E18_INVENTARIO` |
| `npm run reaudit:sec` | `SEC_REAUDIT_CHECK_OK: 3 artefatos conferem; 35/35 âncoras` |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| **Gate do portal completo** (`node scripts/qa-ux-portal-postgres.mjs`) | **50/50**, `# fail 0`, exit 0, **711,7 s** — nenhum cenário vizinho quebrou com o arquivo de gate compartilhado alterado |
| `git diff --check` | limpo (sem espaço em branco pendente) |

**Antes** da correção dos documentos, a suíte já acusava exatamente **5** falhas, todas de inventário/ledger e **todas** consequência esperada dos arquivos novos (E27 pedindo **164** arquivos, gerador 222 desatualizado, `ux-pro-00` desatualizado em duas guardas) — nenhuma falha de produto. Depois da regeneração pelos geradores e da reconciliação do ledger: **1270/1270**.


## 7. Limites declarados — o que esta fatia **não** prova

1. **Sem SMTP:** a aprovação emite o convite canônico e grava o vínculo; **não envia e-mail**. Quem aprova não avisa o solicitante pela tela.
2. **Sem aceite humano, sem homologação, sem UAT:** produção **NO-GO**, **0/222**; nenhuma reauditoria integral executada.
3. **Sem leitor de tela e sem Windows:** teclado, foco e contraste foram medidos apenas no Chromium empacotado.
4. **A fila é global do módulo**, não escopada por conta: o cenário A/B prova que a decisão de um pedido não contamina o outro, mas **não** existe isolamento por carteira nesta tela.
5. **Resposta fora de ordem não é alcançável pela tela** (o “Atualizar” fica travado durante a leitura). A guarda de sequência fica provada **no teste focal**, não no gate — declarado como lacuna de jornada, não como prova de navegador.
6. **Dívida preservada, não corrigida:** `src/app/admin/ti/CliFinanceClient.tsx` continua usando o alias preso na borda de RH e engolindo a falha com `.catch(()=>({requests:[]}))` — mesma classe de defeito (falha aberta), superfície diferente, fora do escopo desta fatia.
7. **UX-PRO-00 não é prova:** as colunas “noite”/“px”/“teclado” da matriz gerada são heurísticas estáticas do gerador (`scripts/ux-pro-00-inventory.mjs`) e continuam dizendo “não comprovado por captura”. A prova de navegador desta fatia está no gate e em `docs/ux-pro-06-cli13-fila-acesso-evidencias/`, **não** naquele CSV. O CSV **não** foi editado à mão: foi regenerado pelo gerador aprovado.
8. **Cosmético aberto:** a página usa `.back` e `.eyebrow`, que **não existem** em `AccessRequests.module.css`. Sem efeito de layout medido (os elementos herdam estilo do texto), declarado para não virar surpresa.

## 8. Comandos

```bash
# focal
node --test tests/ux-pro-06-cli13-fila-acesso-estados.test.mjs

# gate (cenário CLI-13 apenas)
UX_PORTAL_TEST_PATTERN='CLI-13' npm run test:portal-workspace
UX_PORTAL_TEST_PATTERN='CLI-13' \
UX_PORTAL_EVIDENCE_DIR=docs/ux-pro-06-cli13-fila-acesso-evidencias \
  npm run test:portal-workspace

# inventários: somente pelos geradores
node scripts/requisitos-222-inventory.mjs
node scripts/ux-pro-00-inventory.mjs
node scripts/ux-pro-03-ti-inventory.mjs
node scripts/ux-pro-10b-contrast-inventory.mjs
```

## 9. Reconciliação do ledger (drift medido)

- `origin/main` no início da sessão: `3ebdef5…` = **merge da PR #323**. O ledger em `main` declarava base `666ffd7…` (`#322`) e a #323 como **aberta** — uma etapa atrás.
- Existe a **PR #324**, aberta e **sem merge**, com a reconciliação equivalente (2 arquivos, +6/−4, zero código). Ela **não** foi mergeada, **não** foi fechada e **não** foi reescrita por esta sessão.
- Esta fatia reconciliou `docs/STATUS-VIGENTE.md` **a partir de `git log origin/main`**, reproduzindo o conteúdo da #324 em vez de depender dela: se a #324 for mergeada depois, o conflito é textual e localizado neste arquivo.
- Inventários regenerados **somente** pelos geradores aprovados: `arquivosVarridos` 1637 → **1641** (módulo, focal, evidência e este relatório) e `/admin/portal/solicitacoes` passa a **2** arquivos no diretório da rota. Nenhum CSV foi editado à mão.
- `test:unit`: **163 → 164** arquivos (o novo focal entra na lista explícita); `npm test` **1259 → 1270** (as 11 asserções novas); gate do portal **49 → 50** cenários.
