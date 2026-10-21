# UX-PRO-ID3 — estados de leitura do portal autenticado do cliente

**Data:** 21/10/2026  
**Base:** `main` `daea872a8b43cc9e0528574a461154af75a3a976` (PR #287 integrada)  
**Branch:** `codex/id3-client-workspace-read-20261021`  
**Escopo:** auditar as dez páginas restantes do portal autenticado que consultam dados de workspace: `/cliente/app/agenda`, `/solicitacoes`, `/chamados`, `/contratos`, `/reclamacoes-colaborador`, `/documentos`, `/satisfacao`, `/renovacao`, `/relatorios` e `/cobrancas`. O nome completo de cada rota inclui o prefixo `/cliente/app`.

## Objetivo e limites

Revisar endpoint por endpoint e estado por estado como as páginas representam carregamento, sucesso vazio, erro transitório, sessão expirada e acesso negado. A tarefa só altera uma página quando existir lacuna comprovada no comportamento realmente montado. Preservar a implementação já entregue em `/cliente/app/seguranca` (ID1), bem como raiz, assistente, continuidade e demais rotas fora desta lista.

## Inventário inicial

- As dez páginas estão montadas sob `src/app/cliente/app/` e consultam APIs `/api/client/*` por `workspaceFetch`.
- `workspaceFetch` lança mensagens distintas para HTTP 401, 403, 404, 5xx e demais erros; cada página será conferida para garantir que o erro não vire vazio/zero nem apague conteúdo útil sem razão de segurança.
- O layout autentica o cliente via `ClientSpaceProvider`; os endpoints mantêm autorização e escopo por conta no servidor. Nenhuma decisão de UI será tratada como autorização.
- O inventário vigente registra o portal com gate `ux-portal-delivery.yml`, mas sem evidência por rota/estado suficiente para declarar estas dez jornadas validadas.

## Riscos a controlar

- **Isolamento entre contas:** não enfraquecer vinculação server-side nem confiar em `accountId` informado pelo cliente; testar conta A/B quando o gate existente permitir.
- **Falha mascarada como ausência:** HTTP, JSON inválido ou falha de rede não podem ser apresentados como lista vazia, total zero ou sucesso.
- **Perda de dados já lidos:** erro de releitura não deve apagar conteúdo válido sem necessidade; negativas de autenticação/autorização devem seguir o comportamento fail-closed já aprovado.
- **Contratos e operação:** não alterar métodos, URLs, query/body, nomes de campos, chaves idempotentes, ações, APIs, banco, auditoria ou fluxos de negócio.
- **Escopo:** não tocar em outras páginas, no provedor compartilhado ou no layout global sem defeito demonstrado que exija isso; nenhuma mudança em arquivo gerado ou configuração de build.
- **Dados de teste:** fixtures e capturas somente sintéticos; não usar sessão, cookie, contato ou dado real.

## Validação planejada

1. Rodar o teste focal vigente `npm run test:ux-portal:pg` na base antes e registrar resultado; inspecionar cada endpoint e estado efetivamente montado.
2. Caso a inspeção revele falha reproduzível ainda não coberta, acrescentar primeiro um teste focal que falhe contra esta base; só então fazer a correção aditiva mínima.
3. Executar o teste focal, suíte completa, typecheck, build, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check` e `git diff --check`.
4. Preservar hashes de `next-env.d.ts` e `tsconfig.json`. Registrar resultados como inspeção estática, validação automatizada, inspeção visual/manual ou aceite humano, sem misturar essas classes.
5. Abrir uma PR limitada ao portal do cliente somente com gates locais verdes; exigir checks obrigatórios verdes e revisão registrada antes de merge.

## Evidência disponível e ausente

A evidência automatizada desta sessão será adicionada após a inspeção. Não há aceite humano nem validação manual global registrados. Capturas headless, testes estáticos e automação não equivalem a UAT ou auditoria WCAG integral.

**Antes do código:** nenhum comportamento das dez páginas é presumido como defeituoso apenas por existir menção a `carregando/vazio` na matriz. A implementação será decidida por estado observado e endpoint real.
