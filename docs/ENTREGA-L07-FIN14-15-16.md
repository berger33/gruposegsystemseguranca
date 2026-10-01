# Entrega L07 — FIN-14, FIN-15 e FIN-16

## Escopo
Fatia de endurecimento dos domínios que ainda compartilhavam `src/server/fin-budget-api.mjs` sem as garantias já aplicadas ao FIN-13:

- FIN-14 — exportação do período (`/api/fin/exports`, `/api/fin/export-logs`).
- FIN-15 — fechamento de competência e versões de relatório (`/api/fin/competence-closures`, `/api/fin/report-versions`).
- FIN-16 — provisão/revisão de comissões ligadas à regra CRM-25 (`/api/fin/commission-provisions`, `/api/fin/commission-provision-history`).

A entrega é aditiva: nenhuma migração histórica foi alterada e nenhum tipo existente foi modificado.

## Lacunas corrigidas
Antes desta fatia, os handlers FIN-14/15/16 ainda:

- gravavam sem transação, com auditoria executada depois do commit (falha de auditoria não revertia nada);
- não tinham `FOR UPDATE` em decisão/transição;
- não aplicavam a borda `guardMutation`, de modo que o papel `ti` podia **escrever** nesses domínios;
- aceitavam qualquer valor de `status`/`action` e repassavam datas e textos direto ao SQL;
- respondiam `500 internal` para toda falha, sem `503 audit_unavailable`;
- tinham o `PATCH` de exportação e de provisão **quebrados**: o parâmetro `$1` era deduzido ao mesmo tempo como enum e como texto, e o PostgreSQL recusava a consulta com `42P08 inconsistent types deduced for parameter $1`. O caminho só respondia `500 internal`; agora é tipado explicitamente e exercitado pelo gate.

## Alterações
- `db/migrations/133-fin14-15-16-export-closure-commission-hardening.sql` (nova, aditiva):
  - FIN-14: `fin_export_logs` imutável, exportação sempre com acesso limitado do contador, transições `pendente → gerando → gerado → expirado` (`falhou → pendente`), `gerado` exige `storage_key` e `generated_at`.
  - FIN-15: `fin_report_versions` imutável e sempre preservada; transições `aberta → fechada → reaberta → fechada`; reabertura exige identidade autorizadora, data e motivo.
  - FIN-16: `is_auto_paid` permanece proibido; transições `provisionada → em_revisao → revisada → paga|cancelada`; `paga` exige revisão prévia, identidade e data de baixa manual.
- `src/server/fin-budget-api.mjs`: handlers FIN-14/15/16 transacionais com `BEGIN`/`COMMIT`, `FOR UPDATE` nas decisões e nas chaves de duplicidade, auditoria fail-closed com rollback total e `503 { "error": "audit_unavailable" }`, allowlist de status/ações/tipos antes do SQL, respostas sanitizadas sem detalhe SQL, sessão/same-origin/papéis financeiro/admin e papel `ti` somente leitura em todo o domínio.
- `scripts/migrate-site-visual.mjs` e `scripts/qa-wave0-static.mjs`: faixa de migrações passa a 001–133.
- `tests/l07-delivery.integration.test.mjs`: três novos testes HTTP (FIN-14, FIN-15, FIN-16) com dados sintéticos. Nenhum teste Chromium foi acrescentado nesta fatia: os três domínios ainda não têm aba própria no workspace, então um teste de navegador adicionaria fragilidade sem cobertura real.
- `scripts/qa-l07-delivery-postgres.mjs`: gate L07 passa de 24 para 27 subtestes.

## Garantias verificadas pelo gate
- FIN-14: criação com protocolo `EXP-FIN`, trilha em `fin_export_logs`, duplicidade recusada pela chave de armazenamento (sem criar segunda exportação), transições de geração controladas, `gerado` sem `storage_key` recusado, trilha imutável, acesso limitado do contador não pode ser desligado, papéis não financeiros recusados, `ti` somente leitura e `503` com rollback da exportação e da trilha.
- FIN-15: fechamento único por competência, reabertura apenas autorizada e justificada, segunda reabertura consecutiva recusada, novo fechamento registrado, versões 1/2/3 preservadas e imutáveis, `503` sem criar fechamento nem versão.
- FIN-16: provisão nasce `provisionada` e nunca `paga`; pagamento automático recusado na criação e na atualização; baixa exige revisão anterior e confirmação manual explícita; provisão paga é terminal; histórico imutável e sem tentativa de pagamento automático; `503` com rollback da provisão e do histórico.

## Validações executadas em 2026-10-01
- `npm ci`: OK, 82 pacotes, 0 vulnerabilidades.
- `npm run typecheck`: OK.
- `node scripts/qa-wave0-static.mjs`: OK, 5/5; migrações 001–133 contínuas e registradas.
- `npm test`: OK, 196/196.
- `npm run test:migrations:pg`: OK, migrações 001–133, duas passagens idempotentes e clone/checksum preservado (o stderr de checksum mismatch em `006` é o cenário negativo esperado do próprio gate, com exit code 0).
- `npm run test:l07-delivery:pg`: OK, 27/27, 1ª execução.
- `npm run test:l07-delivery:pg`: OK, 27/27, 2ª execução consecutiva; Chromium sem SIGSEGV.
- `npm run test:l03-delivery:pg`: OK, 1/1.
- `npm run test:l04-delivery:pg`: OK, 20/20.
- `npm run test:l05-delivery:pg`: OK, 1/1.
- `npm run test:l06-delivery:pg`: OK, 9/9.
- `npm run build`: OK.

## Limites
Esta entrega não promete resultado financeiro, não implementa pagamento, cobrança real, gateway real ou emissão real — a baixa de comissão é apenas um registro manual auditado. Não altera migrações históricas nem tipos existentes. Todos os dados dos testes são sintéticos, em PostgreSQL descartável e isolado.
