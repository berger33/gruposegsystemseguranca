# UX-07 / EXT-08 — Base de Conhecimento e Procedimentos Operacionais Canônicos

**Data:** 2026-10-06
**Rota:** `/admin/conhecimento`
**Status do aceite humano:** **PENDENTE**

## Objetivo e fronteira

Esta entrega torna a jornada de Base de Conhecimento uma superfície de produto para o contrato canônico EXT-08:

- pesquisa de procedimentos por escopo;
- versão, ciclo de vida e publicação;
- histórico imutável de revisões;
- confirmação de ciência por versão;
- criação de POP em rascunho.

Nenhuma rota de servidor, regra de autorização, tabela ou migração foi alterada. As migrações `086` e `160` permanecem a fonte do modelo e `src/server/ext-knowledge-api.mjs` continua decidindo sessão, papel, origem, transição, versionamento e ciência.

## Decisões de interface

### Vocabulário canônico e ausência honesta

`src/lib/knowledge-vocabulary.mjs` concentra os códigos literais de erro emitidos pelo servidor, os cinco estados de ciclo de vida e os oito papéis `STAFF_ROLES`. O teste de anti-deriva lê o servidor e falha se surgir código sem descrição.

`category` e `tags` não são enums no contrato: são `TEXT` e `TEXT[]` abertos em `086`. O vocabulário traduz as sugestões conhecidas de categoria, mas preserva valores novos como vieram; etiquetas também passam como dado livre. Isso evita inventar classificações inexistentes.

Campos ausentes são apresentados como `Dado ausente`, `Resumo não informado.`, `Sem tags declaradas` ou situação equivalente. Não há conversão de ausência para `0`, `0%` ou `01/01/1970`.

### Leituras isoladas

A interface possui quatro estados `UiState` independentes:

1. lista de procedimentos;
2. detalhe da versão e versões relacionadas;
3. histórico de revisões;
4. ciências e métricas de ciência.

O recurso de detalhe é consultado separadamente para detalhe e histórico porque o contrato atual os entrega na mesma resposta. Assim, uma falha da leitura de histórico não apaga o detalhe já obtido. Ciência usa sua rota própria. `loading`, `error`, `denied`, `empty` e `ready` não se confundem.

Um `401`/`403` vira `UiState` **Acesso negado**, nunca uma lista vazia. A mensagem diz explicitamente: **“Menu não é autorização”**; navegar até a tela não substitui a decisão do servidor.

### Acessibilidade e responsividade

A jornada usa quatro abas reais, com `role="tablist"`, `role="tab"` e `role="tabpanel"`, roving `tabindex` e setas esquerda/direita, `Home` e `End`. Campos possuem rótulos associados e os estados têm região viva via `UiState`.

`KnowledgeWorkspace.tsx` não contém `style={{...}}`; usa somente classes semânticas de `src/components/ui/UiWorkspace.module.css`. Grade, campos, cards, conteúdo longo e listas usam `min-width: 0`, quebra de palavra e layouts empilhados em telas pequenas. O gate mede a largura em viewport de 390px.

## Cobertura automatizada

| Artefato | Prova |
| --- | --- |
| `tests/ux-knowledge-vocabulary.test.mjs` | anti-deriva dos erros, ciclo de vida, papéis, categoria/tag aberta, ausência honesta e ausência de estilo inline |
| `tests/ux-knowledge-workspace.integration.test.mjs` | sessão obrigatória, 403 real do endpoint protegido de ciência, leituras independentes com falha injetada apenas no browser, tabs por teclado, português, ausência e viewport 390px |
| `scripts/qa-ux-knowledge-postgres.mjs` | cluster PostgreSQL exclusivo, migrações reais, servidor real e Chromium Playwright real; recusa banco do operador/remoto e limpa o diretório temporário |
| `.github/workflows/ux-knowledge-delivery.yml` | typecheck, vocabulário, regressão EXT-08 e gate PostgreSQL/Chromium em PR para `main` |

### Comandos executados nesta entrega

```bash
npm run typecheck
npm run test:unit
node --test tests/ext08-knowledge*.test.mjs
npm run test:ux-knowledge:pg
npm run ux:evidence -- --stage=ux-07-conhecimento
```

A captura de evidência usa PostgreSQL descartável e grava em `docs/ux-07-conhecimento-evidencias/`. Ela registra a lista vazia legítima (o banco começa sem POPs); os cenários com massa sintética, 403 e falha de rede são registrados pelo gate dedicado acima.

## Limites declarados

- O gate não equivale a aceite humano, homologação de operação ou validação integral de WCAG.
- As imagens usam dados sintéticos e um banco que é removido após a captura.
- A autorização continua sendo responsabilidade do servidor. A interface não afirma que uma ação foi autorizada antes da resposta canônica. No cenário browser do 403, o teste somente apresenta um menu liberado para alcançar a tela com cookie financeiro; a resposta `forbidden_role` da rota de ciência vem do servidor canônico real e não é simulada.
- **Aceite humano permanece PENDENTE.**
