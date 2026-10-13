# UX-PRO-00 — atualização do inventário vigente

**Data:** 13/10/2026
**Base auditada:** `main` / `origin/main` em `bdc6345` (após o merge da PR #193).
**Escopo:** regenerar o inventário e a matriz de cobertura de UX-PRO-00 para refletir a base atual; não é uma auditoria visual nova.

## Resultado

O código contém **100 arquivos de entrada de página e 100 rotas distintas** em `src/app`. O catálogo administrativo atual contém **27 destinos**. A execução anterior de 10/10 encontrou 26 e seus arquivos permanecem como registro daquele snapshot; o teste foi conferido novamente contra o catálogo atual, sem alterar rotas ou permissões.

Os artefatos vigentes são:

- [`UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`](UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv)
- [`UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`](UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv)

O método detalhado de contagem, classificação de evidências e limitações está no [registro de reconciliação de 10/10](UX-PRO-00-RECONCILIACAO-COBERTURA-2026-10-10.md); ele descreve a base `c50a99b` e deve ser lido como histórico metodológico. A matriz de 13/10 foi produzida pelo mesmo gerador sobre a base `bdc6345`.

## Evidência e limites

Na geração atual, as classes estáticas permanecem: código 46, capturas referenciadas 20 e testes automatizados de jornada 34. A matriz não comprova que capturas ou jornadas ainda estejam visualmente corretas na versão atual. Não foi feita nesta atualização uma navegação manual por todas as páginas, teste completo por teclado, validação em todos os tamanhos de tela, exercício de todos os estados nem aceite de usuários.

Validação reproduzível:

```bash
node scripts/ux-pro-00-inventory.mjs --check
node --test tests/ux-pro-00-inventory.test.mjs tests/admin-navigation.test.mjs
```

A atualização local executou os dois comandos com **6 testes aprovados**. A CI da PR consolidada ainda precisa concluir antes do merge.

## Continuidade

UX-PRO-00 está concluída como inventário estático reconciliado. A próxima implementação é **UX-PRO-01 — Tokens e chrome compartilhado**, seguindo o plano mestre e preservando autenticação, papéis, permissões, APIs e fluxos existentes. As rotas sem evidência visual recente devem ser revalidadas ao longo das fatias, sem declarar cobertura global prematuramente.
