# UX-PRO-ID3 — `/cliente/app/agenda`: leitura isolada por conta (resultado)

**Data:** 26/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** primeira das oito páginas pendentes do ID3. Escopo restrito a `src/app/cliente/app/agenda/page.tsx`, ao teste focal e ao cenário de navegador do gate do portal.

## 1. Defeito reproduzido (RED)

A leitura usava um `useState<Visit[] | null>` global, sem vínculo com a conta:

1. Ao trocar de A para B, a visita de A permanecia visível enquanto o `GET /api/client/visits?account=B` estava pendente.
2. Uma resposta antiga de A podia sobrescrever o resultado já concluído de B.
3. Um `200` com payload inesperado fazia `setVisits(undefined)` e a tela ficava presa em "Carregando agenda…".
4. Falha de releitura substituía a lista pelo alerta, em vez de preservar a última leitura válida.
5. Cadastro suspenso/encerrado nunca carregava e ficava em "Carregando agenda…" indefinidamente.

`node --test tests/ux-pro-id3-agenda-leitura-ui.test.mjs` na base: **0/3 aprovados, 3 falhas** (saída preservada nesta sessão como RED estático).

## 2. Correção (aditiva, sem mudar contratos)

- `VisitRead`/`VisitReadError` guardam `accountId`, lista e `readAt`; `latestRequest` numera cada consulta.
- Sucesso, erro e `finally` ignoram `requestId !== latestRequest.current`.
- `Array.isArray(data.visits)` recusa payload inesperado como falha de leitura.
- `currentRead`/`currentError` só são elegíveis quando pertencem à `activeAccount.id`.
- A região anuncia `aria-busy`; conta sem leitura concluída permanece em carregamento, nunca em "vazio".
- Falha de releitura mantém a lista visível com `role="alert"` + botão "Tentar novamente" e a faixa "Última leitura concluída às HH:MM".
- Cadastro suspenso/encerrado passa a ter mensagem própria, sem spinner infinito.

**Preservado:** URL/método/query de `GET /api/client/visits?account=…`, `PATCH /api/client/visits/:id`, ações "Confirmar" e "Solicitar reagendamento", campos com rótulos, `maxLength`, vocabulário, ids de teste, sessão/grants decididos no servidor, auditoria e isolamento A/B do backend. Nenhuma migração, rota, RBAC ou configuração foi alterada.

## 3. Evidências (GREEN)

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-id3-agenda-leitura-ui.test.mjs` | **3/3** |
| `AWS_EXECUTION_ENV=… npm test` | **1038/1038**, 0 falhas/skips/todo |
| `npm run typecheck` | exit 0 |
| `npm run build` | 105/105 páginas |
| `node scripts/qa-wave0-static.mjs` | 5/5 |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK (CSVs regenerados: apenas a linha de `/cliente/app/agenda` mudou — `carregando/vazio` → `carregando/erro/vazio`) |
| `AWS_EXECUTION_ENV=… npm run test:ux-portal:pg` | **28/28** (novo cenário de navegador incluso), `UX_PORTAL_TEST_EXIT: 0`, cluster temporário limpo |

O novo cenário `browser ID3: agenda mantém a leitura na conta ativa e descarta resposta fora de ordem` usa PostgreSQL 17 descartável, sessão de cliente real e Chromium: cria contas A/B sintéticas, uma visita em A, confirma no servidor que A=1 e B=0,controla a pendência das leituras interceptando o `fetch`, e verifica:

- A carregada e capturada em 390 px;
- B pendente sem título de A, com "Carregando agenda…" e sem mensagem de vazio;
- 0 px de overflow em 320/390/768/1440;
- B vazia confirmada após a resposta;
- troca por `ArrowUp`/`ArrowDown` com foco preservado no seletor;
- `B:2` concluída antes de `A:2`, com o resultado final permanecendo em B.

## 4. Limitações honestas

- O **RED em navegador** para esta rota não foi capturado antes da correção (o RED estático foi). O cenário de navegador replica exatamente o protocolo já provado como RED na PR #298 para Contratos; a falha visual anterior da Agenda foi demonstrada por leitura do código original, não por captura "antes" em Chromium.
- Sem validação manual por pessoa, sem leitor de tela, sem Windows real, sem aceite humano de Marcelo/Andreia/cliente. Tema dia/noite não se aplica ao portal autenticado (não há controle de tema nesta superfície).
- A falha de payload inválido é coberta por guarda estática no teste focal; não há ainda um cenário de navegador que devolva `200 { visits: null }`.
- O gate usa `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x` para carregar as bibliotecas NSS empacotadas, convenção já usada pelo repositório.

## 5. Próxima fatia

`/cliente/app/chamados` (GET de chamados + reabertura), mantendo o mesmo padrão: teste focal RED, correção mínima, cenário A/B no gate do portal, regeneração dos CSVs de inventário e relatório próprio. `solicitacoes` já foi entregue em seguida (`docs/UX-PRO-ID3-SOLICITACOES-LEITURA-RESULTADO-2026-10-26.md`). Consultar a fila em `docs/STATUS-VIGENTE.md`.
