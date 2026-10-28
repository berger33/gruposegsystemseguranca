# UX-PRO-ID3 — `/cliente/app/renovacao`: comunicações, restrição e vencimentos presos à conta ativa (resultado)

**Data:** 26/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** sétima das oito páginas pendentes do ID3 (após `agenda`, `solicitacoes`, `chamados`, `reclamacoes-colaborador`, `documentos` e `satisfacao`). É a página com **mais superfícies alimentadas por uma única leitura**: o `<select>` de manifestação, a lista de comunicações, a faixa de **restrição de acesso declarada** e as duas listas de datas (contratos + CRM).

## 1. Defeito reproduzido (RED)

1. `data` e `loadError` eram globais, sem `accountId`. Ao trocar de A para B, as comunicações de A continuavam no `<select>` **enviável**, na lista e nas respostas registradas; os contratos e renovações de A continuavam em "Vencimentos e renovações registrados"; e a **restrição de encerramento de A** (motivo, origem e protocolo) podia ser exibida como se fosse de B. Uma resposta antiga de A também sobrescrevia B.
2. `load` lançava `new Error("load_failed")` e `setLoadError(error.message)` exibia esse **código técnico cru** ao cliente. O `!response.ok` era caminho morto (`workspaceFetch` já lança) e não havia validação do payload: um `200` malformado virava `|| []` ("nenhuma comunicação") ou estourava `data.renewalDates.contracts.length` (tela quebrada). `setData(null)` no início de cada releitura apagava dados válidos em caso de falha.
3. Com cadastro suspenso/encerrado, `setData(null)` deixava **as três seções** presas em "Carregando…" para sempre.
4. O POST usava `workspaceFetch`, que consome o corpo do erro: o mapa de mensagens existente **nunca era alcançado** num 400/409/503. Faltavam também traduções para `invalid_reference`, `invalid_response_kind`, `idempotency_key_required`, `invalid_request`, `body_too_large`, `origin_forbidden`, `client_session_required` e `renewal_communication_unavailable`.
5. `submit` relia `activeAccount.id` depois do `await` e não conferia se o `communication_id` enviado pertencia à conta ativa. Sem `aria-busy`/`role="status"` e sem distinção entre queda de rede e erro de negócio.

`node --test tests/ux-pro-id3-renovacao-leitura-ui.test.mjs` na base: **0/3 aprovados, 3 falhas**.

## 2. Correção (aditiva, sem mudar contratos)

- `RenewalRead`/`RenewalReadError` com `accountId` e `readAt`; `latestRequest` numera cada consulta; sucesso, erro e `finally` descartam `requestId !== latestRequest.current`.
- Validação explícita de **todas as coleções** do payload (`communications`, `responses`, `renewalDates.contracts`, `renewalDates.crmRenewals`), de `as_of`/`note` e de `accessRestriction.restricted`. Um `200` inesperado é falha de leitura declarada, nunca "nenhuma comunicação" nem tela quebrada. `load_failed` removido; `readFailureMessage` preserva a tradução amigável sem sufixo `(HTTP …)`.
- `currentRead`/`currentError` só são elegíveis para a `activeAccount.id`. **Todas as quatro superfícies derivam de `currentRead`**: `<select>` (`actionable`), lista, restrição declarada e datas de contratos/CRM.
- `submit` valida `currentRead.communications.some(...)` antes de enviar (defesa em profundidade), captura o `accountId` no início e usa **`fetch` direto** para ler o corpo. Mapa ampliado de 5 para **14 motivos**, preservando as cinco mensagens originais. `submitFailureMessage` transforma `Failed to fetch` em mensagem humana sem engolir erros de negócio.
- Falha de releitura preserva a última leitura nas três seções com alerta + "Tentar novamente" e a faixa "Última leitura concluída às HH:MM"; conta sem leitura concluída permanece em carregamento.
- Estado próprio para cadastro inativo nas três seções, `aria-busy` em cada uma e `role="status"` nos anúncios de carregamento/leitura preservada.

