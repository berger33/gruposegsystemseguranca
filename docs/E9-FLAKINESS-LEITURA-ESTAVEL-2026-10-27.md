# E9 — flakiness: leitura estável do corpo no gate do portal (27/10/2026)

**Estado:** uma causa concreta diagnosticada e corrigida. **E9 permanece aberto** — as outras frentes de instabilidade seguem na fila. Produção **NO-GO**.

## 1. O sintoma

Ao validar a 6ª promoção (PLT-13), a **primeira** execução do gate completo do portal deu **41/42**, com:

```
not ok 19 - browser ID3: reclamações restritas ficam na conta ativa e não exibem o relato
  error: 'o protocolo precisa estar visível'
  location: tests/ux-portal-workspace.integration.test.mjs:1488
```

O mesmo cenário passou **1/1 isolado** e a repetição do gate completo fechou **42/42**. Padrão clássico de flakiness: o defeito não é do produto, é da **medição**.

## 2. Diagnóstico

O cenário esperava apenas o título da reclamação:

```js
const titleALocator = page.getByText(titleA, { exact: true });
await titleALocator.waitFor();
const bodyText = await page.locator('body').innerText();
assert.equal(bodyText.includes(protocolA), true, 'o protocolo precisa estar visível');
```

Título e protocolo são renderizados **no mesmo `<li>`**, a partir do mesmo `setRead()` — não há dois fetches de dados. Mas `activeAccount` vem de `useClientSpace()` e pode ser atualizado **depois** da primeira leitura. O `useEffect` da página depende de `[activeAccount, load]`; uma nova referência de conta dispara um **segundo `load()`**, que faz `setReadLoading(true)` e substitui a lista pelo spinner `Carregando reclamações…`.

Sequência da falha:

1. 1º `load()` termina → título e protocolo aparecem → `titleALocator.waitFor()` passa;
2. `useClientSpace` atualiza `activeAccount` → 2º `load()` começa → **spinner**;
3. o teste lê `body.innerText()` nesse intervalo → sem protocolo → asserção falha.

O cenário já era tolerante a múltiplas chamadas (`nextACall = __id3ComplaintCalls[account] + 1`), o que confirma que releituras são esperadas.

## 3. Correção

**Sem `waitForTimeout` arbitrário e sem retry que esconda o erro.** Criado `tests/helpers/portal-stable-read.mjs` com `waitForStableBodyText(page, { required, forbidden, timeout })`, que espera — numa única avaliação atômica dentro do navegador — que **todos** os textos obrigatórios estejam presentes e **nenhum** texto de transição apareça:

```js
const bodyText = await waitForStableBodyText(page, {
  required: [titleA, protocolA, 'Protocolo', 'Severidade'],
  forbidden: ['Carregando reclamações…', 'Aguardando uma leitura concluída…'],
});
```

O helper exige ao menos um texto em `required`, usa `page.waitForFunction`, e devolve o corpo **já medido** no estado estável. Nenhuma rota, contrato, permissão, migração ou comportamento de produto mudou.

Guarda de regressão `tests/e9-portal-stable-read-guard.test.mjs` (no `test:unit`):

| # | Regra |
|---|---|
| 1 | o helper existe, usa `waitForFunction` e lê `document.body.innerText` |
| 2 | recusa medição sem `required` e devolve o corpo |
| 3 | o gate importa e usa o helper; a medição direta foi removida do cenário |
| 4 | a chamada exige protocolo + envelope do RH e proíbe o spinner |
| 5 | **regra geral**: nenhum cenário pode afirmar presença no corpo sem `waitForStableBodyText` |

**RED 0/5 → GREEN 5/5.** A regra 5 foi escrita para cenários futuros: medir `body.innerText()` com asserção de presença sem estabilidade agora quebra no `npm test`, em vez de falhar intermitentemente em CI.

## 4. Evidência de estabilidade

| Execução | Resultado |
|---|---|
| Cenário 19 isolado (antes da correção) | **1/1** — confirmava flakiness |
| Gate completo, 1ª execução (antes) | **41/42** — falha no cenário 19 |
| Gate completo, repetição (antes) | **42/42** |
| Cenário 19 isolado (depois da correção) | **1/1** |
| Gate completo **execução 1** (depois) | **42/42** · 359,6 s |
| Gate completo **execução 2** (depois) | **42/42** · 350,0 s |
| Gate completo **execução 3** (depois) | **42/42** · 345,9 s |

Três execuções completas consecutivas em clusters PostgreSQL 17 descartáveis + Chromium real, sem uma única falha. `next-env.d.ts` (`1862ac4b…`) e `tsconfig.json` (`2128c956…`) preservados após todas.

## 5. Bateria final

| Verificação | Resultado |
|---|---|
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1128/1128** (207 `.mjs`, 144 no `test:unit`) |
| `npm run typecheck` | **0** erros |
| `npm run build` | **105/105** páginas |
| `qa-wave0-static` | **5/5** |
| `ux-pro-00` / `ux-pro-03-ti` / `requisitos-222` `--check` | **OK / OK / OK** |
| `npm audit --audit-level=moderate` | **0** vulnerabilidades |
| `git diff --check` | **limpo** |
| Gates E6 grupos 1 / 2 / 3 | **6/6 · 7/7 · 6/6** |
| Gate 10B prévias | **5/5** (SHA `917236ad…` à época; hoje `14ff3232…` após a Opção A) |
| Workflows | **49** (nenhum novo) |

## 6. O que E9 ainda tem aberto

Esta fatia fechou **uma** causa. Permanecem sem investigação:

- `l04-delivery` subteste 17 — `data-theme` em rota pré-renderizada;
- `ext14-intel` subteste 18 — Chromium empacotado com `--single-process` morre em ~54 ms;
- falha inicial de `test:demo-local:pg` na PR #298 (`demo_isolated_restore_failed`);
- run de CI **E3-R2** sem causa atribuída;
- modo positivo de `/qa/modulos` (exige cluster `seg_qa_homologacao`).

O inventário 222 continua com **34 `a_revalidar` sem gate**, **0/222 aceite humano** e **0/222 reauditoria integral**. A correção E9 é de infraestrutura de teste — **não** promove nenhum requisito.
