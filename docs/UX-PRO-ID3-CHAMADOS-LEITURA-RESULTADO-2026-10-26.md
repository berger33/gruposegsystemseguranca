# UX-PRO-ID3 — `/cliente/app/chamados`: leitura isolada por conta + tradução real dos erros (resultado)

**Data:** 26/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** terceira das oito páginas pendentes do ID3 (após `agenda` e `solicitacoes`). Escopo: `src/app/cliente/app/chamados/page.tsx`, teste focal, cenário de navegador no gate do portal e CSVs de inventário.

## 1. Defeito reproduzido (RED)

1. `tickets` e `loadError` eram estados globais sem `accountId`: ao trocar de A para B, o chamado de A continuava visível durante a leitura de B e uma resposta antiga de A podia sobrescrever o resultado de B.
2. `200` com payload inesperado fazia `setTickets(undefined)` e a tela ficava presa em "Carregando chamados…".
3. Falha de releitura substituía a lista inteira pelo alerta; nenhuma indicação de "última leitura válida".
4. A lista não tinha estado próprio para cadastro suspenso/encerrado (renderizava nada) e não anunciava `aria-busy`.
5. **Defeito funcional mais grave:** abrir, aceitar e reabrir usavam `workspaceFetch`, que em resposta `!ok` **consome o corpo e lança** antes de `response.json()`. Consequentemente o mapa `openErrors` (11 mensagens: `ticket_accept_requires_resolved`, `ticket_reopen_only_resolved_or_closed`, `idempotency_conflict`, etc.) nunca era alcançado — a pessoa recebia "Não foi possível conectar agora" mesmo diante de um 400/409 perfeitamente explicável.
6. Rascunhos de aceite/reabertura e mensagens de sucesso/erro não eram limpos na troca de conta.

`node --test tests/ux-pro-id3-chamados-leitura-ui.test.mjs` na base: **0/3 aprovados, 3 falhas**.

## 2. Correção (aditiva, sem mudar contratos)

- `TicketsRead`/`TicketsReadError` com `accountId` e `readAt`; `latestRequest` numera cada consulta; sucesso, erro e `finally` descartam `requestId !== latestRequest.current`.
- `Array.isArray(data.tickets)` recusa payload inesperado; `readFailureMessage` mantém a tradução amigável do HTTP e remove o sufixo técnico `(HTTP xxx, codigo)`.
- `currentRead`/`currentError` só são elegíveis para a `activeAccount.id`. Falha de releitura preserva a lista com alerta + "Tentar novamente" e a faixa "Última leitura concluída às HH:MM".
- Formulário **e** lista têm mensagem para cadastro inativo; `aria-busy` nas duas seções e `role="status"` no carregamento.
- As três mutações passam a usar **`fetch` direto** e leem o corpo com `response.json().catch(() => ({}))`, tornando `openErrors[payload.error]` efetivo. O GET continua usando `workspaceFetch` (1 única chamada no arquivo).
- `submit`, `acceptTicket` e `reopenTicket` capturam o `accountId` no início e recarregam essa conta, não a conta que porventura esteja ativa ao final da requisição.
- Na troca de conta, rascunhos, mensagem, estado e chave de idempotência são reiniciados.

**Preservado:** endpoints (`GET /api/client/tickets`, `POST /api/client/tickets`, `PATCH …/accept`, `PATCH …/reopen`), `Idempotency-Key` e fingerprint de retry, validações de título/descrição, `TICKET_CATEGORIES`, trilha de atendimento, SLA pausado, aceite, reabertura, chips, rótulos, vocabulário e a autorização/auditoria decididas no servidor. Nenhuma migração, rota, RBAC ou configuração foi alterada.

## 3. Evidências (GREEN)

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-id3-chamados-leitura-ui.test.mjs` | **3/3** (RED 0/3 → GREEN) |
| `AWS_EXECUTION_ENV=… npm test` | **1044/1044**, 0 falhas/skips/todo |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** |
| `qa-wave0-static` / inventário `--check` | 5/5 / 100 rotas (CSVs: linhas de `agenda`, `chamados`, `solicitacoes`) |
| `AWS_EXECUTION_ENV=… npm run test:ux-portal:pg` | **30/30**, `UX_PORTAL_TEST_EXIT: 0`, cluster limpo, `next-env.d.ts` intacto |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |

O cenário `browser ID3: chamados isola a leitura por conta e traduz erro de reabertura` usa PostgreSQL 17 descartável, sessão de cliente real e Chromium. Cria contas A/B e um chamado **resolvido** em A; confirma no servidor que A=1 e B=0. No navegador:

- **Prova da tradução (HTTP real):** preenche motivo de reabertura curto (`curto`), clica "Reabrir chamado" e recebe `400 ticket_reopen_reason_required`. A tela exibe **"Informe um motivo de reabertura com pelo menos 10 caracteres."** e **nenhuma** mensagem genérica de conexão — algo que o código anterior não conseguia fazer.
- Segura o GET de B: chamado de A ausente, "Carregando chamados…" visível, sem mensagem de vazio; 0 px de overflow em 320/390/768/1440.
- Libera B → vazio confirmado; `ArrowUp`/`ArrowDown` com foco preservado; `B:2` concluída antes de `A:2` e o resultado final permanece em B.

## 4. Limitações honestas

- RED em navegador não capturado antes da correção (RED estático comprovado); o cenário segue o protocolo já validado nas fatias anteriores.
- Foram exercitadas em navegador a **reabertura com erro** e a leitura; o sucesso de abertura/aceite/reabertura continua coberto pelos gates `tests/f03-client-ticket-acceptance.integration.test.mjs` e `tests/l08-delivery.integration.test.mjs`, não por novo teste visual.
- Outros gates com `NEXT_DIST_DIR` próprio ainda podem reescrever os arquivos gerados; apenas `test:ux-portal:pg` foi corrigido (fatia anterior). A guarda `PLT-SMK-001` continua detectando contaminação.
- Sem validação manual, leitor de tela, Windows real ou aceite humano. Tema dia/noite não se aplica ao portal autenticado.

## 5. Próxima fatia

`/cliente/app/documentos`, mantendo o padrão: teste focal RED, correção mínima, cenário A/B no gate do portal, regeneração dos CSVs e relatório próprio. `reclamacoes-colaborador` já foi entregue em seguida (`docs/UX-PRO-ID3-RECLAMACOES-LEITURA-RESULTADO-2026-10-26.md`). Fila vigente: `docs/STATUS-VIGENTE.md`.
