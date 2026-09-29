# Prompt da próxima sessão — Grupo SEG System (entrega local, L04)

Escrito ao fim da integração da fatia de notas internas/campo a campo de
CRM-05/06 (sessão `arena/01a0eef9-gruposegsystemseguranca`, PR #25) com a
fatia de calendário de CRM-08 (sessão `arena/01a0ef36-gruposegsystemseguranca`,
PR #24). Use este arquivo como prompt de entrada da próxima continuação.

## Estado de entrada

- Base: `main` após os merges dos PRs #24 e #25 (conferir o SHA no disco antes
  de começar).
- Referências obrigatórias antes de qualquer código:
  `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`,
  `docs/EVIDENCIAS-ENTREGA-LOCAL.md`,
  `docs/PROMPT-CONTINUACAO-CRM-NOTAS-KANBAN.md` (fatia notas/kanban) e
  `docs/PROMPT-CONTINUACAO-CRM-AGENDA-CALENDARIO.md` (fatia calendário).
- **L04 permanece PARCIAL. Não iniciar L05.**
- Fatias entregues (gate mesclado 9/9, duas vezes consecutivas):
  - **CRM-05/06/07 completo** (`arena/01a0eef9`): notas internas dedicadas
    (`crm_opportunity_notes`, `crm-note-api.mjs`, `OpportunityNotes.tsx`) e
    campo a campo de oportunidades — todos os campos em criação/manutenção com
    unidade validada contra a empresa, atribuição imutável, borda pessoal nas
    rotas de oportunidade (antes abertas a qualquer staff), motivo de perda
    obrigatório também no banco, reabertura auditada com ação dedicada,
    proibição de troca direta ganho↔perdido, flags coerentes por CHECK e
    busca no servidor com curinga escapado.
  - **CRM-08 com visão de calendário por semana** (`arena/01a0ef36`,
    PR #24): `MyAgenda.tsx` com alternador lista/semana, somente leitura, sem
    rota/migração nova (reaproveita `GET /api/crm/visits/agenda?from=&to=`).
- Migrações 001–111 aplicadas e IMUTÁVEIS; próxima migração livre: **112**
  (confirmar no disco antes de criar). 510 tabelas.
- **CRM-05, CRM-06 e CRM-07 estão pronto_local** (provados por gate campo a
  campo). CRM-08 tem agenda, conflito, vínculo PUB-04 e calendário semanal.
- Fora desta entrega, por decisão registrada: CRM-10, automação de mensagens,
  SMTP, lembretes/notificações de agenda, ações dentro da visão de calendário
  (deliberadamente só leitura), hospedagem externa, Windows e aceite humano.
  Não publicar em produção nem contratar serviços.

## Lacunas restantes de L04 (escolher UMA fatia vertical)

1. **Revalidação campo a campo de CRM-01..04** com cenários dedicados no gate:
   CRM-02 precisa de tela de contato com função
   decisor/influenciador/usuário/financeiro com preferências e restrições;
   CRM-01 segue sem rota de criação/edição de unidade (hoje é fixture SQL);
   CRM-03/04 (endereços/correção de dados) sem tela dedicada.
2. **Lacunas PUB:** PUB-02/05 e PUB-06..10 (CMS, temas, SEO, montador de
   pacote, painel de métricas de origem/conversão — componentes órfãos em
   `src/app/admin/ti/*Client.tsx`, conectar por domínio, nunca despejar na
   página de TI).
3. **CRM-10 (carteira):** fora por decisão registrada — reabrir apenas com
   decisão explícita do proprietário.
4. **Lembretes/notificações de CRM-08:** só entram com provedor, autorização e
   opt-out operacional decididos pelo proprietário.

## Riscos residuais anotados (não corrigidos, declarados)

- A busca de empresas (CRM-01) segue com curinga não escapado (ILIKE cru).
- Rotas de empresa/contato/importação em `crm-api.mjs` ainda usam o auxiliar
  de auditoria que engole falha (`try/catch` mudo) — mutação sem trilha não
  reverte. As rotas de oportunidade/notas são transacionais desde a 111.
- `handleAdminLeadStatus` em `server.mjs`: padrão de auditoria "solta" em
  transação multi-instrução (comportamento confirmado correto hoje; o CHECK
  da 103 fecha a causa atual, mas o padrão não foi hardenizado).
- Sessões paralelas: se outra fatia for mesclada no `main` antes desta, o gate
  e os docs terão conflito de apendo — resolver mantendo **ambos** os cenários
  e re-executar a bateria no estado mesclado, como feito na integração dos
  PRs #24/#25.

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
  controles preenchidos; em `<select>`, usar `<label htmlFor>` + `id`.
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
