# Execução — primeiro lote do pacote separado de homologação local

**Data de execução:** 2026-09-28 (America/Sao_Paulo, data de referência da sessão). **Ambiente efetivamente ensaiado:** Linux, Node 22.22.3, PostgreSQL 17.9 via `embedded-postgres` em cluster recém-criado em loopback. Massa somente sintética. Nenhum teste real de Windows executado aqui; não extrapolar. Produção: **NO-GO**.

## Decisões e limites

- A prévia antiga PGlite não foi substituída. O novo ZIP inicia 96 migrações em banco PG novo e um processo de desenvolvimento local; não lê `.env`, URL externa ou banco preexistente. A rota `/qa/modulos` só aparece mediante marca explícita e URL do PG efêmero em loopback.
- TI, RH, Admin e Cliente A são identidades geradas a cada execução com e-mail `example.invalid`, senha aleatória e hash scrypt. Marcelo usa **chave legada temporária** gerada na inicialização porque a migração 006 não permite perfil staff `marcelo`; não se trata de autenticação individual concluída (`SEC-05` pendente).
- Corrigida a falha encontrada no recorte: cookie de RH tinha acesso à leitura/alteração de leads e à administração das contas do portal. GET/PATCH leads e endpoints de administração de contas agora negam RH; papel admin também é negado nestes endpoints legados, cujo esquema de auditoria só aceita `ti`/`marcelo`. Permissões de todos os demais handlers ainda exigem uma matriz mais ampla.
- Índice distingue **operacional no recorte** de **protótipo**, **em modelagem**, **bloqueado** e **interface/API não homologada**. As próprias páginas `/admin/ti` e `/admin/marcelo` agora deixam visível que seus cartões são apenas descritivos. Nenhuma tela demonstrativa foi marcada como concluída.

## Evidências observadas deste lote

| ID / vínculo | Comando / critério | Resultado |
|---|---|---|
| `QA-HOM-001` / `PLT-MIG-001` | `node scripts/qa-homologacao-local.mjs --preflight`; injetar `DATABASE_URL` inválida | Limpo exit 0; URL injetada recusada exit 2, sem iniciar DB. |
| `QA-HOM-001` / `PLT-MIG-001` | `node scripts/qa-homologacao-local.mjs --verify` | Exit 0; 96/96 migrações PG, 4 identidades/2 contas fictícias; cleanup `QA_HOM_TEMP_CLEANED: true`. |
| `QA-HOM-002` / `SEC-04`, `SEC-05` | Smoke HTTP staff TI/RH/Admin e chave Marcelo + login Cliente A | 5 respostas HTTP 200; consulta privada de Marcelo **não habilitada**; validação de cookie via fetch com cookie capturado (não armazenado). |
| `QA-HOM-003` / `TENANT-SEG-001` | Smoke HTTP sem sessão/RH vs. TI/Marcelo | Anônimo leads 401; RH leads/contas e PATCH lead 403; Admin nas contas legadas 403; TI leads e Marcelo contas 200. Rerun final exit 0. |
| `QA-HOM-004` / `CLIENTE-SEG-001` | Cliente A vs. anônimo em `/api/client/accounts` | Cliente A 200 só conta A; anônimo 401; B não listada. Outras rotas ainda pendentes. |
| `PLT-SMK-001`, `PLT-CI-001` | `node scripts/qa-wave0-static.mjs`; `npm test`; `npm run typecheck`; `npm run build` | Pré-checagem 5/5; unitários **140/140** no rerun final após inclusão de 7 testes de preflight; typecheck exit 0, build exit 0, `/qa/modulos` compilada como dinâmica. |
| Windows / UAT humano | Executar `.bat` em Windows 22, navegadores e roteiros de todos os papéis | **NÃO EXECUTADO AQUI / PENDENTE**. |

**Reprodução do ZIP extraído:** `unzip` em pasta `/tmp/seg-hom-archive-*`, `npm ci` e `node scripts/qa-homologacao-local.mjs --verify` concluíram smoke HTTP e `QA_HOM_TEMP_CLEANED: true` com `extracted_exit=0` na execução observada. Pré-checagem antecede `npm ci` nos dois lançadores. Após qualquer nova edição do ZIP, repetir checksum/exclusões e smoke antes de entregá-lo. No Windows, continua pendente.

**Evidências temporárias (não versionadas):** `/tmp/qa-hom-{npmci,unit,type,build,verify,negative}.log`. Não contêm senhas de acesso do runner em `--verify`; logs `/tmp` não são garantia de persistência. Revisar saída final antes de afirmar números definitivos.

**Pendências:** teste Windows do binário PostgreSQL embutido; UI e RBAC completos; troca do token Marcelo por identidade individual; conferência de revogação de sessão staff; matriz de 222 requisitos; dados de documentos/bytes e backup; UAT por papel; validação jurídica/trabalhista/fiscal; carga/pentest exclusivamente com autorização específica em staging isolado.

**Próximo passo:** instalar ZIP separado em Windows isolado; anotar resultado de `INICIAR-HOMOLOGACAO.bat`, smoke sem segredos e roteiro manual por papel. Aguardar `CONTINUAR` para lotes amplos, não promover produção.
