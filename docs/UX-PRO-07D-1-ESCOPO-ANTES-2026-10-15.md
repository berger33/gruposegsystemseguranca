# UX-PRO-07D-1 — escopo, baseline e medição anterior: estados honestos de leitura em `/admin/operacao`

**Data:** 15/10/2026

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

**Fatia registrada aqui:** UX-PRO-07D-1 — estados honestos de **leitura** dos cinco grupos de leitura do workspace principal de `/admin/operacao` (grupo principal de nove leituras, estrutura, dimensionamento, versões de escala e detalhe da versão selecionada), no mesmo padrão das subfatias de leitura UX-PRO-07A, UX-PRO-07B-1 e UX-PRO-07C-1. As escritas ficam fora desta fatia.

**Origem do recorte:** `docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`, seção 2, linha 07D (`/admin/operacao`: “Preservar a reescrita UX-07 existente; separar qualquer tratamento do legado avançado e produzir evidência atual”), reconferida contra a `main` vigente nesta sessão. A ordem 07A → 07B → 07C está entregue e mergeada (PRs #222–#227); a linha seguinte do mapa é a 07D. Nenhum identificador foi presumido sem essa conferência.

## 1. Base realmente conferida

Conferência feita no checkout desta sessão, antes de qualquer edição de tela:

- branch de trabalho: `arena/fde056de-gruposegsystemseguranca` (branch fixada da sessão; nenhuma outra branch foi criada ou selecionada);
- `HEAD` local e `origin/main`: `85e1e075ef047018c9e882d87cb642bf27eb1aef` (merge da PR #227, UX-PRO-07C-2), confirmado por `git fetch origin main`, `git rev-parse HEAD`/`origin/main` e `git merge-base --is-ancestor`;
- PR #228 consta `CLOSED` (redundante com a #227); não foi reaberta e nenhum commit dela foi reaplicado; `git stash list` vazio; árvore de trabalho limpa;
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`;
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`;
- dependências instaladas com `npm ci`;
- `node scripts/ux-pro-00-inventory.mjs --check` → `OK`; 100 entradas de rota; contagem estática, não equivale a passagem visual, teste de estados ou aceite humano;
- gate herdado da rota executado na base intacta: `npm run test:ux-ops:pg` → **9/9**, `UX_OPS_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` (PostgreSQL descartável, HTTP real e Chromium). Ao final, `next-env.d.ts`/`tsconfig.json` restaurados e reconferidos pelos SHA-256 acima.

Foram lidos antes deste registro: `AGENTS.md`, `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`, `docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md`, `docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`, `docs/UX-PRO-07-PATRIMONIO-ESTADOS-2026-10-14.md` (07A), `docs/UX-PRO-07-EMERGENCIAL-RELATORIO-2026-10-14.md` e `docs/UX-PRO-07B-2-RELATORIO-2026-10-14.md` (07B-1/07B-2), `docs/UX-PRO-07C-1-RELATORIO-2026-10-14.md` e `docs/UX-PRO-07C-2-RELATORIO-2026-10-15.md` (07C-1/07C-2), `docs/UX-07-OPERACAO-2026-10-05.md` (reescrita UX-07 anterior desta rota), os dois CSVs vigentes de 13/10/2026, `scripts/ux-pro-00-inventory.mjs`, `scripts/qa-ux-ops-postgres.mjs`, `tests/ux-ops-workspace.integration.test.mjs`, `tests/ux-ops-vocabulary.test.mjs`, `src/app/admin/operacao/page.tsx`, `src/app/admin/operacao/OperacaoWorkspace.tsx`, `src/lib/ops-request.ts`, `src/lib/ops-vocabulary.mjs` (+ `ops-vocabulary.d.mts`) e `src/components/ui/UiState.tsx`.

Nada de UX-PRO-07A, 07B-1, 07B-2 ou 07C-1/07C-2 é reaberto: nenhum arquivo de `/admin/patrimonio`, `/admin/emergencial`, `/admin/fornecedores`, `src/lib/asset-request.ts`, `src/lib/emergency-request.ts`, `src/lib/supplier-read.ts` ou `src/lib/supplier-write.ts` é tocado por esta fatia, e nenhuma asserção herdada é editada.

## 2. Mapa das dezessete leituras que a subfatia trata

Todas `GET`, mesma origem, com autorização decidida no servidor. Os grupos abaixo são os grupos de carregamento que a própria tela já declara nos comentários de `OperacaoWorkspace.tsx:336-349` (grupo principal, estrutura OPS-01, dimensionamento OPS-02, versões OPS-03 e detalhe sob demanda); esta fatia preserva essa atomicidade de grupo — não a fragmenta nem a amplia.

| Grupo | Leituras (URL inalterada) | Chave canônica do corpo 2xx |
| --- | --- | --- |
| principal (9) | `GET /api/ops/posts?limit=100`, `GET /api/ops/allocations`, `GET /api/ops/coverage-requests`, `GET /api/ops/handovers`, `GET /api/ops/occurrence-book`, `GET /api/ops/checklist-instances`, `GET /api/ops/work-rules`, `GET /api/ops/qualifications`, `GET /api/ops/validations?is_valid=false` | `posts`, `allocations`, `requests`, `handovers`, `occurrences`, `instances`, `rules`, `qualifications`, `validations` |
| estrutura (2) | `GET /api/ops/job-roles`, `GET /api/ops/post-shift-needs` | `roles`, `needs` |
| dimensionamento (2) | `GET /api/ops/dimensioning`, `GET /api/ops/coverage-gaps` | `dimensionings`, `gaps` |
| escalas — versões (1) | `GET /api/ops/schedule-versions` | `versions` |
| detalhe da versão (3) | `GET /api/ops/schedule-entries?version_id=…`, `GET /api/ops/schedule-acks?version_id=…`, `GET /api/ops/schedule-history?version_id=…` | `entries`, `acknowledgments`, `history` |

Contratos que esta subfatia não pode quebrar:

- os nove casos vigentes de `tests/ux-ops-workspace.integration.test.mjs` (401 sem sessão; “menu não é autorização” para `supervisor` em escrita restrita; massa pelas APIs reais; falha inicial não vira vazio; 14 abas com roving tabindex e setas/Home/End; vocabulário em português; ciência idempotente na tela; correção pontual do legado `OpsAdvanced2Client`; 390 px sem transbordo) continuam passando **sem edição de asserção**;
- `tests/ux-ops-vocabulary.test.mjs` exige que todo código de erro dos cinco servidores de operação tenha frase e que nenhuma tradução invente código inexistente — o código sintético de resposta inválida desta fatia (`invalid_ops_response`) é código de cliente, como `invalid_supplier_response` na 07C-1, e não entra no bloco `ERROR_MESSAGES` do vocabulário;
- `tests/admin-page-gates.test.mjs` exige `page.tsx` com os papéis publicados `["supervisor","marcelo","admin","ti"]` — `page.tsx` não é tocado;
- `tests/ui-surface-locale.test.mjs` recusa `toLocale…String()` sem localidade explícita em `src/app` e `src/components` — a hora da leitura usa localidade explícita `pt-BR`;
- verbos, URLs, query strings, cabeçalhos, corpos, transições canônicas, autorização, auditoria, migrações e tenancy permanecem intactos; `src/server/ops-*.mjs`, `server.mjs` e os clientes legados `OpsAdvanced2Client`/`OpsAdvanced3Client` não são tocados.

## 3. Estados atuais de leitura — medição anterior

SHA-base = `85e1e07`, `OperacaoWorkspace.tsx` com 1457 linhas (pós-UX-07 fatia A).

| ID | Medição anterior | Evidência `file:line` no SHA-base |
| --- | --- | --- |
| O1 | Resposta `2xx` sem a chave canônica vira lista vazia em **todas** as dezessete leituras: cada aplicação faz `data.<chave> \|\| []`, sem validar que a chave existe e é uma lista. Uma resposta ilegível aparece como “Nenhum posto/versão/registro…”, indistinguível de vazio real. | `:373-381` (principal), `:396-397` (estrutura), `:412-413` (dimensionamento), `:424` (versões), `:453-455` (detalhe) |
| O2 | Nenhum grupo registra a hora da última leitura concluída. Depois de uma leitura com sucesso, a tela não diz quando aquele recorte foi lido. | ausente em todo o arquivo (nenhum `readAt`); estados em `:332-349` são apenas `loading`/`error` por grupo |
| O3 | Falha de **releitura** destrói ou esconde o conteúdo já lido, sem marcá-lo como desatualizado: o grupo principal troca a tela inteira (abas incluídas) pela caixa de erro; estrutura/dimensionamento/versões escondem as tabelas atrás do erro; o detalhe **apaga** entradas, ciências e histórico no `catch`. | `:351-371` + `:523-529` (principal), `:543-551` (estrutura via `PostsPanel`), `DimensioningPanel`/`SchedulesPanel` (erro substitui o conteúdo), `:445-451` (detalhe limpa os três arrays) |
| O4 | Depois do sucesso não existe nenhum controle de releitura: os quatro carregadores só rodam no `useEffect` de montagem e os botões “tentar novamente” só existem dentro da caixa de erro. Quem opera precisa recarregar a página para reler postos, estrutura, dimensionamento ou versões — o único caminho de releitura existente é clicar de novo em “Ver calendário” para o detalhe. | `:385`, `:401`, `:417`, `:428` (efeitos únicos), `:430-456` (`selectVersion`); nenhum botão de atualização no JSX (`:512-600`) |
| O5 | `401`/`403` depois do sucesso não falham fechado por grupo: as coleções lidas permanecem em estado (apenas escondidas atrás da caixa de erro no grupo principal; retidas nos demais grupos) e a classificação de `unauthorized` no vocabulário oferece “tentar novamente” (`canRetry` de `auth`), como se repetir a mesma chamada fosse a saída para perda de sessão. | `:368-371` (erro sem limpeza), `:387-399`, `:403-415`, `:419-426` (idem); `src/lib/ops-vocabulary.mjs:771-806` (`describeOpsError`) consumido por `ReadError` em `:296-308` |
| O6 | Não há guarda contra resposta superada: se o operador selecionar a versão A e em seguida a B, a resposta atrasada de A pode sobrescrever entradas/ciências/histórico de B, porque `selectVersion` aplica o resultado sem conferir qual seleção continua vigente. O mesmo vale para releituras concorrentes do mesmo grupo. | `:430-456` (`selectVersion` sem contador de requisição); carregadores `:351-428` idem |
| O7 | O vazio de cada painel existe (textos “Nenhum…”), mas como O1 transforma resposta ilegível em `[]`, o vazio exibido não prova que a consulta foi concluída com sucesso — ele é alcançável também a partir de um corpo `2xx` malformado. | painéis em `:620-620` ss. (vazios) combinados com O1 (`:373-381` etc.) |
| O8 | Sem captura UX-PRO desta rota: o inventário registra linha 28 (`/admin/operacao`) com `capturas` vazio e lacunas “sem captura visual; tema noturno sem captura; percurso de teclado não verificado; estados não exercitados em navegador”, embora o gate herdado exercite abas/teclado em navegador sem gravar evidência versionada. | `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv:28`; `tests/ux-ops-workspace.integration.test.mjs` (capturas apenas com `UX_OPS_EVIDENCE_DIR`, sem `resumo.json`) |

### 3.1 Áreas explicitamente fora desta fatia

- **Legado avançado.** `OpsAdvanced2Client` (Supervisão, Rondas, Relatórios) e `OpsAdvanced3Client` (Métricas, Limpeza, Monitoramento), montados nas seis abas legadas, continuam como estão — inclusive a correção pontual de leitura da UX-07. O mapa da 07D manda “separar qualquer tratamento do legado avançado”; tratar essas telas é item próprio, não desta PR, e nenhuma asserção sobre elas é alterada.
- **Escrita da ciência de escala.** `acknowledgeSchedule` (`POST /api/ops/schedule-acks`, `:459-476`) é a única escrita do workspace principal. Estado de envio, prevenção de duplo clique e reconciliação de resultado dessa escrita **não** são tratados aqui: ficam para a subfatia de escrita da 07D (padrão B-1/B-2 e C-1/C-2), sem alterar o comportamento vigente nesta PR.
- **Abas.** As 14 abas já são `tablist`/`tab`/`tabpanel` reais com roving tabindex e setas/Home/End (`:533-549`, `:484-497`) — não há defeito tipo C11 nesta rota e nada nelas é reconfigurado.

## 4. Fatia UX-PRO-07D-1 — incluído e excluído

### Incluído

Somente `src/app/admin/operacao/OperacaoWorkspace.tsx`, um transporte de leitura novo `src/lib/ops-read.ts` (classificação de resposta inválida e de falha fechada, reaproveitando `opsRequest`/`describeOpsError` sem duplicar o vocabulário), o gate focal aditivo e as evidências/relatórios desta fatia. A entrega deve:

1. dar a cada um dos cinco grupos estado próprio de leitura — “ainda não lido/carregando”, “pronto” (com hora local da leitura concluída), “falhou” e “atualizando” — mantendo a atomicidade de grupo vigente (o grupo só fica pronto quando todas as suas leituras respondem `2xx` com a chave canônica sendo uma lista);
2. tratar resposta `2xx` sem a chave canônica (ou com a chave não-lista) como falha declarada `invalid_ops_response`, nunca como vazio nem como sucesso;
3. declarar o vazio somente depois de resposta `2xx` válida, mantendo os textos de vazio vigentes;
4. acrescentar controle explícito de releitura por grupo (“Atualizar…”), com exatamente os mesmos `GET`s que o grupo já fazia — nenhum verbo, URL ou query muda;
5. em falha transitória de releitura, preservar o conteúdo lido, mostrar faixa `role="alert"` por grupo com a causa e o código reais, a hora da última leitura concluída e a declaração de que o conteúdo pode estar desatualizado, com repetição real somente quando a classificação permitir;
6. em `401`/`403` de releitura (ou de leitura inicial), falhar fechado **no grupo**: limpar as coleções protegidas do grupo (e, no grupo de versões, também a seleção e o detalhe), apresentar o estado de negativa sem tratá-lo como dado desatualizado e sem oferecer repetição da mesma chamada;
7. descartar resposta superada por contador de requisição por grupo: selecionar a versão B depois da A (ou reler o mesmo grupo duas vezes) nunca aplica a resposta atrasada da seleção/requisição anterior;
8. selecionar uma versão continua relendo **somente** o detalhe (as três leituras do detalhe), sem relançar versões, grupo principal, estrutura ou dimensionamento — comportamento vigente que passa a ser provado por contadores no gate;
9. manter as 14 abas, o calendário, os painéis e o vocabulário exatamente como estão fora do caminho de leitura, usando os tokens e componentes compartilhados já consumidos pela tela (`UiState`, `UiBadge`, `UiWorkspace.module.css`).

### Excluído

- qualquer alteração de verbo, URL, query, corpo, cabeçalho, estado de domínio, transição canônica, permissão, auditoria, migração ou tenancy; `src/server/ops-api.mjs`, `ops-advanced*.mjs`, `ops-pendency-api.mjs` e `server.mjs` não são tocados;
- a escrita `POST /api/ops/schedule-acks` e o seu caminho de reconciliação (`acknowledgeSchedule`), que permanecem byte a byte no comportamento vigente;
- `OpsAdvanced2Client`, `OpsAdvanced3Client` e as seis abas legadas (Supervisão, Rondas, Relatórios, Métricas, Limpeza, Monitoramento);
- `page.tsx`, `AdminGate`, papéis declarados, metadados e navegação;
- asserções herdadas de `tests/ux-ops-workspace.integration.test.mjs`, `tests/ux-ops-vocabulary.test.mjs`, `tests/l06-delivery.integration.test.mjs` e `tests/l08-delivery.integration.test.mjs` (nenhuma é editada, removida ou relaxada; os casos novos são aditivos e o runner passa apenas a auditar o resumo TAP com um mínimo maior);
- `/admin/operacao` não é misturada com nenhuma outra rota nesta PR;
- validação manual, homologação, revisão humana e aceite humano. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu.

## 5. Prova exigida para encerrar a UX-PRO-07D-1

1. **Gate focal aditivo com navegador real** (`tests/ux-ops-workspace.integration.test.mjs`, executado por `scripts/qa-ux-ops-postgres.mjs`: PostgreSQL descartável, migrações reais, servidor HTTP real, Chromium; falhas injetadas somente em `window.fetch` da página), provando: autorização das leituras preservada no servidor (anônimo `401` sem vazar a chave canônica); carregando não é vazio (atraso injetado) e vazio só depois de `2xx` válido; falha inicial transitória com código real e repetição que emite nova leitura de verdade; falha transitória de releitura preservando o conteúdo com hora, sem mostrar dado criado durante a falha, e repetição bem-sucedida que traz o dado novo; `403` depois do sucesso falhando fechado por grupo (conteúdo protegido fora da tela, sem faixa de desatualizado e sem repetição); `2xx` sem a chave canônica virando `invalid_ops_response` sem virar vazio; seleção de versão relendo somente o detalhe (contadores dos demais grupos imóveis); releitura de outro grupo (dimensionamento) preservando o conteúdo na falha; e medições em 320/390/768/1440 px, tema noturno pelo controle real do envelope e percurso de teclado, com transbordo, menor alvo e contrastes instrumentados.
2. O gate novo deve ser **executado primeiro contra a implementação anterior** e o resultado registrado em `docs/ux-pro-07-operacao-evidencias/antes-07d-1/`, sem tratar isso como regressão de gate herdado.
3. **Preservação:** os nove casos herdados continuam passando sem edição; `npm run test:l06-delivery:pg` e `npm run test:l08-delivery:pg` continuam verdes; nenhuma asserção herdada é alterada.
4. **Evidências** em `docs/ux-pro-07-operacao-evidencias/`: 320/390/768/1440 px no tema dia, 768 px em tema noturno pelo controle real, percurso de teclado, falha inicial, dado preservado/desatualizado e resposta inválida; `resumo.json` com `problems: []` em todas as entradas, derivado de overflow do documento, menor alvo medido e contrastes instrumentados. As medições automatizadas não equivalem a auditoria WCAG completa.
5. **Relatório depois** com tabela O1–O8 antes/depois por `file:line` do SHA-base e da implementação final, contratos preservados, gates executados e limitações.
6. **Inventário:** regenerar os dois CSVs somente com `node scripts/ux-pro-00-inventory.mjs`; provar que o diff se limita à linha 28 (`/admin/operacao`) — ou que nenhuma célula mudou; nunca editar CSV à mão.
7. **Bateria completa** antes de abrir a PR: `npm ci`; `npm test`; `npm run typecheck`; `npm run build`; `node scripts/qa-wave0-static.mjs`; `node scripts/ux-pro-00-inventory.mjs --check`; `npm run test:l06-delivery:pg`; `npm run test:l08-delivery:pg`; `npm run test:ext04-suppliers:pg` (preservação da trilha anterior); o gate focal novo em duas execuções independentes; `git diff --check` limpo; `next-env.d.ts` e `tsconfig.json` restaurados e reconferidos pelos dois SHA-256 após cada build e cada gate que suba o Next.

Este documento não é aprovação das fatias seguintes e não declara aceite humano. Uma PR desta subfatia só pode ser mergeada depois de todos os checks remotos verdes (cancelado, pulado, em fila ou sem runner não conta), estado `MERGEABLE`/`CLEAN` e revisão técnica automatizada publicada como comentário — sem alegar revisão humana.
