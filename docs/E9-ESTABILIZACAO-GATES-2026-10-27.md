# E9 — Estabilização dos gates e descoberta da dívida E19

**Data:** 2026-10-27 · **Status:** 3 dos 4 itens do E9 fechados com evidência; 1 permanece sem logs. A dívida sistêmica **E19 foi descoberta aqui e EXECUTADA em seguida** (ver §4 e `docs/E19-ARQUIVOS-GERADOS-RESULTADO-2026-10-27.md`).

## 1. O que havia pendente

`docs/E9-FLAKINESS-LEITURA-ESTAVEL-2026-10-27.md` havia fechado **uma** causa (o 2º `load()` de `useClientSpace` no cenário ID3 de reclamações) e listado quatro itens "sem investigação":

1. `l04-delivery` subteste 17 — `data-theme` em rota pré-renderizada;
2. `ext14-intel` subteste 18 — Chromium `--single-process` morrendo em ~54 ms;
3. falha inicial de `test:demo-local:pg` na PR #298 (`demo_isolated_restore_failed`);
4. run de CI **E3-R2**, sem causa atribuída.

## 2. Diagnóstico: os dois primeiros JÁ estavam estabilizados no código

A auditoria de 10/10 pediu "estabilizar os dois subtestes"; o código evoluiu desde então, mas nenhum documento foi atualizado e **nenhuma guarda protegia as correções**:

| Item | Correção existente (encontrada nesta fatia) | Evidência desta fatia |
| --- | --- | --- |
| `l04` subteste 17 | `assertPublishedTheme()` usa `page.waitForFunction(() => document.documentElement.dataset.theme === 'tech', { polling: 100 })` **antes** de `getAttribute('data-theme')`, inclusive após `reload()`. Resolve a race de hidratação da rota pré-renderizada. | gate `test:l04-delivery:pg` **20/20** (160,8 s), exit 0 |
| `ext14` subteste 18 | `launchBrowser()` com até **3** tentativas e o cenário de UI com até **2**, ambos filtrando `BROWSER_CRASH` e **recusando** re-tentar `ERR_ASSERTION` (asserção de negócio nunca é crash). O runner define `AWS_EXECUTION_ENV` (correção D10). | gate `test:ext14-intel:pg` **18/18** (10,0 s), exit 0, `minimo_exigido=16` |

`tests/e9-gates-estabilidade.test.mjs` congela esses dois padrões: se alguém remover o `waitForFunction`, trocar os retries por `catch` genérico ou deixar de filtrar `ERR_ASSERTION`, a suíte cai.

**Observação sem alteração:** `tests/ext14-intel.integration.test.mjs` ainda acrescenta `"--single-process"` ao `packagedChromium.args` — mas `@sparticuz/chromium` **já inclui essa flag** (confirmado lendo `args` com `AWS_EXECUTION_ENV` setado). É uma duplicação inofensiva; foi mantida porque `tests/ux-intel-workspace.integration.test.mjs` exige a string no contrato. Corrigi-la é cosmético e exigiria atualizar a guarda focal — fora do escopo desta fatia.

## 3. Defeito real encontrado: os gates sujavam a árvore versionada

Ao rodar `npm run test:demo-local:pg` para reproduzir o item 3, o gate passou (exit 0 em ~53 s, `demo_isolated_restore_failed` **não reproduzida**), mas o SHA de `next-env.d.ts` mudou de **`1862ac4b…` para `0f706298…`**.

Causa raiz: `scripts/local-demo.mjs` monta um **allowlist explícito de env** (não repassa `NEXT_DIST_DIR`) e sobe `server.mjs --dev` com `NODE_ENV=development`. O Next então reescreve `next-env.d.ts` para `.next/dev/types/...`.

O mesmo defeito apareceu no `ext14`: `next-env.d.ts` → **`e15fd6c2…`** (`.next/integration-ext14/dev/types/...`) e `tsconfig.json` ganhou **dois includes** (`.next/integration-ext14/types/**/*.ts` e `.../dev/types/**/*.ts`). Consequência: a guarda E2 (`tests/generated-files-hygiene.test.mjs`) passava a **falhar na execução seguinte** — um falso vermelho de CI indistinguível de uma regressão real.

**Correção (aditiva, sem tocar em nenhuma asserção de negócio):**

- Novo helper `scripts/qa-generated-files.mjs` com `snapshotGeneratedFiles()`, `restoreGeneratedFiles()` e `withCleanGeneratedFiles()` sobre `next-env.d.ts` + `tsconfig.json`.
- `scripts/qa-local-demo-persistent.mjs` e `scripts/qa-ext14-intel-postgres.mjs` passaram a fazer snapshot no início e restore num **`finally` interno** — ou seja, mesmo que o cleanup do PostgreSQL/`rm` lance, a árvore é devolvida.
- Ambos passaram a imprimir o restore no log (`QA-HOM-008_GENERATED_FILES_RESTORED`, `QA_EXT14_GENERATED_FILES_RESTORED`).

**Prova de correção** (SHAs antes/depois idênticos em cada gate):

