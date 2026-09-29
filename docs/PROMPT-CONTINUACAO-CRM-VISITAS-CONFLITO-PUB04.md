# Continuação Arena — CRM-08 (conflito de horário + vínculo PUB-04)

Data da retomada: 2026-09-29. Branch fixa da sessão:
`arena/01a0eeda-gruposegsystemseguranca`.

## Estado de entrada

- Base conferida: `fd7a939e5e678da5ee0b90632c075d97e349c1eb` (`main`, merge do
  PR #21) no início da sessão.
- L04 permanece parcial conforme `docs/ESTADO-EXECUCAO-LOCAL.md`; L05 não
  começa.
- Próxima migração livre confirmada no disco: **110**; 001–109 permanecem
  imutáveis (509 tabelas).
- Gate de entrada revalidado antes de escrever código: `qa-wave0-static` 5/5 e
  `test:l04-delivery:pg` 6/6.
- Fora desta entrega, por decisão registrada: CRM-10, automação de mensagens,
  SMTP, calendário/lembretes adicionais, hospedagem externa, Windows e aceite
  humano.

## Recorte escolhido

Lacuna 2 da lista: **CRM-08 — detecção de conflito de horário do responsável e
vínculo PUB-04 (`lead_visit_confirm`/`lead_visit_cancel`)**. Calendário,
lembretes e notificação externa continuam fora.

## Decisões de política registradas ANTES da rota

### A. Conflito de horário

1. **O conflito é do responsável, não da sala.** A checagem considera apenas as
   visitas em que a identidade que está agendando é `responsible_id`. Nenhuma
   agenda de terceiro é consultada, então a resposta de conflito não vira
   oráculo da agenda alheia: a pessoa só vê o próprio compromisso.
2. **Participante convidado não gera conflito.** Um convidado pode recusar; a
   presença dele não é reserva. Bloquear por participante exporia agenda de
   terceiros e travaria o responsável por decisão de outra pessoa.
3. **Janela considerada:** `[scheduled_at, scheduled_at + duração)`. Quando a
   duração é nula (campo opcional desde 014), a política assume **60 minutos**
   para efeito de conflito — assumir zero deixaria passar sobreposição real.
   Encostar (fim exatamente igual ao início do próximo) **não** é conflito.
4. **Só visitas vivas bloqueiam:** `solicitada`, `em_agendamento` e
   `confirmada`. `realizada` e `cancelada` não reservam nada.
5. **Fail-closed, sem bypass.** O conflito devolve `409
   visit_schedule_conflict` e a mutação inteira é revertida. Não existe
   parâmetro de força, nem exceção por papel: admin/Marcelo/TI seguem a mesma
   regra. Para dobrar o horário é preciso antes cancelar ou reagendar a visita
   que já ocupa a faixa.
6. **Corrida real é serializada no banco** com `pg_advisory_xact_lock` por
   identidade responsável, dentro da transação da mutação. Sem isso, duas
   requisições simultâneas passariam as duas pela consulta e gravariam
   sobreposição.
7. A checagem roda em **criação** e em **alteração** de `scheduled_at` ou
   `duration_minutes`, e também na transição para `confirmada` (confirmar é o
   momento em que o horário vira promessa).

### B. Vínculo PUB-04

8. **A ponte é a oportunidade.** Só existe propagação quando a oportunidade da
   visita tem `public_lead_id` (lead público de PUB-03 convertido). O vínculo é
   materializado em `crm_visits.public_lead_id` no momento do agendamento e
   nunca é aceito do cliente.
9. **Propagação transacional e unidirecional (CRM → lead)** na mesma transação
   da mutação da visita:
   - visita `confirmada` → lead `confirmada`, auditoria `lead_visit_confirm`;
   - visita `realizada` → lead `realizada`, auditoria `lead_visit_confirm`;
   - visita `cancelada` → lead `cancelada` **somente se não sobrar nenhuma
     outra visita viva do mesmo lead**, auditoria `lead_visit_cancel`;
   - **reagendamento** de uma visita que já havia confirmado o lead devolve o
     lead a `em_agendamento`, auditoria `lead_status_change`. Notificação não
     promete horário sem reserva real: perdida a reserva, cai a confirmação.
10. **Lead `realizada` é congelado.** Visita nova não reabre nem cancela um
    atendimento já realizado; a propagação é ignorada silenciosamente para esse
    caso e nada é auditado como se tivesse mudado.
11. **Cada propagação escreve as três trilhas na mesma transação**:
    `public_lead_status_audit` (histórico do lead), `auth_access_audit` com a
    ação PUB-04 (`lead_visit_confirm`/`lead_visit_cancel`/`lead_status_change`)
    e `crm_visit_lead_sync` no alvo da visita. Falha de qualquer uma reverte a
    mutação da visita — a visita não muda de estado sem a trilha do lead.
12. **Sem alargamento de acesso.** A propagação não dá ao comercial nenhuma
    leitura nova sobre `public_leads` além da que `/api/admin/leads` já concede
    ao papel; o participante convidado continua sem enxergar o lead.
13. **Correção de trilha em `PATCH /api/admin/leads/:id` (PUB-04 manual):** a
    rota auditava **qualquer** transição de visita, inclusive
    `cancelada`, como `lead_visit_confirm`, e engolia a falha de auditoria com
    `try {} catch {}` — a mudança de status era confirmada sem trilha. Passa a
    mapear `confirmada`/`realizada` → `lead_visit_confirm`, `cancelada` →
    `lead_visit_cancel`, demais → `lead_status_change`, e a falha de auditoria
    passa a reverter a transição (fail-closed).

## Entrega deste recorte

- Migração **`110-crm-visit-conflict-lead-link.sql`** (aditiva): colunas
  `lead_sync_status`/`lead_sync_at` com CHECK de coerência em `crm_visits`,
  índice parcial de conflito por responsável e reafirmação do CHECK de
  `auth_access_audit` no padrão herdado (falha se a constraint pai sumir),
  acrescentando `crm_visit_lead_sync`.
- `src/server/crm-visit-api.mjs`: trava consultiva por responsável, detecção de
  sobreposição, vínculo do lead no agendamento e propagação PUB-04 auditada.
- `server.mjs`: correção do mapeamento e da atomicidade da auditoria PUB-04
  manual.
- `src/app/admin/crm/OpportunityVisits.tsx`: mensagem dedicada de conflito e
  selo do lead público vinculado com a situação propagada.
- Gate: cenário 7 em `tests/l04-delivery.integration.test.mjs`.

## Evidência de retomada/fechamento

```bash
npm ci
node scripts/qa-wave0-static.mjs
npm run test:migrations:pg
npm run test:l04-delivery:pg   # 2x consecutivas
npm test
npm run typecheck
npm run build
git diff --check
```

## Próximo passo

Não iniciar L05. Continuam pendentes em L04: revisão campo a campo de
CRM-01..06 e do kanban/tabela de CRM-05/06, notas internas dedicadas de
CRM-07, lacunas PUB-02/05 e PUB-06..10 (componentes órfãos em
`src/app/admin/ti/*Client.tsx`, conectar por domínio) e CRM-10 (fora por
decisão). Automação de mensagens segue exigindo autorização, opt-out
operacional e provedor.
