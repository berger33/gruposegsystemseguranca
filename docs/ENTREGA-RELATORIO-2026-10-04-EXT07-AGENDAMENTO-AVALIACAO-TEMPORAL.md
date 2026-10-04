# Entrega — EXT-07 execução agendada da avaliação temporal (2026-10-04)

## Resumo

Executa a pendência declarada desde a migração 155: a avaliação temporal do EXT-07 deixa de depender exclusivamente de um humano chamar `POST /api/ext/compliance/evaluate`. O servidor passa a avaliar o estado temporal sozinho, no próprio processo, como **opt-in por ambiente**, agindo em nome de uma **identidade staff real declarada pelo operador**, com cada execução registrada em ledger imutável.

| Item | Valor |
|---|---|
| Base | PR #118 `MERGED`, merge `150052e7a391a32a447341089ce3451e62a3477e`; branch `arena/01a104d5-gruposegsystemseguranca`, divergência 0/0, árvore limpa |
| Migração | **156** (`156-ext07-scheduled-evaluation.sql`), aditiva; 001–155 intocadas; próxima livre **157** |
| Ativação | `EXT07_EVALUATE_INTERVAL_SECONDS` (inteiro ≥ 1; ausente/inválido = desligado) + `EXT07_EVALUATE_IDENTITY` (UUID de staff admin/ti ativa) |
| Fronteira | Não é ator externo, integração regulatória, SMTP nem armazenamento: é timer local com autor declarado |

## Pendência executada

O relatório da 155 registrava: *"avaliação temporal é operação administrativa explícita (botão/rota `POST /evaluate`); execução agendada futura é pendência documentada"*. O `ESTADO-EXECUCAO-LOCAL` e o `CHECKLIST` repetiam a pendência. A própria resposta da rota devolvia a nota.

## Probe antes de implementar (script apagado)

Cluster PostgreSQL 17 descartável, migrações 001–155, servidor HTTP real, fixture sintética: obrigação com antecedência de 30 dias, documento vencido na véspera e corrente a 10 dias do vencimento.

- **PROBE_T0 ≡ PROBE_T12s**: após 12 s com o servidor de pé, estado idêntico — 0 tarefas para o vencido, corrente `vigente` (antecedência não marcada), obrigação `pendente`, 0 eventos novos. Nada avalia o estado temporal sozinho.
- **Nenhum timer/agendador** existia no processo.
- O `POST /evaluate` explícito continuava sendo o único caminho (confirmado no mesmo probe: cria a tarefa, marca `a_vencer`, deriva a obrigação).
- Temporários do probe apagados; nunca banco real.

## O que foi entregue

**Núcleo compartilhado (sem mudança de contrato).** `runExpiryEvaluation(client, { actorIdentityId })` foi extraído de `ext-compliance-api.mjs` por dedent programático do corpo original (zero reescrita lógica): a rota HTTP explícita e o agendador executam **o mesmo código** — data-base sempre `CURRENT_DATE` do servidor, tarefa única por documento/período/regra, fail-closed sem responsável staff ativo. `isActiveStaffIdentity` foi promovida a export para revalidação por tick.

**Agendador (`src/server/ext-compliance-scheduler.mjs`, novo).** `parseSchedulerConfig` lê o ambiente (valor inválido não liga nada); `runScheduledEvaluationOnce` executa um tick: `BEGIN` → `pg_try_advisory_xact_lock` (sobreposição entre instâncias) → revalidação da identidade declarada → núcleo → evento do dia → `audit_log` → run `concluida` → `COMMIT`. `startExtComplianceScheduler` agenda o intervalo (timer com `unref`), roda o **primeiro tick imediatamente** e bloqueia sobreposição em processo (flag). Cada tick roda sob `dispatchGuarded` (PLAT-01): nenhuma rejeição escapa para o timer.

**Semântica de ledger.** A migração 156 cria `ext_compliance_evaluation_runs`: uma linha por execução que de fato rodou — `concluida` (inclusive sem efeito: ausência de efeito não é ausência de execução) ou `falha` com a causa. O ledger é **append-only** por trigger (`UPDATE`/`DELETE` sempre bloqueados). O evento `expiry_evaluated` em `ext_compliance_events` é gravado **uma vez por dia/ator** com chave determinística `agendada:YYYY-MM-DD` (`ON CONFLICT DO NOTHING`); ticks seguintes no mesmo dia executam o trabalho idempotente sem duplicar o evento. Falha de `audit_log` reverte a execução inteira (mesma disciplina do HTTP) e grava run `falha` em transação própria.

