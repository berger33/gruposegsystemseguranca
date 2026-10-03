# Relatório L08 — Promoção canônica CLI-06..08 (chamados, agenda e relatórios)

- **Data:** 2026-10-03
- **Lote:** L08 / CLI-06..08
- **Branch da sessão:** `arena/01a1000c-gruposegsystemseguranca`
- **Base oficial confirmada:** `49b49b9192f83a058adc29b9567851119f829991` (merge da PR #87)
- **Estado remoto confirmado antes da edição:**
  - PR #87: `MERGED` em `2026-10-03T04:31:16Z`, merge commit `49b49b9192f83a058adc29b9567851119f829991`, head `b5485f7c8437f491bc9428c9be16107f4cb0061f`.
  - PR #85: `MERGED` em `2026-10-03T01:47:27Z`, merge commit `8eae38ae7ce84b9a824a63d469d36e03a3b0a5c0`.
  - `origin/main` e `HEAD` da branch da sessão estavam em `49b49b9192f83a058adc29b9567851119f829991` (`git rev-list --left-right --count HEAD...origin/main` = `0 0`).
  - `git merge-base --is-ancestor b5485f7 origin/main` retornou `0` após aprofundar/fetchar o objeto da PR #87 no clone raso.
- **Migrações:** 001–139 preservadas; criada a migração aditiva **140-l08-cli06-08-lifecycle-visits-reports.sql**. Próxima migração livre: **141**.

---

## 1. Diretriz aplicada

O lote seguiu a orientação do proprietário: foco em execução e implementação, sem rodar matrizes pesadas L03..L08 em cascata, Chromium de múltiplas jornadas ou Postgres embutido em loop. Foram executadas apenas as validações rápidas autorizadas.

---

## 2. Implementação entregue

### CLI-06 — Ciclo real de chamados no portal canônico

- `client_tickets` permanece como fonte canônica dos chamados promovidos em L08.
- Migração 140 adiciona:
  - status `waiting_client` (`Aguardando cliente`);
  - `sla_due_at`, `sla_paused_at`, `sla_pause_reason`, `sla_total_paused_seconds`;
  - `reopen_count`, `last_reopen_reason`, `resolved_at`, `closed_at`;
  - tabela `client_ticket_sla_pauses` com pausa/resumo por autor e identidade;
  - trilha ampliada em `client_ticket_status_audit` com motivo, reabertura e referência da pausa.
- API canônica (`src/server/client-space-api.mjs`):
  - listagem de chamados retorna campos de SLA e reabertura;
  - staff Marcelo/TI pode mover para `waiting_client`, iniciando pausa de SLA explícita;
  - saída de `waiting_client` resume a pausa e acumula segundos;
  - reabertura de `resolved`/`closed` para `open`/`in_progress` exige motivo de 10..500 caracteres;
  - cliente autenticado pode reabrir seu próprio chamado via `/api/client/tickets/:id/reopen`, sempre com escopo por conta validado no servidor.
- UI do cliente (`/cliente/app/chamados`):
  - mostra `Aguardando cliente`;
  - exibe aviso de SLA pausado;
  - permite reabrir chamados resolvidos/encerrados com motivo obrigatório.
- UI administrativa (`/admin/clientes`):
  - adiciona `Aguardando cliente` no seletor de situação;
  - expõe motivo de mudança/reabertura e indicadores de pausa/reaberturas.

### CLI-07 — Agenda de visita/manutenção com confirmação e reagendamento

- Migração 140 cria tabelas canônicas:
  - `client_visits`;
  - `client_visit_status_audit` com histórico imutável.
- API canônica:
  - `/api/admin/client-visits` (`GET`/`POST`);
  - `/api/admin/client-visits/:id` (`PATCH`);
  - `/api/client/visits` (`GET`);
  - `/api/client/visits/:id` (`PATCH` para confirmação ou reagendamento pelo cliente).
- Regras aplicadas:
  - contrato/chamado/visita precisam pertencer ao cadastro informado;
  - cliente só enxerga visitas do próprio vínculo validado por `client_access_grants`;
  - cliente só confirma ou solicita reagendamento, não finaliza/cancela por conta própria;
  - reagendamento exige nova data/hora e motivo mínimo.
- UI entregue:
  - nova página `/cliente/app/agenda` com listagem, confirmação e solicitação de reagendamento;
  - nova seção administrativa `VisitsSection.tsx` em `/admin/clientes` para criar, filtrar e atualizar visitas.

### CLI-08 — Relatórios revisados e aceite/ciência pelo cliente

- Migração 140 cria tabelas canônicas:
  - `client_reports`;
  - `client_report_status_audit` com histórico imutável.
- API canônica:
  - `/api/admin/client-reports` (`GET`/`POST`);
  - `/api/admin/client-reports/:id` (`PATCH`);
  - `/api/client/reports` (`GET`, somente `approved`/`sent`/`acknowledged`);
  - `/api/client/reports/:id/acknowledge` (`PATCH`).
- Regras aplicadas:
  - rascunhos, itens em revisão e rejeitados não aparecem ao cliente;
  - aprovação exige revisão previamente registrada;
  - envio exige aprovação;
  - `acknowledged` é ação do cliente autenticado, não do staff;
  - aceite/ciência registra identidade individual e histórico.
- UI entregue:
  - nova página `/cliente/app/relatorios` para consulta e aceite/ciência;
  - nova seção administrativa `ReportsSection.tsx` em `/admin/clientes` para criar, revisar, aprovar e enviar relatórios.

---

## 3. Arquivos principais afetados

- Banco/migrações:
  - `db/migrations/140-l08-cli06-08-lifecycle-visits-reports.sql`
  - `scripts/migrate-site-visual.mjs`
  - `scripts/qa-wave0-static.mjs`
- API/servidor:
  - `src/server/client-space-api.mjs`
  - `server.mjs`
  - `src/lib/client-space-core.mjs`
  - `src/lib/client-space-core.d.mts`
- Portal do cliente:
  - `src/app/cliente/app/chamados/page.tsx`
  - `src/app/cliente/app/agenda/page.tsx`
  - `src/app/cliente/app/relatorios/page.tsx`
  - `src/app/cliente/app/ClientAppNavigation.tsx`
  - `src/app/cliente/app/ClientApp.module.css`
  - `src/app/cliente/app/page.tsx`
- Administração:
  - `src/app/admin/clientes/page.tsx`
  - `src/app/admin/clientes/TicketsSection.tsx`
  - `src/app/admin/clientes/VisitsSection.tsx`
  - `src/app/admin/clientes/ReportsSection.tsx`
  - `src/app/admin/clientes/admin-shared.ts`
- Testes rápidos:
  - `tests/client-space-core.test.mjs`

---

## 4. Validação rápida executada

- `npm ci` → OK, 82 pacotes instalados, 0 vulnerabilidades.
- `node scripts/qa-wave0-static.mjs` → 5/5 verificações OK; migrações 001–140 contínuas e registradas.
- `npm run typecheck` → OK (`tsc --noEmit`).
- `npm test` → 196/196 testes unitários rápidos OK em ~4,4s.
- `npm run build` → OK; Next.js compilou 80 páginas, incluindo `/cliente/app/agenda` e `/cliente/app/relatorios`.
- Pós-PR: `npm run test:tenant:pg` → OK após compatibilidade com o gate legado de `client_tickets` até a aplicação da migração 140.
- Pós-PR: `npm run test:l08-delivery:pg` → OK, 51/51.

`next-env.d.ts` e `tsconfig.json` foram restaurados após build/gates que geram tipos temporários.

---

## 5. Não executado por diretriz

Não foram executadas matrizes pesadas de integração L03..L08 em cascata, Chromium headless em múltiplas jornadas nem Postgres descartável em loop. A homologação final Windows continua pendente e adiada até o fechamento integral do sistema.
