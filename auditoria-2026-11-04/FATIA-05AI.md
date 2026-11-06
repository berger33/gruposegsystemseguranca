# Fatia 05AI — supervisão do backup/restore sintético

**Data:** 06/11/2026. `HEAD` e `origin/main` após fetch: `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b` (PR #349). Branch `arena/8208e8f7-gruposegsystemseguranca`. Alterações 05Y–05AH preservadas; sem commit, push, PR, deploy ou dados de operador. Matriz antes **66/68**, depois **67/68 adotados localmente**. Produção **NO-GO**.

## Escopo e alteração

O runner `scripts/qa-backup-restore-postgres.mjs` executa oito variantes QA, com um cluster e duas bases novas ou dois clusters independentes em loopback. Mantém recusas de URL/opt-in remoto e de `CLIENT_DOCS_DIR` em modo sintético, requisitos dos modos, clientes PG major 17, dados e credenciais sintéticos, migrações, dump/restore, conferências de catálogo, ledger, contas A/B, grants, documentos, arquivos, assinatura, inventário, objetos CLI e HTTP conforme cada variante. Nenhum cenário foi removido e os testes existentes de integração não foram enfraquecidos.

Em POSIX, o pai supervisiona desde o preflight dos executáveis; `embedded-postgres` só é importado no worker. Para manter fases monotônicas, no modo supervisionado ambos os clusters são inicializados antes de ambos serem iniciados, depois as duas bases são criadas pelo helper local limitado. O modo Windows mantém a ordem e implementação anteriores, sem homologação nova. O arquivo dump, clusters, diretórios de arquivos/âncora e as duas raízes CLI ficam sob `QA_PG_DIRECTORY` (também `TMPDIR` dos filhos); o worker não remove o sandbox principal, reservado ao pai. O marcador histórico de limpeza só é emitido quando a limpeza do supervisor foi confirmada. O pai restaura os arquivos gerados Next/TypeScript. O processo de HTTP e ferramentas PG compartilham o grupo de processos do worker nas execuções observadas.

Prazos por fase: boot 30s, inicialização dos dois clusters 120s, início 60s, criação 30s, migração de origem 90s, teste 900s (inclui dump, restore, migração da base restaurada e HTTP), stop 30s, conclusão 5s; teto agregado **1265s**, além de margens de encerramento e limpeza. A margem é baseada nas amostras locais, não promessa em máquinas mais lentas. O workflow preserva as oito variantes e a coleta de todos os resultados, shell e instalação verificada dos clientes oficiais; acrescenta a suíte do supervisor. O job de 60 minutos permanece: os tetos de oito execuções, se todos forem atingidos, **não cabem simultaneamente** no job, que pode interromper o conjunto antes de todos os resultados. CI remoto não foi executado.

## Ferramentas de QA

Não havia `pg_dump`/`pg_restore` instalados. Para este ensaio local somente, fonte oficial GitHub PostgreSQL `REL_17_9`, commit `6d396980fc5aed4f1a525e0bd75cb16b25ed40ca`, foi obtida com `gh api`; tarball SHA-256 `76b5e6610b20c169c2b4d75ab2db4d43c4714cd106fab8a11c387194971cadd9`. Clientes compilados em `/tmp/f05ai/pgsrc` com `--without-readline --without-zlib --without-icu`, bibliotecas locais e sem flex/bison; placeholders e exclusão de `psqlscan.o` apenas no Makefile temporário de frontend, seguindo precedente da onda 9. A primeira compilação `make -j2` falhou por corrida de header gerado; a repetição sequencial passou. `pg_dump` e `pg_restore` reportaram 17.9. Não são binários homologados para produção, não foram adicionados ao Git, e `/tmp` pode não persistir.

## Ensaios reais locais

| Variante | Baseline legado exit 0 | Supervisionado exit 0 |
|---|---:|---:|
| base | 23,88s | 17,92s |
| clusters | 26,08s | 21,23s |
| files | 21,53s | 27,04s |
| http | 21,08s | 30,38s |
| signed | 29,29s | 25,08s |
| inventory | 29,59s | 21,40s |
| cli-objects | 29,13s | 24,24s; repetição final 17,31s |
| cli-partial | 28,58s | 28,98s; repetição final 15,71s |

Todas as variantes conferiram 582 tabelas, 183/183 checksums de migração, dados A/B e origem inalterada no recorte; outputs de arquivos, assinatura, HTTP, inventário e CLI são próprios dos modos pertinentes. As primeiras oito passaram antes do ajuste que explicitou a raiz CLI dentro do sandbox; ambas as variantes CLI foram repetidas com sucesso após o ajuste. Sob dois consumidores de CPU, CLI-partial passou em 21,93s, incluindo rollback compensado, checagens finais de DB/HTTP e limpeza. Não são oito backups reais independentes.

Sete injeções mantiveram **exit 1**, sem `QA_RESTORE_VERIFIED`, com limpeza: arquivo dump inválido (`pg_restore_list_exit_1`), byte de arquivo (`qa_file_archive_sha256_mismatch`), coadulteração de manifesto (`qa_file_manifest_sha256_mismatch`), chave de assinatura adulterada (`qa_signature_untrusted_key`), arquivo ausente no inventário (`qa_inventory_legacy_file_missing`), reivindicação de cobertura integral (`qa_inventory_unresolved_references`) e chave CLI adulterada (mesmo erro de assinatura, zero objetos no destino antes da limpeza). CLI-partial é negativo esperado compensado que prossegue e termina exit 0, com verificações explícitas. Não equivale a rollback global do restore.

Um cliente falso pendurado no preflight produziu `timeout-boot`, exit 1 em 30,15s e sandbox vazio, sem processo falso ativo observado. Recusa de clientes ausentes manteve exit 2 e nenhum banco pronto. `npm run test:pg-supervisor:pg` reproduziu colisão e cluster morto, com falhas internas esperadas e limpeza, exit geral 0.

Cancelamentos enviados ao pai: dois clusters prontos SIGTERM **143** (15 processos observados); dump propositalmente atrasado SIGTERM **143** (17 observados, ambas as raízes CLI presentes); servidor HTTP iniciado SIGINT **130** (17 observados, ambas as raízes CLI presentes). Diretórios próprios ficaram vazios e nenhum descendente amostrado estava ativo depois; processos zumbis não contam como ativos. Medição por árvore de processos amostrada via `ps`, não prova ausência absoluta de processos destacados, nascidos entre amostras ou sob SIGKILL/OOM. HTTP iniciado não prova navegação concluída. Hashes após cancelamento: `next-env.d.ts` `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; `tsconfig.json` `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

## Regressões e limites

Supervisor **86/86**; guardas de backup + supervisor **95/95**; focal backup/assinatura/inventário/CLI **47/47**; `npm test` **1627/1627**, zero falhas/skip/todo; typecheck e build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, três inventários `--check` aprovados, `git diff --check` limpo. A primeira rodada de testes de supervisor+guardas foi **94/95** devido a asserção nova apontar nome inexistente de função de preflight; corrigida para o comando realmente executado, repetição 95/95. Logs e harness em `/tmp/f05ai` são temporários e não versionados.

O gate é **somente sintético**: não comprova backup coordenado DB+arquivos/WAL sob concorrência, armazenamento real, assinatura/custódia/KMS reais, RPO/RTO, restore operacional, UAT, CI remoto ou Windows. A função API de backup não é liberada por este trabalho. Integridade do checkout compartilhado em gates concorrentes não foi homologada. `qa-ux-pro-e6-postgres.mjs` permanece pendente: baseline 05AG sofreu OOM global; não foi alterado nem reexecutado. SIGSEGV observados em L06 e RAG continuam sem causa estabelecida. Client-security/N8 e N9 continuam abertos; produção permanece **NO-GO**.