| Gate | Antes | Depois | Resultado |
| --- | --- | --- | --- |
| `test:demo-local:pg` | `1862ac4b… / 2128c956…` | idênticos | exit 0, 53 s |
| `test:ext14-intel:pg` | `1862ac4b… / 2128c956…` | idênticos | **18/18** |
| `test:l04-delivery:pg` | `1862ac4b… / 2128c956…` | idênticos | **20/20** (já restaurava dentro do próprio teste) |

Sobre o item 3: `demo_isolated_restore_failed` **não se reproduziu**. O gate executou `cold copy → self-check → isolated restore` e o cenário de escopo restaurado (`RESTORED_HTTP_SCOPE`) passou. Sem os logs originais da PR #298 não há como atribuir a causa daquela falha pontual; ela fica registrada como **não reproduzida localmente**, não como "corrigida".

## 4. E19 — dívida sistêmica descoberta e **EXECUTADA em 27/10**

A correção acima era pontual. A varredura completa encontrou o mesmo risco em escala (retrato original):

| Superfície | Total | Com restore | Sem restore |
| --- | ---: | ---: | ---: |
| Arquivos `scripts/qa-*.mjs` (76 runners + 1 helper) | **77** | 3 | **74** |
| Runners que **spawnam** testes de integração | 62 | 1 | **61** |
| Testes `tests/*.mjs` que usam `NEXT_DIST_DIR` | **55** | 8 | **47** |

**Resolvido na fatia E19** (`docs/E19-ARQUIVOS-GERADOS-RESULTADO-2026-10-27.md`): não foi possível envelopar os runners com `withCleanGeneratedFiles()` porque 63 deles têm **mais de um `process.exit()`** (um chega a 10) e `process.exit()` não espera um `finally` assíncrono. Em vez disso, criou-se `scripts/qa-generated-files-guard.mjs` — módulo de importação única que faz snapshot síncrono e restaura no evento `exit` (com `writeFileSync`), cobrindo `process.exit`, exceção não tratada, fim natural e SIGINT/SIGTERM.

**65 runners** receberam uma única linha (`import './qa-generated-files-guard.mjs';`), com `node --check` em todos (0 falhas). Os 2 que já tinham restore explícito foram mantidos. Resultado: **67/67 runners que spawnam processos protegidos, 0 desprotegidos**. Guarda `tests/e19-generated-files-guard.test.mjs` **RED 5/6 → GREEN 6/6** com provas em subprocesso real. Gates F01, EXT-02 (22/22) e 10B (5/5) executados com SHAs preservados.

A guarda E9 que congelava o teto em 74 foi atualizada: agora exige **zero** runners desprotegidos e reconhece as três formas válidas de proteção. Os 47 testes de integração com `NEXT_DIST_DIR` que não fazem restore interno seguem cobertos pelo runner — que é o ponto único de proteção.

## 5. O que ainda não está fechado

- **CI E3-R2:** run histórico sem logs disponíveis neste workspace. **Sem causa atribuída** — não foi inventada nenhuma explicação. Requer os logs completos do run para diagnóstico.
- **`demo_isolated_restore_failed` (PR #298):** não reproduzida em duas execuções; causa original desconhecida.
- **~~1 falha intermitente na 1ª execução da bateria~~ — CAUSA ATRIBUÍDA em 27/10, não era flakiness.** Ao capturar o log completo, o teste `reauditoria 222: os arquivos versionados conferem com o código atual` falhava porque ele próprio executa `scripts/requisitos-222-inventory.mjs --check` e o JSON ainda estava desatualizado (novos arquivos da fatia). Bastou regenerar o inventário para a suíte fechar **1146/1146**. Ou seja: **qualquer arquivo novo exige rodar o gerador 222 antes de `npm test`** — é um passo obrigatório da bateria, não uma instabilidade. A guarda nova (`e9-gates-estabilidade`) passou 7/7 isolada em todas as execuções.
- **~~E19: 61 runners sem restore~~ — EXECUTADA em 27/10.** Ver §4 e `docs/E19-ARQUIVOS-GERADOS-RESULTADO-2026-10-27.md`: 67/67 runners protegidos, 0 desprotegidos.
- Modo positivo de `/qa/modulos` exige cluster `seg_qa_homologacao`; leitor de tela, WCAG integral, UAT/Windows e aceite humano seguem não executados. **Produção segue NO-GO.**

## 6. Artefatos e validação

- Helpers: `scripts/qa-generated-files.mjs` (E9) e `scripts/qa-generated-files-guard.mjs` (E19)
- Runners corrigidos: `scripts/qa-local-demo-persistent.mjs`, `scripts/qa-ext14-intel-postgres.mjs`
- Guardas: `tests/e9-gates-estabilidade.test.mjs` (**7 testes**, RED 3/5 → GREEN 7/7) e `tests/e19-generated-files-guard.test.mjs` (**6 testes**, RED 5/6 → GREEN 6/6), ambas no `test:unit`
- Gates: `test:demo-local:pg` exit 0 · `test:ext14-intel:pg` **18/18** · `test:l04-delivery:pg` **20/20** · F01 exit 0 · EXT-02 **22/22** · 10B **5/5**

Nenhuma rota, contrato, permissão, migração ou dado de negócio foi alterado. Nenhum requisito dos 222 foi promovido. Os SHAs canônicos `next-env.d.ts = 1862ac4b…` e `tsconfig.json = 2128c956…` foram preservados.
