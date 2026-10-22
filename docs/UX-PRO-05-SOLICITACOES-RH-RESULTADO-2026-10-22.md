# UX-PRO-05 — Solicitações do funcionário e revisão do RH

**Data:** 2026-10-22 (America/Sao_Paulo)  
**Base:** `main` `4566b73cb568020705d01e4ce50307009e75c4d2`  
**Superfície:** `/funcionario` → `Pedidos` → solicitação; `/admin/funcionarios` → `Solicitações` → análise/decisão; retorno relido pelo titular.

## Antes

A #209 cobriu `Jornada` do portal e explicitamente deixou RH/análise fora daquela PR. A documentação de UX-04 dizia que decisões de RH não tinham sido exercitadas ponta a ponta com pedido criado por sessão de funcionário. Na implementação montada, `refresh()` convertia falha GET de `/api/admin/hr/l03/self-requests` em `[]`; a aba recebia esse array e podia representar falha como fila vazia, sem ação de repetição.

**Baseline observado:** teste focal contra a `main` falhou ao esperar `[data-ui-state="error"]` após uma resposta HTTP 503 sintética para a leitura da fila. O defeito foi reproduzido antes de alterar `RhWorkspace`.

## Depois

- A leitura da fila guarda um estado próprio: ainda carregando, erro, vazio confirmado ou registros disponíveis.
- Falha mantém em memória os pedidos já carregados; a tela avisa que pode haver novos itens e oferece nova leitura apenas se `canRetry` permitir. A lista vazia só aparece depois de GET bem-sucedido sem pedidos.
- Gate Chromium com PostgreSQL descartável cria um pedido pela UI do funcionário, mostra-o ao RH, avança para análise e aprovação, confere titularidade, responsável, histórico e auditoria no banco, e relê o retorno na sessão do titular.
- A navegação por teclado até Solicitações foi conferida. A fila foi exercitada em 320, 390, 768 e 1440 px, temas claro e noturno; a suíte verifica transbordo horizontal e fechamento visual/acessível do menu após a transição responsiva.

## Contratos e proteção de dados

Nenhuma rota, método, payload, identidade, permissão, regra de escopo, banco ou migração foi alterada. O funcionário só vê seu próprio pedido; RH mantém as concessões `employees.read/write`; `Idempotency-Key`, transições válidas, autor da decisão e auditoria fail-closed continuam no servidor. A resposta e as capturas usam apenas dados sintéticos descartáveis. Nenhuma mensagem externa é enviada.

## Evidência e validação

- **Inspeção estática:** `/admin/funcionarios` monta `RhWorkspace` sob `AdminGate`; `RequestReviews` consome `/api/admin/hr/l03/self-requests`. `/funcionario` monta `RequestsTab`, que envia o endpoint existente de criação e relê `/api/employee/home`.
- **Automatizado focal RH:** `UX_HR_TEST_PATTERN='falha ao ler solicitações do RH' npm run test:ux-hr:pg` — 1/1, PostgreSQL 17 descartável, Chromium via Chrome local. O cenário 503 não é mostrado como vazio; uma resposta 200 vazia posterior é mostrada como vazio.
- **Automatizado E2E:** `UX_PORTAL_TEST_PATTERN='funcionário cria solicitação e RH decide' npm run test:ux-portal:pg` — 1/1, 001–180 em PostgreSQL descartável e Chromium via Edge. Inclui autoria autenticada no banco, duas revisões auditadas, retorno ao titular e responsividade/tema/teclado.
- **Capturas automatizadas:** diretório `docs/ux-pro-05-solicitacoes-evidencias/depois/`. A captura de falha foi substituída após corrigir o mock do teste; a versão atual mostra HTTP 503, preservação da lista e ação de repetição. Os PNGs foram inspecionados estaticamente quanto a conteúdo, quebra e estado de tema; isso não equivale a sessão manual de usabilidade.
- **Compatibilidade do runner local:** `qa-ux-hr-postgres.mjs` inicializa o cluster descartável em UTF-8; `UX_HR_BROWSER_EXECUTABLE_PATH` permite Chrome instalado no Windows. CI Linux continua no Chromium empacotado.

### Gates locais

| Gate | Resultado |
| --- | --- |
| Focal RH: falha de leitura e repetição | passou, 1/1 |
| E2E titular → RH → retorno ao titular | passou, 1/1 |
| `npm test` | passou, 993/993 |
| `npm run typecheck` | passou |
| `npm run build` | passou, 105 páginas geradas |
| `node scripts/qa-wave0-static.mjs` | passou, 5/5 |
| `node scripts/ux-pro-00-inventory.mjs --check` | passou, inventário de 100 rotas consistente |
| `git diff --check` | passou |
| `next-env.d.ts` / `tsconfig.json` | hashes restaurados/conferidos; sem alteração proposta |

Os checks remotos desta fatia ainda dependem da PR e não foram executados. Não houve validação visual manual com operador, aceite de Marcelo/Andreia, homologação de produção ou avaliação WCAG integral. As capturas do funcionário em mobile também mostram a navegação inferior fixa sobre parte do formulário enquanto ela está na tela; a evidência não determina se isso bloqueia uso com rolagem e a navegação compartilhada não foi alterada nesta fatia.

## Limites e continuação

Esta é uma subfatia de UX-PRO-05. Escala, documentos, benefícios, treinamento, afastamentos, folha/holerite, desligamento e demais telas RH não foram auditadas nesta PR. As integrações externas, publicação real de holerite e recebimento por e-mail não são demonstradas aqui.
