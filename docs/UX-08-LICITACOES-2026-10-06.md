# UX-08 — Licitações (EXT-03): apresentação, vocabulário e gate focal

**Rota:** `/admin/licitacoes`  
**Servidor canônico confirmado:** `src/server/ext-bidding-api.mjs` (singular `bidding`, 1.717 linhas)  
**Data:** 2026-10-06  
**Base:** `89537f1` (merge da PR #174)  
**Aceite humano:** **PENDENTE**. Marcelo e Andreia não participaram; nada aqui é homologação.

A fatia altera apresentação e prova, não contrato. `server.mjs`, `src/server/ext-bidding-api.mjs` e `db/migrations/**` permanecem intocados. Não há migração nem scheduler.

## 0. ETAPA 0 — inventário anterior à edição

O arquivo canônico foi lido por inteiro, seguido do import, construção e dispatch em `server.mjs`.

### Rotas realmente despachadas

| Método | URL | handler |
|---|---|---|
| GET/POST | `/api/ext/bidding/notices` | `handleNotices` |
| GET/PATCH | `/api/ext/bidding/notices/{id}` | `handleNoticeById` |
| POST | `/api/ext/bidding/notices/{id}/responsible` | `handleNoticeResponsible` |
| GET/POST | `/api/ext/bidding/notices/{id}/deadlines` | `handleNoticeDeadlines` |
| POST | `/api/ext/bidding/deadlines/{id}/supersede` | `handleDeadlineSupersede` |
| GET/POST | `/api/ext/bidding/notices/{id}/proposals` | `handleNoticeProposals` |
| POST | `/api/ext/bidding/proposals/{id}/withdraw` | `handleProposalWithdraw` |
| POST | `/api/ext/bidding/notices/{id}/result` | `handleNoticeResult` |
| GET/POST | `/api/ext/bidding/notices/{id}/documents` | `handleNoticeDocuments` |
| POST | `/api/ext/bidding/documents/{id}/deactivate` | `handleDocumentDeactivate` |
| GET/POST | `/api/ext/bidding/notices/{id}/checklist` | `handleNoticeChecklist` |
| POST | `/api/ext/bidding/checklist/{id}/deactivate` | `handleChecklistDeactivate` |
| GET/POST | `/api/ext/bidding/notices/{id}/alert-rules` | `handleNoticeAlertRules` |
| GET e escrita 410 | quatro aliases `ext-bidding-notices` | `handleLegacyBiddingNotices` |
| GET e escrita 410 | quatro aliases `ext-bidding-documents` | `handleLegacyBiddingDocuments` |

Os **15 handlers retornados** por `createExtBiddingApi()` aparecem no dispatch: **não há handler morto**. O anti-deriva fixa essa conclusão.

### Constantes, estados derivados e chaves

- papéis de leitura e escrita: `admin`, `marcelo`, `ti`;
- situações: `rascunho`, `publicado`, `em_analise`, `homologado`, `vencido`, `cancelado`, `deserto`; as quatro últimas são terminais;
- transições: rascunho → publicado/cancelado; publicado → análise/cancelado/deserto; análise → homologado/vencido/cancelado/deserto; terminal não reabre;
- tipos de prazo: publicação, esclarecimento, impugnação, entrega de proposta, sessão de abertura, recurso e assinatura;
- fontes: edital publicado, retificação publicada e registro interno;
- `deriveDeadlineSituation`: prazo inexistente, substituído, sem data, vencido, vigente ou a vencer; “a vencer” exige regra explícita;
- `deriveProposalWindow`: aceita somente com edital aberto e prazo de entrega vigente;
- `deriveChecklistStatus`: atendimento vem de documento ativo da versão mais recente;
- fontes físicas: oito tabelas `ext_bidding_*`; data-base é declarada pelo servidor;
- idempotência é por `(created_by_identity, idempotency_key)`, com impressão digital no evento. A tela preserva os prefixos do protótipo: `ext03-edt`, `sta`, `rsp`, `prz`, `sub`, `prp`, `ret`, `doc`, `chk`, `alr`, `res`.

### 64 códigos literais

O inventário está materializado, um a um, em `src/lib/bidding-vocabulary.mjs` e comparado diretamente com o servidor por `tests/ux-bidding-vocabulary.test.mjs`. Inclui guardas (`unauthorized`, `forbidden_role`, `origin_forbidden`), validações, conflitos de versão, máquina de estados, auditoria, indisponibilidade e `legacy_mutation_retired`. O teste reprova código ausente ou inventado.

## 1. Apresentação

O workspace conserva as capacidades do protótipo: criar e selecionar edital; transicionar situação; designar responsável; registrar e substituir prazo; registrar e retirar proposta; checklist; dossiê documental versionado; regra de alerta; resultado imutável e histórico.

A apresentação acrescenta oito etapas navegáveis por teclado (setas, Home e End), usa a superfície compartilhada sem alterar `UiWorkspace.module.css`, traduz estados canônicos e separa carregamento, vazio, negativa e falha. `forbidden_role` e `unauthorized` são descritos como negativa, com código técnico. Ausência não vira zero; `honestMoney(null)` é “Não informado”, enquanto zero real continua `R$ 0,00`.

O wrapper `biddingRequest()` sempre devolve `{ok,data}` ou `{ok,error}`, preserva o payload cru e não reescreve URL, método, corpo ou `Idempotency-Key`.

## 2. Fronteira externa

A tela repete a declaração canônica: não há integração com ComprasNet, BEC/SP, PNCP ou equivalente, importação automática, envio externo nem upload real. `file_url` e `storage_key` são referências declaradas pela equipe. A relevância de mercado segue **indicada, não confirmada**.

## 3. Provas

- anti-deriva: `tests/ux-bidding-vocabulary.test.mjs`;
- servidor herdado: `tests/ext03-biddings.test.mjs`;
- integração HTTP + PostgreSQL + Chromium: `tests/ux-bidding-workspace.integration.test.mjs`;
- gate novo descartável: `scripts/qa-ux-bidding-postgres.mjs` (`UX_BIDDING_SETUP: …`, limpeza no `finally`);
- gate herdado: `npm run test:ext03-biddings:pg`;
- workflow: `.github/workflows/ux-bidding-delivery.yml`;
- captura: etapa `ux-08-licitacoes`, desktop 1440×900 e mobile 390×844 em `docs/ux-08-licitacoes-evidencias/`.

A falha é injetada somente no browser por `page.addInitScript` sobre `window.fetch`. O h1 é esperado por `textContent`. Dados são sintéticos.

## 4. Validação obrigatória

Todas executadas localmente e verdes em 2026-10-06:

- ✅ `npm run typecheck`
- ✅ `node --test tests/ux-bidding-vocabulary.test.mjs` — 6/6
- ✅ `node --test tests/ext03-biddings.test.mjs` — 67/67
- ✅ `npm run test:unit` — 821 aprovações, zero falha
- ✅ `npm run test:ext03-biddings:pg` — 26/26 no PostgreSQL real
- ✅ `npm run test:ux-bidding:pg` — 27/27, HTTP + PostgreSQL + Chromium reais
- ✅ `npm run ux:evidence -- --stage=ux-08-licitacoes` — desktop e mobile OK
- ✅ `npm audit --audit-level=high` — zero vulnerabilidade

## 5. Pendências de proprietário

PR #170 continua duplicada e aberta; a branch remota da PR #167 continua candidata a remoção. Esta fatia não fecha PR, apaga branch nem faz merge. A confirmação de relevância de mercado e o aceite humano continuam pendentes.
