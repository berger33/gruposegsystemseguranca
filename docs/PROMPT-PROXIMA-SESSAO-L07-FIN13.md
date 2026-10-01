# Prompt da próxima sessão — L07 · FIN-13 (orçamento gerencial e cenários)

> Cole o conteúdo abaixo como primeira mensagem da nova sessão. Ele é auto-suficiente: não depende do histórico de conversa anterior.

---

## Contexto

Você continua o **L07 — Financeiro e Marcelo** do repositório `berger33/gruposegsystemseguranca`. O documento mestre da missão é `docs/PROMPT-CONTINUACAO-L07-FINANCEIRO-MARCELO.md`: **leia-o inteiro antes de escrever código** e siga o repositório, não a memória — confirme cada afirmação com `grep` e leitura de código.

**Ponto de partida:** `origin/main` em `97d4d41` (merge da PR #57, FIN-12). FIN-01 a FIN-12 estão entregues por fatia, cada uma com migração aditiva, API endurecida, tela real em `/admin/financeiro` e subtestes próprios no gate L07.

**Sua fatia é FIN-13, e somente FIN-13:**

> **FIN-13** — orçamento gerencial e cenários de expansão com premissas explícitas; não prometer resultado.

FIN-14, FIN-15, FIN-16 e ADM-01..12 **não** devem ser tocados.

## Regra de branch

Trabalhe exclusivamente na branch da sua sessão (`arena/<id>-gruposegsystemseguranca`). Nunca em `main`. Abra PR própria a partir dela. **Só faça merge com autorização explícita do usuário.**

## Pré-voo obrigatório (antes de qualquer edição)

1. `git log --oneline -3` e `git ls-remote --heads origin | tail -5` — confirme que descende de `97d4d41`.
2. `npm ci`
3. Baseline, registrando os números:
   - `npm run typecheck` → 0
   - `node scripts/qa-wave0-static.mjs` → 5/5, migrações 001–131
   - `npm test` → 196/196
   - `npm run test:l07-delivery:pg` → **22/22**
   Se algo estiver vermelho antes de você mexer, **pare e relate** — não herde quebra.
4. **Verifique a primeira pendência herdada (abaixo) antes de começar o FIN-13.**

## Pendência herdada que você deve checar primeiro

Na PR #57 (FIN-12), os jobs de CI `finance-postgres-browser` (5m43s) e `crm-postgres-browser` (9m57s) ficaram vermelhos **enquanto todos os gates locais estavam verdes** (L07 22/22 em três execuções, L04 20/20, L03 1/1, L05 1/1, L06 9/9, migrações 131/131, unitários 196/196, build 0). O `crm-postgres-browser` cobre o L04, área que a fatia FIN-12 não tocou, e a duração de ~10 min contra ~2,5 min normais é exatamente a assinatura de runner lento documentada em `docs/PROMPT-CONTINUACAO-L07-FINANCEIRO-MARCELO.md` (seção "Armadilhas conhecidas"). A PR foi mergeada mesmo assim, a pedido do usuário, com a evidência local. **Não houve re-rodada limpa de CI e os logs do runner não puderam ser lidos do sandbox daquela sessão.**

Faça isto antes do FIN-13:
- rode `npm run test:l07-delivery:pg` e `npm run test:l04-delivery:pg` **em série, nunca em paralelo**, no HEAD atual;
- se passarem, abra a sua PR normalmente e confira se o CI fica verde para o mesmo código — isso fecha a dúvida;
- se algum deles falhar de verdade, **pare o FIN-13 e conserte a regressão primeiro**, relatando o que quebrou.

## O que já existe para FIN-13 (auditar, não reescrever)

- Rascunho de schema: `db/migrations/080-*.sql` (confirme o arquivo com `ls db/migrations | grep 080`) com as tabelas de orçamento e cenário; a próxima migração livre é a **132**.
- API: `src/server/fin-budget-api.mjs`, exposta em `server.mjs` como `/api/fin/budgets` e `/api/fin/budget-scenarios` (mais aliases `/api/hr/fin-budget*`, presentes em `API_PATH_MATCH`).
- Tela: nenhuma aba de orçamento em `/admin/financeiro`; há apenas diagnóstico em `/admin/ti`.

Trate o estado `a_revalidar` como **não entregue até prova por execução**. A experiência das fatias FIN-05..FIN-12 foi sempre a mesma: o rascunho existe, mas valida pouco e aceita que o cliente HTTP decida o que o servidor deveria decidir.

## Padrão de qualidade que a fatia precisa seguir (copie FIN-11/FIN-12)

Use `db/migrations/131-fin12-gateway-hardening.sql` e o bloco FIN-12 de `src/server/fin-management-api.mjs` como modelo literal:

1. **Migração exclusivamente aditiva.** Nenhuma migração histórica é alterada; nenhum `ALTER TYPE ... ADD VALUE` (o migrador roda cada arquivo em transação). Constraints novas em `NOT VALID` para preservar linhas do rascunho. Atualize `scripts/migrate-site-visual.mjs` (lista + contagem 131→132) e `scripts/qa-wave0-static.mjs` (`latestMigration`).
2. **Estados e transições explícitos**, validados por trigger no banco **e** pela API — nunca só por um dos dois.
3. **Idempotência por chave única** em toda criação.
4. **Referências canônicas obrigatórias** (contrato, conta, centro de custo…): nada de entidade paralela.
5. **Histórico imutável** em tabela própria (`UPDATE`/`DELETE` bloqueados por trigger).
6. **Transacional e fail-closed**: `pool.connect()`, `BEGIN`, `FOR UPDATE`, histórico e `auditLog({ client })` no mesmo cliente, `COMMIT` só depois da auditoria; auditoria indisponível ⇒ `503 {"error":"audit_unavailable"}` com rollback integral.
7. **Resposta sem detalhe SQL**: allowlist de códigos de domínio para `23514`; nada de `details: e.message`.
8. **A API autoriza, o React só renderiza**: sessão + same-origin + papel financeiro no servidor.
9. **Tela real** em `/admin/financeiro` (nova aba), com `data-testid` estáveis; `/admin/ti` fica somente leitura apontando para o caminho canônico.

## Exigência específica do FIN-13: "não prometer resultado"

Esta é a parte que o gate precisa provar, e é onde o rascunho provavelmente erra:

- **Premissa explícita é obrigatória.** Um cenário sem premissa registrada (texto com faixa mínima, origem do número e data-base) não pode existir — o banco recusa, não só a API.
- **Estimativa nunca se disfarça de resultado.** Valor projetado e valor realizado são campos distintos, com rótulo distinto na tela; o comparativo tem de deixar visível o que é projeção. Nada de um campo "resultado" que às vezes é previsão.
- **Dado ausente é lacuna visível, não zero.** Siga o padrão do FIN-09 (`is_complete` + `incomplete_reason`): sem base, o cenário é marcado incompleto, com motivo, e a margem/resultado não é calculada.
- **Cenário aprovado não vira compromisso automático**: aprovar um cenário não cria recebível, despesa, meta nem orçamento executado. Prove isso no gate com contagem antes/depois.
- **Versionamento das premissas**: alterar a premissa de um cenário aprovado retira a aprovação (padrão já usado no CRM-25 e nas políticas do FIN-06).

## Gate

Acrescente **dois subtestes** a `tests/l07-delivery.integration.test.mjs` (HTTP e Chromium), elevando o gate de 22 para **24**. O subteste HTTP precisa cobrir, no mínimo: 401 anônimo, 403 papel indevido, 403 origem externa, premissa obrigatória, idempotência, transições inválidas, estimativa ≠ realizado, cenário incompleto com motivo, aprovação que não cria compromisso, alteração de premissa que derruba a aprovação, garantias repetidas no banco para escrita direta, histórico imutável e auditoria indisponível com rollback. O Chromium percorre a jornada pela aba nova.

## Regressão mínima antes do commit

Sempre **em série, nunca em paralelo** (disputa do `.next`):

`npm run typecheck` · `node scripts/qa-wave0-static.mjs` · `npm test` · `npm run test:migrations:pg` · `npm run test:l07-delivery:pg` **duas rodadas consecutivas** · `npm run test:l03-delivery:pg` · `npm run test:l04-delivery:pg` · `npm run test:l05-delivery:pg` · `npm run test:l06-delivery:pg` · `npm run build` · `git diff --check`.

Os gates reescrevem `next-env.d.ts` e `tsconfig.json`: rode `git checkout -- next-env.d.ts tsconfig.json` antes de commitar.

## Entregáveis

- `db/migrations/132-fin13-*.sql` aditiva + scripts atualizados.
- API endurecida em `src/server/fin-budget-api.mjs` + rotas de histórico em `server.mjs` e em `API_PATH_MATCH`.
- `src/app/admin/financeiro/BudgetWorkspace.tsx` ligado em `FinanceiroWorkspace.tsx`.
- Dois subtestes novos no gate L07 (22 → 24).
- `docs/ENTREGA-L07-FIN13.md` no mesmo formato de `docs/ENTREGA-L07-FIN12.md`: diagnóstico do que existia, o que mudou, tabela de evidência com comandos e números, e limitações explícitas.
- PR própria contra `main`, **sem merge sem autorização**.

## Dívida conhecida do bloco L07 (não é a sua fatia, mas registre)

- `docs/CHECKLIST-ENTREGA-LOCAL.md` continua com FIN-05..FIN-12 em `a_revalidar` e os campos "preencher": as entregas por fatia ficaram só nos `docs/ENTREGA-L07-FIN*.md`. Consolidar a matriz (com comando, número e commit por item) é tarefa do fechamento do bloco L07, junto com `docs/ESTADO-EXECUCAO-LOCAL.md`.
- FIN-12 deixou explícito que a conciliação do gateway **não** dá baixa no recebível (`fin_payment_history`). Ligar as duas coisas é decisão de contrato financeiro — pergunte ao usuário antes de assumir, provavelmente no fechamento de FIN-14/15.

## Comunicação

Português direto. Relate o que foi provado por execução contra o que continua pendente, com números. Em ambiguidade de escopo, de contrato de API, de migração ou de autorização: **pergunte, não decida sozinho.**
