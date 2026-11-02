# PLT-02 — Auditoria: filtros completos e fronteira de acesso (01/11/2026)

## 1. Por que

PLT-02 exige trilha consultável por autor, ação, objeto, período e resultado, com acesso restrito e exportação auditada. A superfície existente é `AuditClient` em `/admin/ti`, servida por `admin-audit-api.mjs`. O escopo foi completar a filtragem da superfície existente, sem criar uma segunda tela ou alterar eventos históricos.

## 2. Defeitos reproduzidos

1. A API de listagem aceitava `actorId` e `target`, mas a exportação ignorava ambos. Resultado: usuário podia filtrar a tela e receber exportação mais ampla do que os filtros selecionados.
2. A API de listagem/exportação exigia sessão administrativa, mas não restringia o papel. Uma sessão RH conseguia chamar os endpoints diretamente com **200**, apesar do contrato da superfície declarar acesso restrito a TI/admin.
3. A interface não oferecia campos de identidade específica do autor nem objeto/alvo; somente tipo de papel, ação, resultado e datas.

## 3. Correção

- `AuditClient` ganhou campos rotulados `ID do responsável` e `Objeto / alvo`; ambos acompanham a query de lista e o objeto de filtros exportado.
- `handleAuditExport` aplica `actor_id` e `target` com parâmetros SQL, sob limites de 200 e 500 caracteres e validação anterior ao acesso ao banco. A listagem mantém os filtros e limites já existentes.
- Listagem e exportação agora recusam papel diferente de `admin`/`ti` com 403 `audit_access_restricted`; anônimo mantém 401. O evento de exportação continua registrado na auditoria. A tradução do novo código de erro foi adicionada à tela.

## 4. Contrato do módulo

Listagem e exportação aceitam os filtros opcionais `actorKind`, `actorId`, `action`, `target`, `result`, `from` e `to`. Identidade e alvo são valores parametrizados, sem interpolação SQL. Exportação continua limitada a 1.000 registros por chamada e JSON/CSV; consulta continua limitada a 200 por página, com paginação. As alterações são aditivas às requisições existentes.

## 5. Prova

- RED unitário: a query de exportação não continha `actor_id` nem `target`, e o endpoint retornava 200 a RH.
- GREEN focal `tests/ux-pro-03-audit-observability-ui.test.mjs`: **7/7**, incluindo comparação dos parâmetros list/export e 401/403/200 para anônimo, RH, TI e admin; entradas inválidas são recusadas antes do banco.
- Browser/HTTP **PLT-02 1/1** em PostgreSQL 17 descartável + Chromium e `server.mjs --dev`: ator/ação/objeto/resultado filtram um registro sintético exato; RH recebe 403 em consulta e exportação, TI recebe 200; exportação JSON contém o evento filtrado e grava `audit_export`; os novos campos são usados pela UI em 390 px.
- Evidência visual: `docs/ux-pro-03-plt-02-auditoria-evidencias/`, resumo com `problems: []` e `sobraDocumentoPx: 0`.
- `npm test`: **1373/1373**; `npx tsc --noEmit`: limpo; `npm run build`: sucesso; `requisitos-222-inventory --check` e `ux-pro-03-ti-inventory --check`: OK após regeneração pelos scripts.

## 6. Limites

PLT-02 permanece `a_revalidar`, `aceite_humano=nao_registrado`, `reauditoria_integral=nao_executada`. A prova cobre filtro e exportação JSON no cenário browser; não exercita CSV no navegador, exportação máxima de 1.000 eventos nem filtros de período em PostgreSQL real, nem leitor de tela/UAT. Não há aceite humano. Produção segue **NO-GO**.
