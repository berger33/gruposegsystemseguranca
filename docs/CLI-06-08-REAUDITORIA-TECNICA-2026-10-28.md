# CLI-06..08 — fatia de evidência técnica (28/10/2026)

## Escopo

Esta fatia adiciona evidência focal à jornada de cliente para CLI-05 (chamados restritos à conta com trilha de status, no teste já existente), CLI-06 (ciclo de status/reagendamento de visita), CLI-07 (listagem da agenda com isolamento por conta) e CLI-08 (visibilidade do relatório revisado e ciência/aceite do cliente). Não é reauditoria integral nem aceite humano.

## Evidência executada

`npm run test:l08-delivery:pg` — PostgreSQL descartável, HTTP real e Chromium: **52/52** testes passaram. A subprova nova em `tests/client-space.integration.test.mjs` verifica:

- visita inserida para a conta A listada pela sessão A e rejeição de leitura da conta B;
- reagendamento pelo cliente persistido com status `rescheduled` e trilha `client_visit_status_audit`;
- relatório `draft` oculto do cliente, enquanto relatório `approved` é exibido;
- reconhecimento do relatório pelo cliente, registro da trilha `client_report_status_audit` e repetição idempotente da ação.

O workflow registra explicitamente que a fatia cobre apenas essa parte cliente de CLI-06..08. Fluxos administrativos completos de criação, revisão, aprovação, publicação, interface e jornadas por todos os papéis continuam fora da prova.

## Limites e estado

- Não houve mudança de implementação funcional; a alteração é de teste e escopo declarado do gate.
- Não afirmar implementação integral de CLI-06/07/08, aceite humano, UAT ou prontidão de produção.
- CLI-02/03/05 e partes staff/UI de CLI-06..08 continuam pendentes de prova focal; demais pendências da matriz permanecem.
- A classificação `mencionado_em_gate` do inventário 222 é referência técnica, não promoção a aceite nem reauditoria integral.