**Preservado:** endpoints (`GET`/`POST /api/client/renewal-communications` → `cliFinanceApi.handleClientRenewalCommunications`), `Idempotency-Key` e replay, corpo do POST (`communication_id`, `response_kind`, `message`), `RENEWAL_RESPONSE_KINDS`, textos de `typeLabel`/`kindLabel`/`kindDone`, counter de caracteres, `responseBox`, faixa de restrição com motivo/origem/protocolo, fontes `client_contracts.ends_on`/`crm_renewals.renewal_date`, e toda a autorização/auditoria no servidor (`sent_at`, grant não revogado, conta ativa, autoria pela sessão, `auth_access_audit` na mesma transação). **Nenhuma migração, rota, RBAC, handler ou configuração foi alterada.**

## 3. Evidências (GREEN)

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-id3-renovacao-leitura-ui.test.mjs` | **3/3** (RED 0/3 → GREEN) |
| `AWS_EXECUTION_ENV=… npm test` | **1056/1056**, 0 falhas/skips/todo (`test:unit` com **127** arquivos) |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** páginas |
| `qa-wave0-static` / inventário `--check` | 5/5 / 100 rotas (CSVs regenerados: 7 linhas ID3, incluindo `renovacao`) |
| `AWS_EXECUTION_ENV=… npm run test:ux-portal:pg` | **34/34**, `UX_PORTAL_TEST_EXIT: 0`, cluster limpo, `next-env.d.ts` SHA `1862ac4b…` intacto |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |

O cenário `browser ID3: renovação mantém comunicações, restrição e datas na conta ativa e traduz 409 real` usa PostgreSQL 17 descartável, sessão de cliente real e Chromium. Cria em A: empresa CRM, contrato com `ends_on=2027-01-31`, renovação no CRM (`2027-02-15`), uma proposta de renovação respondível e um **encerramento bloqueante** com motivo; B fica vazia. O servidor confirma A = 2 comunicações / restrição `true` / 1 contrato / 1 renovação, e B = `[]` / `false` / `[]` / `[]`. No navegador:

- **Tradução em HTTP real:** com a tela carregada, a mesma identidade registra `interesse_renovar` primeiro por outra requisição (`201`); o envio da UI recebe **`409 response_already_registered`** e exibe **"Esta manifestação já está registrada para esta comunicação."**, com **0** ocorrências de "Não foi possível conectar agora…". Com `workspaceFetch` o corpo teria sido consumido e viraria erro genérico.
- **B:1 pendente:** 0 opções de A nos `<select>`, 0 faixas de "Restrição de acesso declarada", 0 conteúdos/contratos/renovações de A, exatamente 1 "Carregando comunicações…" e nenhum "Nenhuma comunicação…" antes da resposta; 0 px de overflow em 320/390/768/1440.
- **B confirmado:** vazio de comunicações **e** "Nenhum contrato ou renovação com registro canônico nesta conta."; `ArrowUp`/`ArrowDown` com foco preservado; `B:2` concluída antes de `A:2` e **nenhum dado de A volta** (inclusive a restrição e as datas).

O cenário focal rodou isolado (`UX_PORTAL_TEST_PATTERN`) em **1/1** antes da bateria completa de **34/34**.

## 4. Limitações honestas

- RED em navegador não capturado antes da correção (RED estático comprovado); o protocolo repete o das seis fatias anteriores.
- Foi provada a tradução do **409** por concorrência real, mas não o **sucesso** do POST em navegador (manifestação registrada, replay por chave, histórico imutável) — isso segue coberto por `tests/cli12-renewal-communications.test.mjs` (10/10) e pelo cenário HTTP do próprio gate.
- Outros gates com `NEXT_DIST_DIR` próprio ainda podem reescrever os arquivos gerados; apenas `test:ux-portal:pg` foi corrigido. A guarda `PLT-SMK-001` continua detectando contaminação.
- Sem validação manual, leitor de tela, Windows real ou aceite humano. Tema dia/noite não se aplica ao portal autenticado.

## 5. Próxima fatia

`/cliente/app/relatorios` — **entregue em seguida** (`docs/UX-PRO-ID3-RELATORIOS-LEITURA-RESULTADO-2026-10-26.md`), mesmo padrão: teste focal RED, correção mínima, cenário A/B no gate do portal, regeneração dos CSVs e relatório próprio. Isso **fechou o UX-PRO-ID3** no escopo local (10/10 páginas; gate 35/35, `npm test` 1059/1059). Próxima frente: UX-PRO-03. Fila vigente: `docs/STATUS-VIGENTE.md`.
