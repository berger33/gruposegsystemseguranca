# Prompt da próxima sessão — Grupo SEG System (entrega local, L04)

Escrito ao fim da sessão `arena/01a0eeda-gruposegsystemseguranca`
(CRM-08: conflito de horário + vínculo PUB-04). Use este arquivo como prompt
de entrada da próxima continuação.

## Estado de entrada

- Base: `main` após o merge do PR desta sessão (CRM-08 conflito/PUB-04).
- Referências obrigatórias antes de qualquer código:
  `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`,
  `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e
  `docs/PROMPT-CONTINUACAO-CRM-VISITAS-CONFLITO-PUB04.md`.
- **L04 permanece PARCIAL. Não iniciar L05.**
- Última fatia entregue (gate 7/7 duas vezes consecutivas): conflito de
  horário do responsável (fail-closed, sem bypass, serializado por trava
  consultiva) e vínculo PUB-04 transacional CRM → lead
  (`lead_visit_confirm`/`lead_visit_cancel`/`lead_status_change`), com
  correção do mapeamento e da atomicidade da auditoria em
  `PATCH /api/admin/leads/:id`.
- Migrações 001–110 aplicadas e IMUTÁVEIS; próxima migração livre: **111**
  (confirmar no disco antes de criar). 509 tabelas.
- Fora desta entrega, por decisão registrada: CRM-10, automação de mensagens,
  SMTP, calendário/lembretes adicionais, hospedagem externa, Windows e aceite
  humano. Não publicar em produção nem contratar serviços.

## Lacunas restantes de L04 (escolher UMA fatia vertical)

1. **CRM-07 residual:** revisão campo a campo do kanban/tabela herdados de
   CRM-05/06 (busca/prioridade/tabela cobertas só no ponto usado pelo gate) e
   notas internas dedicadas.
2. **CRM-08 residual:** visão de calendário por período/semana na agenda
   pessoal. Lembretes/notificações continuam dependendo de provedor — só
   entram com autorização e opt-out operacional.
3. **Lacunas PUB:** PUB-02/05 e PUB-06..10 (CMS, temas, SEO, montador de
   pacote, painel de métricas de origem/conversão — componentes órfãos em
   `src/app/admin/ti/*Client.tsx`, conectar por domínio, nunca despejar na
   página de TI).
4. **Revalidação campo a campo de CRM-01..06** com cenários dedicados no gate.

## Método (inegociável)

- Registrar as decisões de política ANTES da rota, em
  `docs/PROMPT-CONTINUACAO-<fatia>.md`; sem bypass administrativo;
  fail-closed.
- Migração nova apenas aditiva; preservar o padrão do CHECK de
  `auth_access_audit` (falhar se a constraint pai sumir, nunca afrouxar).
- Auditoria transacional: falha de auditoria injetada deve reverter a
  mutação.
- Gate dentro de `tests/l04-delivery.integration.test.mjs`: HTTP real +
  PostgreSQL descartável + Chromium real sem `--disable-web-security` (um
  navegador por persona; SQL só para fixture/asserção/falha injetada).
- Atualizar `scripts/migrate-site-visual.mjs` (manifesto) e
  `scripts/qa-wave0-static.mjs` (`latestMigration`) se criar migração.
- Cuidado conhecido: o dev server do gate pode reescrever `tsconfig.json`
  (`.next/integration-l04`) — restaurar com `git checkout` antes do commit.
- Documentar honestamente ao final (estado, checklist, evidências e prompt da
  sessão seguinte). Não marcar como concluído o que não foi provado por gate.

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
