# UX-PRO-ID3 — Escopo antes da implementação: leitura de Contratos por conta ativa

**Data:** 2026-10-23 (America/Sao_Paulo)
**Branch ativa:** `arena/ba30e55c-gruposegsystemseguranca`
**Base:** `main` / `origin/main` `7e706e67bfbc2be7205720dad7801beac96eda2f` (merge da PR #297)
**Frente autorizada:** ID3 — estados de leitura do portal autenticado do cliente
**Superfície única:** `/cliente/app/contratos` (`src/app/cliente/app/contratos/page.tsx`)

## 1. Verificações iniciais

- Branch ativa confirmada; árvore limpa; HEAD e `origin/main` em `7e706e67bfbc2be7205720dad7801beac96eda2f`, divergência `0/0` após `git fetch origin main`.
- PRs abertas: nenhuma.
- Workflows do SHA base em `main`:
  - `QA baseline`, run `39901767735`: `completed` / `success`.
  - `PostgreSQL 17 backup and restore gates`, run `39901767685`: `completed` / `success`.
- Não há falha ativa no `main` atual. Falhas em SHAs anteriores são históricas e já foram sucedidas por merges verdes.
- Hashes protegidos conferidos antes das alterações:
  - `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`.
  - `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

## 2. Reconciliação com a matriz, código montado e entregas anteriores

A linha `/cliente/app/contratos` de `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` registra evidência de código e do gate genérico `ux-portal-delivery.yml`, mas não registra captura nem percurso específico de leitura/troca de conta. Essa ausência de evidência, isoladamente, não foi tratada como defeito.

O defeito foi localizado pela inspeção do componente efetivamente montado:

- `src/app/cliente/app/layout.tsx` monta `ClientSpaceProvider` e a navegação da área autenticada.
- `src/app/cliente/app/ClientAppNavigation.tsx:49–61` oferece o seletor `Conta de cliente selecionada` quando a identidade tem mais de uma conta.
- `src/app/cliente/app/contratos/page.tsx` é a entrada real da rota e consulta `GET /api/client/contracts?account=…` por `workspaceFetch`.

A PR #288 corrigiu `/cliente/app/cobrancas`, inclusive a associação do resultado à conta. Ela **não** alterou `/cliente/app/contratos` e declarou as demais rotas como somente inspecionadas estaticamente. Esta fatia não reabre nem retrabalha cobranças ou qualquer entrega #284–#297; trata um defeito novo, reproduzível em outra tela autorizada por ID3.

## 3. Defeito atual e caminho determinístico de reprodução

### 3.1 Resultado não vinculado à conta de origem

Em `src/app/cliente/app/contratos/page.tsx`:

- linhas `40–41`: existe apenas uma coleção global (`contracts`) e um texto global de erro (`error`), sem o `accountId` que originou a leitura;
- linhas `43–52`: `loadContracts(accountId)` grava qualquer resposta concluída diretamente com `setContracts(data.contracts)` (linha `49`), sem guardar a conta nem verificar se uma consulta mais nova já começou;
- linhas `54–60`: ao trocar a conta, uma nova leitura começa, mas a coleção da conta anterior não deixa de ser elegível para renderização;
- linhas `100` e `138–154`: o cabeçalho passa a identificar a nova `activeAccount`, enquanto a lista continua iterando a coleção global anterior.

**Reprodução funcional prevista e exercitável no código montado:** uma identidade sintética com grants válidos para as contas A e B abre Contratos, recebe um contrato real de A pelo endpoint e então seleciona B com o GET de B mantido pendente. Antes da resposta de B, o título do contrato de A permanece na tela sob o nome de B. Isso é uma mistura visual de dados entre contas; não se trata de afirmar que o servidor ampliou o grant.

### 3.2 Corrida entre respostas

Como a linha `49` aceita qualquer conclusão, uma resposta antiga de A que chegue depois da resposta mais nova de B substitui a lista de B mesmo com B ainda selecionada. O endpoint continua correto e isolado no servidor; o defeito está na conciliação temporal do estado no navegador.

### 3.3 Comportamento que precisa passar a ser garantido

1. Ao selecionar outra conta, nenhum contrato da conta anterior pode ser renderizado durante a leitura da nova conta.
2. Vazio de B só pode aparecer depois do `200` de B; enquanto B estiver pendente, deve haver carregamento, não contrato de A nem falso vazio.
3. Uma resposta fora de ordem não pode substituir o resultado da consulta mais recente.
4. Erro de uma conta não pode ser apresentado como erro de outra; nova tentativa deve continuar usando o mesmo endpoint e a conta ativa.

### 3.4 Acréscimo reproduzido antes do CSS: seletor da troca A/B em 320 px

A primeira execução GREEN confirmou a separação A/B, mas parou na medida responsiva obrigatória: `overflow = 31` em 320 px. A repetição com diagnóstico de nós, preservada em `docs/evidencias/ux-pro-id3-contratos-leitura-2026-10-23/red-responsivo-320.txt`, identificou:

- `div.ClientApp_navTools…`: `left = 16`, `right = 351` em viewport `320`;
- `button.ClientApp_logoutButton…` (`Sair`): `left = 276`, `right = 351`;
- 0 px em 390, 768 e 1440.

A captura de diagnóstico dessa execução mostrou o seletor e `Sair` cruzando a borda direita; o RED preservado é o log acima, e a captura final de mesmo nome foi refeita depois da correção. Em `src/app/cliente/app/ClientApp.module.css:40–57`, `.navTools` não permite quebra nem encolhimento e `.accountSelect` conserva largura intrínseca do nome longo. O nome sintético e a asserção `overflow <= 1` não serão reduzidos para ocultar o defeito.

Esse controle é o próprio seletor usado na troca A/B desta fatia. Uma correção limitada a `flex-wrap` e `min-width: 0` no grupo CSS já montado permanece na mesma família, sem alterar `ClientAppNavigation.tsx`, provedor, outras páginas ou contratos. A suíte integral do portal será exigida porque o módulo CSS é compartilhado; nenhuma cobertura visual das outras rotas será inferida.

## 4. Contratos e invariantes a preservar

- `GET /api/client/contracts?account=<uuid>` permanece com a mesma rota, método, query, cabeçalhos, cookies e payload `{ contracts: [...] }`.
- `src/server/client-space-api.mjs:361–409` permanece intacto: sessão de cliente obrigatória, `requireAccountScope`, grant ativo, restrição `all`/`selected`, lista vazia deny-by-default para allowlist vazia e consulta SQL por `client_account_id`.
- Nenhuma alteração em autenticação, sessões, RBAC, grants, escopo por contrato, isolamento de contas/titulares, `audit_log`, armazenamento privado, operações locais ou migrações SQL `001–180`.
- Nenhuma alteração em `ClientSpaceProvider`, `ClientAppNavigation`, `workspace-response.ts`, outras páginas ID3, APIs ou CSS global.
- Não se afirmará que a correção visual cria autorização: a autorização continua exclusivamente no servidor. A correção impede que dados já recebidos para uma conta sejam apresentados no contexto visual de outra e que respostas antigas vençam uma consulta mais nova.
- `next-env.d.ts` e `tsconfig.json` devem conservar os hashes protegidos; `next-env.d.ts` será restaurado se o build/dev o modificar automaticamente.

## 5. Correção mínima prevista

Somente no componente de Contratos:

- representar sucesso e erro com o `accountId` de origem;
- derivar da conta ativa o resultado/erro elegível para renderização;
- identificar a consulta mais recente e ignorar conclusões fora de ordem;
- explicitar a leitura em andamento sem apresentar a coleção anterior no contexto da nova conta;
- após o RED responsivo documentado em 3.4, permitir quebra/encolhimento do grupo do seletor e de `Sair`, sem remover controles nem alterar seu comportamento.

Não está prevista mudança de endpoint, payload, vocabulário compartilhado, componente React compartilhado, desenho de outras telas ou comportamento das mutações de outros módulos.

## 6. Riscos e mitigação

- **Risco:** uma resposta antiga limpar ou sobrescrever o estado da consulta atual.
  **Mitigação:** teste com respostas A/B liberadas fora de ordem e guarda de sequência no componente.
- **Risco:** esconder um vazio legítimo ou mantê-lo durante carregamento.
  **Mitigação:** o teste separa B pendente de B com `200 { contracts: [] }`.
- **Risco:** quebrar o seletor nativo ou o fluxo por teclado.
  **Mitigação:** a troca A/B também será operada com setas direcionais no seletor focado no Chromium.
- **Risco:** atribuir ao gate uma prova de autorização que ele não tem.
  **Mitigação:** conferir por HTTP real que o endpoint retorna somente os dados da conta solicitada e manter o teste preexistente de conta alheia; relatar separadamente a correção visual e a autorização server-side.

## 7. Arquivos previstos

- `docs/UX-PRO-ID3-CONTRATOS-LEITURA-ESCOPO-ANTES-2026-10-23.md` (este escopo).
- `src/app/cliente/app/contratos/page.tsx` (reconciliação da leitura por conta).
- `src/app/cliente/app/ClientApp.module.css` (somente quebra/encolhimento do grupo do seletor, após o RED de 31 px em 320).
- `tests/ux-pro-id3-contratos-leitura-ui.test.mjs` (contrato estático focal, inicialmente RED).
- `tests/ux-portal-vocabulary.test.mjs` (somente importação do teste focal na suíte já existente).
- `tests/ux-portal-workspace.integration.test.mjs` (cenário PostgreSQL 17 + Chromium, inicialmente RED, com capturas e medidas).
- `docs/evidencias/ux-pro-id3-contratos-leitura-2026-10-23/` (capturas antes/depois, resultados RED e resumo da nova fatia).
- `docs/UX-PRO-ID3-CONTRATOS-LEITURA-RESULTADO-2026-10-23.md` (resultado final).

Nenhum CSV de matriz/inventário, `resumo.json` histórico, workflow ou contagem histórica será alterado.

## 8. Plano de validação

1. Criar os testes e capturas com `src/` intacto; provar RED estático e RED em PostgreSQL 17 + Chromium pela presença do contrato de A durante a leitura pendente de B.
2. Implementar somente a correção delimitada na seção 5.
3. Executar inspeção estática, teste focal e de contrato, PostgreSQL 17 descartável + Chromium real e a suíte completa da família (`npm run test:ux-portal:pg`).
4. Medir `scrollWidth - clientWidth <= 1` em `320`, `390`, `768` e `1440`; capturar e inspecionar individualmente antes/depois. O portal autenticado não oferece controle de tema: dia/noite não se aplica a esta tela e não será simulado com o tema administrativo.
5. Operar a troca de contas por teclado e verificar foco no seletor.
6. Executar todos os gates aplicáveis solicitados: `npm audit --audit-level=high`, `node scripts/qa-wave0-static.mjs`, `npm run typecheck`, `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test`, `node scripts/ux-pro-00-inventory.mjs --check`, `node --test tests/ux-pro-00-precision.test.mjs tests/admin-navigation.test.mjs`, `npm run build`, `npm run test:rag`, `npm run test:tenant:pg`, `npm run test:demo-local:pg`, `npm run test:cli-v2:pg`, suíte PostgreSQL 17 + Chromium da família, `git diff --check` e `sha256sum next-env.d.ts tsconfig.json`.
7. Se o Chromium local falhar por `libnspr4.so`/NSS, usar somente `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x`, já suportada por `@sparticuz/chromium` e pelos runners do repositório, documentando o ajuste; não pular testes nem instalar pacotes fora do lockfile.
8. Relatar separadamente inspeção estática, testes unitários/contrato, PostgreSQL + Chromium, medidas/inspeção de capturas e aceite humano operacional **não realizado**.
9. Abrir PR pequena; aguardar checks e reviews obrigatórios verdes; só então fazer merge sem `--auto` e confirmar commit/workflows pós-merge.

## 9. Critérios de parada

- Parar se a reprodução não demonstrar o defeito no `src/` intacto, se exigir mudança de contrato/arquitetura, ou se aparecer impacto fora da tela delimitada.
- Parar sem merge se qualquer gate, check ou review obrigatório falhar ou permanecer pendente; preservar o trabalho e relatar o bloqueio sem enfraquecer testes.
- Parar e restaurar/validar arquivos se os hashes protegidos divergirem.
- Não declarar captura, medida ou teste automatizado como aceite humano, conformidade WCAG ou homologação de produção.
