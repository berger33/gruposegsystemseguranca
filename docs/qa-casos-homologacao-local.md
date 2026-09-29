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
| `PLT-SMK-001`, `PLT-CI-001` | `node scripts/qa-wave0-static.mjs`; `npm test`; `npm run typecheck`; `npm run build` | Pré-checagem 5/5; unitários **141/141** após teste de porta ocupada; typecheck exit 0, build exit 0, `/qa/modulos` compilada como dinâmica. `--verify` foi repetido em Linux após a correção: 96/96, smoke HTTP e limpeza exit 0. |
| `QA-HOM-001` / Windows (relato do usuário) | `INICIAR-HOMOLOGACAO.bat` após `npm ci`; porta 3000 ocupada | **BLOQUEADO**, `qa_port_3000_busy_stop_the_old_preview` no ZIP anterior: nenhuma migração executada. Preflight do novo pacote checa a porta antes de `npm ci`; reteste no Windows pendente. |
| `QA-HOM-001` / instalação Windows | `npm warn install-scripts` para `@embedded-postgres/windows-x64@17.9.0-beta.17` | Aviso **não é** falha de porta. Tarball SHA-512 confere com lockfile; `native/pg-symlinks.json` contém `[]`, logo o script bloqueado não possui symlinks para criar neste pacote. O PostgreSQL no Windows iniciou no relato seguinte, mas a homologação foi bloqueada antes do fim das migrações. |
| `QA-HOM-001` / Windows, primeira tentativa (relato do usuário) | Migrações 001–013 aplicadas em cluster descartável; próxima falhou com `UTF8 ... WIN1252`; cleanup registrado | **FALHOU / NÃO HOMOLOGADO.** Banco QA herdou codificação WIN1252 do cluster. |
| `QA-HOM-001` / Windows, segunda tentativa (relato do usuário) | `initdb` forçado em UTF-8 deu `FATAL invalid byte sequence for encoding "UTF8": 0xe7 0x61 0x2f`, exit 1; cleanup registrado | **FALHOU / NÃO HOMOLOGADO.** Tentativa de forçar UTF-8 no cluster também falhou **antes de 001**; alteração substituída, não mantida. |
| `QA-HOM-001` / correção/reteste local | `node scripts/qa-homologacao-local.mjs --verify-win1252` (Linux: cluster emulado WIN1252) | `QA-HOM-001_CLUSTER_ENCODING: WIN1252` e `QA-HOM-001_ENCODING: server=UTF8 client=UTF8 Unicode round-trip OK` no DB QA; **96/96**, smoke de papéis, cleanup true, exit 0. Novo runner deixa `initdb` nativo e cria DB QA UTF-8 `TEMPLATE template0 LC_COLLATE C LC_CTYPE C`; ordenação C **não é UAT regional**. |
| `QA-HOM-001` / codificação Linux normal | `node scripts/qa-homologacao-local.mjs --verify` | Cluster SQL_ASCII; banco QA UTF8, **96/96** migrações, smoke e cleanup true, exit 0. Ambos ensaios são Linux; correção no Windows **ainda pendente**. |
| Windows / UAT humano | Executar `.bat` com porta livre e navegar por todos os papéis | **PENDENTE**. |

**Reprodução do ZIP extraído:** preflight, `npm ci`, `--verify-win1252` e `--verify` tiveram exit 0; ambos os últimos registraram banco QA UTF8, 96/96, smoke HTTP e cleanup true. Na extração o cluster padrão Linux apareceu UTF8; uma primeira asserção auxiliar que o presumiu SQL_ASCII falhou, embora o smoke tivesse exit 0. A asserção foi corrigida para aceitar qualquer codificação do cluster padrão e exigir WIN1252 somente no ensaio simulado; verificação final passou. Pré-checagem antecede `npm ci` nos dois lançadores. Após qualquer nova edição do ZIP, repetir checksum/exclusões e smoke antes de entregá-lo. **No Windows, continua pendente.**

**Evidências temporárias (não versionadas):** `/tmp/qa-hom-{npmci,unit,type,build,verify,negative}.log`. Não contêm senhas de acesso do runner em `--verify`; logs `/tmp` não são garantia de persistência. Revisar saída final antes de afirmar números definitivos.

**Pendências:** teste Windows do binário PostgreSQL embutido; UI e RBAC completos; troca do token Marcelo por identidade individual; conferência de revogação de sessão staff; matriz de 222 requisitos; dados de documentos/bytes e backup; UAT por papel; validação jurídica/trabalhista/fiscal; carga/pentest exclusivamente com autorização específica em staging isolado.

**Próximo passo:** instalar ZIP separado em Windows isolado; anotar resultado de `INICIAR-HOMOLOGACAO.bat`, smoke sem segredos e roteiro manual por papel. Aguardar `CONTINUAR` para lotes amplos, não promover produção.

## Atualização posterior — QA-HOM-005 (`SEC-06`, `SEC-07`)

O usuário confirmou posteriormente que abriu o esboço no Windows; isso corrige apenas o estado de **abertura visual** descrito acima, não homologa os 222 requisitos. No primeiro lote P0 seguinte, o runner `--verify` ganhou negativas HTTP para as rotas de segurança do cliente: anônimo 401, autenticado 503 explícito (MFA e troca de e-mail ainda não implementados), origem estrangeira 403, cookie antigo após MFA sintético 401 e senha correta com MFA sintético ativo 503 sem cookie. Em Linux, 96/96 migrações, smoke completo e cleanup true, exit 0; unitários 147/147, typecheck e build exit 0. Detalhes, limites e próxima ação: [QA-HOM-005](evidencias/QA-HOM-005-seguranca-cliente-fail-closed.md). **Não se trata de MFA funcional, Windows revalidado nem autorização do Funnel.**
