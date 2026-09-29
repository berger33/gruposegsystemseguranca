# Continuação Arena — L04 após entregar a agenda CRM-08

## Objetivo e fonte

Continue `berger33/gruposegsystemseguranca` somente na branch Arena atribuída à
sessão. Leia `docs/EXECUCAO-ENTREGA-LOCAL.md`, `docs/PLANO-MESTRE-IMPLEMENTACAO.md`,
`docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e
`docs/CHECKLIST-ENTREGA-LOCAL.md` antes de alterar código.

O roteiro L00–L10 tem 222 requisitos. SMTP e hospedagem externa continuam fora
da entrega local. L04 permanece **PARCIAL**: não avance para L05 enquanto as
lacunas combinadas não forem resolvidas ou receberem mudança explícita de escopo.

## Base conferida e patch desta continuação

- Base: `main` em `8b3d14f8e9697daf7f1f7b7d018ae32ac84c3efb` (merge do PR #17).
  Comece conferindo o SHA atual da branch Arena e de `main`; não restaure refs
  históricas nem use `927cb8d`/PR #13/#14 como base.
- Código do recorte CRM-08: `7ddd659` — `feat(crm-08): visit and meeting agenda
  with responsible, participants and audit`. Documentação/evidências no commit
  seguinte da mesma branch.
- Escolha executada: **Opção B**, agenda de visitas/reuniões. CRM-09 e CRM-10
  não foram iniciados.
- **Próxima migração livre: 108.** Confirme no disco antes de usar. Não edite
  001–107.

### Entregue no CRM-08

- Política de escopo decidida e registrada **antes** da rota (cabeçalho da
  migração 107, cabeçalho de `src/server/crm-visit-api.mjs` e evidências):
  - responsável pela oportunidade agenda, edita, reagenda, confirma, conclui,
    cancela e gerencia participantes;
  - participante convidado vê apenas as visitas em que foi incluído e responde
    somente por si (`confirmado`/`recusado`);
  - papel administrativo não é bypass; nenhum diretório de staff é exposto
    (convite por e-mail exato, erro genérico para inexistente/não-staff/inativo);
  - reagendar zera todas as confirmações e devolve a visita a `solicitada`;
  - cancelar exige motivo (também no banco); `realizada`/`cancelada` são finais.
- Rotas autenticadas, de mesma origem e com versão otimista (`expected_version`):
  - `GET/POST /api/crm/opportunities/:id/visits` (paginação real 1–100);
  - `PATCH /api/crm/opportunities/:id/visits/:visitId`;
  - `POST /api/crm/opportunities/:id/visits/:visitId/participants`;
  - `DELETE /api/crm/opportunities/:id/visits/:visitId/participants/:identityId`;
  - `POST /api/crm/opportunities/:id/visits/:visitId/response`;
  - `GET /api/crm/visits/agenda` (agenda pessoal, responsável ou convidado).
- Migração 107: versão, `cancel_reason`/`cancelled_at`/`cancelled_by_id`,
  `reschedule_count`/`rescheduled_at`, tabela `crm_visit_participants` com
  resposta individual e ampliação das ações de auditoria.
- Auditoria transacional para criar, editar, mudar situação, reagendar,
  cancelar, convidar, remover convidado e responder.
- UI: `OpportunityVisits.tsx` (agenda da oportunidade) e `MyAgenda.tsx` (agenda
  pessoal), montadas em `/admin/crm`.
- Correção do vazamento residual: `GET /api/crm/opportunities/:id` não expõe
  mais `visits` fora da política.

### Provas já executadas neste recorte

- `npm ci`: 82 pacotes, 0 vulnerabilidades.
- `node scripts/qa-wave0-static.mjs`: 5/5 (001–107 contínuas e agendadas).
- `npm run test:migrations:pg`: 107/107 na primeira aplicação e no replay, 506
  tabelas, clone TEMPLATE e controle negativo de checksum aprovados.
- `npm run test:l04-delivery:pg`: 4/4 com PostgreSQL descartável, HTTP real e
  Chromium real (sem `--disable-web-security`). O cenário CRM-08 cobre negação
  por sessão/papel/propriedade/origem/método, entradas inválidas, jornada de UI
  do responsável, confirmação do convidado em navegador separado, tentativas
  negadas do convidado, conflito de versão, reagendamento que zera confirmações,
  cancelamento com motivo, estados finais, ordem completa da auditoria e
  rollback de auditoria injetada.
- `npm test`: 186/186; `npm run typecheck`: 0 erros; `npm run build`: 70 rotas.

## Lacunas reais após a Opção B

CRM-08 **não** está concluído: faltam lembretes/notificações da agenda (dependem
de provedor e de decisão de opt-out), visão de calendário por semana/mês,
detecção de conflito de horário do responsável e vínculo com os estados de
visita do PUB-04 (`lead_visit_confirm`/`lead_visit_cancel`). Integração com
calendário externo segue fora do escopo local.

CRM-07 continua parcial: tarefas seguem pessoais, sem delegação/equipe, edição
de prazo ou paginação; kanban, tabela, busca e filtros completos precisam de
revalidação. `stages` da rota legada de detalhe ainda não tem a borda de
propriedade que tarefas, interações e visitas já têm. CRM-09 e CRM-10 não foram
implementados como jornadas. PUB-02/05/06/07/08/09/10 e a revalidação campo a
campo de CRM-01..06 continuam pendentes. Sem aceite Windows/humano, SMTP ou
hospedagem externa.

## Próximo recorte — escolha única recomendada

**Opção C — CRM-09, cadências de prospecção como tarefas manuais.** Não misture
com CRM-10 nem com a visão de calendário do CRM-08 na mesma sessão.

Entregue a cadência como sequência de tarefas **criadas manualmente** a partir
de um modelo: passo, intervalo em dias, canal sugerido e responsável. Nada de
envio automático de mensagem nesta fatia. Antes de escrever a rota, registre
explicitamente: quem pode criar/editar modelos de cadência, se a cadência pode
ser aplicada a oportunidade de outra pessoa (a resposta padrão é não), como o
opt-out do contato bloqueia passos futuros e o que acontece com os passos
pendentes quando a oportunidade é ganha, perdida ou o contato é desativado.
Qualquer automação de mensagem depende de autorização, opt-out e provedor
definidos — e deve ficar para depois, com decisão registrada.

Ao tocar CRM-09, resolva também, se couber no mesmo recorte, a borda de
propriedade de `stages` na rota legada de detalhe.

Depois: CRM-10 (carteira), fechamento das lacunas do CRM-07 (delegação/equipe,
prazo, paginação, kanban/busca/filtros), complementos do CRM-08 (calendário,
conflito de horário, vínculo com PUB-04), lacunas PUB e revalidação CRM-01..06.
Só depois sequer cogite L05.

## Execução e fechamento obrigatórios

1. Confirme branch, `git status`, `git log` e o número de migração no disco
   (próxima livre: **108**). Não volte a bases históricas.
2. Rode `npm ci`. Para migração, `npm run test:migrations:pg`; para CRM,
   `npm run test:l04-delivery:pg`; no fechamento, `npm test`,
   `npm run typecheck`, `npm run build` e regressões proporcionais. Os gates
   recusam `DATABASE_URL`/`DATABASE_MIGRATION_URL` externas.
3. Use PostgreSQL descartável, HTTP real e Chromium sem `--disable-web-security`.
   SQL é somente fixture/asserção/falha injetada, nunca substituto da jornada
   HTTP. O Chromium empacotado roda em `--single-process`: use um navegador por
   persona em vez de dois contextos simultâneos.
4. Teste autorizado, outro usuário, outro papel, sem sessão, origem incorreta,
   entrada inválida, persistência por recarga, conflito de versão e falha de
   auditoria. Não reduza expectativa para obter verde.
5. Não edite migrações 001–107. Não deixe `next-env.d.ts`/`tsconfig.json`
   apontando para diretórios de build de integração; descarte apenas alterações
   automáticas comprovadas.
6. Atualize `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/EVIDENCIAS-ENTREGA-LOCAL.md`,
   `docs/CHECKLIST-ENTREGA-LOCAL.md` e este prompt, crie commit coerente e
   entregue SHA, testes executados, lacunas e próximo passo. Não alegue
   conclusão de L04 por haver tela ou endpoint.
