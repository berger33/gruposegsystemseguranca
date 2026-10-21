# UX-PRO-09E PU5 — estados de etapa no simulador público

**Data:** 21/10/2026  
**Base:** `origin/main` `9eff20e6a3e48d62e6ccc8fe626a82ec380d5097`  
**Escopo:** `/simulador`, somente os estilos dos estados ativo e concluído do indicador de etapas.

## Antes (inspeção estática da base)

`src/app/simulador/page.tsx` aplica `styles.stepActive` ao `<li>` atual e `styles.stepDone` aos itens anteriores. Em `Simulator.module.css`, a regra `.steps li` tem especificidade (0,1,1), maior que `.stepActive`/`.stepDone` (0,1,0); a regra `.steps li span` (0,1,2) também vence `.stepActive span`/`.stepDone span` (0,1,1). Assim, as cores definidas para rótulo, círculo e número ativo/concluído perdem na cascata. A borda ativa usa `!important`, portanto permanece azul, mas o estado concluído não recebe a cor de texto pretendida. O indicador continua operável; o defeito é visual e pode reduzir a distinção de progresso.

## Riscos e limites

- Alterar apenas especificidade das regras `.stepActive` e `.stepDone` e seus descendentes no CSS local do simulador.
- Preservar passos, validação, formulário, consentimento, submissão, API `/api/leads`, conteúdo público e tema público atual.
- Não alterar estilos globais, outros layouts ou contrastes fora do PU5.
- Não registrar nem simular aceite humano. Verificação automatizada não substitui inspeção manual.

## Validações previstas

1. Adicionar uma regressão que falhe na base antes da correção, cobrindo precedência das regras de estado.
2. Executar teste focal `node --test tests/ux-pro-09e-public-site.test.mjs`, `npm run typecheck`, `npm test`, `npm run build`, `node scripts/qa-wave0-static.mjs`, inventário (`node scripts/ux-pro-00-inventory.mjs --check`) e `git diff --check`.
3. Conferir estado ativo/concluído em navegador automatizado, se disponível, e registrar limites de viewport/tema. O site público não possui tema sistêmico; `prefers-color-scheme` não será descrito como tema noturno do produto.
4. Preservar os hashes de `next-env.d.ts` e `tsconfig.json` fora do diff.

Uma falha ou gate pendente interrompe esta fatia e impede avanço/merge.
