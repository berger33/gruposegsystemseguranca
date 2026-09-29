# Prompt da próxima sessão — Grupo SEG System (entrega local, L04)

Escrito ao fim da sessão `arena/01a0ef36-gruposegsystemseguranca`
(CRM-08 residual: visão de calendário por semana, somente leitura). Use este
arquivo como prompt de entrada da próxima continuação.

## Estado de entrada

- Base: `main` no commit que fizer merge desta fatia (PR desta sessão sobre
  `ea7a1ed`, HEAD anterior `ed50d22`). Conferir no disco antes de começar.
- Referências obrigatórias antes de qualquer código:
  `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`,
  `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e
  `docs/PROMPT-CONTINUACAO-CRM-AGENDA-CALENDARIO.md`.
- **L04 permanece PARCIAL. Não iniciar L05.**
- Última fatia entregue (gate 8/8 duas vezes consecutivas): visão de
  calendário por semana (segunda a domingo, fuso local do navegador) na
  agenda pessoal de CRM-08 (`MyAgenda.tsx`), somente leitura, reaproveitando
  o endpoint já existente `GET /api/crm/visits/agenda?from=&to=` sem rota,
  coluna ou migração nova.
- Migrações 001–110 aplicadas e IMUTÁVEIS; próxima migração livre: **111**
  (confirmar no disco antes de criar). 509 tabelas.
- Fora desta entrega, por decisão registrada: CRM-10, automação de mensagens,
  SMTP, lembretes/notificações da agenda, ações (confirmar/reagendar/
  cancelar) dentro da própria visão de calendário, hospedagem externa,
  Windows e aceite humano. Não publicar em produção nem contratar serviços.

## Lacunas restantes de L04 (escolher UMA fatia vertical)

1. **CRM-07 residual:** revisão campo a campo do kanban/tabela herdados de
   CRM-05/06 (busca/prioridade/tabela cobertas só no ponto usado pelo gate) e
   notas internas dedicadas.
2. **CRM-08 residual:** lembretes/notificações da agenda — dependem de
   decisão de negócio sobre provedor, autorização e opt-out operacional
   antes de qualquer worker ou envio. A visão de calendário por semana já foi
   entregue nesta sessão; não reabrir sem uma regressão concreta.
3. **Lacunas PUB:** PUB-02/05 e PUB-06..10 (CMS, temas, SEO, montador de
   pacote, painel de métricas de origem/conversão — componentes órfãos em
   `src/app/admin/ti/*Client.tsx`, conectar por domínio, nunca despejar na
   página de TI).
4. **Revalidação campo a campo de CRM-01..06** com cenários dedicados no gate.

## Método (inegociável)

- Registrar as decisões de política ANTES da rota, em
  `docs/PROMPT-CONTINUACAO-<fatia>.md`; sem bypass administrativo;
  fail-closed.
- Nem toda fatia precisa de migração nova: se a lacuna puder ser fechada
  reaproveitando rotas e autorização já existentes (como o calendário desta
  sessão), prefira isso — menos migração desnecessária é menos superfície de
  risco. Quando for necessária, a migração é apenas aditiva; preservar o
  padrão do CHECK de `auth_access_audit` (falhar se a constraint pai sumir,
  nunca afrouxar).
- Auditoria transacional: falha de auditoria injetada deve reverter a
  mutação (aplica-se a fatias que criam/alteram mutação; fatias somente
  leitura, como esta, não precisam disso).
- Gate dentro de `tests/l04-delivery.integration.test.mjs`: HTTP real +
  PostgreSQL descartável + Chromium real sem `--disable-web-security` (um
  navegador por persona; SQL só para fixture/asserção/falha injetada). Ao
  testar UI assíncrona (buscas disparadas por `useEffect`/clique), aguarde a
  resposta HTTP real (`page.waitForResponse`) antes de inspecionar o DOM —
  não confie em `waitForTimeout` fixo, que pode ler o estado "carregando".
- Atualizar `scripts/migrate-site-visual.mjs` (manifesto) e
  `scripts/qa-wave0-static.mjs` (`latestMigration`) **se** criar migração.
- Cuidado conhecido: o dev server do gate pode reescrever `tsconfig.json` e
  `next-env.d.ts` (`.next/integration-l04`) — restaurar com `git checkout`
  antes do commit (`git status --short` deve mostrar só os arquivos que você
  quis tocar).
- Se um cenário preexistente do gate quebrar por causa de uma regra nova,
  ajustar o cenário e **declarar o ajuste** na documentação — nunca afrouxar
  a regra.
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

## Fechamento

Commit e push na branch arena fixa da sessão, abrir PR para `main` com a
fatia, a política registrada e a evidência. Fazer o merge. Não avançar para
L05 enquanto L04 tiver lacuna aberta. Entregar o prompt completo para
continuar o projeto em outra sessão.
