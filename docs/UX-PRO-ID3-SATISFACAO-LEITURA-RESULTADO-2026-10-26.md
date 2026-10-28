# UX-PRO-ID3 — `/cliente/app/satisfacao`: pesquisas e `<select>` presos à conta ativa (resultado)

**Data:** 26/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** sexta das oito páginas pendentes do ID3 (após `agenda`, `solicitacoes`, `chamados`, `reclamacoes-colaborador` e `documentos`). Aqui a leitura alimenta **duas superfícies ao mesmo tempo**: o histórico e o `<select>` de pesquisas pendentes do formulário de resposta.

## 1. Defeito reproduzido (RED)

1. `items`/`loadError` eram globais, sem `accountId`. Ao trocar de A para B, as pesquisas de A podiam continuar no histórico **e no `<select>`** de B — permitindo tentar enviar uma resposta com `survey_id` de outra conta (o servidor recusaria, mas a UI induzia o erro). Uma resposta antiga de A também podia sobrescrever B.
2. `load` lançava `new Error("load_failed")` num caminho morto (`workspaceFetch` já lança em `!ok`) e não validava o payload: `200` malformado → `setItems(undefined)` → spinner infinito; `setItems(null)` no início de cada releitura apagava dados válidos em caso de falha.
3. O histórico ficava em "Carregando pesquisas…" **para sempre** quando o cadastro estava suspenso/encerrado (o formulário avisava, a lista não).
4. O POST usava `workspaceFetch`, que consome o corpo do erro e lança: o mapa de mensagens nunca era alcançado. Além disso, faltavam traduções para `invalid_response` e **`score_outside_declared_scale`** — justamente o erro de nota fora da escala declarada (NPS 0–10, CSAT 1–5, genérica).
5. `submit` relia `activeAccount.id` depois do `await`; sem `aria-busy`/`role="status"`.

`node --test tests/ux-pro-id3-satisfacao-leitura-ui.test.mjs` na base: **0/3 aprovados, 3 falhas**.

## 2. Correção (aditiva, sem mudar contratos)

- `SurveysRead`/`SurveysReadError` com `accountId` e `readAt`; `latestRequest` numera cada consulta; sucesso, erro e `finally` descartam `requestId !== latestRequest.current`.
- `Array.isArray(data.surveys)` recusa payload inesperado; `readFailureMessage` mantém a tradução amigável sem sufixo técnico; `load_failed` removido.
- `currentRead`/`currentError` só são elegíveis para a `activeAccount.id`. **`pending` deriva de `currentRead.surveys`** — histórico, `<select>`, finalidade e escala declarada vêm todos da mesma leitura.
- `submit` valida `pending.some(item => item.id === selectedId)` antes de enviar (defesa em profundidade), captura o `accountId` no início e usa **`fetch` direto** para ler o corpo. Mapa ampliado: `invalid_response`, `score_outside_declared_scale`, `invalid_request`, `idempotency_key_required`, além dos três anteriores.
- Falha de releitura preserva histórico e formulário com alerta + "Tentar novamente" e a faixa "Última leitura concluída às HH:MM"; conta sem leitura concluída permanece em carregamento.
- Formulário e histórico têm estado próprio para cadastro inativo, `aria-busy` e `role="status"` (com textos distintos para não duplicar anúncio).

**Preservado:** endpoints (`GET`/`POST /api/client/satisfaction-surveys` → `extSatisfactionApi.handleClient`), `Idempotency-Key` e replay, corpo do POST (`survey_id`, `score`, `feedback`), escala/metodologia declaradas, `statusLabel`/`typeLabel`, `responseBox`, contador de caracteres, e toda a autorização/auditoria no servidor (`origin='ext06_canonica'`, `target_identity_id`, `sameOrigin`). Nenhuma migração, rota, RBAC ou configuração foi alterada.

## 3. Evidências (GREEN)

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-id3-satisfacao-leitura-ui.test.mjs` | **3/3** (RED 0/3 → GREEN) |
| `AWS_EXECUTION_ENV=… npm test` | **1053/1053**, 0 falhas/skips/todo |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** |
| `qa-wave0-static` / inventário `--check` | 5/5 / 100 rotas (CSVs: `agenda`, `chamados`, `documentos`, `reclamacoes-colaborador`, `satisfacao`, `solicitacoes`) |
| `AWS_EXECUTION_ENV=… npm run test:ux-portal:pg` | **33/33**, `UX_PORTAL_TEST_EXIT: 0`, cluster limpo, `next-env.d.ts` intacto |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |

O cenário `browser ID3: satisfação mantém pesquisas e select na conta ativa e traduz nota fora da escala` usa PostgreSQL 17 descartável, sessão de cliente real e Chromium. Insere uma pesquisa canônica sintética em A (`origin='ext06_canonica'`, metodologia `generica`, escala **1–5**, `follow_up_threshold=2`, destinatário/autor conforme migração 152) e confirma no servidor que A=1 e B=0. No navegador:

- **Tradução em HTTP real:** seleciona a pesquisa, preenche comentário válido, remove os atributos `min`/`max` do input (a validação nativa bloquearia) e envia nota **9**. O servidor responde `400 score_outside_declared_scale` e a tela exibe **"A nota precisa estar dentro da escala declarada da pesquisa."** — não um erro genérico.
- Segura o GET de B: a opção da pesquisa de A desaparece do `<select>`, a finalidade desaparece do histórico, "Carregando pesquisas…" visível, sem "Nenhuma pesquisa"; 0 px de overflow em 320/390/768/1440.
- Libera B → vazio confirmado; `ArrowUp`/`ArrowDown` com foco preservado; `B:2` concluída antes de `A:2` e **nenhuma opção de A volta ao `<select>`**.

> Nota de execução: na primeira tentativa o gate falhou porque `<option>` é `hidden` para o Playwright e `waitFor()` espera visibilidade; corrigido para `state: 'attached'`. A reexecução foi 33/33.

## 4. Limitações honestas

- RED em navegador não capturado antes da correção (RED estático comprovado); o protocolo do cenário repete o das cinco fatias anteriores.
- Foi provada a tradução do erro **de escala**, mas não o **sucesso** do POST (nota dentro da escala, plano de ação, replay) em navegador — isso segue coberto por `tests/ext06-satisfaction.integration.test.mjs` e `tests/cli11-satisfaction-portal.test.mjs`.
- Outros gates com `NEXT_DIST_DIR` próprio ainda podem reescrever os arquivos gerados; apenas `test:ux-portal:pg` foi corrigido. A guarda `PLT-SMK-001` continua detectando contaminação.
- Sem validação manual, leitor de tela, Windows real ou aceite humano. Tema dia/noite não se aplica ao portal autenticado.

## 5. Próxima fatia

`/cliente/app/renovacao` — **entregue em seguida** (`docs/UX-PRO-ID3-RENOVACAO-LEITURA-RESULTADO-2026-10-26.md`), mantendo o padrão: teste focal RED, correção mínima, cenário A/B no gate do portal, regeneração dos CSVs e relatório próprio. Agora resta **apenas `relatorios`** para fechar o ID3. Fila vigente: `docs/STATUS-VIGENTE.md`.
