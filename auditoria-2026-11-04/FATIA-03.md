# Fatia 03 — diagnóstico e isolamento do boot EXT-03

**Data:** 04/11/2026. **Base:** `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. **Branch:** `arena/a5202d09-gruposegsystemseguranca`.
**Resultado:** conflito de diretório Next reproduzido e corrigido no gate de QA, com diagnóstico seguro e regressão. Sem commit/push/PR/deploy nesta entrega.

## 1. Evidência antes da correção

O gate iniciava o servidor com pasta fixa `.next/integration-ext03`, descartava stdout/stderr, esperava até 60s sem observar a saída do filho e não limitava cada fetch. O teardown testava `child.killed`, que significa sinal enviado, não processo encerrado.

- Baseline instrumentado isolado: 26/26, boot ~2,49s.
- Primeiro par concorrente com pasta compartilhada: um runner exit 0, outro exit 1, servidor encerrado em ~1,74s. A primeira classificação de log ainda não reconhecia a mensagem da versão instalada do Next; não foi inventada uma causa nesse ponto.
- Depois de conferir o código do lock no Next instalado e acrescentar a categoria correspondente, segundo par concorrente com pasta compartilhada: um runner 26/26, outro exit 1; diagnóstico do filho em **~1,75s**, `next-lock`, código de saída 1.

Assim, há uma causa concreta reproduzida: concorrência sobre o mesmo distDir. **Isso não prova que a falha histórica da auditoria teve essa mesma causa**: o log daquela tentativa foi descartado e ela passou no retry isolado.

## 2. Mudança aplicada

### Integração EXT-03

`tests/ext03-biddings.integration.test.mjs`:

- Cria `.next-qa-ext03-<sufixo>` com `mkdtemp`, um distDir por execução, em vez de usar a pasta compartilhada.
- Observa o processo imediatamente após spawn; sai com erro diagnóstico se ele encerrar antes da prontidão.
- Mantém o contrato de prontidão 401/200 em `/api/admin/session`.
- Mantém **60 segundos de prazo global**, agora com fetch individual limitado a 1s ou ao saldo restante. Requisições são abortadas e corpos cancelados.
- Aguarda a saída após SIGTERM; só escala para SIGKILL quando necessário. Não usa `child.killed` como prova de encerramento.
- Remove somente a pasta criada por esta execução e apenas depois de o processo terminar. Informa `QA_EXT03_NEXT_DIST_CLEANED: true`.

### Diagnóstico seguro e regressão

`tests/helpers/server-startup.mjs`:

- Janela interna limitada por stream, descartada; saída pública contém **no máximo 16 eventos de categorias de allowlist**, tempos/contagens e estado do processo.
- Categorias conhecidas: porta ocupada, lock Next, módulo ausente, permissão, arquivo ausente e marcador de servidor escutando.
- **Não publica texto bruto**, nem fragmentos de linhas desconhecidas: não depende somente de tentar mascarar senhas em regex. URLs, env, cookies e mensagens arbitrárias não entram no relatório.
- Classificação funciona entre chunks e com cores ANSI usuais. Categorias são pistas, não prova funcional nem autorização.
- Listeners e timers do helper são liberados; falhas de spawn, saída precoce e timeout continuam sendo falhas, não skips.

`tests/ext03-biddings.test.mjs`: sete novos testes no arquivo já listado na suíte, cobrindo saída precoce, categorias/segredos/limite da cauda, spawn inexistente, readiness 200/401 e falha 500/fetch pendurado, término normal, escalonamento SIGKILL e contrato de distDir/CI.

`.github/workflows/ext03-delivery.yml`: inclui o helper no filtro de mudanças e corrige o nome do step de migrações para 001–183. O comentário do runner foi reconciliado; a lógica PostgreSQL não foi alterada.

## 3. Resultados depois da correção

| Verificação | Resultado |
|---|---|
| Focal EXT-03 + boot | **74/74**, sem skip no Linux usado |
| Par concorrente, sem carga adicional | **2/2 runners**, 26/26 cada; ~13,5s totais por runner; boot ~2,07s |
| Par concorrente + dois consumidores CPU + npm test | **2/2 runners**, 26/26 cada; ~29–30s; boot ~5,04s |
| Segundo par + dois consumidores CPU | **2/2 runners**, 26/26 cada; ~23,5–23,8s; boot ~3,74–3,77s |
| Execução final isolada | **26/26**, boot ~1,67s |
| Suíte completa, simultânea ao primeiro par sob carga | **1.535/1.535**, zero falhas, zero skips; ~97s de parede |
| TypeScript | OK |
| Build | OK |
| Wave0 | **5/5** |
| Mapa SEC | **35/35** âncoras |
| Índice de requisitos `--check` | OK; 222 IDs, 12 a revalidar sem gate |
| `git diff --check` | OK |

**Total: 7 execuções completas pós-correção, todas 26/26.** Cada runner registrou limpeza do PostgreSQL e do distDir exclusivo. Checagem final de processos e diretórios não encontrou servidores de teste, clusters desse ensaio, consumidores CPU nem pastas `.next-qa-ext03-*` remanescentes.

As duas primeiras asserções dos novos testes falharam durante desenvolvimento: uma fixture de subprocesso tinha escape de newline incorreto; outra supunha ordem de categorias numa janela sobreposta. Foram corrigidas as fixtures/asserções, sem remover testes de negócio nem elevar prazos. Os placares acima são posteriores às correções.

## 4. Preservação e limites

- Nenhuma mudança em runtime, handlers, UI, permissões, APIs de negócio, schema ou dados persistentes. A jornada canônica continua com seus 26 testes HTTP/banco e exigência mínima sem skip.
- Não houve aumento do prazo global nem afrouxamento da contagem mínima de casos.
- A coleta de categorias ignora mensagens desconhecidas por segurança. Pode ser necessário acrescentar uma categoria validada em investigação futura; não expor o log bruto como atalho.
- O teste de escalonamento POSIX declara limitação no Windows; aqui rodou de fato, sem skip. Não é homologação Windows.
- A porta HTTP continua sendo escolhida aleatoriamente pelo teste; ainda pode haver conflito. O diagnóstico agora distingue `address-in-use` quando reconhecido. Não se promete estabilidade universal por sete execuções verdes.
- O ciclo de vida de `embedded-postgres`, timeouts/cleanup dos outros runners e interrupção externa da suíte continuam na fatia 04/05. Esta entrega não declara N8/N9 resolvidos.
- O índice de requisitos foi regenerado somente para refletir o helper adicional: 1.726 → 1.727 arquivos, sem promoção de evidência/aceite. Ledger, plano e contagem documental foram atualizados.

**Próxima fatia:** 04 — reproduzir falhas do cluster PostgreSQL e implementar/testar o piloto de lifecycle com limites e limpeza segura. **Produção: NO-GO.**
