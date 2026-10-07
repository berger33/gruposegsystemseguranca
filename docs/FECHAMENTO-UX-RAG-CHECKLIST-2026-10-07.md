# Checklist de fechamento — UX e RAG

Base auditada: `c059e1207190988f8c1a305d1be28b8457ce3bde`. Este registro começa sem implementação nova. Critérios completos em [plano de fechamento](ARENA-FECHAMENTO-UX-RAG-2026-10-07.md).

| ID | Escopo | Estado | PR/SHA/evidência | Próxima ação |
|---|---|---|---|---|
| FECH-01 | Assistentes privados e contrato | PR aberta | branch `arena/b75daccc-gruposegsystemseguranca`, base `7765d99`, head `__HEAD__`; PR #__PR__; `npm run test:ai-rag-widget:pg` 25/25 (PG 17 real + HTTP real + Chromium real + provedor **stub**); unit 19/19 com pool simulado; evidências em `docs/fech-01-assistentes-evidencias/` | Revisar o PR; rodar `npm test`/`npm run build`/`npm run test:rag` no CI; após merge, FECH-02 (console real de TI) |
| FECH-02 | TI/curadoria operacional | pendente | — | Após FECH-01 |
| FECH-03 | Fontes por diretório | pendente | — | Após curadoria |
| FECH-04 | RH recrutamento/admissão | pendente | — | Inspecionar legado |
| FECH-05 | RH afastamento/benefício/treinamento | pendente | — | Dividir por família |
| FECH-06 | RH desligamento/avançado e fluxos sensíveis | pendente | — | Dividir implementação/validação |
| FECH-07 | Subpáginas cliente | pendente | — | Inventariar cobertura atual |
| FECH-08 | Patrimônio | pendente | — | Auditar workspace |
| FECH-09 | Relatórios/emergencial | pendente | — | Uma PR por família |
| FECH-10 | Leads/clientes/portal | pendente | — | Uma PR por família |
| FECH-11 | Visual/TI restante/público | pendente | — | Uma PR por família |
| FECH-12 | Auditoria final e runbook | pendente | — | Consolidar após implementação |

Para cada PR adicionar: rotas/papéis, implementação entregue, comandos/resultados, ambiente e dados, evidências de desktop/mobile/teclado, limitações, checks do head e pendência operacional. Não marcar tudo validado com base em um teste unitário ou captura. Se encontrar requisito já entregue, indicar evidência atual e reduzir a fatia, sem duplicar trabalho.

## Detalhe da fatia FECH-01 (atualizado em 07/10/2026)

- **Problema:** `RagWidget` escondia as bases privadas atrás de um aviso fixo, prometia “fila garantida”,
  aceitava 2000 caracteres contra o limite de 500 do servidor e não apresentava 401/403/ausência/indisponibilidade.
- **Entrega:** widget reescrito sobre o contrato do servidor (`src/lib/rag-widget-contract.mjs`); servidor passou a
  exigir flag **e** estado publicado e a declarar `empty_scope` separado de `no_relevant_source`; páginas dos
  assistentes (RH, gestão, cliente) com texto honesto sobre sessão/papel/vínculo.
- **Rotas/papéis:** `/admin/rh/assistente` (rh/admin), `/admin/marcelo/assistente` (marcelo/admin),
  `/cliente/app/assistente` (sessão de cliente com vínculo ativo), `/contato` (público). Autorização continua
  nas APIs; nenhuma regra de RBAC, grant ou migração foi alterada (001–174 intactas).
- **Testes por natureza:** contrato puro + **pool simulado** (`tests/rag-widget-contract.test.mjs`,
  `tests/ai-rag-real-scope.test.mjs`, 19/19); **HTTP real + PostgreSQL 17 real + Chromium real** com **provedor
  stub determinístico** (`tests/ai-rag-widget.integration.test.mjs` via `npm run test:ai-rag-widget:pg`);
  **Ollama real: nenhum teste desta fatia**; Windows, desempenho e aceite humano: **pendentes**.
- **Evidências:** capturas desktop (1440×900) e mobile (390×844) e de teclado em
  `docs/fech-01-assistentes-evidencias/` (arquivo → cenário → limite no README da pasta).
- **Checks do head:** `npm run typecheck` OK; `node --test` dos dois arquivos unitários 19/19;
  gate focal 25/25 com piso TAP 20 e 0 skip/todo. `npm test`, `npm run build` e o smoke PGlite
  (`npm run test:rag`) devem ser confirmados no CI/PR antes do merge.
- **Limitações:** 403 `scope_forbidden` não é alcançável pela navegação normal (menu por papel + trigger 102
  revoga sessões ao mudar o papel) — o gate apresenta a negativa real com cenário rotulado; curadoria segue
  não montada (FECH-02); busca lexical, sem PDF e sem fonte por diretório (FECH-03); feedback do assistente
  não existe nesta fatia.
- **Próxima ação:** revisar/integrar o PR do FECH-01 e então iniciar **FECH-02**, sem reabrir FECH-01.

Validações fora do Arena: computador Windows do operador, desempenho/Ollama real, ativação no build local e aceite humano. Permanecem pendentes até evidência real; não bloqueiam a preparação de PRs na sandbox.
