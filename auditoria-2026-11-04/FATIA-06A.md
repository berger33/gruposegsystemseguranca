# Fatia 06A — equivalência de filtros e TAP das rotas públicas

**Data:** 06/11/2026. Base `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b`, PR #349; branch `arena/8208e8f7-gruposegsystemseguranca`. Alterações locais anteriores preservadas; nenhum commit, push, PR, deploy, dado real ou serviço externo. Fatia 05 continua **67/68** (E6 administrativo bloqueado por OOM). Fatia 06 foi iniciada somente neste recorte; não está concluída. Produção **NO-GO**.

## Inventário antes da mudança

Quatro workflows chamam o mesmo runner `scripts/qa-ux-public-routes-postgres.mjs` e o mesmo arquivo `tests/ux-public-routes.integration.test.mjs`, com patterns diferentes. O comando sem filtro `npm run test:ux-public-routes:pg` executa todos os 24 cenários. Não são quatro suítes independentes; o filtro é aplicado pelo Node à mesma suíte.

| Workflow | Pattern | Casos no arquivo | Superfície resumida | Job |
|---|---|---:|---|---:|
| `.github/workflows/ux-public-routes-delivery.yml` | `E6 grupo 1` | 6 | 7 rotas de serviços, segmentos, conteúdos e FAQ; HTTP, viewport/noindex, teclado, vazio/erro, desconhecido e links | 40min |
| `.github/workflows/ux-public-routes-group2-delivery.yml` | `E6 grupo 2` | 7 | 5 rotas de conversão; HTTP, viewport/noindex, erro/protocolo de orçamento, token inválido, pacotes/privacidade e simulador | 40min |
| `.github/workflows/ux-public-routes-group3-delivery.yml` | `E6 grupo 3` | 6 | 12 rotas de prévia, `/qa/modulos` fechado, viewport, aviso/teclado, validação do parâmetro e layout publicado | 40min |
| `.github/workflows/ux-layout-previews-a11y-delivery.yml` | `UX-PRO-10B previas` | 5 | foco, zoom, contraste, iframe e layout 09 | 45min |

As descrições completas dos 24 nomes e suas asserções permanecem no arquivo de integração: contagens ou texto do workflow por si só não demonstram cada asserção. Os workflows conservam paths próprios, `pull_request` filtrado e `workflow_dispatch`, passos de typecheck, `npm audit`, guardas e inventário; o de 10B conserva verificações das medições **após** a execução. Um filtro `paths` indica quando o workflow pode ser acionado, não prova execução para todo arquivo alterado nem a aprovação em CI. Não foram removidos cenários, caminhos, checagens ou patterns.

Reprodução antes da mudança com Node 22: suíte diretamente, sem banco e com pattern inexistente, retornou **exit 0**, `# tests 1`, `# pass 1`, contando o arquivo como teste sem executar cenário nomeado. Com `E6 grupo 1` e banco desativado, também saiu 0 mas mostrou **6 skips**. O runner anterior baseava-se apenas no exit code; a sondagem com banco de 05AH havia sido interrompida após mais de 180s, sem concluir. Essas observações não provam que CI tenha passado incorretamente, mas demonstram que exit 0 isolado é insuficiente.

## Mudança

- `scripts/lib/qa-public-tap-audit.mjs`: auditor específico do TAP serial Node 22, exige contadores únicos de testes/pass/fail/cancelled/skipped/todo, resultados de cenários nomeados, coerência de contagem, zero falhas/cancelamentos/skip/todo, e recusa resumo ausente/duplicado ou output truncado. A linha sintética do próprio arquivo não conta como cenário.
- O runner transmite TAP completo durante a execução, guarda até 2 MiB para auditoria e reprova se o limite for ultrapassado. A saída original não zero permanece não zero. Retira `NODE_TEST_CONTEXT` dos subprocessos para evitar herança indevida do runner de testes.
- Pisos fixos: integral **24**; patterns exatos dos quatro workflows **6/7/6/5**. Patterns arbitrários continuam disponíveis, com piso **1**, portanto não garantem que a seleção seja integral. Não se presume equivalência de regexes diferentes ao pattern exato do workflow.
- Para pattern não vazio, sondagem inicial usa a mesma seleção com banco desativado e exige somente casos nomeados marcados skip na sondagem; seleção inexistente/regex inválida/piso insuficiente reprova antes de cluster, HTTP ou navegador. Esta sondagem **não é execução de jornada**. Auditoria posterior exige os cenários realmente aprovados com banco, em vez de confiar na sondagem. O supervisor aplica o prazo `boot` existente à sondagem POSIX; Windows preserva o fallback de execução, mas a mudança funcional do auditor não foi validada no Windows.
- Os quatro workflows incluem helper/teste nos próprios `paths` e executam o novo teste antes do gate. Demais passos e limites foram mantidos. O teste focal foi acrescentado ao `test:unit`.

