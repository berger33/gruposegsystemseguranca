# Fatia 05AH — supervisão do gate de rotas públicas

**Data:** 06/11/2026. `HEAD` e `origin/main` após fetch: `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b` (merge PR #349). Branch ativa `arena/8208e8f7-gruposegsystemseguranca`; mudanças locais 05Y–05AG preservadas. Sem commit, push, PR, deploy, provedor externo ou dados reais.

**Fatia 05 parcial:** matriz 65/68 antes e **66/68 adotados / 2 pendentes** depois. Gate negativo do supervisor é arquivo extra fora do denominador. Produção **NO-GO**.

## Inventário e alteração

`npm run test:ux-public-routes:pg` executa `scripts/qa-ux-public-routes-postgres.mjs`; quatro workflows usam o mesmo runner e suíte com recortes diferentes: descoberta, conversão, raiz/prévias e acessibilidade das prévias. PostgreSQL 17 descartável UTF8 em loopback, migrações, HTTP e Chromium reais; dados sintéticos, Ollama e SMTP desligados. Conservados rotas públicas, noindex de prévia, estados de leitura, protocolo de orçamento sintético, falhas injetadas só em `window.fetch`, teclado/zoom e medições de contraste. `/qa/modulos` é provada no modo fechado; nada é publicado. Não se alteraram aplicação, CSS, migrações ou testes de integração.

No POSIX, wrapper após recusa de URLs herdadas/opt-in remoto e antes de import nativo; grupo exclusivo, criação local limitada, fases e conclusão IPC. O pai restaura `next-env.d.ts` e `tsconfig.json` em `finally`; marcador histórico de limpeza só aparece quando o supervisor confirma remoção. Stop rejeitado continua reprovando. Windows mantém caminho anterior, não homologado. Os quatro workflows preservam shell `observed-shell.sh`, patterns específicos, typecheck, npm audit, guardas, inventário e limites de 40/45 minutos; o de prévias mantém verificações **após** o gate sobre as medições recém-geradas. Acrescentados paths e testes do supervisor e ambiente local. A infraestrutura compartilhada, correção `FONTCONFIG_PATH` da PR #349 e regras de proveniência não foram alteradas. CI e npm audit remotos não foram executados aqui.

O runner preserva `UX_PUBLIC_TEST_PATTERN` e contrato legado por **exit code**, sem auditor TAP ou piso. Não confundir os quatro recortes com execução integral. Em Node 22, executar diretamente a suíte sem banco com padrão sem correspondência retorna exit 0 e contabiliza o próprio arquivo como um teste aprovado, sem executar cenários nomeados; o runner não dispõe de auditor para detectar isso. Em ensaio com banco, mesmo padrão ficou parado após o início do servidor por mais de 180s e foi cancelado; não é prova de sucesso nem de que todo padrão vazio retornará zero. Esta limitação permanece aberta, sem reduzir cobertura nem alterar filtros existentes. A evidência integral abaixo usou pattern vazio e conferência explícita de 24 casos reais.

A suíte 10B escreve dois artefatos versionados de medições/amostras, por contrato consumido no mesmo job; não são restaurados pelo wrapper, que cuida somente dos arquivos Next/TypeScript. Em execução e cancelamentos observados os hashes dos artefatos continuaram idênticos aos anteriores. Isso não garante integridade desses artefatos se o processo morrer durante uma escrita; testes concorrentes no mesmo checkout não são homologados.

Prazos: migração **90s**, teste **1500s**, soma das fases **1740s**, além de margens de encerramento/remoção. TAP mais longo observado **396,31s** sob dois consumidores CPU; a suíte tem timeout de navegação de 90s e timeout de espera por página de 45s, por operação. Não se mediu migração isoladamente. Margens para esta amostra, não garantia em máquinas lentas ou que todos os máximos internos caibam simultaneamente; os limites dos jobs incluem setup, auditoria e demais passos.

## Ensaios locais

Linux/Node 22.22.3, integral sem filtro, zero fail/skip/todo:

| Ensaio | Resultado | Tempo de parede |
|---|---|---:|
| Baseline anterior à alteração | 24/24, exit 0 | 332,75s |
| Supervisionado isolado | 24/24, exit 0, limpeza/restauração | 330,99s |
| Supervisionado sob dois consumidores CPU | 24/24, exit 0, limpeza/restauração | 406,09s |
| Grupo 1 (filtro de workflow) | 6/6 | 55,30s |
| Grupo 2 (filtro de workflow) | 7/7 | 52,23s |
| Grupo 3 (filtro de workflow) | 6/6 | 88,69s |
| Prévias 10B (filtro de workflow) | 5/5 | 152,30s |

Os filtros são subconjuntos da mesma suíte, não provas integrais independentes. Após o filtro 10B, guarda de medições **5/5** e inventário de contraste `--check` aprovados. O teste de navegador já possui até três tentativas de inicialização, mantidas; não há log por tentativa, portanto não se afirma que não houve retries.

Negativo PG `npm run test:pg-supervisor:pg` sob dois consumidores CPU: 6,84s, exit geral 0; colisão e cluster morto produziram falhas internas esperadas exit 1 e limpeza, não clusters aprovados.

Cancelamentos reais, sinal enviado ao supervisor após observar gatilho:

| Gatilho | Sinal | Exit | Tempo desde início |
|---|---|---:|---:|
| Banco pronto | SIGTERM | 143 | 1,02s |
| Servidor ouvindo em loopback | SIGINT | 130 | 10,44s |
| Chromium ativo | SIGTERM | 143 | 24,74s |

Nos três, sandbox observado removido, limpeza/restauração registradas, hashes de gerados intactos e nenhum descendente **observado** ativo na árvore amostrada via `/proc` por ancestralidade, PID e início. Zumbis não são ativos; processos destacados ou nascidos entre amostras podem escapar à medição. Chromium ativo não prova navegação concluída. Hashes SHA-256: `next-env.d.ts` `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; `tsconfig.json` `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`; medições 10B `14ff32329995276f479c99e3ec6d98d7db58b5f8b7886f9463e49a1d8441766c`; amostras `9faea36df5f7e1be5a4dc9cc2378fb163ae7047a74edac8e9b1a3b5f26965a42`.

## Regressões e histórico de tentativas

Supervisor **84/84**. Novas provas exercitam as três recusas reais exit 2, protocolo, filtros e ligação dos quatro workflows e demonstração da limitação do pattern sem banco. **Primeira execução dos testes de supervisor 83/84:** a asserção nova esperava `# tests 0` ao filtrar tudo, mas Node 22 relatou o arquivo como `# tests 1`; corrigida a expectativa para o comportamento observado, mantendo verificação de ausência dos cenários nomeados. Repetição 84/84.

**Sondagem com banco e pattern sem correspondência:** não terminou em 180s, deixando processo em execução após timeout da ferramenta. Enviado SIGTERM ao supervisor observado; exit de supervisor 143 registrado, sandbox removido e gerados restaurados. O comando não foi repetido e não é evidência de sucesso; não se sabe aqui se terminaria sem a interrupção ou somente pelo prazo da fase.

Focal supervisor, guardas dos três grupos, inventário de rotas, medições, contraste, higiene e package-artifacts **128/128**. `npm test` **1625/1625** sem fail/skip/todo; typecheck e build exit 0, sequenciais. SEC **35/35 âncoras**, wave0 **5/5**; três inventários regenerados e conferidos com `--check`, sem diff dos artefatos. Logs e harness em `/tmp/f05ah`, temporários e não versionados.

## Limites

Não prova CI remoto, Windows, UAT, WCAG integral, aceite humano, publicação ou operação real. Não há garantia de contenção sob SIGKILL/OOM do supervisor, travas de kernel/filesystem ou processos destacados/escapados. E6 administrativo continua pendente por OOM no baseline de 05AG; SIGSEGV intermitentes documentados no L06 (05AB) e RAG (05AG) continuam sem causa estabelecida. Client-security/N8 e N9 continuam abertos. Os dois runners restantes exigem inventário próprio; backup/restore real não está autorizado.
