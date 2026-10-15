# UX-PRO-07C-2 — Escritas de `/admin/fornecedores`

**Data:** 2026-10-15 (UTC) · **Branch:** `arena/c0af9881-gruposegsystemseguranca` · **Base:** `ff0e6d620104364a35438785d8767400704d90cf` (`origin/main`, após PR #226) · **Fatia:** UX-PRO-07C-2 — escrita EXT-04 em `/admin/fornecedores`

## Resultado e limite

A interface agora dá estado explícito às nove operações canônicas de escrita nesta rota, valida a forma do recurso retornado antes de declarar sucesso, classifica falhas por status e código, bloqueia submits concorrentes e oferece replay manual seguro apenas quando o resultado é incerto. O gate focal passou em duas execuções independentes e a bateria local foi concluída com sucesso. As evidências antes e depois estão separadas em `antes-07c-2/` e `depois-07c-2/`.

A fatia fecha **somente** este escopo de escritas em `/admin/fornecedores`; **não conclui UX-PRO-07**. C11 (abas sem painel) permanece fora de escopo, não foi alterado e continua dependendo de ordem explícita do proprietário como item separado.

## Escopo canônico preservado

As nove mutações permanecem `POST`, nas mesmas URLs, com os mesmos corpos e identificadores de operação/chaves de idempotência:

| Escrita | URL canônica | Corpo preservado |
|---|---|---|
| Criar cotação | `/api/ext/supplier/suppliers/{supplier_id}/products/{product_id}/quotations` | `quantity`, `unit_price_cents`, `notes` |
| Transicionar cotação | `/api/ext/supplier/quotations/{quotation_id}/status` | `status`, `reason` |
| Decidir aprovar/rejeitar | `/api/ext/supplier/quotations/{quotation_id}/decision` | `decision`, `justification` |
| Registrar validade | `/api/ext/supplier/quotations/{quotation_id}/validities` | formulário de validade existente |
| Criar regra de alerta | `/api/ext/supplier/quotations/{quotation_id}/alert-rules` | `days_before`, `justification` |
| Registrar referência documental | `/api/ext/supplier/quotations/{quotation_id}/documents` | formulário documental existente |
| Criar pedido derivado | `/api/ext/supplier/quotations/{quotation_id}/orders` | `notes` |
| Transicionar pedido | `/api/ext/supplier/orders/{order_id}/status` | `status`, `reason` |
| Registrar prazo do pedido | `/api/ext/supplier/orders/{order_id}/deadlines` | formulário de prazo existente |

Não houve alteração de servidor, endpoint, verbo, payload, geração ou chave de idempotência, permissões, auditoria ou migrações. A página não repete POST automaticamente. Falha transitória e resposta 2xx sem recurso canônico são apresentadas como resultado incerto; o botão de replay envia o corpo serializado e a mesma `Idempotency-Key`, somente após ação explícita. Conflito e validação não oferecem replay cego. HTTP 401/403 fecha a jornada e limpa dados e formulários protegidos.

## Referências antes/depois (`file:line`)

| Área | Antes — base `ff0e6d6` | Depois — branch desta fatia |
|---|---|---|
| Escrita compartilhada | `src/app/admin/fornecedores/FornecedoresWorkspace.tsx:228–243`: `mutate` comum enviava POST, mantinha chave após erro e tratava a resposta apenas por `result.ok`. | `src/app/admin/fornecedores/FornecedoresWorkspace.tsx:291–371`: trava síncrona antes do `await`, captura de URL/corpo/chave, validação, classificação, incerteza e replay manual da mesma tentativa. |
| Nove handlers | `src/app/admin/fornecedores/FornecedoresWorkspace.tsx:251–293`: handlers chamavam `mutate` e só continuavam no sucesso HTTP. | `src/app/admin/fornecedores/FornecedoresWorkspace.tsx:379–523`: os nove handlers enviam planos com contratos e validações de recurso canônico explícitos. |
| Falhas e resposta 2xx | Não existia classificador separado para as escritas. | Novo `src/lib/supplier-write.ts:36–125`: distingue 400/413/422, 409, 401, 403, transitórios, resposta inválida e inesperados; mantém status/código real e determina se o mesmo request pode ser oferecido para replay manual. Validadores por recurso: `FornecedoresWorkspace.tsx:68–92`. |
| Falha fechada | `src/app/admin/fornecedores/FornecedoresWorkspace.tsx:132–142` na base já fechava leituras negadas; não cobria negação originada por uma escrita nem limpava todos os formulários. | `src/app/admin/fornecedores/FornecedoresWorkspace.tsx:183–205,307–324`: 401/403 de escrita entram no estado negado e limpam dados, formulários, erro e request pendente. |
| UI de pendência | Base `src/app/admin/fornecedores/FornecedoresWorkspace.tsx:228–243,471–472`: `busy` era string, sem estado acessível de envio por ação. | `src/app/admin/fornecedores/FornecedoresWorkspace.tsx:526,625–655` expõe `role="status"`, ação pendente, classificação/código e retry explícito; os botões identificam a ação com `aria-busy` e os controles de escrita ficam bloqueados enquanto há envio ou incerteza (exemplos: `:732–734`, `:822–824`, `:841–852`, `:922–945`, `:993–995`, `:1033–1036`, `:1081–1083`). |
| Gate focal | `tests/ux-supplier-workspace.integration.test.mjs:15–19,341–593` na base continha os casos estáticos e oito casos de leitura. `scripts/qa-ux-supplier-postgres.mjs:59–75` exigia no mínimo 10 aprovações. | Os casos herdados permanecem sem asserções alteradas; cinco testes aditivos estão em `tests/ux-supplier-workspace.integration.test.mjs:879–1138`. O caso das nove escritas verifica `aria-busy`, bloqueio de botões e campos tanto durante o envio como enquanto o resultado permanece incerto (`:905–947`, em especial `:920–936`). O mínimo passa a 15 e o auditor TAP continua rejeitando resumo ausente, falha, skip, todo ou aprovações abaixo do mínimo (`scripts/qa-ux-supplier-postgres.mjs:59–75,129–150`). |
| Inventário | CSVs não registravam o estágio 07C-2. | Gerados exclusivamente por `node scripts/ux-pro-00-inventory.mjs`; o diff de cada CSV é somente a linha `/admin/fornecedores`. |

A mudança no cabeçalho dos testes apenas documenta a composição da suíte. A atualização do harness acrescenta suporte a escritas e medições; nenhuma asserção herdada foi editada, removida ou relaxada.

## Baseline e evidência do gate focal

O baseline foi executado contra a implementação anterior a 07C-2, no commit base informado acima, usando PostgreSQL descartável, servidor HTTP real e Chromium. Resultado: **15 testes; 10 pass, 5 fail, 0 cancelled, 0 skipped e 0 todo**. Os 10 testes herdados passaram; os cinco casos aditivos de escrita falharam pelas capacidades ausentes na implementação anterior, como esperado. Isso é baseline, não regressão herdada. O registro integral e as medições estão em:

- `docs/ux-pro-07-fornecedores-evidencias/antes-07c-2/antes-gate-completo.txt`
- `docs/ux-pro-07-fornecedores-evidencias/antes-07c-2/antes-medicoes.json`
- `docs/ux-pro-07-fornecedores-evidencias/antes-07c-2/resumo.json` e capturas PNG

O gate final (`npm run test:ux-supplier:pg`) foi iniciado duas vezes de forma independente, cada uma com cluster PostgreSQL temporário e processo/browser próprios. Em **ambas**: **15 pass, 0 fail, 0 skipped, 0 todo**, mínimo exigido 15 e limpeza do cluster confirmada. TAPs integrais:

- `docs/ux-pro-07-fornecedores-evidencias/depois-07c-2/execucao-1-tap.txt` — execução com capturas
- `docs/ux-pro-07-fornecedores-evidencias/depois-07c-2/execucao-2-tap.txt` — repetição independente

Cobertura aditiva: as nove mutações recebem 2xx sem recurso canônico **depois do commit real**, o que precisa permanecer incerto; cada replay manual mantém método, URL, payload serializado e chave e não duplica o evento/efeito no banco. Há também guarda de dois submits no mesmo tick, falha 503 e de rede sem retry automático, 400 e 409 reais classificados separadamente, e 401/403 fail-closed. A injeção de falhas do browser fica em `window.fetch`; as chamadas não injetadas passam pelo servidor HTTP real. O cenário pós-commit confirma o estado no PostgreSQL.

## Medições automatizadas e capturas

`docs/ux-pro-07-fornecedores-evidencias/depois-07c-2/resumo.json` acompanha **16 capturas/estados**, todos com `problems: []` e `overflowDocumentoPx: 0`: 320×844, 390×844, 768×1024 e 1440×900 em tema diurno; 768×1024 em tema noturno; percurso de teclado em 390×844; estados de leitura e de escrita (envio, 2xx inválido, duplo submit, 503, rede, 409 e acesso negado). Nos estados com controles interativos, o menor alvo medido foi **44 px**. No estado 403, a jornada fechada tem zero ações e, portanto, `menorAlvoPx: null`, com `failClosedSemAcoes: true`. A menor razão entre os pares de contraste instrumentados foi 6,18:1; os pares selecionados não constituem uma medição exaustiva de todas as combinações visuais.

As evidências 07C-1 na raiz do diretório de evidências foram preservadas. A nova baseline e os resultados 07C-2 ficam nos subdiretórios próprios, sem sobrescrever `antes/` ou as capturas anteriores.

## Bateria local anterior à PR

| Comando | Resultado |
|---|---|
| `npm ci` | Concluído; 81 pacotes instalados, 0 vulnerabilidades reportadas. |
| `npm test` | **933 pass, 0 fail, 0 skipped, 0 todo.** A primeira tentativa detectou CSVs desatualizados após a criação das evidências; regenerados pelo script autorizado, o diff foi limitado à linha `/admin/fornecedores` nos dois CSVs, e a repetição integral passou. |
| `npm run typecheck` | Passou. |
| `npm run build` | Passou; build de produção e geração estática concluídos. |
| `node --check tests/ux-supplier-workspace.integration.test.mjs` e `node --check scripts/qa-ux-supplier-postgres.mjs` | Passaram. |
| `node scripts/qa-wave0-static.mjs` | 5/5 verificações estáticas passaram. |
| `node scripts/ux-pro-00-inventory.mjs --check` | Passou após a regeneração autorizada. |
| `npm run test:l06-delivery:pg` | 9 pass, 0 fail, 0 skipped, 0 todo. |
| `npm run test:l08-delivery:pg` | 51 pass, 0 fail, 0 skipped, 0 todo. |
| `npm run test:ext04-suppliers:pg` | 28 pass, 0 fail, 0 skipped, 0 todo; mínimo exigido 28. |
| `npm run test:ux-supplier:pg` — duas execuções | Cada uma: 15 pass, 0 fail, 0 skipped, 0 todo; mínimo exigido 15. |
| `git diff --check` | Limpo. |

Após build e cada gate com Next.js, `next-env.d.ts` e `tsconfig.json` foram restaurados e seus SHA-256 conferidos. Valores finais (iguais à base):

- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`

## Limitações e declarações

**Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu**

**As medições automatizadas não equivalem a auditoria WCAG completa**

As afirmações deste relatório são limitadas ao código, às medições e aos gates automatizados listados. Não representam aprovação humana, conformidade WCAG integral, conclusão de UX-PRO-07 ou aceite do proprietário. C11 continua pendente de ordem expressa e registro separado.
