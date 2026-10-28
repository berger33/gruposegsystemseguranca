# E3/E4 — canonicalização da frente de IA legada (27/10/2026)

**Estado:** ambos os erros foram corrigidos localmente e cobertos por guarda + gate HTTP real. **F14 (IA real) permanece aberto**; os 10 requisitos `AI-*` continuam **sem reauditoria integral e sem aceite humano**. Produção **NO-GO**.

## 1. Diagnóstico

**E3.** `src/components/AiBotWidget.tsx` (órfão — nenhuma rota o monta) chamava `POST /api/ai/bot` e `POST /api/ai/rag/feedback`. O `server.mjs` já respondia **410 `legacy_ai_retired`** ao primeiro desde a migração para `POST /api/ai/answer`. O widget também exibia protocolo, fila Ollama, modo beta, redirecionamento WhatsApp, custo/token e painel de desenvolvedor — nenhum desses campos existe no contrato canônico.

**E4.** A RAG legada (`ai-rag-api.mjs`) negava `rag_key='cliente'` com **403 `tenant_scope_not_implemented`** em três handlers (`handleQueries`, `handleFeedback`, `handleBotSessions`), enquanto a canônica isola por `client_account_id` + `client_access_grants`. O bloqueio 410 do `server.mjs` cobria apenas **8** aliases de escrita. Faltavam:

- `/api/ai-rag-queries` (→ `handleQueries`);
- `/api/ai/rag/feedback`, `/api/public/ai/rag/feedback`, `/api/admin/ai-rag-feedback` (→ `handleFeedback`);
- `/api/ai/bot-sessions` (→ `handleBotSessions`).

Por esses caminhos, um POST com `rag_key='cliente'` **alcançava** o handler legado e recebia o 403 contraditório. A curadoria administrativa (GET de índices, documentos, chunks e custo) continua legítima e não devia ser aposentada.

**Descoberta extra (pela guarda).** `src/app/admin/ti/AiRagClient.tsx` — a aba **montada** "Bases dos assistentes" — também chamava `/api/ai/bot` ou `/api/admin/ai-bot-sessions` no botão `testBot()`, e tentava exibir `data.mode`, `data.protocol`, `data.queue_position` e `data.is_whatsapp_redirect`. Ou seja, o botão de teste da tela de curadoria estava **quebrado em produção de desenvolvimento**: sempre 410.

## 2. Correções

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `server.mjs` | bloqueio 410 estendido de **8 → 13** aliases de escrita; continua restrito a `POST`; resposta mantém `{ error: 'legacy_ai_retired', canonical: '/api/ai/answer' }`. Curadoria GET intacta. |
| 2 | `src/components/AiBotWidget.tsx` | virou **alias de compatibilidade** (`@deprecated`): preserva assinatura e import, delega ao `RagWidget` canônico (usado em 5 rotas reais e coberto por gate de navegador). Escopo privado continua bloqueado com aviso. Removidos ~230 linhas de contrato morto e `any`. |
| 3 | `src/app/admin/ti/AiRagClient.tsx` | `testBot()` passou a chamar `/api/ai/answer` e a descrever **fontes**, **motivo** (`empty_scope` / `no_relevant_source` / `ai_unavailable`) e se o modelo foi **realmente consultado** — sem inventar protocolo, modo ou fila. |
| 4 | `tests/e3-e4-ai-canonical.test.mjs` | guarda estática no `test:unit`: extrai os paths despachados para os 3 handlers legados e exige que **todos** estejam no 410; exige a canônica antes do bloqueio; proíbe que qualquer código de cliente chame os 13 contratos retirados; exige o alias do widget. |
| 5 | `tests/ux-pro-03-ti-ai-rag-ui.test.mjs` | guarda focal atualizada: separa **contratos vivos** (componente chama + servidor despacha) de **retirados** (componente **não** chama; servidor mantém no 410). |
| 6 | `tests/ai-rag-widget.integration.test.mjs` | **2 cenários HTTP** novos: 13 aliases × 2 escopos → 410 com `canonical`, nunca `tenant_scope_not_implemented`; e os 3 GETs de curadoria continuam 200. |

