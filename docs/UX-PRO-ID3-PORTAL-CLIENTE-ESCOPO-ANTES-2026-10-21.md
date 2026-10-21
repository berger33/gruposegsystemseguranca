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

## Inspeção estática das rotas realmente montadas

Todas as dez entradas `page.tsx` existem sob `src/app/cliente/app/`; nenhuma rota foi inferida apenas pela matriz. Os componentes usam `workspaceFetch` e mantêm leitura de dados separada das ações de submissão/reconhecimento. A checagem abaixo é inspeção de código, não uma execução de cada jornada:

| Rota | Leitura montada | Resultado da inspeção |
|---|---|---|
| `/cliente/app/agenda` | `GET /api/client/visits?account=…` | Carregamento, erro com repetição e vazio condicionado à leitura concluída. |
| `/cliente/app/solicitacoes` | `GET /api/client/service-requests?account=…` e `GET /api/client/contracts?account=…` | Payload não inicializado fica em carregamento; erro tem `role="alert"` e repetir; lista vazia só após resultado válido. |
| `/cliente/app/chamados` | `GET /api/client/tickets?account=…` | Erro de leitura exposto com repetição; carregamento separado do conteúdo. |
| `/cliente/app/contratos` | `GET /api/client/contracts?account=…` | Erro com repetição; vazio explicado após leitura. |
| `/cliente/app/reclamacoes-colaborador` | `GET /api/client/employee-complaints?account=…` | `data` nulo durante leitura; erro e repetição separados do vazio. |
| `/cliente/app/documentos` | `GET /api/client/documents?account=…` | Erro com repetição; vazio só após carregamento dos documentos. |
| `/cliente/app/satisfacao` | `GET /api/client/satisfaction-surveys?account=…` | `items` não inicializado durante leitura; erro com repetição; vazio após resposta. |
| `/cliente/app/renovacao` | `GET /api/client/renewal-communications?account=…` | `data` não inicializado durante leitura; falha com repetição; vazio separado por tipo de comunicação. |
| `/cliente/app/relatorios` | `GET /api/client/reports?account=…` | Erro com repetição, carregamento e vazio separados. |
| `/cliente/app/cobrancas` | `GET /api/client/cobrancas` | Antes, lista iniciava em `[]` e o indicador de carregamento em `false`; o JSX podia anunciar vazio antes do `useEffect`. Corrigido nesta fatia. |

Nas nove primeiras rotas, a consulta inclui a conta ativa. A API continua responsável por validar sessão e grant; o parâmetro enviado pelo navegador não é autoridade. Cobranças não envia conta na URL: a leitura canônica valida sessão de cliente e mesma origem, busca somente grants ativos e filtra no servidor por essas contas e por `finance_integration_active=true` (até 100 itens). O componente mantém o filtro local para a conta selecionada. Não alterei esses contratos nem as ações existentes.

## Resultado antes/depois

- **Antes:** foi incluído primeiro um cenário browser com conta/grant sintéticos e `fetch` de cobranças mantido pendente. Contra a base, o teste falhou reproduzivelmente: a frase “Nenhuma cobrança integrada disponível” apareceu enquanto a requisição ainda não tinha resposta (`true !== false`). A revisão também detectou que itens da conta A poderiam permanecer na tela durante a primeira renderização após selecionar B.
- **Depois:** cada resultado e erro fica associado ao `accountId` que originou a leitura. Sem resultado para a conta selecionada, a página mostra carregamento; itens da conta anterior deixam de ser renderizados imediatamente. Uma identidade sem conta vinculada tem mensagem própria, erro do provedor tem alerta e repetição, e ausência de cobranças só é mostrada após leitura bem-sucedida vazia. O cenário browser controla a latência inicial, confirma a ausência de falso vazio, carrega uma cobrança sintética da conta A, seleciona B e verifica que o protocolo de A desaparece enquanto a nova leitura está pendente.
- A rota e endpoint permaneceram os mesmos. Nenhuma API, schema, permissão, auditoria, dado persistido, autenticação ou isolamento foi alterado.

## Evidência e limitações

- **Inspeção estática:** revisão dos dez `page.tsx`, `workspaceFetch`, chamadas GET, ramos de carregamento/erro/vazio, provedor e implementação servidor de `/api/client/cobrancas`.
- **Validação automatizada:** `npm run test:ux-portal:pg` passou **23/23**, incluindo o novo cenário browser; `npm test` passou **983/983**; `npm run typecheck`, `npm run build` (105 páginas), `node scripts/qa-wave0-static.mjs` (**5/5**), `node scripts/ux-pro-00-inventory.mjs --check` (**100 rotas**) e `git diff --check` passaram. O teste focal foi executado isoladamente novamente após a ampliação de viewports e troca A/B.
- **Revisão de viewport/teclado no Chromium headless do ambiente Windows:** o cenário sintético de cobrança verificou ausência de overflow horizontal em 320, 390, 768 e 1440 px; o link “Área do cliente” recebeu foco programaticamente no DOM. Isso não equivale a uma revisão manual de navegação completa.
- **Tema:** a navegação montada do portal autenticado não oferece controle de tema; por isso não há evidência de inspeção claro/escuro nesta rota/família.
- **Não realizado:** revisão visual manual desktop/mobile, prova de tema noturno, teste de falha HTTP específico em cada uma das dez APIs, tentativa A/B individual para todas as rotas, validação manual por operador, aceite humano, auditoria WCAG integral ou homologação de produção. A evidência geral do gate existente de isolamento cobre negativa de conta alheia em contratos, não substitui a matriz A/B de cada endpoint.

Não há aceite humano registrado nem foi inferido. O inventário de rotas permanece com 100 entradas; não houve criação/remoção de rota.
