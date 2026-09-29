# Prompt da próxima sessão — Grupo SEG System (entrega local, L04)

Escrito ao fim da sessão `arena/01a0eef9-gruposegsystemseguranca`
(CRM-07 residual: notas internas + campo a campo de CRM-05/06). Use este
arquivo como prompt de entrada da próxima continuação.

## Estado de entrada

- Base: `main` após o merge do PR desta fatia (conferir o SHA no disco antes
  de começar; a fatia de código é o commit da branch arena da sessão).
- Referências obrigatórias antes de qualquer código:
  `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`,
  `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e
  `docs/PROMPT-CONTINUACAO-CRM-NOTAS-KANBAN.md`.
- **L04 permanece PARCIAL. Não iniciar L05.**
- Última fatia entregue (gate 8/8 duas vezes consecutivas): notas internas
  dedicadas de CRM-07 (`crm_opportunity_notes`, `crm-note-api.mjs`,
  `OpportunityNotes.tsx`) e campo a campo de CRM-05/06 — todos os campos de
  oportunidade em criação/manutenção com unidade validada contra a empresa,
  atribuição imutável (origem/campanha/responsável/lead), borda pessoal nas
  rotas de oportunidade (antes abertas a qualquer staff), motivo de perda
  obrigatório também no banco, reabertura auditada com motivo e ação
  dedicada, proibição de troca direta ganho↔perdido, flags coerentes por
  CHECK e busca no servidor com curinga escapado.
- Migrações 001–111 aplicadas e IMUTÁVEIS; próxima migração livre: **112**
  (confirmar no disco antes de criar). 510 tabelas.
- **CRM-05, CRM-06 e CRM-07 estão pronto_local** (provados por gate campo a
  campo). CRM-08 tem agenda, conflito e vínculo PUB-04.
- Fora desta entrega, por decisão registrada: CRM-10, automação de mensagens,
  SMTP, calendário/lembretes adicionais, hospedagem externa, Windows e aceite
  humano. Não publicar em produção nem contratar serviços.

## Lacunas restantes de L04 (escolher UMA fatia vertical)

1. **CRM-08 residual:** visão de calendário por período/semana na agenda
   pessoal. Lembretes/notificações continuam dependendo de provedor — só
   entram com autorização e opt-out operacional.
2. **Revalidação campo a campo de CRM-01..04** com cenários dedicados no gate
   (CRM-02 precisa de tela de contato com função
   decisor/influenciador/usuário/financeiro com preferências e restrições;
   unidade de CRM-01 segue sem rota de criação — hoje só fixture).
3. **Lacunas PUB:** PUB-02/05 e PUB-06..10 (CMS, temas, SEO, montador de
   pacote, painel de métricas de origem/conversão — componentes órfãos em
   `src/app/admin/ti/*Client.tsx`, conectar por domínio, nunca despejar na
   página de TI).
4. **CRM-10 (carteira):** fora por decisão registrada — reabrir apenas com
   decisão explícita do proprietário.

## Riscos residuais anotados (não corrigidos, declarados)

- A busca de empresas (CRM-01) segue com curinga não escapado (ILIKE cru).
- Rotas de empresa/contato/importação em `crm-api.mjs` ainda usam o auxiliar
  de auditoria que engole falha (`try/catch` mudo) — mutação sem trilha não
  reverte. As rotas de oportunidade/notas são transacionais desde a 111.
- `handleAdminLeadStatus` em `server.mjs`: padrão de auditoria "solta" em
  transação multi-instrução (comportamento confirmado correto hoje; o CHECK
  da 103 fecha a causa atual, mas o padrão não foi hardenizado).

## Método (inegociável)

- Registrar as decisões de política ANTES da rota, em
  `docs/PROMPT-CONTINUACAO-<fatia>.md`; sem bypass administrativo;
  fail-closed.
- Migração nova apenas aditiva; preservar o padrão do CHECK de
  `auth_access_audit` (falhar se a constraint pai sumir, nunca afrouxar);
  CHECKs novos sobre tabela povoada entram `NOT VALID` (valem para escrita
  nova sem reescrever o passado).
- Auditoria transacional: falha de auditoria injetada deve reverter a
  mutação.
- Gate dentro de `tests/l04-delivery.integration.test.mjs`: HTTP real +
  PostgreSQL descartável + Chromium real sem `--disable-web-security` (um
  navegador por persona; SQL só para fixture/asserção/falha injetada).
- Atualizar `scripts/migrate-site-visual.mjs` (manifesto) e
  `scripts/qa-wave0-static.mjs` (`latestMigration`) se criar migração.
- Cuidado conhecido: o dev server do gate pode reescrever `tsconfig.json`
  (`.next/integration-l04`) — restaurar com `git checkout` antes do commit.
- Se um cenário preexistente do gate quebrar por causa de uma regra nova,
  ajustar o cenário e **declarar o ajuste** na documentação — nunca afrouxar
  a regra.
- Detalhe de UI conhecido: rótulo `<label>` que envolve controle já
  preenchido carrega o valor no nome acessível (React espelha `defaultValue`
  como texto da textarea) — usar casamento por substring nos `getByLabel` de
  controles preenchidos.
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
