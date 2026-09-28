# Fase 2 — Casos detalhados da Onda 0 (integridade do checkout)

Data: 2026-09-28. Plano mestre **aprovado pelo usuário** nesta conversa; baseline conhecida `arena/01a0e96a-gruposegsystemseguranca` @ `5b4b200`. Referências: [plano](plano-mestre-testes.md), [auditoria](qa-auditoria-fase0.md). Este documento contém a especificação e um quadro de resultados; a evidência de cada execução está vinculada no final. Prévia automatizada somente leitura: `node scripts/qa-wave0-static.mjs`. Falha de preflight é defeito/bloqueio, não permissão para mascarar teste ou copiar o ZIP sobre o código. Antes de executar, confirmar SHA/árvore e não sobrescrever alterações do usuário.

## Ordem e gate

1. `PLT-SMK-001`: integridade/deps/build/import, depois HTTP em loopback **somente se** baseline íntegra.
2. `PLT-CI-001`: pipeline confiável, skips explicados e falhas não mascaradas. CI remoto apenas na branch fixa, se push explicitamente solicitado; sem mexer em produção.
3. `PLT-MIG-001`: inventário estático; migração dupla e rollback **somente em banco PostgreSQL de teste dedicado**, se disponível. Beta PGlite é trilha separada e schema mínimo não valida todos os 222 requisitos.

**Gate desta onda:** 0 imports ausentes; dependências/lock consistentes; 0 falhas no teste unitário, 0 skips inesperados; typecheck/build exit 0; smoke servidor HTTP 200; CI reporta falhas; 001–096 presentes e agendadas, migração idempotente em PG isolado. Se faltar PG, parte dinâmica fica `BLOQUEADO` e a onda não é declarada aprovada. Um resultado pode ser `PASSOU`, `FALHOU` ou `BLOQUEADO` por subetapa; o caso geral só passa quando todas as subetapas obrigatórias passam.

## PLT-SMK-001 — Checkout íntegro e aplicação inicializável

