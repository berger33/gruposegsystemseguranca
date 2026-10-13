# UX-PRO-03 — Registros de integração no console de TI

**Data:** 13/10/2026
**Base:** `main` / `origin/main` em `8e3aec1b330b9b427366ec7d5175b83599b53e2b`
**Superfície:** `/admin/ti` → aba **Registros de integração**, renderizada por `TiConsole` e protegida por `AdminGate` para `ti` e `admin`.

## Situação confirmada antes da edição

O componente `IntegrationLogClient` já era importado e renderizado pela aba de TI. As cinco famílias de rotas chamadas pelo cliente existem em `server.mjs`; o serviço exige mesma origem, sessão e papel `admin`/`ti`. Portanto, esta fatia melhora uma tela existente e não promove um componente órfão.

Há uma divergência histórica: `docs/INVENTARIO-ADMIN-TI.md`, produzido em 02/10, ainda classifica o arquivo como não importado e informa zero APIs. Essa classificação não corresponde ao `TiConsole` atual. O inventário de 13/10 registra 100 rotas e foi regenerado após a alteração; a atualização não muda a contagem de rotas.

O serviço atual tem limites operacionais relevantes para a apresentação: ao criar uma tarefa, grava uma sequência simulada e a marca como concluída sem importar/exportar/sincronizar um sistema externo; ao registrar uma delivery, cria os registros de delivery e log com status demonstrativo sem fazer chamada de rede. O formulário de conciliação armazena números fornecidos pela pessoa, sem buscar ou comparar as bases. Uma URL HTTP cadastrada e uma assinatura interna não provam que um provedor recebeu a mensagem.

## Antes e depois

| Antes | Depois |
|---|---|
| Uma página longa misturava tarefas, logs, configurações, deliveries e conciliação em listas compactas. | Quatro tarefas acessíveis por botões com estado selecionado: tarefas, registros técnicos, webhooks/deliveries e conciliação. Cada área tem título, explicação, contagem e lista próprios. |
| Placeholders em inglês substituíam rótulos; controles não tinham orientação persistente e a grade fixa não se adaptava bem a telas estreitas. | Campos rotulados em português, instruções e unidades junto aos campos, grupos responsivos e tabelas com rolagem horizontal contida e foco por teclado. |
| Falhas de consulta podiam aparecer como listas vazias; não havia estados confiáveis para carregamento, falha ou acesso negado. | Cada coleção tem estados de carregamento, vazio, indisponibilidade e acesso negado, com nova tentativa. A falha de uma coleção não mascara as demais. Operações mostram feedback de sucesso/falha. |
| Jobs e deliveries apareciam como integração funcional, apesar de a API concluir/registrar os itens localmente sem tráfego externo. | Avisos na página, nas tarefas e nos formulários dizem que o resultado é demonstrativo e interno; conciliação é identificada como contagem informada, não comparação automática. |
| Um segredo conhecido vinha pré-preenchido no cadastro de webhook; mensagens e detalhes técnicos ficavam misturados à operação. | O segredo começa vazio, usa campo de senha e não é repetido após o cadastro. Logs e mensagens técnicas ficam em tarefa própria ou detalhes recolhíveis. |

## Contratos e comportamento preservados

- Mantidos `GET/POST /api/admin/integrations/jobs`, `GET /api/admin/integrations/logs`, `GET/POST/PATCH /api/admin/integrations/webhooks`, `GET/POST /api/admin/integrations/webhooks/deliveries` e `GET/POST /api/admin/integrations/reconciliation`.
- Os nomes e estruturas de payload continuam usando os campos atuais: `job_type`, `source`, `target`, `total_records`, `rate_limit_per_minute`, `max_retries`, `file_reference`, `name`, `url`, `secret`, `events`, `timeout_ms`, `webhook_id`, `event_type`, `payload`, `total_source`, `total_target`, `matched`, `mismatched`, `missing_in_target` e `missing_in_source`.
- Não foram alterados handlers, permissões, campos persistidos, ciclo de vida, auditoria ou limites do servidor. `AdminGate`, `sameOrigin`, sessão e os papéis exigidos pela API permanecem como estavam.
- URLs, eventos, limites e status continuam sendo dados existentes. As mensagens da interface não afirmam envio externo, assinatura verificada pelo destino ou conciliação automática.

## Validação

- Teste focal `node --test tests/ux-pro-03-ti-integration-logs-ui.test.mjs`: **4/4 aprovados**; cobre montagem/gates, rotas e campos preservados, honestidade do modo demonstrativo, estados e tokens/breakpoints/foco.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; Next compilou e gerou 105 páginas.
- `node scripts/ux-pro-00-inventory.mjs --check`: aprovado após regenerar o CSV de inventário; permanecem **100 entradas de rota**.
- `git diff --check`: aprovado antes da revisão final.
- `npm test`: **929 aprovados e 3 falhas em 932**. Todas são `EPERM` ao criar symlinks em `tests/qa-backup-coverage-inventory.test.mjs`, `tests/qa-cli-v2-local-provider.test.mjs` e `tests/qa-cli-v2-transfer.test.mjs` no ambiente Windows. Não são falhas do teste focal; a suíte `QA baseline` no GitHub/Linux precisa concluir verde para permitir merge.
- Revisão estática considerou breakpoints CSS de 900 px e 650 px, cores semânticas do tema administrativo, rótulos e foco visível. A matriz global enumera os viewports 320, 390, 768 e 1440 px.
- A validação manual no navegador foi tentada, mas o runtime de automação do desktop falhou duas vezes ao inicializar (`failed to write kernel assets: The system cannot find the path specified`). Portanto, não há captura visual nem inspeção renderizada nos viewports, alternância real de tema ou percurso manual por teclado. Breakpoints e cores foram revisados somente no código; nenhum aceite humano foi realizado.

## Limites restantes

Esta fatia não implementa provedores externos, execução real de jobs, retries reais, chamadas de webhook, validação de assinatura no destino, importação/exportação de arquivos nem conciliação automática. Essas capacidades não devem ser apresentadas como concluídas. Consultas continuam limitadas a 200 itens (jobs, logs e deliveries) e 100 itens (webhooks e relatórios), conforme os endpoints atuais; filtros e paginação não foram acrescentados.

## Próxima fatia UX-PRO-03

Reconciliar o código da `main` e relatórios existentes. Escolher uma única superfície técnica ainda montada, sem ativar componentes órfãos. Candidatas a reavaliar incluem `RAG/fontes` e componentes de governança/auditoria que estejam realmente renderizados. Preservar contratos, permissões e operação local; abrir PR pequena e só integrar com revisão concluída e todos os checks obrigatórios verdes.
