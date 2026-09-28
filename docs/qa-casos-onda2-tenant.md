# Fase 2 — Onda 2: TENANT-SEG-002 (falha injetada, autorização fail-closed)

Data: 2026-09-28. Continuação autorizada após [Onda 1 RAG](qa-casos-onda1-rag.md), conforme [Plano Mestre](plano-mestre-testes.md). Branch fixa `arena/01a0e96a-gruposegsystemseguranca` @ base `5b4b200`. **Não** houve push, deploy, banco de dados externo, dados pessoais reais, teste destrutivo, carga ou invasão.

| Campo | Critério |
|---|---|
| ID / módulo / prioridade / risco | `TENANT-SEG-002` / portal do cliente (`src/server/client-space-api.mjs`) / **P0** / `SEG-AUD-001` (bypass quando verificação de unidade ou allowlist falha). |
| Pré-condição / dados | Teste de handlers Node diretamente, pool artificial com falhas por etapa; UUIDs e strings **sintéticos**. Nenhum banco/servidor/arquivo de documento aberto (teste de download não chega ao arquivo). Para HTTP real, exige PostgreSQL QA isolado, sessões e contas A/B criadas para QA. |
| Aceite local | Erro na consulta de grant, unidade ou allowlist retorna **503** sanitizado, sem leitura protegida nem mutação; grant ausente, revogado ou unidade não correspondente retorna **403**; lista selecionada vazia retorna `200 {contracts:[]}` sem SELECT de contratos; allowlist selecionada é parâmetro `ANY($2)` limitado à conta; sessão ausente retorna 401 sem DB. |
| Limite | Mock prova os caminhos testados, **não** prova integração PostgreSQL, concorrência/revogação durante a consulta, isolamento A/B completo, storage físico, RLS, SaaS multi-tenancy ou auditoria durável sob falha do próprio banco. Caso integral aguarda `TENANT-SEG-001` em E2 isolado. |

## Procedimento e rastreabilidade

1. `TENANT-SEG-002.A` — injetar erro em (i) grant inicial, (ii) releitura do grant/unidade, (iii) consulta de pertinência da unidade, (iv) allowlist do contrato; confirmar 503/nenhum SELECT de contrato, documento ou ticket. `node --test tests/client-space-fail-closed.test.mjs`.
2. `TENANT-SEG-002.B` — simular grant ausente, desaparecimento/revogação entre consultas e unidade fora do escopo; confirmar 403/sem dados. Requisições de documentos, tickets e download também são negadas quando a unidade falha; abertura de ticket não escreve.
3. `TENANT-SEG-002.C` — verificar via mock que allowlist `selected` vazia não lê contratos e a lista com um único UUID é aplicada em `client_account_id=$1 AND id=ANY($2)`; ausência de sessão = 401 e 0 consultas. Estes são testes de lógica, não evidência de dados reais.
4. `TENANT-SEG-002.D` — retestar unitários, typecheck, build, preflight e regressão RAG/PGlite isolado após correção. No ambiente QA PostgreSQL futuro: reproduzir os mesmos erros/negações pela API HTTP e com transações concorrentes, exercitar revogação e conta/unidade A/B (`TENANT-SEG-001`). Nunca executar SQL de teste em banco compartilhado/produção.

## Resultado observado

| Subetapa | Evidência | Resultado |
|---|---|---|
| Baseline antes do patch | 14 testes Node com pool artificial: **5 pass, 9 fail**, exit 1. Em falhas de unidade/allowlist, o checkout original prosseguia até leitura de contratos, documentos ou tickets; no download chegou ao caminho de arquivo. Uma tentativa de ticket POST foi barrada somente pela falha artificial de gravação, não pela autorização. | **FALHOU**; `SEG-AUD-001` reproduzido. |
| Reparo `TENANT-SEG-002.A/B/C` | `requireAccountScope`: releitura do grant exige `identity_id`, `client_account_id`, `revoked_at IS NULL`; ausência/negação resulta 403, exceção de DB resulta 503 e `return null`. `handleClientContracts`: grant ausente/modo inválido nega 403; erro de consulta de allowlist nega 503; modo selected mantém filtro ou devolve lista vazia. **14/14** testes do arquivo passaram. | **PASSOU nos cenários mock**, não encerra o defeito em PG. |
| Regressão local `TENANT-SEG-002.D` | `npm ci --no-audit --no-fund` exit 0; `npm test` **89 pass, 0 fail, 0 skip**; `npm run typecheck` exit 0; build beta (`NEXT_PUBLIC_ALLOW_INDEX=false NEXT_PUBLIC_ENV=beta`) exit 0 **66/66** páginas; `node scripts/qa-wave0-static.mjs` **5/5**; `npm audit --audit-level=high` **0 vulnerabilidades reportadas**; `npm run test:rag` em PGlite temporário exit 0 e custo **14/14**, Ollama real desativado; `git diff --check` limpo. `next-env.d.ts` regenerado pelo build e restaurado ao conteúdo HEAD. | **PASSOU local**, sem CI remoto/PG. |
| Validação E2 real | Não há PostgreSQL QA dedicado/credenciais aprovadas nem autorização para operações destrutivas; integração PG 001–096 e concorrência/revogação **não foram executadas**. | **BLOQUEADO**; caso geral **PARCIAL**, release **NO-GO**. |

**Decisões e limites:** `SEG-AUD-001` foi **mitigado no código e verificado por injeção de erro em memória**, mas permanece aberto até reteste HTTP/PG isolado. Os handlers usam leituras separadas sem transação que fixe uma fotografia do grant; concorrência e revogação durante a janela ainda precisam de teste e possivelmente redesenho. Quando o banco falha, a auditoria no próprio banco não é garantida; 503 não significa trilha persistida. O retorno 200 de allowlist vazia significa zero dados, não acesso aprovado. A listagem de contas e demais módulos não está coberta por este caso.

**Atualização após este bloco:** `TENANT-SEG-001` teve [teste A/B HTTP em PostgreSQL 17.9 descartável](qa-casos-onda3-tenant-pg.md) no recorte 001–007; revogação sequencial passou, mas corrida/exportação v2 seguem pendentes. `PLT-MIG-001` dinâmico falhou em 021; CI remoto não executado. Não simular cobertura dos outros módulos ou marcar isolamento SaaS integral como homologado.
