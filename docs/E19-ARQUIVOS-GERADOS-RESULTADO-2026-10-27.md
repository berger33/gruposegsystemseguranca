# E19 — Proteção de arquivos gerados em todos os runners de QA

**Data:** 2026-10-27 · **Status:** executado e validado · **Produção segue NO-GO.**

## O problema

Ao corrigir o E9, descobriu-se que **os gates que sobem `server.mjs --dev` ou testes com `NEXT_DIST_DIR` reescrevem `next-env.d.ts` e `tsconfig.json`**. Sem restore, a árvore fica suja e `tests/generated-files-hygiene.test.mjs` (guarda E2) falha na execução seguinte — um **falso vermelho de CI** indistinguível de regressão real. Na época, só 2 runners (demo-local e ext14) tinham snapshot/restore explícito.

Inventário de 27/10: **78 arquivos `scripts/qa-*.mjs`**, dos quais **67 spawnam processos**; **65 sem nenhuma proteção**. A guarda E9 congelou o teto em 74 para impedir que a dívida crescesse.

## Por que não envelopar com `withCleanGeneratedFiles()`

O helper E9 (`scripts/qa-generated-files.mjs`) oferece `withCleanGeneratedFiles(fn)`. Mas os runners têm **vários pontos de saída**: 63 deles têm mais de um `process.exit()` e um chega a **10**. Envelopar exigiria reescrever a lógica de controle de cada um — 65 refatorações manuais, com risco de alterar o comportamento dos gates (justamente o que o usuário proibiu: preservar contratos e comportamento).

Além disso, `process.exit()` **não espera** um `finally` assíncrono. Um envelope `try/finally` com `await restoreGeneratedFiles()` simplesmente não rodaria na maioria dos caminhos.

## A solução: guarda de saída por importação única

`scripts/qa-generated-files-guard.mjs` é um módulo de **efeito colateral**: ao ser importado,

1. lê **sincronamente** `next-env.d.ts` e `tsconfig.json`;
2. registra `process.on('exit', restore)` — disparado por `process.exit()`, por exceção não tratada e pelo fim natural do event loop;
3. restaura com **`writeFileSync`** (o handler `exit` não aceita `async`), só se o conteúdo mudou;
4. cobre também `SIGINT`/`SIGTERM` (cancelamento de CI);
5. oferece opt-out `SEG_QA_SKIP_GENERATED_GUARD=1` e log `SEG_QA_GENERATED_GUARD_LOG=1` para depuração;
6. exporta `releaseSignalHandlers()` para runners com **shutdown próprio** — `qa-homologacao-local.mjs` registra handlers de SIGINT/SIGTERM para parar servidor e Postgres; se o guard mantivesse os dele, `process.exit()` atropelaria o cleanup e deixaria processos órfãos. Ele libera os handlers do guard e mantém o restore no `exit`.

Cada runner recebeu **uma única linha** no cabeçalho, sem tocar em nenhuma asserção, comando, variável ou ponto de saída:

```js
import './qa-generated-files-guard.mjs';
```

**65 runners** foram atualizados de forma determinística (inserção após o último `import`), com `node --check` em todos — **0 falhas de sintaxe**. Os 2 que já tinham restore explícito (demo-local, ext14) foram mantidos como estão; o helper E9 continua disponível para envelopes futuros.

Resultado: **67/67 runners que spawnam processos estão protegidos, 0 desprotegidos.**

Não há corrida com processos filhos: só o **runner** importa o guard; os testes spawnados herdam o ambiente mas não o módulo. Quando um runner spawnar outro runner (ex.: `qa-evidence-report.mjs`), ambos fazem snapshot do mesmo estado e ambos restauram o mesmo conteúdo no seu próprio `exit`.

## RED → GREEN

`tests/e19-generated-files-guard.test.mjs` no `test:unit`:

- **RED 5/6 → GREEN 7/7** — o último teste exigia que a guarda estivesse no `test:unit`; ao incluí-la, mais um teste foi adicionado para cobrir o conflito de sinais.
- Provas **funcionais em subprocesso real**:
  - suja os 2 arquivos e chama `process.exit(0)` → restaurados;
  - suja e lança exceção não tratada → restaurados;
  - com `SEG_QA_SKIP_GENERATED_GUARD=1` → a guarda **não** age (opt-out funciona) e o teste devolve o estado original;
  - recebe **SIGTERM** enquanto está com os arquivos sujados → restaura e encerra com código 143 (128+15).
- Verifica que o módulo usa `readFileSync`/`writeFileSync`, cobre SIGINT/SIGTERM, não inventa arquivo ausente e **não é importado por `server.mjs`** (o servidor de produção não deve restaurar arquivos concorrentemente).

A guarda E9 (`tests/e9-gates-estabilidade.test.mjs`) foi atualizada: o teto de 74 virou **zero desprotegidos**, e a contagem agora considera as três formas válidas de proteção (guard de saída, `restoreGeneratedFiles`, `withCleanGeneratedFiles`). A guarda E19 também verifica que todo runner com handler de sinal próprio chama `releaseSignalHandlers()`.

**Conflito encontrado durante a validação:** `qa-homologacao-local.mjs` já registrava os próprios handlers de `SIGINT`/`SIGTERM` para graceful shutdown. Como os handlers são registrados **depois** do import, verificar `process.listeners()` no momento do import não resolveria — foi preciso a API explícita de liberação.

## Evidência em gates reais

| Gate | Resultado | Árvore |
| --- | --- | --- |
| `qa-admin-entry-postgres.mjs` (F01) | exit 0 | SHAs preservados |
| `qa-ext02-third-parties-postgres.mjs` (EXT-02) | **22/22**, `minimo_exigido=21` | SHAs preservados |
| `qa-ux-public-routes-postgres.mjs` (10B, padrão `UX-PRO-10B previas`) | **5/5** | SHAs preservados |

`next-env.d.ts = 1862ac4b…` e `tsconfig.json = 2128c956…` antes e depois de cada execução.

## O que NÃO mudou

Nenhuma rota, contrato, permissão, migração, dado, asserção de negócio, contagem de testes ou comportamento de gate. A importação é inertes quando o processo não suja os arquivos. **Nenhum commit, push ou PR** foi feito.

## Limites

- O handler `exit` não roda em `SIGKILL` ou falha catastrófica do processo. Runners com handler de sinal próprio precisam chamar `releaseSignalHandlers()` (a guarda E19 verifica isso). Nesses casos a árvore pode ficar suja — a guarda E2 continua detectando e a correção é manual (`git checkout HEAD -- tsconfig.json` + restaurar `next-env.d.ts` para `.next/types/...`).
- A **E3-R2** (run de CI sem logs) e as demais pendências (aceite humano 0/100 e 0/222, UAT/Windows, leitor de tela, WCAG manual, D7/C11, E14/E15/E16, provedores, backup real) permanecem abertas.

## Artefatos

- `scripts/qa-generated-files-guard.mjs` — módulo da guarda.
- `scripts/qa-generated-files.mjs` — helper E9 (mantido).
- `tests/e19-generated-files-guard.test.mjs` — guarda 7/7.
- `tests/e9-gates-estabilidade.test.mjs` — teto atualizado.
- `docs/e19-runners-aplicados.txt` — lista dos 65 runners atualizados.
- `docs/E9-ESTABILIZACAO-GATES-2026-10-27.md` §4 — inventário original da dívida.
