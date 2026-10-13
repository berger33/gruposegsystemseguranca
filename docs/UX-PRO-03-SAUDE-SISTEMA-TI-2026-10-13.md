# UX-PRO-03 — Saúde do sistema no console de TI

**Data:** 13/10/2026
**Base:** `main` SHA `ef8237823d0a20bafef97b3a2fc8266a4f41ca4d`
**Superfície:** aba “Saúde do sistema”, realmente montada por `TiConsole` no `/admin/ti`.

## Antes e depois

| Antes | Depois |
|---|---|
| A tela mostrava payload e estados quase como log bruto, com nomes de endpoint, dependência e status internos em inglês. | A consulta é escolhida por tarefa (completa, resposta do processo, prontidão ou painel restrito), com explicação do escopo e estado/resumo em português. |
| Erros de leitura e falhas de rede eram texto genérico; histórico e estado atual compartilhavam a mesma mensagem. | Carregamento, vazio, falha e acesso negado são separados para a consulta atual e o histórico, cada um com nova tentativa. O resultado 503 da rota de prontidão continua visível como “Não pronto”, não como sucesso saudável. |
| Verificações, métricas e JSON técnico disputavam a mesma área; detalhes de latência, fila, integrações e observabilidade eram compactados. | Estado geral e métricas aparecem primeiro, dependências em cartões e JSON/metadados em detalhes técnicos expansíveis. O histórico diferencia verificações de mudanças de estado. |
| Cores fixas e estilos inline não acompanhavam bem o tema da área; controles e textos compactos dificultavam telas pequenas e teclado. | Estilos usam tokens semânticos do console, foco visível, rótulos persistentes e grades responsivas. |

## Contratos e comportamento preservados

- Preservadas as consultas já usadas: `GET /api/health`, `/api/health/live`, `/api/health/ready`, `/api/admin/operational` e `/api/admin/operational/history?limit=50`.
- O seletor mantém os quatro modos; a aba de histórico continua restrita a sessão TI/Administração. O gate da página e as verificações de mesma origem e papel do servidor não foram alterados.
- A prontidão mantém tratamento próprio de HTTP 503 com payload de diagnóstico. Liveness continua significando somente que o processo responde; não é apresentado como verificação das dependências.
- Permanecem a auditoria existente da consulta operacional, limite de 50 itens do histórico, dados de latência, estado, degradação, motivos e metadados retornados. O JSON permanece acessível em detalhes técnicos.
- Nenhum endpoint, payload, papel, permissão, tabela, migração, dado, agendamento ou integração foi alterado. Nenhum componente órfão foi montado.

## Validação

- Teste focal `node --test tests/ux-pro-03-ti-healthcheck-ui.test.mjs`: 4/4 aprovados.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; 105 páginas geradas.
- `node scripts/ux-pro-00-inventory.mjs --check`: aprovado; 100 rotas reconciliadas.
- `git diff --check`: aprovado.
- `npm test`: 921 aprovados e 3 falhas em 924 testes. As falhas são limitações conhecidas de `EPERM` do Windows ao criar symlinks nos testes `qa-backup-coverage-inventory`, `qa-cli-v2-local-provider` e `qa-cli-v2-transfer`; a `QA baseline` no GitHub/Linux precisa confirmar o gate completo.
- Revisão estática desktop/mobile considerando viewports de 320/390/768/1440 CSS px; as grades colapsam aos 900/650 px. Não houve inspeção autenticada renderizada nesses viewports.
- Tema dia/noite: as cores e superfícies usam os tokens administrativos; revisão estática, sem captura autenticada.
- Teclado: seletor e botões nativos com rótulos, detalhes via `summary`, foco visível em controles; não houve travessia manual autenticada.
- Não houve aceite humano nem inspeção visual manual nesta sessão.

## Limites

O histórico é o conjunto mais recente retornado pelo serviço (até 50 nesta interface), não um monitoramento contínuo nem um SLA. A rota pública de prontidão ainda persiste as verificações conforme o servidor existente. Metadados e `error_sanitized` são renderizados como diagnósticos, sem afirmar que seus campos não disponíveis estão zerados. Não houve validação visual autenticada até o momento.
