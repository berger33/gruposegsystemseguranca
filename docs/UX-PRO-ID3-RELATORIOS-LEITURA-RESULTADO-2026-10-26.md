# UX-PRO-ID3 — `/cliente/app/relatorios`: lista, aceites e rascunhos presos à conta ativa (resultado)

**Data:** 26/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** oitava e **última** das oito páginas pendentes do ID3. Com ela, a família UX-PRO-ID3 fica **concluída no escopo local desta sessão** (as duas páginas anteriores já vinham dos PRs #288 e #298). Aqui a leitura alimenta a lista **e os botões/observações de aceite** de cada relatório.

## 1. Defeito reproduzido (RED)

1. `reports`/`loadError` eram globais, sem `accountId`. Ao trocar de A para B, os relatórios de A continuavam na lista — inclusive o `<textarea>` e o botão **"Registrar aceite/ciência"**, que disparava um `PATCH /api/client/reports/{id}/acknowledge` com um `id` da conta antiga. `notes` (rascunhos por `report.id`), `message` (sucesso/erro do aceite) e `busy` também sobreviviam à troca. Uma resposta antiga de A sobrescrevia B.
2. `loadReports` chamava `workspaceResponse(response)` **duas vezes** — a segunda tentaria reler um corpo já consumido — e não validava o payload: `200` malformado → `setReports(undefined)` → "Carregando relatórios…" infinito. O `if (!response.ok)` era caminho morto (`workspaceFetch` já lança) e `loadError` exibia `error.message` cru com sufixo `(HTTP 503, …)`.
3. **Não havia `setReports(null)` no início da leitura**: diferentemente das outras páginas, a troca de conta não mostrava nem spinner — os dados de A simplesmente permaneciam na tela de B. Com cadastro inativo, "Carregando relatórios…" ficava para sempre.
4. O `PATCH` usava `workspaceFetch`, que consome o corpo do erro: o mapa `actionErrors` (3 mensagens) **nunca era alcançado** e todo 400/403 virava "Não foi possível conectar agora…". Faltavam traduções para `invalid_report_id`, `report_not_found`, `invalid_request`, `forbidden`, `client_session_required`.
5. `acknowledge` relia `activeAccount.id` depois do `await`, não conferia se o relatório vinha da conta ativa e `reportStatus[report.status]` quebrava a renderização diante de status inesperado. Sem `aria-busy`.

`node --test tests/ux-pro-id3-relatorios-leitura-ui.test.mjs` na base: **0/3 aprovados, 3 falhas**.

## 2. Correção (aditiva, sem mudar contratos)

- `ReportsRead`/`ReportsReadError` com `accountId` e `readAt`; `latestRequest` numera cada consulta; sucesso, erro e `finally` descartam `requestId !== latestRequest.current`.
- Parser único (`workspaceFetch` + `response.json()`), `Array.isArray(data.reports)` recusa payload inesperado, `readFailureMessage` traduz a falha sem sufixo técnico. `currentRead`/`currentError` só são elegíveis para a `activeAccount.id`; **lista, botões de aceite e observações derivam de `currentRead.reports`**.
- `useEffect` limpa `notes`, `message`, `state` e `busy` a cada troca de conta; cadastro inativo tem estado próprio; falha de releitura preserva a última leitura com alerta + retry e a faixa "Última leitura concluída às HH:MM"; conta sem leitura concluída permanece em carregamento; `aria-busy` e `role="status"`.
- `acknowledge` valida `currentRead.reports.some(...)` antes do envio, captura o `accountId` no início e usa **`fetch` direto** no PATCH. Mapa ampliado de 3 para **8 motivos**, preservando as três mensagens originais; `replayed` gera mensagem própria; queda de rede continua com texto humano.
- `reportStatus[report.status] ?? { text: report.status, chip: … }` e `reportTypeLabel[...] ?? ...` evitam que payload inesperado quebre a tela.

**Preservado:** endpoints (`GET /api/client/reports` e `PATCH /api/client/reports/{id}/acknowledge` → `clientSpaceApi`), filtro `status IN ('approved','sent','acknowledged')`, corpo do PATCH (`note`), textos de `reportStatus`/`reportTypeLabel`, `responseBox` de revisão e de ciência, `maxLength=500`, replay idempotente, e toda a autorização/auditoria no servidor (`requireAccountScope`, `sameOrigin`, `client_report_status_audit` na mesma transação). **Nenhuma migração, rota, RBAC, handler ou configuração foi alterada.**

## 3. Evidências (GREEN)

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-id3-relatorios-leitura-ui.test.mjs` | **3/3** (RED 0/3 → GREEN) |
| `AWS_EXECUTION_ENV=… npm test` | **1059/1059**, 0 falhas/skips/todo (`test:unit` com **128** arquivos) |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** páginas |
| `qa-wave0-static` / inventário `--check` | 5/5 / 100 rotas (CSVs regenerados: 8 linhas ID3) |
| `AWS_EXECUTION_ENV=… npm run test:ux-portal:pg` | **35/35**, `UX_PORTAL_TEST_EXIT: 0`, cluster limpo, `next-env.d.ts` intacto |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |

O cenário `browser ID3: relatórios mantêm lista e aceites na conta ativa e traduzem 400 do PATCH` usa PostgreSQL 17 descartável, sessão de cliente real e Chromium. Insere dois relatórios canônicos em A (migração 140): um `sent` com período e botão de aceite, outro `acknowledged` com "Ciência registrada"; B fica vazia. O servidor confirma A = 2 e B = `[]`. No navegador:

- **Tradução em HTTP real:** preenche a observação com **2 caracteres** e clica em "Registrar aceite/ciência". O servidor responde **`400 report_acknowledgement_too_short`** e a tela exibe **"A observação deve ter pelo menos 3 caracteres ou ficar vazia."**, com **0** ocorrências de "Não foi possível conectar agora…". Com `workspaceFetch` o corpo teria sido consumido e o mapa nunca alcançado.
- **B:1 pendente:** 0 títulos, 0 resumos, **0 textareas/botões de aceite** de A e 0 mensagens de erro da conta anterior; exatamente 1 "Carregando relatórios…" e nenhum "Nenhum relatório aprovado…" antes da resposta; 0 px de overflow em 320/390/768/1440.
- **B confirmado:** vazio declarado; `ArrowUp`/`ArrowDown` com foco preservado; `B:2` concluída antes de `A:2` e **nenhum relatório nem botão de A volta**.

O cenário focal rodou isolado (`UX_PORTAL_TEST_PATTERN`) em **1/1** antes da bateria completa de **35/35**.

## 4. Limitações honestas

- RED em navegador não capturado antes da correção (RED estático comprovado); protocolo idêntico ao das sete fatias anteriores.
- Foi provada a tradução do **400** do PATCH, mas não o **sucesso** do aceite em navegador (transição para `acknowledged`, auditoria `client_report_status_audit`, replay) — coberto pela suíte de integração do espaço do cliente.
- Outros gates com `NEXT_DIST_DIR` próprio ainda podem reescrever os arquivos gerados; apenas `test:ux-portal:pg` foi corrigido. A guarda `PLT-SMK-001` continua detectando contaminação.
- **Conclusão local ≠ aceite:** sem validação manual, leitor de tela, Windows real, UAT ou homologação humana. Produção segue **NO-GO** (`docs/PRODUCAO-GATE.md`).

## 5. Fechamento do ID3 e próxima fatia

As dez páginas de leitura do portal do cliente agora têm isolamento por conta ativa: `cobrancas` (#288), `contratos` (#298), `agenda`, `solicitacoes`, `chamados`, `reclamacoes-colaborador`, `documentos`, `satisfacao`, `renovacao` e `relatorios` (26/10). Cada uma das oito desta sessão tem teste focal RED→GREEN 3/3, cenário A/B em PostgreSQL 17 + Chromium, CSVs regenerados e relatório próprio; o gate do portal foi de **27/27 para 35/35**.

Próxima frente da fila: **UX-PRO-03** (reauditoria do `TiConsole` + promoção "com prova" dos 44 componentes órfãos de `/admin/ti`), seguida de UX-PRO-06/04/05, gates das 25 rotas públicas e reauditoria dos 222 IDs. Fila vigente: `docs/STATUS-VIGENTE.md`.
