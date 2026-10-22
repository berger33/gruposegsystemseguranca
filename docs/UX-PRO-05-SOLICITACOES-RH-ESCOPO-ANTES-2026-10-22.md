# UX-PRO-05 — escopo antes: solicitação do funcionário até decisão de RH

**Data:** 2026-10-22 (America/Sao_Paulo)  
**Base:** `main` `4566b73cb568020705d01e4ce50307009e75c4d2`  
**PRs abertas na conferência:** nenhuma  
**Superfície única:** fluxo `/funcionario` → `Pedidos` → criar solicitação → `/admin/funcionarios` → `Solicitações` → decisão RH → leitura de retorno pelo titular.

## Gap confirmado na documentação e no código montado

A #209 cobriu a jornada e comprovantes sob `EmployeeTimeClock`, mas deixou explicitamente fora as decisões de RH. A documentação UX-04 e o teste existente cobrem o estado vazio e contrato HTTP da análise; não há gate navegador integrado que crie a solicitação pela sessão do funcionário, a veja na aba RH, decida e confirme que o titular vê o retorno. Os componentes reais são `RequestsTab` em `EmployeePortal.tsx` e `RequestReviews` em `RhWorkspace.tsx`; os endpoints existentes são `/api/employee/actions/request`, `/api/employee/home` e `/api/admin/hr/l03/self-requests`.

## Escopo proposto

Adicionar teste focal end-to-end com PostgreSQL descartável, API HTTP e Chromium para a sequência funcionário→RH→funcionário. Identificar defeitos observáveis no fluxo montado e corrigi-los de forma aditiva somente dentro dessas duas telas/estados. Registrar antes/depois e limitações. Nenhuma outra aba de RH/portal será incluída.

## Riscos e controles

- **Exposição entre titulares:** solicitar e conferir a resposta autenticada pertence apenas ao funcionário de teste; verificar API/DB de modo que nenhum outro titular receba o pedido.
- **Decisão RH mascarada:** testar falha da API e garantir que nada seja declarado aprovado/rejeitado sem confirmação do servidor.
- **Dados apagados:** submit deve preservar formulário em falha e limpar somente após confirmação canônica.
- **Auditoria/idempotência:** preservar `Idempotency-Key`, identidade de sessão, auditoria fail-closed e transições canônicas.
- **Contratos:** não mudar rotas, métodos, payloads, permissões, isolamento nem migrações.
- **Componentes compartilhados/gerados:** evitar CSS/UI compartilhado sem defeito medido; inventário só se a superfície registrada mudar.
- **Evidência:** massa e capturas sintéticas, sem dados pessoais reais; automatização de navegador não será apresentada como revisão manual nem aceite humano.
- **Ambiente:** gate usa cluster PostgreSQL isolado e descarte automático; nunca apontar para banco operacional.

## Validação planejada

1. Executar o teste focal contra a `main` limpa como baseline.
2. Exercitar criação pela UI autenticada de funcionário, estado/status canônico, decisão autenticada de RH e releitura do histórico pelo titular; verificar titularidade, banco e auditoria.
3. Cobrir teclado e desktop/mobile/temas em estados principais e eventual falha de escrita.
4. Após ajuste: gate focal, `npm run typecheck`, `npm test`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `git diff --check` e checks obrigatórios de CI.
5. Preservar hashes de `next-env.d.ts` e `tsconfig.json`; inventário só será regenerado se a matriz de cobertura da rota mudar.

Uma PR pequena baseada em `main`, sem merge com check falho/pendente ou revisão ausente. Esta etapa de escopo é commitada antes de qualquer edição de tela ou teste.
