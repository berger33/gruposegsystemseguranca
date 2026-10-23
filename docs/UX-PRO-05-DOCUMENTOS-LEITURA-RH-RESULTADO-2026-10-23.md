# UX-PRO-05 — leitura honesta de Documentos no RH: resultado e evidências (2026-10-23)

**Base reconciliada:** `main` / `origin/main` `95ac2ed0ca95a66213263eb4375396e8dc87d033` (merge da PR #295).

**Superfície única:** `/admin/funcionarios` → aba `Documentos`.

**Escopo e RED original:** `docs/UX-PRO-05-DOCUMENTOS-LEITURA-RH-ESCOPO-ANTES-2026-10-23.md`.

## 1. Resultado

A leitura de documentos agora possui estado próprio de conclusão, consulta em andamento e erro. Uma falha transitória não é mais convertida em coleção vazia nem apaga a última lista conhecida. Vazio somente aparece depois de resposta `200` sem documentos; `401/403` permanecem fail-closed e removem a coleção sensível da tela.

Não houve alteração de endpoint, método HTTP, payload, cabeçalho, cookie, `Idempotency-Key`, autenticação, RBAC, concessões, escopo por titular/conta, `audit_log`, migração SQL ou armazenamento privado. Nenhum CSS foi alterado e nenhuma tela legada ou órfã foi promovida.

## 2. Antes × depois verificável

| Situação | Antes | Depois |
|---|---|---|
| Falha inicial de `GET /api/admin/hr/l03/documents` | `setDocs([])` produzia “Nenhum documento no seu escopo” mesmo sem resposta válida. | `UiState` de erro/negativa com status e código diagnóstico; nenhuma confirmação de vazio. |
| Falha de releitura depois de uma lista válida | A coleção era substituída por `[]`, apagando dados já apresentados. | A lista permanece visível, marcada como potencialmente desatualizada, com repetição quando `canRetry === true`. |
| Releitura pendente | Não havia estado próprio; a interface podia parecer vazia ou concluída. | `loading` explícito e `aria-busy`; durante releitura, a lista anterior continua visível. |
| `200 { documents: [] }` | Era indistinguível de erro. | É o único caminho que substitui a lista anterior pelo estado vazio confirmado. |
| `401/403` | A coleção era limpa, mas a aba podia apresentar vazio. | A coleção é limpa e a autenticação/negativa é apresentada sem falso vazio; `403` não oferece retry. |
| Releitura `503` após mutação confirmada | A primeira implementação reutilizava “nada foi carregado nem gravado”, contradizendo um `PATCH` já concluído. | O texto delimita a falha à consulta e afirma que a releitura não desfaz uma ação já confirmada. O vocabulário compartilhado não foi alterado. |

## 3. Arquivos da fatia

- `src/app/admin/funcionarios/RhWorkspace.tsx` — estados `docsLoaded`, `docsLoading`, `docsError`, preservação/limpeza fail-closed, feedback e retry da aba.
- `tests/ux-pro-05-documentos-leitura-rh-ui.test.mjs` — três testes estáticos focais de montagem, preservação e estados.
- `tests/ux-hr-vocabulary.test.mjs` — inclusão do teste focal na suíte existente.
- `tests/ux-hr-workspace.integration.test.mjs` — dois cenários PostgreSQL + Chromium e capturas; somente o GET é controlado nos cenários de falha.
- `docs/UX-PRO-05-DOCUMENTOS-LEITURA-RH-ESCOPO-ANTES-2026-10-23.md`, este relatório e `docs/evidencias/ux-pro-05-documentos-leitura-rh-2026-10-23/`.

## 4. RED comprovado antes das correções

1. **Estático original, com `src/` intacto:** `node --test tests/ux-pro-05-documentos-leitura-rh-ui.test.mjs` → exit 1, 3 testes, 1 aprovado e 2 falhados. Faltavam o estado próprio e os estados honestos.
2. **Integrado original, PostgreSQL 17 + Chromium:** o caso focal terminou com exit 1, 1 teste e 1 falha. O `503` inicial produzia zero blocos de erro e a captura “antes” mostrava falso vazio.
3. **Segunda revisão, ainda dentro da mesma fatia:** depois de um `PATCH` real aprovado, foi acrescentada uma asserção proibindo “nada foi carregado nem gravado” no erro da releitura. Ela falhou contra a primeira implementação (`1` teste, `1` falha), com o banco confirmando `status = approved`. A mensagem foi então delimitada à consulta; o mesmo gate focal passou `2/2`.

Nenhum teste foi removido, pulado ou enfraquecido para obter o resultado verde.

## 5. Classes de validação mantidas separadas

### 5.1 Inspeção estática, testes unitários/contrato e gates de projeto

- Reconciliação manual do código montado com a matriz vigente e com o resíduo documentado da entrega #295.
- `node scripts/qa-wave0-static.mjs` → **5/5**, imports presentes e migrações `001–180` contínuas/registradas.
- `node scripts/ux-pro-00-inventory.mjs --check` → inventário e matriz de **100 rotas** conferem com o código; nenhum CSV histórico foi alterado.
- `node --test tests/ux-hr-vocabulary.test.mjs` → **22/22**, incluindo os três testes focais de Documentos.
- `node --test tests/ux-pro-00-precision.test.mjs tests/admin-navigation.test.mjs` → **10/10**.
- `npm run typecheck` → aprovado.
- `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` → **1001/1001**, 0 falhas, 0 skips e 0 todos. A variável somente seleciona as bibliotecas AL2023 já empacotadas para o Chromium local; não altera teste ou produto.
- `npm audit --audit-level=high` → **0 vulnerabilidades**.
- `npm run build` com o ambiente beta do CI → build Next.js `16.4.2` aprovado.
- `git diff --check` → aprovado.
- SHA-256 preservados: `next-env.d.ts` = `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`; `tsconfig.json` = `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

### 5.2 PostgreSQL 17 descartável, HTTP real e Chromium

| Comando | Resultado |
|---|---|
| `UX_HR_TEST_PATTERN='Documentos:' ... npm run test:ux-hr:pg` | **2/2**; erro inicial, retry por foco + Enter, lista preservada, loading, vazio após `200`, `403` real sem `documents`, negativa isolada sem retry e limpeza da lista. |
| `npm run test:ux-hr:pg` | **18/18**, incluindo aprovação/rejeição real de documentos e todas as jornadas preexistentes de RH. |
| `npm run test:l03-delivery:pg` | **1/1**; jornada integral com duas identidades, documentos, escopo e revogação. |
| `npm run test:ux-portal:pg` | **26/26**, incluindo retorno de documento ao titular e isolamento. |
| `npm run test:tenant:pg` | **22/22**; escopo A/B e contratos de conta. |
| `npm run test:cli-v2:pg` | **11/11**; aliases, cobrança e autorização preservados. |
| `npm run test:demo-local:pg` | aprovado; persistência, restart, escopo e cópia de restauração sintética. |
| `npm run test:rag` | smoke HTTP aprovado no workspace isolado do CI. |

Os runners PostgreSQL aplicaram o ledger vigente até `180`, usaram clusters temporários exclusivos e reportaram limpeza. O teste focal confirmou no PostgreSQL que o `PATCH` persistiu `approved` enquanto somente o GET seguinte recebia `503`; portanto a preservação visual não substitui nem simula a mutação real.

### 5.3 Medição responsiva e inspeção de capturas reais

Foram inspecionadas **11 capturas**: uma “antes” e dez “depois”, em `docs/evidencias/ux-pro-05-documentos-leitura-rh-2026-10-23/`:

- `antes-...erro-inicial-390-day.png`: falso vazio original.
- `...erro-inicial-390-day.png`: erro `503`, diagnóstico e retry, sem vazio.
- `...carregado-390-day.png`: documento sintético carregado.
- `...preservado-320-day.png`, `...preservado-390-day.png`, `...preservado-768-day.png`, `...preservado-1440-day.png`: lista mantida após falha de releitura.
- `...preservado-390-night.png`: mesmo estado no tema noite.
- `...loading-390-day.png`: releitura pendente com lista ainda visível.
- `...vazio-390-day.png`: vazio somente depois de `200` com coleção vazia.
- `...denied-390-day.png`: negativa sem lista, retry ou falso vazio.

O documento foi medido em `320`, `390`, `768` e `1440` no tema dia, e em `390` no tema noite; todas as asserções exigiram `overflow <= 1`. A rolagem interna da tabela de dados permanece como já existia e não foi confundida com overflow da página. As capturas noturna e de loading foram refeitas depois de aguardar a transição de viewport; não houve ajuste de CSS nem ocultação do menu.

Esta etapa é **inspeção de imagens produzidas pelo Chromium**, não certificação de todos os dispositivos/navegadores nem teste de contraste completo da página.

### 5.4 Aceite humano operacional

**Não realizado.** Não houve aceite de Marcelo, Andreia ou titular, nem validação manual em dispositivo físico. Testes automatizados, medidas e capturas não são apresentados como aceite humano.

## 6. Nota de reprodução do ambiente local

A primeira execução local de `npm test` encontrou duas falhas de lançamento do Chromium por ausência de `libnspr4.so` no `LD_LIBRARY_PATH`. O caso focal foi repetido com `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x`, convenção já usada pelos runners do repositório, e passou `5/5`; depois a suíte integral passou `1001/1001`. Não houve instalação de dependência fora do lockfile, skip ou alteração de workflow para contornar a falha.

## 7. Fora de escopo

Permanecem fora desta fatia redesenhos de outras abas, mudanças na tabela compartilhada, novos contratos de documentos, migrações, alterações de RBAC/auditoria e qualquer retrabalho das entregas #284–#295 sem nova evidência reproduzível. Checks de PR, revisão e workflows pós-merge são verificados no processo de entrega e não são substituídos por este relatório local.
