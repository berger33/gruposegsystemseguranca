# UX-PRO-03 — Notificações no console de TI

**Data:** 13/10/2026  
**Base:** `main` em `ea3042d5648a07f44d49b0876ad0c174e348bc29`  
**Superfície:** opção existente **Notificações** no console `/admin/ti`, já montada por `TiConsole`.

## Antes e depois

| Antes | Depois |
|---|---|
| Rótulos de interface exibiam valores internos em inglês (`recipientKind`, `channel`, `retry`, status) e o formulário não oferecia todos os canais e tipos aceitos pelo servidor. | Campos e estados aparecem em português; as opções refletem os valores já aceitos pela API. Destinatário não sistêmico exige e-mail porque a tela não coleta ID de destinatário. |
| Formulário, fila e ações estavam misturados numa seção com estilos inline; mensagens usavam `alert()` e erros de carregar fila podiam parecer fila vazia. | Formulário, explicação operacional e itens recentes são grupos separados. Carregando, vazio, indisponibilidade, sessão expirada/acesso negado e sucesso são estados distintos; erros de rede não viram fila vazia. |
| A ação de processar mostrava apenas uma contagem, sem distinguir envio externo de registro em caixa local ou falha. | O resultado separa registros confirmados pelo provedor, caixa local e falha/ausência de provedor. A interface declara que enfileirar ou processar não prova entrega externa. |
| Tabela densa, sem tema consistente, feedback por ação ou responsividade clara. | Tabela rolável e focável por teclado, ações com estado ocupado, detalhes técnicos recolhidos, alvos mínimos de 44 px e tokens de tema responsivos para claro/escuro. |

## Contratos e funcionamento preservados

- Permanecem as chamadas existentes: `GET /api/admin/notifications?limit=50`, `POST /api/admin/notifications`, `POST /api/admin/notifications/{id}/retry` e `POST /api/admin/notifications/process`.
- O payload de inclusão preserva `recipientKind`, `recipientEmail`, `channel`, `template`, `payload` e `dedupKey`; nenhuma rota, handler, esquema, estado de fila, autorização ou regra de reprocessamento foi alterada.
- A tela continua no gate existente de TI/admin. O servidor continua exigindo mesma origem e sessão administrativa; processamento manual conserva a regra de papel `ti`, `admin` ou `marcelo`, e auditoria segue no serviço da fila.
- Retry segue disponível apenas para `failed`/`dead`. O lote manual continua limitado pelo serviço a 10 itens.
- `local_outbox` é identificado como registro local, nunca como envio. O estado `sent` só é descrito como confirmado pelo provedor quando retornado pelo serviço. Não foi configurado nem testado SMTP, WhatsApp, SMS, push ou webhook.
- Não foram montados componentes órfãos, criado dado demonstrativo no banco, nem alterados configuração, segredo, migração ou funcionamento local.

## Validação e evidências

- Teste focal `node --test tests/ux-pro-03-ti-notifications-ui.test.mjs`: 4/4 aprovados, cobrindo montagem e gate, endpoints/payloads, estados honestos, opções aceitas, acessibilidade estrutural, tokens e breakpoints.
- `npm run typecheck`: aprovado após os ajustes finais.
- `npm run build`: aprovado após os ajustes finais; Next.js compilou e gerou as 105 páginas.
- Inventário `node scripts/ux-pro-00-inventory.mjs --check`: estava desatualizado no início da fatia. `node scripts/ux-pro-00-inventory.mjs` regenerou os CSVs versionados em 13/10; a checagem final passou e confirmou 100 entradas de rota.
- `git diff --check`: aprovado no fechamento.
- `npm test`: 912 aprovados e 3 falhas em 915 testes. As falhas coincidem com as limitações conhecidas deste checkout Windows ao criar symlinks (`EPERM`) nos testes de inventário de cobertura de backup e dos fluxos CLI v2 local provider/transfer. O gate obrigatório `QA baseline` roda em `ubuntu-latest` e precisa passar integralmente na PR; a execução local não substitui esse check.
- No primeiro commit da PR #203, os 30 checks publicados pelo GitHub concluíram com sucesso, incluindo `QA baseline` (`static-and-smoke`), testes focais e integrações PostgreSQL/browser. A documentação foi atualizada após essa execução; confirmar os checks novamente no SHA final antes do merge.
- Revisão estática de layout: breakpoints 520/760 px (com herança do shell TI), tokens semânticos compartilhados e foco visível em controles/tabela/diagnóstico. A tabela usa rolagem contida; no celular o formulário vira uma coluna. A matriz global segue cobrindo viewports 320/390/768/1440 px.
- **Validação visual manual não realizada:** não houve sessão autenticada com dados fictícios para inspecionar a tela nos quatro viewports, alternar tema dia/noite e percorrer todos os controles via teclado. As afirmações acima são revisão de código e teste estrutural, não evidência de navegador nem aceite humano. Não há captura antes/depois.
- Limite conhecido: serviço responde no máximo 50 itens nesta consulta; não foi alterada nem acrescentada paginação. Contadores de situação são calculados sobre os itens exibidos, enquanto o total é o total devolvido pela API.

## Próxima fatia UX-PRO-03

Reavaliar a próxima superfície técnica realmente montada na `main` e seu contrato atual. Não assumir ordem fixa de inventário: conferir histórico e componentes presentes, escolher uma tela restante (por exemplo Privacidade ou fontes RAG), melhorar somente essa tarefa, abrir PR separada e preservar a mesma regra de não mesclar com checks obrigatórios pendentes.
