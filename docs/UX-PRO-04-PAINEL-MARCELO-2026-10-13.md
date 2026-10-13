# UX-PRO-04 — Painel de decisões do Marcelo

**Data:** 13/10/2026
**Base:** `main` / `origin/main` `4c8969fc1c1537049245b55e05143167a9945bc5`
**Fatia desta PR:** somente `/admin/marcelo` e seu detalhamento de indicadores.

## Reavaliação do escopo

O inventário atual contém `/admin/marcelo`, `/admin/pendencias`, `/admin/analytics` e `/admin/relatorios` como rotas distintas. O painel de Marcelo está realmente montado por `page.tsx` + `MarceloPanel.tsx`, atrás do `AdminGate` para `marcelo`, `admin` e `ti`. Pendências, Analytics e Relatórios também estão montados, em workspaces próprios; ficaram fora desta PR para manter uma única família coerente e evitar duplicar mudanças existentes.

O painel já consulta indicadores e detalhamentos canônicos, expõe período e fonte, separa vazio de indisponibilidade, mostra responsável/prioridade, e abre o registro original. As oito abas, a semântica de teclado, as alçadas e os estados de leitura são trabalho existente e foram preservados.

## Antes e depois

| Antes | Depois |
|---|---|
| O detalhe da pendência mostrava prioridade como enum técnico e não mostrava sua data de referência. | Prioridade aparece em português e a data de referência é exibida em pt-BR. |
| O campo genérico “Detalhe” podia misturar estado, descrição ou próxima ação conforme a fonte. | O cabeçalho esclarece “Estado ou próxima ação”; a tela explica que a referência pode ser criação, ocorrência ou vencimento. |
| A tabela não identificava cabeçalhos como colunas nem tinha região de rolagem própria acessível por teclado. | Cabeçalhos usam escopo de coluna e a tabela fica numa região nomeada, rolável e focável, sem transbordar o documento. |

## Integridade preservada

- Nenhuma rota, permissão, API, método, payload, regra de negócio, alçada, dado, isolamento ou registro de auditoria foi alterado.
- O registro continua sendo aberto pelo `canonical.api` retornado pelo servidor. Identificadores técnicos da fonte permanecem no detalhe secundário existente.
- A data é identificada como referência, não como prazo garantido. A API retorna campos de referência heterogêneos, conforme o tipo canônico.
- Falha segue distinta de ausência; nenhum valor simulado, estimado ou zero foi introduzido. A fixture do teste visual é explicitamente sintética e não é persistida.
- O gate focal foi ajustado para iniciar `initdb` com UTF-8 em Windows e usar Chrome local nesse sistema, mantendo Chromium empacotado no Linux da CI.

## Validação e evidências

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-adm-vocabulary.test.mjs` | 17/17 aprovados |
| `npm run typecheck` | aprovado |
| `npm run build` | aprovado; 105 páginas geradas, incluindo `/admin/marcelo` |
| `node scripts/ux-pro-00-inventory.mjs --check` | aprovado; 100 rotas e matriz vigente conferem |
| `git diff --check` | aprovado |
| `npm test` | 930 aprovados, 3 falhas: `EPERM` ao criar symlinks nos testes de cobertura de backup e CLI-04, restrição local do Windows |
| `npm run test:ux-adm:pg` | 12/12 aprovados em PostgreSQL descartável e Chrome local |

O teste Chromium exercita a tela renderizada em 320, 390, 768 e 1440 px, o tema dia/noite e a passagem de foco por teclado. As capturas ficam em [`docs/evidencias/ux-pro-04-marcelo-panel/`](evidencias/ux-pro-04-marcelo-panel/); a linha com registro é fixture sintética identificada no próprio teste. Estas capturas comprovam renderização automatizada, não inspeção ou aceite humano. Nenhuma sessão manual de Marcelo foi realizada.

## Limitações

O campo “Data de referência” preserva a semântica heterogênea dada pela API. A tela não inventa um prazo ou uma próxima ação quando o tipo canônico não fornece esse dado. `/admin/pendencias`, `/admin/analytics` e `/admin/relatorios` foram inspecionados estaticamente, mas não tiveram revisão visual nesta PR. A `main` continua exigindo os checks da CI e revisão concluída antes de qualquer merge.
