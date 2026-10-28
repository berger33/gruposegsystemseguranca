# UX-PRO-ID3 — `/cliente/app/reclamacoes-colaborador`: canal restrito isolado por conta (resultado)

**Data:** 26/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** quarta das oito páginas pendentes do ID3 (após `agenda`, `solicitacoes` e `chamados`). É a **mais sensível** da fila: reclamação sobre colaborador, com opção de anonimato e compartilhamento mínimo com o RH.

## 1. Defeito reproduzido (RED)

1. `data: Payload | null` era um estado global sem `accountId`. Ao trocar de A para B, as reclamações **e o envelope mínimo** de A podiam permanecer visíveis durante a consulta de B; uma resposta antiga de A podia sobrescrever o resultado de B. Num canal restrito, isso é vazamento de dado sensível.
2. `200` com payload malformado virava `complaints = []` → a tela anunciava **"Nenhuma reclamação registrada"**, mentindo justamente sobre a existência de registros sensíveis.
3. `load` limpava `setData(null)` no início de cada releitura: uma falha apagava tudo; `loadError` substituía a lista. Código técnico `load_failed` podia aparecer como mensagem.
4. Cadastro suspenso/encerrado: o formulário tinha aviso, mas **as outras duas seções ficavam em "Carregando…" indefinidamente**.
5. O POST usava `workspaceFetch`, que consome o corpo e lança em `!ok`; o mapa de 7 mensagens (`description_20_5000`, `invalid_severity`, `idempotency_key_reused`, `forbidden`…) **nunca era alcançado** — a pessoa via mensagem genérica.
6. Nenhuma seção anunciava `aria-busy`.

`node --test tests/ux-pro-id3-reclamacoes-leitura-ui.test.mjs` na base: **0/3 aprovados, 3 falhas**.

## 2. Correção (aditiva, sem mudar contratos)

- `ComplaintsRead`/`ComplaintsReadError` com `accountId` e `readAt`; `latestRequest` numera cada consulta; sucesso, erro e `finally` descartam `requestId !== latestRequest.current`.
- `Array.isArray` valida **tanto** `complaints` **quanto** `hrMinimalShare`; `readFailureMessage` preserva a tradução amigável sem sufixo técnico.
- `currentRead`/`currentError` só são elegíveis para a `activeAccount.id`. As **três** seções (formulário, lista, envelope do RH) deixaram de consumir `data?.…`.
- Falha de releitura preserva a lista e o envelope com alerta + "Tentar novamente" e a faixa "Última leitura concluída às HH:MM"; conta sem leitura concluída permanece em carregamento, **nunca** em "nenhuma reclamação".
- As três seções têm estado próprio para cadastro inativo, `aria-busy` e `role="status"` no carregamento.
- O POST passa a **`fetch` direto** e lê o corpo, tornando o mapa de mensagens efetivo. O GET continua com `workspaceFetch` (1 única chamada no arquivo). `submit` captura o `accountId` no início e recarrega essa conta.
- **Privacidade travada por teste:** o relato (`description`) e a referência do colaborador (`employee_reference`) continuam **sem renderização** na listagem — a API devolve `description`, mas a página só mostra protocolo, categoria, severidade, situação e título.

**Preservado:** endpoints, `Idempotency-Key` e replay, validações de título/relato/referência, categorias e severidades, opção de anonimato, envelope mínimo com justificativas, auditoria e o filtro do servidor (`origin='portal_cliente' AND created_by_identity = sessão AND client_account_id`). Nenhuma migração, rota, RBAC ou configuração foi alterada.

## 3. Evidências (GREEN)

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-id3-reclamacoes-leitura-ui.test.mjs` | **3/3** (RED 0/3 → GREEN) |
| `AWS_EXECUTION_ENV=… npm test` | **1047/1047**, 0 falhas/skips/todo |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** |
| `qa-wave0-static` / inventário `--check` | 5/5 / 100 rotas (CSVs: `agenda`, `chamados`, `reclamacoes-colaborador`, `solicitacoes`) |
| `AWS_EXECUTION_ENV=… npm run test:ux-portal:pg` | **31/31**, `UX_PORTAL_TEST_EXIT: 0`, cluster limpo, `next-env.d.ts` intacto |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |

O cenário `browser ID3: reclamações restritas ficam na conta ativa e não exibem o relato` usa PostgreSQL 17 descartável, sessão de cliente real e Chromium. Insere uma reclamação sintética em A com `origin='portal_cliente'`, `idempotency_key` e `request_fingerprint` (exigências da migração 146); confirma no servidor que A=1 reclamação + 4 campos no envelope e B=0. No navegador:

- **Privacidade:** o texto integral do `body` **não contém** a `description` (a API a devolve, a página não a renderiza), mas contém o protocolo e a descrição do envelope mínimo. A mesma asserção é repetida durante a troca de conta com a leitura pendente.
- Segura o GET de B: reclamação de A ausente, "Carregando reclamações…" visível, sem "Nenhuma reclamação"; 0 px de overflow em 320/390/768/1440.
- Libera B → vazio confirmado; `ArrowUp`/`ArrowDown` com foco preservado; `B:2` concluída antes de `A:2` e o resultado final permanece em B.

## 4. Limitações honestas

- RED em navegador não capturado antes da correção (RED estático comprovado); o protocolo do cenário é o mesmo já validado nas fatias anteriores.
- O **POST de abertura** não foi exercitado em navegador nesta fatia (a tradução dos erros está travada por leitura de código e pelo contrato já testado em `tests/cli15-employee-complaint.test.mjs`). Diferente de `chamados`, aqui não houve prova HTTP da tradução — é a próxima evidência a acrescentar se desejar.
- `hrMinimalShare` é hoje uma lista estática igual para todas as contas; o teste de isolamento prova que ela vem da leitura da conta, mas não que o servidor a personalize.
- Outros gates com `NEXT_DIST_DIR` próprio ainda podem reescrever os arquivos gerados; apenas `test:ux-portal:pg` foi corrigido. A guarda `PLT-SMK-001` continua detectando contaminação.
- Sem validação manual, leitor de tela, Windows real ou aceite humano. Tema dia/noite não se aplica ao portal autenticado.

## 5. Próxima fatia

`/cliente/app/satisfacao`, mantendo o padrão: teste focal RED, correção mínima, cenário A/B no gate do portal, regeneração dos CSVs e relatório próprio. `documentos` já foi entregue em seguida (`docs/UX-PRO-ID3-DOCUMENTOS-LEITURA-RESULTADO-2026-10-26.md`). Fila vigente: `docs/STATUS-VIGENTE.md`.