| Campo | Especificação |
|---|---|
| ID / Módulo / Categoria / Prioridade / Risco | **PLT-SMK-001** / Plataforma / smoke e sistema / **P0** / PLT-RISCO-001, QA-RISCO-001 |
| Pré-condições | checkout local identificável com Node >=20.9, npm, permissão de leitura; **sem** `DATABASE_URL` de produção, `MAIL_HOST` real, túnel público ou uso de dados reais. Para a etapa HTTP: import e build aprovados, porta de loopback livre, segredo local sintético gerado fora do repositório se login for necessário (não é para health). |
| Dados de teste | código e `package-lock.json` do commit, ZIP apenas para comparação; `PORT=3002`, `BIND_HOST=127.0.0.1`, `OLLAMA_ENABLED=false`, `MAIL_HOST` vazio. Nenhuma conta ou dado pessoal. |
| Automatizável? / Ferramenta | Sim: script Node somente leitura, `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, processo Node local e `curl`/`fetch`. Não fazer start público. |

**Passos numerados:**

1. Registrar `git rev-parse HEAD`, `git status --short`, `node --version`, `npm --version`; registrar `sha256sum dist/seg-system-beta.zip` se o artefato existir. Não usar `git reset/checkout` sobre alterações não inspecionadas.
2. Executar `node scripts/qa-wave0-static.mjs` e conferir se `PLT-SMK-001` retorna **zero imports relativos ausentes** e nenhuma dependência runtime sem declaração no manifest/lockfile. Registrar problemas específicos; o script também analisa CI/migrações e, portanto, pode retornar exit 1 por outra categoria.
3. Em checkout pronto, executar `npm ci` com lockfile do mesmo commit e registrar exit code; depois `npm test` e confirmar **0 falhas e 0 skips inesperados**. Separar testes de banco que exigem `RUN_DATABASE_INTEGRATION=1`: skip justificado não conta como execução integrada.
4. Executar `npm run typecheck` e `npm run build` com saída e exit code separados. Next pode regenerar `next-env.d.ts`: registrar a mudança e restaurar **apenas** alteração comprovadamente gerada pelo build, sem sobrescrever alterações preexistentes de outra pessoa.
5. Confirmar que imports do servidor resolvem antes de iniciar processo. Somente com etapa 2 e build verdes, iniciar `node server.mjs` em loopback com Ollama/SMTP externos desativados e banco sintético/isolado; consultar `/api/health/live` por `fetch` local. Não iniciar com `DATABASE_URL` desconhecido; não publicar túnel. Encerrar o processo ao final.
6. Repetir `git status --short` e registrar apenas alterações previstas (`node_modules`, `.next`, dados temporários ignorados). Se o processo não puder iniciar por módulo/dependência ausente, **não** simular 200.

**Resultado esperado mensurável:** nenhum import relativo faltante; todas as dependências runtime declaradas em manifest e lockfile; `npm ci`, `npm test`, `typecheck` e `build` exit **0**; zero falhas na suíte; smoke GET local retorna **HTTP 200** com corpo de health válido em até 10 s após o servidor escutar (10 s é orçamento de teste, não SLA). Falha ou bloqueio em qualquer subetapa impede `PASSOU` global.

**Evidência a coletar:** SHA, branch/status inicial e final, lista de imports/deps, versão Node, exit code e trecho sanitizado das quatro saídas, status/corpo sanitizado do health, tempo e logs do processo; não guardar `.env`, cookies, chaves nem PII. **Situação conhecida antes da execução desta onda:** auditoria anterior constatou 85 imports ausentes, PGlite não declarado, `npm test` exit 1, build/typecheck exit não-zero. Esses fatos não são nova execução deste caso.

## PLT-CI-001 — CI obrigatório detecta falhas e não disfarça skip

| Campo | Especificação |
|---|---|
| ID / Módulo / Categoria / Prioridade / Risco | **PLT-CI-001** / Plataforma / pipeline, regressão e contrato / **P0** / QA-RISCO-001 |
| Pré-condições | commit/pacote de referência identificado; workflow no checkout ou registrar falta. Para checagem remota: CI disponível e autorização de push para **branch fixa desta sessão somente**, nunca `main`. Não alterar repositório com teste negativo persistente. |
| Dados de teste | arquivo de teste sintético temporário local que retorna `exit 1`, e outro marcado como `skip`; criar somente em diretório QA temporário controlado e remover apenas esses próprios arquivos. Não usar credenciais GitHub nem segredos na saída. |
| Automatizável? / Ferramenta | Sim: revisão estática `node scripts/qa-wave0-static.mjs`, Node test e CI GitHub se habilitado; revisão humana confirma distinção de skip esperado vs inesperado. |

**Passos numerados:**

1. Executar a verificação `PLT-CI-001` do script estático; inspecionar `.github/workflows/ci.yml` no **checkout**, não apenas no ZIP. Exigir no fluxo `npm ci`, `npm test`, `npm run typecheck`, `npm run build` e verificação de migrações, sem `|| true` (ou equivalentes) em gates de qualidade. Inspeção de texto é pré-checagem, não prova de CI executado.
2. Executar localmente a suíte padrão e registrar contagens pass/fail/skip e códigos; todo teste integrado pulado por falta de banco deve ser nomeado e registrado `BLOQUEADO` na trilha de integração. O arquivo RAG que imprime `Skip` **não é** 12 casos aprovados.
3. Quando CI de fonte estiver restaurado, introduzir **apenas em worktree temporário de teste** um teste sintético falho e confirmar que o comando `npm test` sai !=0; conferir igualmente que `tsc` e build falhos impedem a promoção. Não publicar nem misturar o teste sintético com trabalho real. Repetir com skip inesperado e verificar se o relatório distingue bloqueio; se pipeline não falhar automaticamente em skip, falha da política QA e deve-se adicionar gate explícito.
4. Somente após autorização específica para push da branch fixa, conferir resultado de CI no commit da branch (`gh`); não executar workflow contra produção nem fazer merge. Sem CI remoto, registrar subetapa como `BLOQUEADO`, não `PASSOU`.

**Resultado esperado mensurável:** workflow fonte existe e contém todas as quatro etapas obrigatórias; falha proposital causa exit **não-zero**; nenhum gate obrigatório contém bypass; integração não executada é reportada como bloqueada, não incluída nos testes aprovados; resultado remoto verde somente quando todas as etapas realmente rodaram. **Evidência:** arquivo/commit do workflow, saída estática, contagens de testes, exit codes positivo/negativo, link/ID de run se ocorrer, classificação de skips e comprovação de remoção apenas do fixture temporário. **Situação conhecida:** workflow ausente da árvore; existe somente no ZIP histórico.

## PLT-MIG-001 — Migração completa, idempotência e plano reversível

| Campo | Especificação |
|---|---|
| ID / Módulo / Categoria / Prioridade / Risco | **PLT-MIG-001** / Plataforma / integração de banco, migração e deploy / **P0** / PLT-RISCO-001, BACKUP-RISCO-001 |
| Pré-condições | para estático: acesso somente leitura; para runtime: migrações reconciliadas, **PostgreSQL descartável em loopback controlado**, nome de banco prefixado `seg_qa_`, usuário específico, URL de migração exclusiva e backup testável; confirmar que URL não é produção e pedir aprovação antes de qualquer comando de schema. Sem DB de teste, nenhuma migração será executada. |
| Dados de teste | sequência de arquivos numerados 001–096; fixtures sintéticas de duas contas (`example.invalid`) e 1 registro de feedback/custo criado **apenas no banco de teste**. Capturar contagem e fingerprint lógico de tabelas/índices/colunas e linhas de fixture antes/depois. |
| Automatizável? / Ferramenta | Inventário sim: `node scripts/qa-wave0-static.mjs`. SQL duas vezes: Node/`pg` + PostgreSQL de teste; rollback em clone isolado após plano de reversão aprovado. Não usar `db:migrate` apontando para URL ambígua. |

**Passos numerados:**

1. Executar verificação `PLT-MIG-001` do script; exigir exatamente **um** arquivo para cada prefixo 001–096 e que o migrador PG registre os mesmos 96 números em ordem definida. Verificar que todos existem e têm SQL não vazio; confirmar que schema **beta mínimo** não é contado como as 96 migrações PG.
2. Revisar permissões/URL do DB de QA e criar backup inicial somente desse banco, sem modificar outro schema. Aplicar o migrador uma vez em E2 e conferir exit 0, objetos esperados (`client_accounts`, `ai_rag_feedback`, `ai_rag_cost_tracking`) e ausência de erro no log.
3. Inserir fixtures A/B sintéticas, registrar contagem e estrutura, aplicar migrador pela segunda vez na **mesma base QA**, conferir exit 0, contagem de fixtures inalterada e estrutura sem objetos duplicados/perdidos. Observar que views de 096 são `CREATE OR REPLACE`; nome de arquivo conter “rollback” **não** prova reversão de schema.
4. Em **outro clone isolado** do QA, ensaiar restauração do backup e caminho de reversão documentado e revisado. Se não houver `down migration` ou restore aprovado, registrar `BLOQUEADO`; jamais testar rollback destrutivo na base original, staging compartilhado ou produção.

**Resultado esperado mensurável:** 96/96 arquivos únicos e registrados; duas aplicações exit **0**, **zero** fixtures removidas/duplicadas e mesmas chaves/contagens estruturais; feedback/custo acessíveis na base QA; restauração de clone preserva checksums/contagens; etapa sem plano de reversão fica `BLOQUEADO`. **Evidência:** relatório estático, URL sanitizada (mostrar só host loopback e prefixo do banco, **nunca senha**), hash dos SQL, saídas/exit codes das duas aplicações, contagens/fingerprint, artefato de backup guardado fora do Git e validação do restore. **Situação conhecida:** 88 arquivos ausentes; migrador atual enumera apenas 001–004; Docker/PG não disponíveis neste sandbox; execução SQL permanece bloqueada.

## Registro de execução por blocos

| ID | Subetapa | Status atual | Evidência sanitizada | Defeito / dependência | Próxima ação |
|---|---|---|---|---|---|
| PLT-SMK-001 | preflight inicial | **FALHOU (histórico)** | [falha inicial](evidencias/QA-onda0-PLT-SMK-001-preflight.md): exit 1, 85 imports ausentes, 2 deps não declaradas | PLT-DEF-001 | reparo local documentado |
| PLT-SMK-001 | checkout beta após reparo, testes, build e HTTP | **PASSOU no recorte local** | [reteste](evidencias/QA-onda0-reparo-controlado.md): 5/5 estático, 46 unitários, 66 páginas, 7/7 smoke | release ainda NO-GO | avançar para isolamento |
| PLT-CI-001 | estático / negativa / CI remoto | **PARCIAL: estático passou, remoto bloqueado** | workflow criado e checado; não houve push/run | CI remoto e fixture negativo | só executar na branch fixa quando autorizado |
| PLT-MIG-001 | inventário / duas aplicações / rollback clone | **PARCIAL: inventário passou, SQL bloqueado** | 001–096 presentes; nenhum SQL executado | PG QA isolado e plano reversão | não executar SQL sem E2 isolado |

**Atualização:** `RAG-SEG-001` teve o recorte de autorização anônima [reparado e testado localmente](qa-casos-onda1-rag.md), mas permanece parcial (papéis/tenant em E2 bloqueados). Próximo bloco sugerido: `TENANT-SEG-002` com falha injetada nos filtros de autorização do portal, reparo fail-closed e isolamento A/B. Nenhum teste de carga, pentest, limpeza de DB compartilhado ou produção faz parte desta onda.