Os handlers legados **mantêm** a negativa interna `tenant_scope_not_implemented` como defesa em profundidade — ela simplesmente deixou de ser alcançável pelo dispatch. Nenhuma rota, permissão, migração ou contrato **vivo** mudou.

## 3. RED → GREEN

| Etapa | Resultado |
|---|---|
| Guarda E3/E4 contra o código original | **RED 2/5** (aliases descobertos + widget + `AiRagClient`) |
| Após as 6 correções | **GREEN 5/5** |
| Guarda focal `AiRagClient` (3 testes) | **3/3** |
| Conjunto focal | **8/8** |
| `npm run typecheck` | **0** erros |

A guarda foi ajustada para ignorar **comentários históricos** que citam os contratos retirados — só o código executável conta como chamada. Isso preserva a explicação da migração sem gerar falso positivo.

## 4. Gate HTTP real (PostgreSQL 17 + Chromium)

`npm run test:ai-rag-widget:pg` — cluster descartável, `server.mjs` de verdade, cookies de sessão reais e provedor de modelo **stub determinístico** (não é Ollama real):

```
# tests 28
# pass 28
# fail 0
# skipped 0
FECH01_RAG_WIDGET_TAP_SUMMARY: pass=28 fail=0 skipped=0 todo=0 minimo_exigido=20
```

Era **26/26**; os 2 novos cenários provam os 410 e a curadoria preservada. O gate continua provando isolamento RH/Marcelo/cliente, vínculo revogado, documento arquivado, `ai_busy`, `ai_unavailable` e a tela real do `RagWidget`.

**Efeito colateral tratado:** o gate reescreve `next-env.d.ts`/`tsconfig.json` com `NEXT_DIST_DIR` próprio. Ambos foram restaurados aos SHAs `1862ac4b…` / `2128c956…` antes da bateria final.

## 5. Bateria final

| Verificação | Resultado |
|---|---|
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1133/1133** (208 `.mjs`, 145 no `test:unit`) |
| `npm run typecheck` | **0** erros |
| `npm run build` | **105/105** páginas |
| `qa-wave0-static` | **5/5** |
| `ux-pro-00` / `ux-pro-03-ti` / `requisitos-222` `--check` | **OK / OK / OK** |
| Gate do portal | **42/42** |
| Gates E6 grupos 1 / 2 / 3 | **6/6 · 7/7 · 6/6** |
| Gate 10B prévias | **5/5** (SHA `917236ad…` à época; hoje `14ff3232…` após a Opção A) |
| Gate IA (FECH-01) | **28/28** |
| `npm audit --audit-level=moderate` | **0** vulnerabilidades |
| `git diff --check` | **limpo** |
| Workflows | **49** (nenhum novo) |

## 6. Limitações — o que esta fatia NÃO fez

- **Não ligou modelo real.** `OLLAMA_ENABLED` continua fora de uso; F14 (AI-01..05/07/08/10, corpus produtivo, custo/token, curadoria e rollback) depende de decisão do proprietário e de hardware/provedor.
- **Não promoveu nenhum dos 10 IDs `AI-*`.** Eles seguem no núcleo duro: **34 `a_revalidar` sem gate**, **0/222 aceite humano**, **0/222 reauditoria integral**. Corrigir E3/E4 é infraestrutura de contrato, não reauditoria de jornada.
- `AiBotWidget` continua **órfão** — agora coerente, mas sem rota que o monte. Decidir se ele deve existir depende do proprietário.
- O `testBot()` da curadoria usa a sessão `admin/ti`; para `rag_key='cliente'` a canônica responde `client_session_required` (401) — comportamento honesto, não uma falha.
- Sem UAT, Windows real, leitor de tela, provedores reais ou produção. **NO-GO**.
