# Próxima fatia do L07 — ADM-01..12, painel do Marcelo

Prompt preparado em 2026-10-02 ao final das jornadas FIN-14/15/16. **ADM-01..12 não foi iniciado nesta sessão.**

## Base e fronteiras

- Usar a `main` oficial mais recente, já com a PR desta fatia integrada por decisão humana; criar branch Arena própria. Não usar cópia local do proprietário.
- FIN-01..16 ficam preservados. Em particular, não reabrir FIN-10 (136), FIN-13 (134), FIN-12→FIN-04 (135) nem FIN-14/15/16 (137) sem lacuna nova reproduzida.
- PRs #47/#53 já foram avaliadas; não reavaliar ou mesclar referências.
- Escopo único: ADM-01..12 no painel funcional de Marcelo. Não iniciar L08 e não declarar L07 concluído até fechar matriz/evidências e obter os aceites previstos.
- Nada real externo: sem PSP, banco, emissão, SMTP ou dados pessoais reais. Massa exclusivamente sintética.

## Leitura obrigatória

1. `README.md`, `docs/ESTADO-EXECUCAO-LOCAL.md` e `docs/ENTREGA-L07.md`.
2. `docs/ENTREGA-L07-FIN14-15-16.md` e `docs/EVIDENCIAS-ENTREGA-LOCAL.md`.
3. ADM-01..12 em `docs/CHECKLIST-ENTREGA-LOCAL.md` e o gate L07 em `docs/EXECUCAO-ENTREGA-LOCAL.md`.
4. `src/server/adm-api.mjs`, `src/server/adm-advanced-api.mjs`, migrações 081/082 e componentes órfãos de `/admin/ti`.
5. `tests/l07-delivery.integration.test.mjs`; preservar os 37 subtestes financeiros.

## Primeiro: baseline e reprodução

No SHA inicial: estático 5/5, typecheck, unitários 196/196, build, migrações 001–137 com replay/checksum, L07 37/37 duas vezes consecutivas e regressões L03–L06. Não ajustar timeout, skip ou assertiva.

Inventariar cada ADM-01..12: rota/tabela/componente existente, vínculo ao registro de origem e lacuna. Reproduzir por HTTP+PostgreSQL+Chromium que `/admin/marcelo` ainda não entrega jornadas reais ou que indicador não abre o registro de origem. Se algo já estiver entregue, preservar e provar.

## Implementação esperada

- Painel próprio `/admin/marcelo`, não uma coleção de cartões descritivos nem componentes mortos em `/admin/ti`.
- Meu dia, pendências, comercial, cobertura, financeiro, renovações, aprovações, busca, favoritos, relatórios, configurações, metas e diário de decisões conforme a matriz ADM-01..12.
- Todo indicador informa período/fórmula/fonte e abre registros reais autorizados. Dados incompletos permanecem explícitos; não inventar margem, meta, prioridade ou aprovação.
- Autorização no servidor, TI somente leitura quando aplicável, motivo em decisão sensível, auditoria na mesma transação e rollback `503 audit_unavailable`.
- Retry/idempotência/concorrência para mutações. Migrações somente aditivas a partir do próximo número livre após 137, constraints novas `NOT VALID`, sem inventar autoria histórica.

## Entrega

Rodar no mesmo SHA: typecheck, unitários, build, estático, migrações, L07 duas vezes consecutivas e regressões L03–L06. Atualizar ESTADO, CHECKLIST, EVIDENCIAS, CONTROLE, ENTREGA-L07 e criar o próximo relatório da mesma série. Abrir PR sem merge e aguardar autorização humana. Diferenciar implementação, validação automática e aceite de Marcelo/Andreia; não inventar aprovação. Preparar o handoff seguinte para fechamento da matriz/evidências do L07, sem iniciar L08.
