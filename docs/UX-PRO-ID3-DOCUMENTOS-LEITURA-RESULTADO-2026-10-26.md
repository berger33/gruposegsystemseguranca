# UX-PRO-ID3 — `/cliente/app/documentos`: links de download presos à conta ativa (resultado)

**Data:** 26/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** quinta das oito páginas pendentes do ID3 (após `agenda`, `solicitacoes`, `chamados` e `reclamacoes-colaborador`). Aqui o risco A/B não é só texto: cada item renderiza um **link clicável de download** para byte privado.

## 1. Defeito reproduzido (RED)

1. `documents` e `error` eram estados globais sem `accountId`: ao trocar de A para B, os documentos **e seus links** de A podiam continuar na tela durante a consulta de B; uma resposta antiga de A podia sobrescrever o resultado de B.
2. `loadDocuments` chamava `workspaceResponse(response)` duas vezes — a primeira dentro de `if (!response.ok)`, que é caminho morto porque `workspaceFetch` já lança em `!ok`. O parser duplo era confuso e o payload não era validado: um `200` com corpo inesperado fazia `setDocuments(undefined)` e a tela ficava presa em "Carregando documentos…".
3. Falha de releitura substituía a lista inteira pelo alerta — nenhuma indicação de última leitura válida.
4. Sem `aria-busy` e sem `role="status"` no carregamento.
5. Ausência do recorte do vínculo (`scope_note`), que as páginas já corrigidas exibem.

`node --test tests/ux-pro-id3-documentos-leitura-ui.test.mjs` na base: **0/3 aprovados, 3 falhas**.

## 2. Correção (aditiva, sem mudar contratos)

- `DocumentsRead`/`DocumentsReadError` com `accountId` e `readAt`; `latestRequest` numera cada consulta; sucesso, erro e `finally` descartam `requestId !== latestRequest.current`.
- `Array.isArray(data.documents)` recusa payload inesperado; `readFailureMessage` preserva a tradução amigável sem sufixo técnico.
- `currentRead`/`currentError` só são elegíveis para a `activeAccount.id`; **a lista e todos os `<a href="/api/client/documents/${id}/download">` vêm de `currentRead.documents`**.
- Falha de releitura preserva a lista com alerta + "Tentar novamente" e a faixa "Última leitura concluída às HH:MM"; conta sem leitura concluída permanece em carregamento, nunca em "nenhum documento".
- `aria-busy`, `role="status"`, mensagem de cadastro inativo preservada e `scope_note` exibido quando existir.
- Removido o parser duplo: uma única chamada `workspaceFetch` + `response.json()`.

**Preservado:** endpoint e formato do GET, URL/contrato do download (a autorização, integridade SHA-256 e auditoria continuam 100% no servidor), formatação de tamanho, rótulos, vocabulário, `appStyles.downloadButton`, estado para cadastro suspenso/encerrado. Nenhuma migração, rota, RBAC ou configuração foi alterada.

## 3. Evidências (GREEN)

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-id3-documentos-leitura-ui.test.mjs` | **3/3** (RED 0/3 → GREEN) |
| `AWS_EXECUTION_ENV=… npm test` | **1050/1050**, 0 falhas/skips/todo |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** |
| `qa-wave0-static` / inventário `--check` | 5/5 / 100 rotas (CSVs: `agenda`, `chamados`, `documentos`, `reclamacoes-colaborador`, `solicitacoes`) |
| `AWS_EXECUTION_ENV=… npm run test:ux-portal:pg` | **32/32**, `UX_PORTAL_TEST_EXIT: 0`, cluster limpo, `next-env.d.ts` intacto |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |

O cenário `browser ID3: documentos e links de download ficam presos à conta ativa` usa PostgreSQL 17 descartável, sessão de cliente real e Chromium. Insere um documento sintético em A (`storage_key` de 48 hex, `size_bytes=42`, sem arquivo físico — o teste não faz download) e confirma no servidor que A=1 e B=0. No navegador:

- A carregada: **1 link** de download, com `href` contendo o `id` do documento de A.
- B pendente: título de A ausente, **0 links** de download, "Carregando documentos…" visível, sem "Nenhum documento"; 0 px de overflow em 320/390/768/1440.
- Libera B → vazio confirmado, ainda 0 links; `ArrowUp`/`ArrowDown` com foco preservado.
- `B:2` concluída antes de `A:2`: o resultado final permanece em B e **nenhum link de A reaparece** — inclusive na resposta fora de ordem.

## 4. Limitações honestas

- RED em navegador não capturado antes da correção (RED estático comprovado); o protocolo do cenário é o mesmo já validado nas quatro fatias anteriores.
- O **download em si** (stream, hash, 404/409, auditoria) não foi exercitado aqui — o fixture não cria arquivo físico. Ele continua coberto pelos gates L02/L03/L08 (`tests/l02-delivery.integration.test.mjs`, `qa-restored-document-http.mjs`). O que esta fatia prova é que a UI não deixa um link de outra conta clicável.
- A autorização do download é e continua sendo do servidor (`requireAccountScope`); a correção é de UI, defesa em profundidade — não substitui RBAC.
- Outros gates com `NEXT_DIST_DIR` próprio ainda podem reescrever os arquivos gerados; apenas `test:ux-portal:pg` foi corrigido. A guarda `PLT-SMK-001` continua detectando contaminação.
- Sem validação manual, leitor de tela, Windows real ou aceite humano. Tema dia/noite não se aplica ao portal autenticado.

## 5. Próxima fatia

`/cliente/app/renovacao`, mantendo o padrão: teste focal RED, correção mínima, cenário A/B no gate do portal, regeneração dos CSVs e relatório próprio. `satisfacao` já foi entregue em seguida (`docs/UX-PRO-ID3-SATISFACAO-LEITURA-RESULTADO-2026-10-26.md`). Fila vigente: `docs/STATUS-VIGENTE.md`.
