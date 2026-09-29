# Continuação Arena — CRM-07 (prazo, paginação, delegação) após CRM-09

Data da retomada: 2026-09-29. Branch fixa da sessão:
`arena/01a0eeb7-gruposegsystemseguranca`.

## Estado de entrada

- Base conferida: `942b3fc7a15898708c2545642ab46cc792be73bc` em `HEAD` da
  branch e `main` no início da sessão (merge do PR #20, CRM-09).
- L04 permanece parcial conforme `docs/ESTADO-EXECUCAO-LOCAL.md`.
- Próxima migração livre confirmada no disco: 109; 001–108 permanecem
  imutáveis.
- L05 não deve começar: L04 segue parcial.
- Fora desta entrega, por decisão registrada: CRM-10, automação de
  mensagens, SMTP, calendário/lembretes adicionais, hospedagem externa,
  Windows e aceite humano.

## Decisões CRM-07 registradas antes da rota

Decisão de negócio desta sessão: **delegação explícita passa a existir**.
A pendência "definição explícita de equipe" do checklist fica resolvida
assim:

1. **Sem visibilidade de equipe ampla.** Não existe fila compartilhada nem
   diretório de tarefas de terceiros. A única ponte entre comerciais é a
   delegação explícita, tarefa a tarefa, com aceite do destinatário.
2. **Quem delega:** somente o responsável pela oportunidade (ou o criador
   enquanto não há responsável), sobre tarefa da própria oportunidade.
   Papel administrativo (admin/Marcelo/TI/RH) não delega nem recebe: a
   delegação é entre identidades staff ativas com papel `comercial`.
3. **Destinatário por e-mail exato**, como no convite de CRM-08. Erro
   genérico único (`delegate_not_available`) para destinatário inexistente,
   papel não-comercial, identidade inativa ou autodelegação — a rota não
   funciona como oráculo de diretório de staff.
4. **Aceite obrigatório.** A delegação nasce `pendente`; o destinatário
   aceita ou recusa pela própria visão "Tarefas delegadas a mim". Só o
   aceite transfere a responsabilidade da tarefa (`responsible_id`);
   a recusa devolve o controle pleno ao dono. Enquanto `pendente`, o dono
   pode revogar; depois de `aceita`, não há revogação nesta fatia.
5. **Depois do aceite:** o dono da oportunidade conserva leitura da tarefa
   (a oportunidade continua dele), mas as transições de estado passam a ser
   exclusivas do delegado, pela rota pessoal de delegadas. O delegado não
   ganha nenhum outro acesso à oportunidade (detalhe, interações, visitas,
   cadências e anexos continuam com a borda anterior).
6. **Contexto mínimo exposto ao delegado:** título/prazo/prioridade/estado
   da tarefa, título da oportunidade, nome da empresa e nome de quem
   delegou. Nada de valores, notas, interações ou contatos.
7. **Tarefa de cadência (CRM-09) não é delegável**: modelos e aplicações são
   privados do comercial; delegar o passo materializado contornaria essa
   política.
8. **Edição de prazo:** apenas pelo responsável atual da tarefa enquanto ela
   está `aberta`/`em_andamento`, com `expected_version` (versão otimista,
   coluna nova com gatilho de incremento). Tarefa com delegação `pendente`
   ou `aceita` não é editável pelo dono. Cada PATCH executa uma única
   operação (transição de estado OU edição de prazo), nunca as duas.
9. **Paginação real** na listagem de tarefas: `limit` 1–100 (padrão 25),
   `offset` 0–10000 e `total`, como nas interações. Filtros no servidor:
   `status`, busca `q` por título (curinga escapado) e `overdue=1`.
10. **Auditoria transacional** para cada mutação nova
    (`crm_task_update`, `crm_task_delegate`, `crm_task_delegation_revoke`,
    `crm_task_delegation_accept`, `crm_task_delegation_decline`,
    `crm_task_delegated_status`); falha de auditoria reverte a mutação.
11. **Rota legada de detalhe** passa a listar as tarefas da oportunidade do
    dono mesmo depois do aceite (a tarefa delegada não pode "sumir" do
    dono); a borda para terceiros permanece.

## Entrega deste recorte

- Migração `109-crm-task-delegation.sql` (versão otimista, campos de
  delegação, índice parcial, gatilho de versão e novas ações de auditoria).
- API `src/server/crm-task-api.mjs` reescrita como objeto de handlers:
  - `GET/POST /api/crm/opportunities/:id/tasks` (paginação + filtros);
  - `PATCH /api/crm/opportunities/:id/tasks/:taskId` (estado OU prazo);
  - `POST/DELETE /api/crm/opportunities/:id/tasks/:taskId/delegation`;
  - `GET /api/crm/tasks/delegated`;
  - `POST /api/crm/tasks/delegated/:taskId/response`;
  - `PATCH /api/crm/tasks/delegated/:taskId`.
- UI `/admin/crm`: `OpportunityTasks.tsx` (paginação, busca, filtro de
  estado, vencidas no servidor, edição de prazo, delegação/revogação) e
  novo `MyDelegatedTasks.tsx` (aceite/recusa e execução), sempre visível
  como a agenda pessoal. Revisão do kanban: busca por título, filtro de
  prioridade e alternância kanban/tabela nas oportunidades.
- Gate novo dentro de `tests/l04-delivery.integration.test.mjs` (cenário 6).

## Evidência de retomada/fechamento

```bash
npm ci
node scripts/qa-wave0-static.mjs
npm run test:migrations:pg
npm run test:l04-delivery:pg
npm test
npm run typecheck
npm run build
```

Os gates de banco recusam `DATABASE_URL`/`DATABASE_MIGRATION_URL` externas e
usam PostgreSQL descartável, HTTP real e Chromium sem
`--disable-web-security`. SQL de teste é apenas fixture, asserção ou falha
de auditoria injetada.

## Próximo passo

Não iniciar L05. Continuam pendentes em L04: revisão campo a campo de
CRM-01..06, conflito de horário e vínculo PUB-04 em CRM-08, lacunas
PUB-02/05/06/07/08/09/10 e CRM-10 (carteira, fora desta entrega por
decisão). Automação de mensagens segue exigindo autorização, opt-out
operacional e provedor.
