# UX-PRO-ID3 — `/cliente/app/solicitacoes`: duas leituras isoladas por conta (resultado)

**Data:** 26/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** segunda das oito páginas pendentes do ID3 (a primeira foi `agenda`). Escopo: `src/app/cliente/app/solicitacoes/page.tsx`, teste focal, cenário de navegador no gate do portal e restauração de arquivos gerados por esse gate.

## 1. Defeito reproduzido (RED)

A página faz **duas leituras em paralelo** — `/api/client/service-requests?account=…` e `/api/client/contracts?account=…` — e guardava os resultados em `useState` globais, sem vínculo com a conta:

1. Ao trocar de A para B, solicitação **e contrato** de A permaneciam visíveis durante as consultas de B. O pior caso era o `<select>` do formulário: oferecia um **contrato de A** para uma nova solicitação aberta em B (o servidor recusaria com `contract_forbidden`, mas a UI induzia o erro).
2. Uma resposta antiga de A podia sobrescrever o resultado já concluído de B.
3. `200` com payload inesperado virava `undefined` e prendia a tela em "Carregando solicitações…".
4. `load` limpava `setItems(null)` no início de toda releitura: uma falha apagava a lista já lida; além disso o código técnico `load_failed` podia aparecer como mensagem ao cliente.
5. Cadastro suspenso/encerrado nunca carregava a segunda seção e ficava em spinner infinito.
6. Erros de POST não eram traduzidos: `workspaceFetch` consome o corpo e lança antes de `response.json()`, então o mapa de mensagens amigáveis (`crm_company_link_required`, `contract_forbidden`, `idempotency_key_reused`) nunca era alcançado.

`node --test tests/ux-pro-id3-solicitacoes-leitura-ui.test.mjs` na base: **0/3 aprovados, 3 falhas**.

## 2. Correção (aditiva, sem mudar contratos)

- `RequestsRead` guarda `accountId`, `items`, `contracts` e `readAt`; `RequestsReadError` guarda `accountId` e `message`; `latestRequest` numera cada par de consultas.
- Sucesso, erro e `finally` descartam `requestId !== latestRequest.current`.
- `Array.isArray` valida **as duas** listas; `readFailureMessage` remove sufixos técnicos `(HTTP xxx, codigo)` sem esconder a causa amigável.
- `currentRead`/`currentError` só são elegíveis para a `activeAccount.id`; o `<select>` só recebe opções de `currentRead.contracts`.
- `submit` captura o `accountId` no início, valida o contrato contra a leitura da conta ativa (defesa em profundidade) e passa a usar `fetch` direto no POST para poder ler o corpo de erro e aplicar o mapa de mensagens — preservando a chave de idempotência em falhas de rede.
- Falha de releitura mantém a lista com alerta + "Tentar novamente" e a faixa "Última leitura concluída às HH:MM"; conta sem leitura concluída permanece em carregamento, nunca em "vazio".
- Formulário **e** lista passam a ter mensagem própria para cadastro inativo; `aria-busy` nas duas seções e `role="status"` no carregamento.

**Preservado:** endpoints, métodos, `Idempotency-Key`, corpo do POST, validações de título/descrição, contador de caracteres, protocolo/registro de sucesso e replay, rótulos, vocabulário, chips, `responseBox`, sessão/grants/auditoria decididos no servidor. Nenhuma migração, rota, RBAC ou configuração foi alterada.

### Correção transversal (E2 residual)

O gate `test:ux-portal:pg` roda `server.mjs --dev` com `NEXT_DIST_DIR=.next/integration-ux-portal` e reescrevia `next-env.d.ts`/`tsconfig.json` no checkout sem restaurar. Isso contaminou a guarda `PLT-SMK-001` numa execução local de `npm test`. O gate agora faz snapshot em `before()` e restauração em `after()`; medido: SHA-256 de `next-env.d.ts` **igual antes e depois** (`1862ac4b…`), 29/29 verdes.

## 3. Evidências (GREEN)

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-id3-solicitacoes-leitura-ui.test.mjs` | **3/3** |
| `AWS_EXECUTION_ENV=… npm test` | **1041/1041**, 0 falhas/skips/todo |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** |
| `node scripts/qa-wave0-static.mjs` / inventário `--check` | 5/5 / 100 rotas (CSVs regenerados: linhas de `agenda` e `solicitacoes`) |
| `AWS_EXECUTION_ENV=… npm run test:ux-portal:pg` | **29/29**, `UX_PORTAL_TEST_EXIT: 0`, cluster limpo |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |

O cenário `browser ID3: solicitações mantém as duas leituras na conta ativa (inclusive contratos do formulário)` usa PostgreSQL 17 descartável, sessão de cliente real e Chromium: cria contas A/B, um contrato e uma solicitação sintéticos em A, confirma no servidor que A=(1,1) e B=(0,0), segura **as duas** requisições de B via `fetch` e verifica:

- A carregada com o contrato de A no `<select>`;
- B pendente: solicitação de A ausente, **opção de contrato de A ausente**, "Carregando solicitações…" visível, sem mensagem de vazio;
- 0 px de overflow em 320/390/768/1440;
- B vazia confirmada nas duas listas;
- `ArrowUp`/`ArrowDown` com foco preservado no seletor;
- `B:n..n+1` concluídas antes de `A:m..m+1`, resultado final permanecendo em B (nem solicitação nem contrato de A reaparecem).

## 4. Limitações honestas

- **RED em navegador** não capturado antes da correção (RED estático comprovado); o cenário replica o protocolo já validado como RED nas PRs #288/#298 e na fatia `agenda`.
- O POST real não foi exercitado neste cenário (exige vínculo CRM e responsável comercial); a tradução de erros do POST é coberta por leitura de código e pelo contrato já testado em `tests/cli10-service-request.test.mjs`, **não** por novo teste de navegador.
- Outros gates de integração que usam `NEXT_DIST_DIR` próprio ainda podem reescrever os arquivos gerados; apenas o gate do portal foi corrigido nesta fatia. A guarda `PLT-SMK-001` continua detectando qualquer contaminação.
- Sem validação manual, leitor de tela, Windows real ou aceite humano. Tema dia/noite não se aplica ao portal autenticado.

## 5. Próxima fatia

`/cliente/app/reclamacoes-colaborador`, mantendo o padrão: teste focal RED, correção mínima, cenário A/B no gate do portal, regeneração dos CSVs e relatório próprio. `chamados` já foi entregue em seguida (`docs/UX-PRO-ID3-CHAMADOS-LEITURA-RESULTADO-2026-10-26.md`). Fila vigente: `docs/STATUS-VIGENTE.md`.