Os pisos são guarda de quantidade, não prova de identidade de cada caso ou de que uma nova funcionalidade esteja coberta. Testes com padrões personalizados também podem executar só um caso. O parser é específico ao TAP atual e ao arquivo sem subtestes aninhados: mudanças estruturais podem exigir revisão, devendo falhar fechadas em vez de converter saída desconhecida em verde. A restauração dos dois JSONs de evidência 10B continua fora do contrato do wrapper: um recorte parcial pode escrevê-los, e SIGKILL/OOM durante escrita não é coberto.

## Resultados locais

| Ensaio supervisionado | Resultado | Tempo de parede |
|---|---|---:|
| Sem filtro | 24/24, auditor PASS | 255,57s |
| Grupo 1 | 6/6, auditor PASS | 55,04s |
| Grupo 2 | 7/7, auditor PASS | 44,32s |
| Grupo 3 | 6/6, auditor PASS | 70,52s |
| Prévias 10B | 5/5, auditor PASS | 122,31s |
| Pattern arbitrário `http E6 grupo 1` | 1/1, auditor PASS | 15,90s |
| Grupo 1, dois consumidores CPU | 6/6, auditor PASS | 71,00s |

Nenhuma falha/skip/todo nas execuções acima; os quatro recortes são subconjuntos do integral. Pattern inexistente e regex inválida retornaram **exit 1**, `QA_PUBLIC_SELECTION_REFUSED`, sem `QA_PUBLIC_PG_READY`; o supervisor confirmou limpeza. Execuções reais diretas sem banco reproduziram o falso positivo e skips e o auditor os recusou; provas de TAP construído recusaram também parcial, ausência de resumo, duplicação, falha, todo, contagem incoerente e truncamento. O teste do supervisor negativo reproduziu duas falhas internas esperadas com limpeza, exit geral 0.

SIGTERM ao supervisor com servidor e Chromium observados: **143**, sandbox removido, 13 processos na árvore amostrada, nenhum descendente amostrado ativo após a saída; restauração e hashes de `next-env.d.ts`, `tsconfig.json` e dois JSONs 10B permaneceram iguais aos anteriores. A árvore foi amostrada por `ps`: processos destacados ou nascidos entre amostras podem escapar; não prova contenção sob SIGKILL/OOM. Chromium ativo não prova jornada concluída. Logs temporários em `/tmp/f06a` podem não persistir.

## Regressões e histórico

Primeira focal **128/129** e primeiro `npm test` **1629/1631**: ambas incluíam a guarda E27, pois o contador documentado de arquivos unitários estava 181 em vez de 182; a suíte integral também apontou o relatório do inventário que ainda citava 1.740 em vez de 1.742 arquivos. Não eram falhas de jornada. Inventário gerado atualizado; documento histórico anota a recontagem sem apagar o número anterior; linha de status atualiza a contagem de arquivos. Guarda documental isolada **18/18** após a correção. Após reconciliação documental e uma prova adicional do runner real, focal final **130/130** e `npm test` **1632/1632**, zero falhas/skip/todo.

Typecheck/build, SEC 35/35 âncoras, wave0 5/5, verificação pós-10B 5/5, contraste e três inventários `--check` passaram. SHA-256 dos arquivos Next `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b` e `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`; evidências 10B `14ff32329995276f479c99e3ec6d98d7db58b5f8b7886f9463e49a1d8441766c` e `9faea36df5f7e1be5a4dc9cc2378fb163ae7047a74edac8e9b1a3b5f26965a42`.

CI remoto, Windows, UAT, leitor de tela, conformidade WCAG integral, operação real e aceite humano não foram verificados. Este mapa não cobre os outros workflows e runners da fatia 06. Client-security/N8 e N9 continuam abertos; produção permanece **NO-GO**.
