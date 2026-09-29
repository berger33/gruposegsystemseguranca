# Execução guiada — PLT-SMK-001 — preflight estático

Data-base: 2026-09-28. Baseline: branch `arena/01a0e96a-gruposegsystemseguranca`, commit `5b4b2006478db7d6951f5af21d8f99cd24e00a2e`. Node v22.22.3, npm 10.9.8. ZIP de referência (somente leitura): SHA-256 `828716ecf7acf308c35d4c9f49d652f4517811613d771dfa14946f81e9bc6ce9`.

## Resultado deste bloco

| ID / subetapa | Status | Esperado | Observado |
|---|---|---|---|
| PLT-SMK-001 / preflight somente leitura | **FALHOU** | 0 imports relativos ausentes; dependências runtime declaradas no package e no lockfile; exit 0 | `node scripts/qa-wave0-static.mjs` exit **1**; **85** imports relativos de `server.mjs` ausentes; `package.json` não declara `@next/env` nem `@electric-sql/pglite`. Primeiros imports ausentes: `admin-rbac-api.mjs`, `admin-audit-api.mjs`, `notification-queue.mjs`. |
| PLT-SMK-001 / instalação, suíte, build, servidor HTTP | **BLOQUEADO neste bloco** | `npm ci`, testes, tipos, build exit 0 e health HTTP 200 | Não executados neste bloco, pois o gate estático falhou. A auditoria da Fase 0 já registrou falhas anteriores, mas não substitui execução nesta baseline após reparo. |
| PLT-CI-001 / diagnóstico incidental | **NÃO EXECUTADO integralmente** | workflow fonte presente e gates reais | O preflight também sinalizou `.github/workflows/ci.yml` ausente; não houve execução de CI. |
| PLT-MIG-001 / diagnóstico incidental | **NÃO EXECUTADO integralmente** | arquivos 001–096 únicos, migrador PG cobre 001–096 | O preflight sinalizou **88** migrações ausentes (008–095) e **92** números não agendados no migrador PG (005–096). Nenhum SQL foi executado. |

**Trecho sanitizado da evidência de terminal:**

```text
PREFLIGHT_EXIT=1
FALHOU PLT-SMK-001: Imports relativos estáticos de server.mjs
FALHOU PLT-SMK-001: Dependências runtime declaradas em manifest e lockfile
FALHOU PLT-MIG-001: Migrações SQL 001–096 contínuas e únicas
FALHOU PLT-MIG-001: Migrações 001–096 registradas no migrador PG
FALHOU PLT-CI-001: CI com install/test/typecheck/build sem bypass
RESUMO: 0/5 verificações estáticas OK; 85 imports ausentes; 88 migrações ausentes.
```

Estado do Git antes/depois: somente os quatro arquivos novos de QA (`docs/plano-mestre-testes.md`, `docs/qa-auditoria-fase0.md`, `docs/qa-casos-onda0.md`, `scripts/qa-wave0-static.mjs`); o preflight não alterou código nem dados. A documentação desta execução foi adicionada **depois** da comparação. Nenhum serviço externo, banco, Docker, túnel, teste de carga ou produção foi acessado.

## Relato de defeito — PLT-DEF-001

- **Título:** Checkout de QA não inicializável por imports e dependências runtime ausentes.
- **Ambiente:** commit e versões acima; checkout local, sem banco configurado.
- **Passos para reproduzir:** `node scripts/qa-wave0-static.mjs`; observar exit 1 e lista de 85 imports ausentes / 2 dependências não declaradas. Para confirmação pontual, `node --input-type=module -e "import('./server.mjs')"` já falhou na auditoria anterior com `ERR_MODULE_NOT_FOUND` em `src/server/admin-rbac-api.mjs`; não repetido neste bloco.
- **Resultado atual × esperado:** 85 imports ausentes e runtime manifest incompleto × 0 imports ausentes e runtime/lock declarados.
- **Severidade / prioridade:** **S2 / P0 de bloqueio de release** (aplicação não inicia neste checkout; não é alegação de vazamento em produção).
- **Impacto:** impede smoke HTTP, integrações, homologação e confiança no artefato de release; o ZIP beta não é substituto automaticamente confiável, pois 27 caminhos comuns diferem conforme auditoria.
- **Causa provável (hipótese):** árvore parcial/inconsistente após transferência/merge, dependências e migrações divergentes; confirmar proveniência no histórico antes de alterar fonte.
- **Evidência:** saída sanitizada acima, `docs/qa-auditoria-fase0.md` para inventário comparativo, lista completa reproduzível pelo script somente leitura.
- **Reprodução/regressão após correção:** refazer PLT-SMK-001 completo, PLT-CI-001 estático + CI real quando disponível, PLT-MIG-001 estático + PG isolado; depois `TENANT-SEG-002`/`TENANT-SEG-001` com massa A/B.

## Decisão e próximo bloco

**NO-GO** para qualquer inferência de sistema funcional/release. Não substituir arquivos divergentes pelo ZIP. Próximo bloco de trabalho seguro: reconciliar **somente arquivos ausentes** com fonte/histórico revisados, atualizar manifest/lock e migrador/CI sob revisão, mantendo cópias existentes mais recentes; repetir o preflight. Se a solicitação permanecer apenas de QA, o próximo teste não executável fica `BLOQUEADO` até o reparo. Falhas potenciais de autorização em `client-space-api.mjs` continuam prioridade P0 separada para a Onda 1.
