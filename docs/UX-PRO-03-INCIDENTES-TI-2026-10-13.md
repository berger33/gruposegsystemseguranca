# UX-PRO-03 — Incidentes no console de TI

**Data:** 13/10/2026
**Base:** `main` SHA `d103aa61c118389a6c2c02cd2c9fd2ad57964fc7`
**Superfície:** aba “Incidentes”, montada por `TiConsole` em `/admin/ti`.

## Antes e depois

| Antes | Depois |
|---|---|
| A tela misturava lista, abertura, atualização, evidências, ações, comunicações e histórico sem hierarquia ou separação por tarefa. | A lista recebeu busca, filtro por situação, resumo dos oito estados e tabela com situação, severidade, responsável e data; abertura e detalhe ficaram em seções próprias. |
| Valores internos de enum, placeholders como rótulos e datas truncadas tornavam os formulários e históricos difíceis de interpretar. | Tipos, severidades, estados, destinatários e datas são apresentados em português; campos têm rótulos persistentes, limites e instruções junto à tarefa. |
| Falhas de rede e de autorização podiam deixar a tela sem explicação; não havia estados próprios de carregamento, vazio ou sucesso. | Lista, detalhe e registros têm estados explícitos de carregamento, vazio, falha, acesso negado e sucesso, com tentativa de recuperação quando aplicável. |
| “Registrar comunicação” e checksum podiam ser entendidos como envio externo ou verificação de arquivo. | A tela informa que a comunicação apenas registra conteúdo e indicadores internos, sem enviar e-mail/SMS; evidência é uma referência textual, sem upload nem verificação do arquivo. |
| Estilos inline, valores de cor fixos, listas compactadas e controles sem rótulos persistentes prejudicavam responsividade, temas e teclado. | Layout usa tokens administrativos, cards/lista rolável, grade adaptável, controles rotulados e foco visível. |

## Comportamento preservado

- Mantidos `GET/POST /api/admin/incidents`, `GET/PATCH /api/admin/incidents/:id`, `POST /api/admin/incidents/evidences`, `POST/PATCH /api/admin/incidents/actions` e `POST /api/admin/incidents/communications`, com os métodos e campos de payload existentes.
- A rota segue montada sob a aba de TI. `AdminGate` continua restrito aos papéis `ti` e `admin`; as APIs continuam exigindo mesma origem, sessão e papel `admin`/`ti`.
- Preservados ciclo de vida, requisitos de transição, campos de causa/impacto/remediação, registro de evidência, conclusão de ação, atualização das flags internas e histórico/auditoria do servidor. Nenhuma API, regra de negócio, dado ou permissão foi alterada.
- Busca e filtro são apenas locais sobre os até 200 registros que a API atual retorna; nenhuma paginação ou ampliação da consulta foi introduzida.

## Validação e evidências

- `node --test tests/ux-pro-03-ti-incidents-ui.test.mjs`: 4/4 aprovados.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; 105 páginas geradas.
- `node scripts/ux-pro-00-inventory.mjs`: regenerou o inventário atual. A diferença na linha `/admin/ti` registra a contagem atualizada de componentes; as 100 rotas não mudaram. `--check` deve passar após versionar a saída.
- `git diff --check`: aprovado.
- `npm test`: 925 aprovados e 3 falhas em 928. As três falhas são `EPERM` do Windows ao criar symlinks nos testes `qa-backup-coverage-inventory`, `qa-cli-v2-local-provider` e `qa-cli-v2-transfer`; não são falhas do teste focal. A `QA baseline` no GitHub/Linux é necessária para fechar o gate.
- Revisão estática responsiva considerou 320, 390, 768 e 1440 CSS px; os breakpoints de 900 e 650 px reorganizam grade e tabela mantém rolagem contida. Não houve sessão autenticada para captura/inspeção visual renderizada nesses viewports.
- Tema dia/noite revisado por tokens em CSS, sem captura renderizada autenticada. Teclado revisado estruturalmente (rótulos associados, controles nativos, foco visível e tabela rolável focável); não houve travessia manual da página. Nenhum aceite humano foi realizado.

## Limitações

As consultas continuam limitadas a 200 incidentes e até 100 itens por coleção conforme a API vigente. Esta entrega não cria incidentes de demonstração nem integra envio externo. O campo de referência de evidência continua armazenando texto informado; o checksum decorre desse texto e não valida bytes de arquivo. O status/registro de comunicação é interno e não comprova entrega a um destinatário.
