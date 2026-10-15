# UX-PRO-07E-2 — leitura honesta de resposta 2xx sem lista canônica nas oito superfícies restantes de `/admin/financeiro`

Data: 2026-10-15
Branch da sessão: `arena/71865335-gruposegsystemseguranca`
Base: `61ec10bc24ffc9bc7ae462e104b49d7b26b8f3eb` (`origin/main`, merge do PR #232, 07E-1)
Commits da fatia: escopo (`docs/UX-PRO-07E-2-ESCOPO-ANTES-2026-10-15.md`, registrado antes do código), gate aditivo (teste + runner + workflow), implementação nos oito arquivos autorizados, evidências/CSVs/relatório.
Decisão de escopo: registrada em `docs/UX-PRO-07E-2-ESCOPO-ANTES-2026-10-15.md`; a fatia foi oferecida ao owner como próxima pendência registrada (`src/lib/finance-request.ts:69-80` na base e `docs/UX-PRO-07E-1-RELATORIO-2026-10-15.md`) e confirmada antes de qualquer edição de código.

## 1. O que esta fatia fecha — e o que ela não fecha

Fecha somente: em `/admin/financeiro`, nas OITO superfícies restantes da classe D1 (FIN-08, FIN-09, FIN-10, FIN-11, FIN-12, FIN-14, FIN-15 e FIN-16), uma resposta HTTP 2xx cujo corpo não traz a lista canônica (chave ausente, chave não-array, `null` ou corpo ilegível) passa a ser **falha declarada de leitura**, com o código `invalid_finance_response`, texto explicando que isto não significa ausência de registros e — onde já existia canal de erro — repetição disponível — em vez de falso "nenhum registro" ou de quebra silenciosa do render. São as **18 ocorrências auditadas** por grep robusto em 8 arquivos, mapeadas linha a linha na seção 3 do documento de escopo.

Com isso, somados aos 5 arquivos da UX-PRO-07E-1, a classe D1 está fechada nos 13 arquivos de `/admin/financeiro`. O comentário de registro em `src/lib/finance-request.ts:69-80` foi atualizado de "PENDENTE" para "implementada", apontando para este relatório.

Não fecha:
- UX-PRO-07 como um todo. Esta fatia **não conclui o UX-PRO-07**; conclui apenas o recorte 07E-2 descrito acima.
- Os achados E2–E9 do plano mestre para `/admin/financeiro` (legado avançado em `src/app/admin/ti/OpsAdvanced2Client.tsx`/`OpsAdvanced3Client.tsx`, datas/fuso, rolagem interna de tabelas, `<main>` aninhado em `src/app/admin/AdminGate.tsx:115`, releitura explícita/hora da última leitura, contraste noturno 1,95:1 em `src/components/ui/UiWorkspace.module.css:72,:103` e `src/app/admin/admin-theme.css:154`, quebra de palavra em cabeçalhos a 768px em `UiWorkspace.module.css:11`): continuam pendentes, cada um exigindo decisão de escopo explícita do owner.
- Os achados transversais herdados do PR #229: continuam pendentes, sem correção transversal e sem mistura de rotas.
- Os 2 hits auditados e NÃO corrigidos: `FiscalWorkspace.tsx:80` (`supported_obligations||[]`, campo de registro já validado) e `ExpenseWorkspace.tsx:176` (fallback de render `history[e.id]||[]`, que agora só enxerga lista confirmada ou estado de falha).
- C11: fora de escopo; somente por ordem explícita do owner, como item registrado à parte.
- O alvo de toque do botão de repetir legado medido em 29px (ver seção 11): observação registrada, fora do escopo desta fatia.

## 2. O defeito na implementação anterior (com `file:line` da base `61ec10b`)

A leitura confiava em `|| []`/`?? []` sobre a chave canônica. Como esse operador só cobre `null`/`undefined`/falsy, um corpo 2xx com chave ausente vira lista vazia (vazio falso) e um corpo com chave **não-array** entra truthy no estado e quebra o render:

| # | Arquivo:linha (base) | Leitura | Chave | Comportamento na base |
| --- | --- | --- | --- | --- |
| 1-4 | `src/app/admin/financeiro/FiscalWorkspace.tsx:44` | `fiscal-activity-rules`, `fiscal-providers`, `fiscal-obligations`, `fiscal-documents` | `rules`, `providers`, `obligations`, `documents` | vazio falso nas 4 tabelas ("Nenhuma regra cadastrada." etc.); não-array quebra em `rules.find is not a function` (linha 73 da base) |
| 5-7 | `src/app/admin/financeiro/GatewayWorkspace.tsx:49` | `payment-gateways`, `gateway-webhooks`, `gateway-charges` | `gateways`, `webhooks`, `charges` | vazio falso ("Nenhum gateway cadastrado." etc.); não-array quebra em `gateways.map`/`charges.map`/`webhooks.map` |
| 8-9 | `src/app/admin/financeiro/ClosureWorkspace.tsx:9,13` | `competence-closures`, `report-versions` | `closures`, `versions` | "Nenhuma competência encontrada." falso; versões sob demanda viram lista silenciosamente vazia |
| 10-11 | `src/app/admin/financeiro/CommissionWorkspace.tsx:11,15` | `commission-provisions`, `commission-provision-history` | `provisions`, `history` | "Nenhuma provisão encontrada." falso; histórico sob demanda vazio sem declaração; não-array quebra em `rows.find`/`rows.map` |
| 12-13 | `src/app/admin/financeiro/CostAllocationWorkspace.tsx:37` | `cost-imports`, `costs` | `imports`, `costs` | vazio falso nas 2 tabelas; não-array quebra em `imports.map is not a function` |
| 14-15 | `src/app/admin/financeiro/ExportWorkspace.tsx:15,21` | `exports`, `export-logs` | `exports`, `logs` | "Nenhuma exportação encontrada." falso; trilha sob demanda vazia sem declaração |
| 16-17 | `src/app/admin/financeiro/ExpenseWorkspace.tsx:61,72` | `expenses`, `expense-history` | `expenses`, `history` | "Nenhuma solicitação." falso; histórico sob demanda com `Sem eventos.` falso |
| 18 | `src/app/admin/financeiro/ManagementResultsWorkspace.tsx:33` | `management-results` | `results` | "Nenhum resultado registrado." falso; não-array quebra em `rows.map is not a function` |

Superfície autorizada: exatamente essas 18 ocorrências nos 8 arquivos, conforme registrado na 07E-1.

## 3. Implementação (estritamente aditiva em contrato)

Nenhum contrato mudou: mesmos métodos, URLs (incluindo os quatro aliases de cada endpoint financeiro), payloads, cabeçalhos, permissões, auditoria, migrações e servidor. As escritas continuam usando os helpers originais, intactos.

- `src/lib/finance-request.ts:83,86,106,121` — `INVALID_FINANCE_RESPONSE`, `invalidFinanceResponse`, `financeReadList` e `financeInvalidListMessage` seguem como na 07E-1 (nenhuma mudança de código nesta fatia; só o comentário de registro, `:69-80`, foi atualizado). O vocabulário canônico `src/lib/finance-vocabulary.mjs` **não** foi alterado (anti-deriva preservada).
- `src/app/admin/financeiro/FiscalWorkspace.tsx:33` — `apiList<T>(path,key)` espelha o fetch de `api` (`:14`), que fica intacto para as escritas; `:60` `readConfirmed`; `:66-69` leitura das 4 listas por `apiList`; `:72` confirma, `:73` desconfirma na falha; `:124,143,165,194` vazios condicionados a `readConfirmed`, com os testids novos `fin11-{rules,providers,obligations,documents}-unavailable`.
- `src/app/admin/financeiro/GatewayWorkspace.tsx:45` — `apiList` espelhando `api` (`:25`, com `FinanceApiError` preservado para a decisão por código em `simulateWebhook`); `:69` `readConfirmed`; `:77-79` leitura; `:153,180,198` vazios condicionados, testids `fin12-{gateways,charges,webhooks}-unavailable`.
- `src/app/admin/financeiro/CostAllocationWorkspace.tsx:45` — `requestList` espelhando `request` (`:26`); `:62` `readConfirmed`; `:66` leitura; `:68` a falha de leitura desconfirma e relança (a falha de escrita em `run` não mexe no flag); `:96,115` vazios condicionados, testids `fin08-{imports,costs}-unavailable`.
- `src/app/admin/financeiro/ClosureWorkspace.tsx:13` — `apiList` espelhando `api` (`:7`); `:16` `load` exige `closures`; `:20` `loadVersions` exige `versions`; `:25` erro das versões ganhou testid `fin15-versions-error`.
- `src/app/admin/financeiro/CommissionWorkspace.tsx:15` — `apiList` espelhando `api` (`:9`); `:18` `provisions`; `:22` histórico exige `history`; `:27` testid `fin16-history-error`.
- `src/app/admin/financeiro/ExportWorkspace.tsx:17` — `apiList` espelhando `api` (`:11`); `:22` `exports`; `:28` trilha exige `logs`; `:34` testid `fin14-logs-error`.
- `src/app/admin/financeiro/ExpenseWorkspace.tsx:60` — `readList` espelhando o `readJson` local (`:52-57`, que continua servindo `expense-authorities`, objeto/null e fora da classe D1); `:69` `expenses`; `:21` `historyError` por solicitação; `:88-96` `loadHistory` exige `history` array (2xx sem lista = falha declarada; o histórico nunca vira lista vazia) ; `:175` erro com testid `fin10-history-error-<id>`; `:179` o "Sem eventos." deixa de aparecer sobre falha.
- `src/app/admin/financeiro/ManagementResultsWorkspace.tsx:33` — `apiList` espelhando `api` (`:22`); `:47` `results`.

Onde o vazio já era guardado por `!error` (FIN-09/10/14/15/16), nenhuma apresentação mudou: o canal de erro herdado (`fin09-error`, `fin10-error`, `fin14-read-error`, `fin15-read-error`, `fin16-read-error`) passou a receber também a mensagem de corpo inválido, e o texto de vazio falso continua suprimido pela guarda herdada. Onde o vazio não era guardado (FIN-08/11/12), foi adotado o padrão idêntico ao da 07E-1 em `BankReconciliationWorkspace.tsx:246-301`: flag de grupo tudo-ou-nada + marcador "Lista indisponível — a leitura não foi confirmada; não confundir com ausência de …".

## 4. Gate aditivo

- `tests/ux-finance-workspace.integration.test.mjs`: prefixo herdado de 858 linhas / 45.438 bytes mantido byte a byte — SHA-256 `21c4f686f343bdea9f8dc972dc931edbd77320b912fb93166661af35df889884` verificado antes e depois de cada reconstrução (confere também o prefixo interno da 07E-1: 347 linhas / 17.004 bytes / `42dc4da39b583445e338c9fb7d8586d43c6b1a9bc8745768b4290280f7e8ec74`). O bloco novo começa na linha 859 e acrescenta 12 casos (arquivo final com 34 `test(`, 76.468 bytes, diff `+478/−0` sobre a base). Nenhuma asserção herdada foi editada, removida ou relaxada.
- Auxiliares novos no bloco: `settle07e2` (mesma semântica do `settle` herdado, teto menor para não inflar a linha de base), `gotoTab07e2` (abre a aba pelo testid estável também usado pelo L07) e `qa07e2ExpenseSpace` (espaço canônico de despesa via SQL, como no L07).
- Massa sintética pelas PRÓPRIAS APIs financeiras (fechamento, provisão, exportação e solicitação), necessária para as quatro leituras sob demanda com id real.
- Injeção de falha somente no `window.fetch` da página, apenas em GET, pela regra persistente e desligável herdada (`openFinanceInvalidBody`); nada é injetado em servidor, banco, proxy ou auditoria.
- Runner próprio `scripts/qa-ux-pro-07e2-postgres.mjs` (`MINIMUM_CASES = 34` em `:61`), PostgreSQL descartável, HTTP real e Chromium; auditoria TAP (`:76`, `:136`) reprova fail, skip, todo, resumo ausente/incompleto e aprovações abaixo do mínimo. Os runners herdados (`qa-ux-finance-postgres.mjs`, `qa-ux-pro-07e1-postgres.mjs`) permanecem intactos.
- Workflow `.github/workflows/ux-pro-07e2-delivery.yml` com `paths:` preciso em `src/app/admin/financeiro/**`, `src/lib/finance-request.ts` (comentário de registro e descritor exercitados pelo gate), o arquivo de teste, o runner e o próprio workflow — classificado pelo inventário como gate focal de `/admin/financeiro`, não baseline.

## 5. Baseline contra a implementação anterior

Diretório próprio: `docs/ux-pro-07-financeiro-evidencias/antes-07e-2/` (`gate.txt` + 41 capturas PNG: 19 dos casos herdados + 22 dos casos novos). As evidências herdadas da 07E-1 foram restauradas após as execuções (nenhuma imagem existente foi sobrescrita no commit final).

Resultado: **24 aprovações / 10 reprovações / 0 skip / 0 todo**, exit 1, 312 s, `UX_FIN_07E2_GATE_REJECTED`. As 24 aprovações são os 22 casos herdados + contrato das 18 chaves + vazio legítimo preservado. As 10 reprovações, todas `AssertionError` com causa visível no `gate.txt`:

| caso | superfície | comportamento da base | evidência (mensagem literal) |
| --- | --- | --- | --- |
| 24 | FIN-15 sem `closures` | "Nenhuma competência encontrada." falso | `not ok 24`; `07e2-fechamento-corpo-invalido.png` |
| 25 | FIN-16 com `provisions` não-array | **quebra o render**: `rows.find is not a function` | `not ok 25`; `07e2-comissoes-corpo-invalido.png` |
| 26 | FIN-14 com corpo 2xx ilegível | "Nenhuma exportação encontrada." falso | `not ok 26`; `07e2-exportacoes-corpo-invalido.png` |
| 27 | FIN-10 sem `expenses` | "Nenhuma solicitação." falso | `not ok 27`; `07e2-despesas-corpo-invalido.png` |
| 28 | FIN-09 com `results` não-array | **quebra o render**: `rows.map is not a function` | `not ok 28`; `07e2-resultado-gerencial-corpo-invalido.png` |
| 29 | leituras sob demanda | versões/histórico/trilha vazios sem declaração | `not ok 29`; `07e2-fechamento-versoes-corpo-invalido.png` |
| 30 | FIN-11 sem `rules` | **quebra o render**: `rules.find is not a function` | `not ok 30`; `07e2-fiscal-corpo-invalido.png` |
| 31 | FIN-12 sem `gateways` | "Nenhum gateway cadastrado." falso | `not ok 31`; `07e2-gateway-corpo-invalido.png` |
| 32 | FIN-08 com `imports` não-array | **quebra o render**: `imports.map is not a function` | `not ok 32`; `07e2-custos-corpo-invalido.png` |
| 34 | responsivo 1440/768/390/320 | **quebra o render** em 1440px; sem superfície para medir | `not ok 34`; `07e2-falha-declarada-1440.png` |

Os erros de página das quatro quebras (`rules.find`, `rows.find`/`rows.map`, `imports.map`, todas "is not a function") foram coletados pelo próprio gate via `pageerror` e aparecem literais no `gate.txt` do baseline.

## 6. Execuções finais (duas, independentes)

- Execução 1 (com capturas): `UX_FINANCE_EVIDENCE_DIR=docs/ux-pro-07-financeiro-evidencias` → **34/34, 0 fail, 0 skip, 0 todo**, exit 0, 158 s. Log em `docs/ux-pro-07-financeiro-evidencias/depois-07e-2/execucao-1/gate.txt`; capturas `07e2-*.png` na raiz do stage e `07e2-resumo.json` (arquivo próprio, não sobrescreve `resumo.json` da 07E-1, que permaneceu byte a byte — SHA-256 `78a213281c64a08d99ab2e53b962ea43d5fc0d36703f7436e9cffb01460d689c`) com 4 entradas, viewports 1440x900/768x1024/390x844/320x844, tema dia, estado `falha_declarada_corpo_2xx_sem_lista_grupo_fiscal`, transbordo 0 em todas as larguras e `alturaBotaoRepetirPx` 29 registrado como observação; sem `firstFocus`/`percursoTeclado` de propósito: não são medidos aqui.
- Execução 2 (sem diretório de evidência, como no CI): **34/34, 0 fail, 0 skip, 0 todo**, exit 0, 145 s. Log em `docs/ux-pro-07-financeiro-evidencias/depois-07e-2/execucao-2/gate.txt`.
- Execução preliminar rejeitada (preservada como evidência do processo): 33/34, exit 1, em `depois-07e-2/execucao-preliminar-rejeitada-alvo-do-botao/gate.txt` — a única reprovação era uma asserção NOVA desta fatia exigindo ≥32px do botão de repetir legado (`fin11-retry`, 29px); a medição foi mantida como observação e a prova passou a exigir existência e acionabilidade do botão (seção 11), sem relaxar nada herdado.

## 7. CSVs regenerados e prova do diff

Regenerados exclusivamente por `node scripts/ux-pro-00-inventory.mjs` (nunca editados à mão). A conferência campo a campo (script de comparação sobre as duas versões) mostra **1 linha alterada de 101 em cada arquivo, só a rota `/admin/financeiro`**, e o único campo alterado é a lista de gates automatizados, que passa a incluir `ux-pro-07e2-delivery.yml` (classificado como jornada/focal):

- `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`: campo 20 passa de `ux-finance-delivery.yml|ux-pro-07e1-delivery.yml` para `ux-finance-delivery.yml|ux-pro-07e1-delivery.yml|ux-pro-07e2-delivery.yml`.
- `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`: campo 7 idem, na parte "teste automatizado de jornada"; viewports (`1440x900|320x844|390x844|768x1024`), stage (`ux-07-financeiro|ux-pro-07-financeiro`) e as demais colunas ficam idênticos.
- `node scripts/ux-pro-00-inventory.mjs --check`: OK, CSVs conferem com o código atual.

## 8. Arquivos protegidos

Depois do build e de cada gate que inicia Next.js: `git checkout -- next-env.d.ts tsconfig.json` e verificação SHA-256 — `next-env.d.ts` `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`, `tsconfig.json` `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`. Nenhum dos dois mudou em `main` durante a fatia; os hashes herdados continuam válidos.

## 9. Bateria completa

| verificação | resultado |
|---|---|
| `npm ci` | OK (81 pacotes, 0 vulnerabilidades) |
| `npm test` | 933/933 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 (migrações 001–180 contínuas) |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK |
| `npm run test:l06-delivery:pg` | 9/9 (a primeira tentativa teve 1 reprovação não reproduzida; ver seção 11) |
| `npm run test:l07-delivery:pg` | 43/43 |
| `npm run test:l08-delivery:pg` | 51/51 |
| `npm run test:ext04-suppliers:pg` | 28/28 |
| `node --test tests/ux-finance-vocabulary.test.mjs` | 10/10 |
| `npm run test:ux-finance:pg` (gate herdado, sem edição) | 34/34 (ele executa o mesmo arquivo de teste; nenhuma edição no runner herdado) |
| `node scripts/qa-ux-pro-07e2-postgres.mjs` (execuções finais 1 e 2) | 34/34 e 34/34 |
| baseline do gate novo contra `61ec10b` | 24/34, rejeitado como esperado |

## 10. Preservações verificadas

- Escritas intocadas nas 8 superfícies: métodos, URLs, payloads, cabeçalhos, `idempotent_replay`/`duplicate_ack` e chaves de idempotência existentes (FIN-14 `storage_key`, FIN-16 `idempotency_key`, FIN-10/11/12 chaves informadas pela tela). Nenhuma `Idempotency-Key` foi inventada.
- `tests/l07-delivery.integration.test.mjs:972` (FIN-09 com 500 → `fin09-error` com `/internal|falha/i`, `fin09-list` com 0 `li`, retry limpa), `:1316/:1330-1331` (FIN-10 falha sem vazio, busca sem resultado com "busca aplicada"), `:1345-1355` (histórico com alçada em `fin10-history-<id>`), `:2890-2899` (leitura 500 + retry em FIN-14/15/16 com "Não foi possível") e `:2915` (`fin15-version-list` com 2 versões): todos seguem verdes na bateria.
- O `resumo.json` herdado do stage (`docs/ux-pro-07-financeiro-evidencias/resumo.json`) permaneceu byte a byte; o resumo novo é arquivo separado e o inventário agrega por rota.

## 11. Limitações e declarações obrigatórias

Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu. As medições automatizadas não equivalem a auditoria WCAG completa. O tema noturno de `/admin/financeiro` não foi medido nesta fatia (contraste é achado transversal E8, fora do escopo). As capturas de teclado/percurso continuam sendo as herdadas dos stages anteriores; o `07e2-resumo.json` declara apenas o estado de falha declarada do grupo fiscal.

Observações registradas sem correção (fora do escopo desta fatia):

- O botão de repetir legado do FIN-11 (`fin11-retry`) mede 29px em 1440px — abaixo da convenção de 32px dos componentes novos, acima de zero para acionabilidade; valor registrado no `07e2-resumo.json` e aqui.
- A primeira execução da bateria em L06 teve 1 reprovação não reproduzida (9/9 nas duas execuções seguintes, 47 s e 45 s); trata-se de flake de infraestrutura de teste, sem relação com os arquivos desta fatia (`/admin/operacao` e `/admin/patrimonio` não foram tocados).

Esta fatia fecha somente o recorte 07E-2 descrito na seção 1 e **não conclui o UX-PRO-07**: permanecem pendentes os achados E2–E9, os achados transversais do PR #229 e C11. A revisão técnica deste trabalho, quando publicada, é automatizada e não constitui aprovação humana.
