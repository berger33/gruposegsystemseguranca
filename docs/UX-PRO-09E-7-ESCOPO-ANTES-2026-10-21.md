# UX-PRO-09E-7 — escopo e riscos antes da implementação

**Data:** 21/10/2026
**Base:** `main` `0637cd63e25b0a92ec1d05d4f69b76a7574138ce` (merge da PR #286)
**Branch:** `ux-pro-09e-7-text-overflow-20261021`
**Objetivo:** ampliar de forma opt-in a atribuição de overflow a linhas de texto no capturador visual, em uma etapa isolada, sem alterar as saídas das etapas existentes.

## Escopo

- Criar um stage próprio `ux-pro-09e-7`, com diretório de saída exclusivo, para 14 rotas públicas explicitamente incluídas: `/`, `/contato`, `/conteudos`, `/conteudos/diagnostico-sem-conteudo`, `/faq`, `/orcamento`, `/pacotes`, `/privacidade`, `/proposta/aceite/diagnostico-token-invalido`, `/segmentos`, `/segmentos/condominio`, `/servicos`, `/servicos/Segurança%20Desarmada` e `/simulador`.
- Medir cada rota em 320, 390, 768 e 1440 px e em `prefers-color-scheme` claro/escuro (112 combinações).
- Executar a medição de `Range.getClientRects()` para texto em todas as capturas opt-in, mesmo quando o documento não rolar horizontalmente. Registrar explicitamente quando a medição ocorreu; isso separa ausência de ocorrência de ausência de amostra.
- Manter `attributeTextOverflow` desligado por padrão nas demais etapas. A etapa 09E-7 escreve somente em `docs/UX-PRO-09E-7-evidencias-2026-10-21/`; os diretórios e JSON históricos de 09B/09E não serão regenerados.

## Inventário e limites

O capturador é `scripts/ux-evidence-capture.mjs`; `ux-pro-09e` atualmente configura `attributeTextOverflow: true`, mas só chama o scanner dentro do ramo de overflow global. Os stages públicos `ux-pro-09b` e `ux-pro-09e` compartilham as 14 rotas e viewports, com diretórios próprios. A cobertura 09E-7 será uma etapa irmã, não uma mudança de configuração das existentes. A captura usa páginas públicas, sem autenticação, não envia formulários e mantém o endpoint sintético de aceite inválido sem credenciais reais.

## Riscos e preservações

- **Falso positivo:** um `Range` pode ultrapassar a largura do viewport por clipping/rolagem intencional de um ancestral. O resultado é diagnóstico com seletor e fragmento curto, não decisão automática de defeito nem bloqueio de build.
- **Amostra ausente:** cada captura opt-in deve marcar que o probe executou; campo de culpados ausente significa que não houve ocorrência detectada naquela amostra, não que ela foi ignorada.
- **Arquivos gerados:** manter saída nova e dedicada; não regenerar inventário nem tocar em capturas de 09B/09E, `next-env.d.ts` ou `tsconfig.json`.
- **Privacidade:** não armazenar tokens, cookies ou dados reais. Fragmentos são limitados a 48 caracteres e vêm apenas das rotas públicas selecionadas; não capturar conteúdo autenticado.
- **Funcionalidade:** nenhuma tela, CSS, API, rota, permissão, autenticação, isolamento, auditoria, dado ou fluxo do produto será alterado.
- **Visual:** evidência automatizada headless não equivale a inspeção manual, leitor de tela, UAT, aceite humano ou conformidade WCAG.

## Validação planejada

1. Teste focal antes/depois para provar que o scanner é executado em modo opt-in independente do overflow global e que os outros stages mantêm configuração/saída inalteradas.
2. Executar `ux-pro-09e-7` contra PostgreSQL descartável e validar 112 combinações, status/rota, marca explícita de medição, screenshots e integridade SHA-256.
3. Executar o teste focal, `npm run typecheck`, `npm test`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check` e `git diff --check`.
4. Preservar os hashes de `next-env.d.ts` e `tsconfig.json`; reportar separadamente CI, inspeção estática, evidência automatizada e validação manual.

**Antes do código:** o scanner de texto opt-in só é executado quando `scrollWidth > clientWidth + 1`; portanto, amostras sem overflow global não produzem evidência de que a inspeção de texto ocorreu. Nenhuma correção de produto é presumida.

## Reavaliação da validação do inventário

O plano inicial previa não regenerar os CSVs porque não haveria mudança de rota. Depois da captura, `node scripts/ux-pro-00-inventory.mjs --check` apontou corretamente a nova evidência `ux-pro-09e-7` em 10 linhas públicas. O gerador lê `resumo.json` por rota e a matriz é a fonte de cobertura; por isso, o plano foi ajustado para regenerar os dois CSVs reproduzíveis e revisar o diff. O inventário de rotas continua com 100 rotas; não se alterou o gerador nem qualquer rota. A regeneração foi necessária para que as capturas não ficassem fora da matriz.
