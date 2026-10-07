# Ponto com localização e ajustes pelo RH

## Diagnóstico e entrega

Antes desta correção não havia captura de localização no portal do funcionário. O funcionário criava pedidos em `emp_journey_corrections`, enquanto a tela habitual de ponto do RH consultava `hr_time_corrections`. A ferramenta histórica de jornada não estava montada no painel principal e a aplicação de correções nela não era transacional. Não era correto considerar o fluxo completo entregue.

Agora:

- Funcionário → Jornada: entrada, início/fim de intervalo e saída; histórico com horário do servidor, coordenadas, precisão e identificador; acompanhamento dos pedidos de ajuste e motivos de rejeição.
- RH → Funcionários e RH → Ponto e ajustes: consulta do ponto por pessoa, marcações/localização e fila dos pedidos efetivamente criados pelos funcionários; análise, aprovação com revisão das horas e rejeição motivada.
- Registro de ponto, pedido, decisão e auditoria são transacionais. Horas de jornada atravessando meia-noite usam timestamps; intervalos não entram na soma. Jornada superior a 24h é marcada como divergente para revisão, sem truncar horas silenciosamente.
- Repetir uma marcação com o mesmo requestId e conteúdo devolve a mesma marcação; trocar conteúdo com o mesmo identificador gera conflito. O servidor serializa operações por funcionário e aceita apenas a próxima marcação possível.
- Marcações geográficas originais não podem ser atualizadas/excluídas. Aprovação preserva o resumo anterior e muda somente o resumo da jornada. Se a saída foi esquecida, o RH pode encerrar a sessão mediante ajuste explícito, vinculado ao pedido; não se cria GPS ou marcação fictícia de saída.
- Dois pedidos pendentes para o mesmo registro são recusados. Reaprovar pedido concluído é recusado. Registro alterado depois do pedido não recebe aprovação sobre um snapshot antigo; rejeite o pedido obsoleto com explicação para permitir uma nova solicitação.
- Fechamento de competência é bloqueado no banco enquanto houver sessão aberta ou pedido pendente. Competência fechada exige o fluxo de reabertura existente antes de uma alteração.

## Permissões e contratos

Cookie de funcionário continua separado do cookie staff. A identidade e a pessoa do registro vêm da sessão; não de employee_id enviado pelo navegador. Funcionário só acessa o próprio ponto e pede ajustes; não pode aprovar. Aprovação/consulta de localização requer sessão individual de papel `rh` ou `admin`, com `employees.read`/`employees.write` no escopo correspondente. TI não aprova por ter acesso ao sistema. O papel RH já recebe o conjunto padrão no mecanismo existente da migração 102; concessões revogadas continuam sendo respeitadas.

Rotas: `GET/POST /api/employee/time-clock`; pedido em `POST /api/employee/actions/time-correction`; RH em `GET/PATCH /api/admin/hr/l03/time-corrections`, `GET /api/admin/hr/l03/time-clock?employee_id=...` e `GET /api/admin/hr/l03/time-punches?employee_id=...&entry_id=...`. Aliases históricos `journey-corrections` GET/PATCH são encaminhados à mesma fronteira segura. Criação staff pelo formulário antigo foi retirada; criação manual/importação de registros continua no fluxo existente. Correções técnicas antigas `hr_time_corrections` não são a fila dos pedidos do funcionário.

## Ativação local

1. Fazer backup e parar o servidor segundo o runbook local existente.
2. Atualizar main e aplicar pelo migrador oficial todas as migrações pendentes, inclusive **176-employee-geolocation-time-clock.sql**. Não alterar migrações anteriores.
3. Construir e reiniciar a aplicação. Esta sessão não aplicou migrações, não fez build e não reiniciou o servidor operacional.
4. No navegador, usar localhost ou HTTPS. HTTP por IP da rede não oferece geolocalização em navegadores comuns. Permitir localização quando solicitado. A captura ocorre somente no clique, não há rastreamento contínuo nem envio offline de marcações.
5. Com dados fictícios: registrar entrada/intervalo/retorno/saída, pedir alteração e conferir a fila do RH. Aprovar com horas revisadas; voltar ao funcionário e conferir o status e o resumo corrigido. Repetir com rejeição e com saída esquecida.

A localização é a informada pelo navegador, com sua precisão; não comprova presença física infalivelmente. Não foi implementada cerca geográfica nem regra universal de posto/escala. Ajustes não inferem automaticamente horas extras, convenção ou folha; o RH informa as horas após revisão. Esta entrega não certifica conformidade trabalhista de um registrador eletrônico de ponto.

## Verificação executada e limites

Passaram `npm run typecheck`, sintaxe dos módulos alterados/servidor e `git diff --check`. Passou `node --test tests/employee-time-clock.focal.test.mjs`: núcleo de jornada noturna/intervalos/validação e fluxo com SQL real em PGlite **descartável**, incluindo aplicação da migração 176 sobre schema mínimo, trigger imutável/fechamento, isolamento de funcionário/unidade, origem, idempotência, aprovação, rejeição sem motivo recusada, saída esquecida e rollback por falha de auditoria. PGlite não é o banco operacional nem uma homologação de toda a cadeia 001–176.

Permanecem para Arena/Antigravity/operador: migrador completo 001–176 duas vezes em PostgreSQL descartável; concorrência real e fechamento simultâneo; build; navegador desktop/mobile/teclado e GPS real; sessão/MFA/revogação pelo servidor completo; falha de rede e repetição; revisão de competência e jornada noturna real. Não inventar aceite de Andreia/Marcelo ou resultados de testes não executados.