**Fail-closed da identidade.** A identidade declarada é revalidada **a cada tick**: suspensa/desativada/inexistente, a execução falha fechado — run `falha` com a causa, **zero mutação** de compliance. Reativada a identidade, o próximo tick retoma sozinho e cria as tarefas pendentes. Nenhum `NOT NULL` foi relaxado e nenhuma identidade sintética foi criada: toda tarefa e todo evento continua tendo autor registrado (`created_by_identity` = identidade declarada).

**Recusa deliberada do modo PGlite.** Sem `DATABASE_URL`, o agendador não liga (log explícito): o modo PGlite beta tem schema mínimo, sem as tabelas EXT-07.

**Observação (`GET /api/ext/compliance/schedule`, novo).** Staff autorizada (401 anônimo / 403 papel não autorizado, como as demais rotas) vê o estado do agendador **deste processo** (`enabled`, intervalo, identidade declarada resolvida para `display_name`) e o ledger de execuções — inclusive de outro processo que tenha ticado, porque o ledger é do banco. Ligado/desligado é decisão de ambiente, não de API: não existe rota que altere a cadência.

**Ligação em `server.mjs`.** Import do agendador; handle + `schedulerState` para a rota de observação; boot **após** `installProcessSafetyNet()` e `server.listen`, com logs de recusa explícitos para cada razão (sem `DATABASE_URL`; identidade ausente/malformada). Sem `DATABASE_URL` o comportamento do servidor é idêntico ao anterior.

## Prova negativa por mutação (guarda sem prova negativa é decoração)

| Mutação | Teste que reprovou |
|---|---|
| Agendador ligado **antes** da rede de segurança de processo | `server.mjs liga o agendador somente depois da rede de segurança` |
| Nota da API regredida para "pendência documentada" | `agendador usa o MESMO núcleo da rota explícita e nunca relança` |
| Tick disparado sem `dispatchGuarded` (rejeição escaparia para o timer) | Guarda estática do guard **e** teste de sobreposição (formato do desfecho mudou) |

Cada mutação foi revertida e a restauração conferida com `sha256sum -c`.

## Validação (bateria integral, evidência versionada)

14/14 passos, **718 asserções TAP, zero fail/skip/todo/cancelled**: npm ci 0 vulnerabilidades; wave 0 5/5 (001–156); typecheck; focal PLAT-01 25/25; focal EXT-07 19/19; **focal agendamento 20/20**; `npm test` **514/514**; build 92 páginas com `/admin/compliance`; `test:migrations:pg` **156/156 ×2** + clone negativo rejeitado (562 tabelas); gate EXT-07 **43/43** com zero skip (37 anteriores preservados + 6 novos: desligado por padrão e rota de observação autorizada; avaliação sozinha com tarefa atribuída à identidade declarada e evento do dia; ticks repetidos sem duplicar tarefa/evento; identidade suspensa → `falha` com zero mutação; retomada automática; ledger append-only no banco); regressão de vizinhança EXT-06 36/36, EXT-05 33/33, EXT-04 28/28; `git diff --check` limpo. Os passos estritamente necessários a esta entrega são wave0, typecheck, focais, unit, migrations-pg e ext07-pg; build e gates vizinhos correram como cortesia de regressão (`server.mjs` mudou de forma aditiva).

Evidência: `docs/evidencias/qa-evidencia-2026-10-04-ext07-agendamento.{pdf,json}` + seções narrativas `.secoes.json`; ledger com contexto de commit/branch. CI: workflow `ext07-delivery.yml` atualizado (paths da 156/agendador/testes; passo unit inclui a suíte nova; ledger 001–156).

## Fronteiras mantidas

- Referência documental permanece declarada e privada: sem upload, bytes, checksum, malware scan, armazenamento verificado ou download; aplicabilidade é declaração interna, não validação jurídica.
- Nenhum ator externo, portal ou integração regulatória inventado; a automação age em nome de identidade staff real declarada pelo operador.
- `ExtAdvancedClient.tsx` e handlers EXT-08..12 preservados (cenário de regressão seguiu verde no gate).
- Migrações 001–155 intocadas; 156 aditiva (sem seed, sem `UPDATE` retroativo).
- Gates falham (não pulam) sem PostgreSQL; nenhuma asserção foi reduzida (MINIMUM_CASES subiu de 35 para 41).

## Pendências que seguem

- Aplicação de migrações em banco de destino / validação no ambiente real do operador (agora incluindo a decisão operacional de intervalo e identidade declarada).
- Aceite humano e validação em Windows.
- (Baixa prioridade, cosmético) Rótulo de erro por módulo nos despachos de segundo nível — já cobertos pelo guard do topo desde o PLAT-01.
