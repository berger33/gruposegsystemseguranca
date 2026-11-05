# Fatia 05X — UX expansão e continuidade (equipe)

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch de main confirmado; HEAD/origin-main `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado. Sem commit/push/PR/deploy.

**Entrega parcial da fatia 05: 55/68 runners adotados; 13 pendentes. Produção NO-GO.**

## 1. Contratos inventariados e preservados

Lidos AGENTS, README, status/plano/matriz, runners, integrações/workflows e documentos históricos UX-10 de expansão, UX-11 de continuidade e fluxos de portal. Não foram reimplementadas capacidades já entregues.

- **Expansão `/admin/expansao`: 12 testes.** Sessão/chave/origem; aliases legados somente leitura; menu distinto de autorização de escrita/decisão; replay idempotente e 409 divergente; quatro abas/teclado; ausência sem zero/valor monetário/data de época inventados; detalhe/cenários/trilha em português; falha distinta de vazio/indicador zero; negado distinto de falha; negativa real de escrita com chave preservada; transição real pela tela e trilha; 390px.
- **Continuidade `/admin/continuidade`: 20 testes, piso herdado 17.** Contratos de transporte/URLs/métodos e exigência de banco; sessão/chave/origem sem vazamento; 403 sem grant e 404 fora de client_account_id; datas ausentes distintas; idempotência/reuso/falha sem consumir chave; 2xx inválido; releitura preserva dados/hora; negativa após sucesso descarta plano; 403/404 não viram lista vazia; criação/transição pela tela; simulado documentado com datas/responsável/estado; publicação e retirada pela equipe com visibilidade apenas para o cliente vinculado; chave sobrevive à falha e é descartada após sucesso; abas/teclado/390px; queda e retorno reais do servidor com recuperação explícita.

**Integrações, APIs, páginas, schema, fixtures e permissões inalterados nesta etapa.** Massa fictícia. Falhas de browser restritas ao window.fetch onde previsto; o caso de queda de servidor mantém a interrupção/retomada local real existente. Não se autorizou expansão real, decisão financeira, publicação real para cliente ou operação de continuidade.

O fluxo cliente dentro da suíte de equipe foi preservado e executado; **não substitui** o gate específico `qa-ux-continuity-client-postgres.mjs`, não migrado nesta fatia. Portal continua somente leitura e minimizado, com publicação explícita e vínculo de conta; nenhum grant foi ampliado.

Gates independentes reexecutados sem edição: **EXT-09 16/16** (mínimo 16) e **EXT-10 31/31** (mínimo 31), zero fail/skip/todo e limpeza confirmada. Ambos continuam nos workflows antes dos focais UX.

## 2. Migração dos runners

`scripts/qa-ux-expansion-postgres.mjs` e `scripts/qa-ux-continuity-postgres.mjs`: wrapper POSIX depois das recusas de URL/opt-in, antes do import de embedded-postgres/efeitos nativos. Pai libera handlers concorrentes da guarda; worker recebe sandbox/TMP/IPC, criação local limitada e fases monotônicas. Pai confirma término/remoção antes do token genérico de limpeza.

**Helper compartilhado inalterado.** Windows conserva caminho anterior, sem nova homologação. Preservados flags nativos, bibliotecas/symlinks e heap originais de expansão; não foram adicionados heap, symlinks ou locale novos à continuidade.

Diferenças de resultado preservadas:

- Expansão mantém pattern/evidências opcionais e contrato por exit code/stdio, **sem auditor TAP mínimo novo**. Pattern pode selecionar subconjunto; ensaios integrais com pattern vazio.
- Continuidade mantém captura de stdout/stderr, `MINIMO = 17`, auditor de fail/skip/todo/parcial/ausência de resumo e QA_UX_CONTINUITY_REQUIRE_DB=1. **20 casos atuais não substituem arbitrariamente o piso herdado 17**. Não ganhou filtro de nome. Executado o auditor real via VM contra resumos positivos e negativos.
- Parada rejeitada reprova no caminho supervisionado de continuidade; legado continua tolerando stop/rm como antes. Remoção/tokens antigos ficam fora da supervisão; token legado não prova limpeza em Windows. POSIX confirma a remoção no pai. Log de expansão “temporário limpo” não antecede a remoção do pai.

Budgets em ambos: migrate **90s**, test agregado **900s**, soma do protocolo **1140s**, além das margens limitadas de TERM/KILL/remoção existentes. Mantidos bootstrap **180s expansão / 240s continuidade**, compilação e demais limites internos, recuperação herdada de crash de browser e lançamento imediato de ERR_ASSERTION. Sem retry novo de gate, relaxamento de asserção ou promessa de todos os máximos internos simultâneos.

Políticas de Next/evidências mantidas. Diretórios opcionais de capturas não utilizados nestas provas; sem sobrescrever evidência histórica. SMTP/Ollama desligados; Chromium local, sem provedor externo/AWS operacional.

## 3. CI e regressão

Workflows existentes já possuíam filtros do supervisor/guarda/teste por adoções anteriores de EXT-09/10; acrescidos filtro do migrador e unitários antes de PG. Env local/opt-in remoto explícito; pattern expansão vazio e read-only explícito no workflow de expansão. Mantidos typecheck, vocabulários/testes herdados, gates EXT-09/10, acionamento manual, auditoria npm, jobs **30min expansão / 50min continuidade** e não cancelamento de continuidade.

Preservados no CI de continuidade: variável de evidências do fluxo de equipe, captura autenticada `ux:evidence -- --stage=ux-11-continuidade` e vocabulário do portal. **Essas capturas opcionais/estágio visual, auditoria npm remota e CI remoto não foram executados nesta etapa**; preservar o comando não é homologá-lo.

Supervisor **59/59**, três regressões novas: contratos dos runners/IPC/budgets/criação/resultado; auditor TAP real de continuidade; CI com gates/evidências/comandos existentes. Guardas reais ampliadas: **54 × 3 recusas + 3 específicas = 165 execuções negativas**, sem cluster; piloto tenant separado.

## 4. Provas

Tempos de parede do comando completo; nos seis, exit 0, zero fail/skip/todo, limpeza confirmada e sem logs de retry de browser observados.

| Jornada | Antes | Pós isolado | Sob dois consumidores CPU |
|---|---:|---:|---:|
| Expansão | **12/12**, 40,56s | **12/12**, 38,03s | **12/12**, 64,30s |
| Continuidade (equipe) | **20/20**, 72,98s | **20/20**, 70,22s | **20/20**, 109,81s |

- Negativo PG sob CPU: overall exit 0 em **6,64s**, reconhecendo duas falhas esperadas exit 1 com limpeza (porta ocupada/cluster morto). Não são clusters aprovados.
- `npm test` depois das jornadas Next, ainda sob dois consumidores CPU: **1597/1597**, zero fail/skip/todo, exit 0, **93,64s**. Sequenciar não resolve a corrida global de gerados registrada na 05B.
- EXT-09 **16/16**, **14,25s**; EXT-10 **31/31**, **26,32s**.

### Seis cancelamentos reais

Sinal único só ao supervisor após gatilho confirmado; árvore por ancestralidade /proc e sandbox identificado no worker, sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| Expansão | Banco pronto / TERM | **143** | 0,82s |
| Expansão | Servidor ativo / INT | **130** | 6,02s |
| Expansão | Chromium ativo / TERM | **143** | 21,12s |
| Continuidade | Banco pronto / TERM | **143** | 0,84s |
| Continuidade | Servidor ativo / INT | **130** | 5,94s |
| Continuidade | Chromium ativo / TERM | **143** | 20,07s |

Nos seis: sandbox removido, limpeza confirmada, hashes next-env.d.ts/tsconfig.json iguais aos de entrada e nenhum descendente observado ativo. Browser ativo não significa navegação/assertions concluídas; sessões destacadas do Playwright, browser travado/escapado e morte abrupta do supervisor continuam fora desta prova.

### Complementares

- Focal final de 13 arquivos **172/172**, zero fail/skip/todo: supervisor, vocabulários de expansão/continuidade/portal, EXT-09/10 unitários, cliente fail-closed, SEC, índices, higiene e package-artifacts.
- Typecheck/build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Índices oficiais regenerados/conferidos: **60 workflows / 1740 arquivos / 222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero; sem promoção por adoção de wrapper.
- Gerados sem diff; higiene e processos/sandboxes conferidos no fechamento.

Logs/harness sintéticos `/tmp/f05x-*` fora do versionamento; resultados persistentes consolidados aqui.

## 5. Continuidade e limites

[Matriz](ADOCAO-POSTGRES.csv): **55/68 adotados; 13 pendentes**. Negativo PG é 69º arquivo fora do denominador. Próximo grupo proposto **05Y — UX continuidade cliente e portal**, após inventário/baseline preservando isolamento de conta, projeções minimizadas e gates herdados.

Permanecem isolamento global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, CI remoto, Windows/UAT/WCAG manual e restore real. Sem reauditoria integral por requisito/papel ou fechamento client-security/N8.

**Fatia 05 e N8/N9 abertos. Produção NO-GO. Sem commit/push/PR/deploy, dados reais, contratação ou envio externo.**
