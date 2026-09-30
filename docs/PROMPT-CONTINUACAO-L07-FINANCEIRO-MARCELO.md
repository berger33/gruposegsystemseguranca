# Continuação L07 — Financeiro e Marcelo (FIN-01..16 + ADM-01..12)

> Documento de handoff preparado ao fechar o L06 (commit `a99ea9f`, OPS-01..16 e AST-01..12 `pronto_local`). Leia tudo antes de escrever código. Siga o repositório, não a memória: confirme cada afirmação abaixo com greps e leitura de código antes de usá-la.

## Missão

Conduzir o **L07 — Financeiro e Marcelo** até `pronto_local` nos 28 itens da matriz (`FIN-01` a `FIN-16` e `ADM-01` a `ADM-12`), com jorna­das completas pela interface, autorização decidida no servidor, persistência real em PostgreSQL descartável e teste de integração próprio (gate L07, que hoje **não existe**). Entregar em fatias pequenas, cada uma com gate verde, commit revisável e PR própria. Ao final, entregar o prompt de continuação do L08.

O L07 é o mesmo terreno do L06: **não é greenfield**. O schema (migrações 077–080 para FIN, 081–082 para ADM) e as APIs (`fin-api.mjs`, `fin-management-api.mjs`, `fin-advanced-api.mjs`, `fin-budget-api.mjs`, `adm-api.mjs`, `adm-advanced-api.mjs`, mais `commission-api.mjs`, `cost-parameter-api.mjs`, `budget-api.mjs`, `cli-finance-api.mjs`) já existem da fase de layout. A entrega é **auditar, endurecer, completar telas e provar por execução** — não reescrever.

## Regra de branch

Trabalhe **exclusivamente** na branch da sua sessão (formato `arena/<id>-gruposegsystemseguranca`). Não reutilize branches de sessões encerradas. Push somente na sua branch. Nunca `main` direto.

## Pré-voo (faça antes de qualquer mudança)

1. Confirme a branch da sessão com `git branch --show-current` e o head com `git log --oneline -3`.
2. Rodar a bateria atual e registrar os números como baseline: `npm run typecheck`, `node scripts/qa-wave0-static.mjs` (5/5), `npm run test:migrations:pg` (123/123, 517 tabelas), `npm test` (196/196), `npm run test:l04-delivery:pg` (20/20), `npm run test:l05-delivery:pg` (1/1), `npm run test:l06-delivery:pg` (9/9). Se algo estiver vermelho **antes** de você mexer, pare e relate — não herde quebra.
3. Confirme o ponto de partida do L06 (não refazer): `grep -c "evaluateOps04" src/server/ops-api.mjs`, `grep -c "shift-needs-title\|dimensioning-title\|schedule-calendar-title" src/app/admin/operacao/OperacaoWorkspace.tsx`, `grep -c '"/api/ops/schedule-history"' server.mjs`. A matriz (`docs/CHECKLIST-ENTREGA-LOCAL.md`) deve mostrar OPS-01..16 e AST-01..12 `pronto_local`.
4. Nenhum teste/gate de L07 existe: confirme com `ls .github/workflows/` (só `ci.yml`, `l04-delivery.yml`, `l05-delivery.yml`, `l06-delivery.yml`) e `grep -n "test:l07" package.json` (nada). Criar o gate L07 é parte da entrega.

## Estado oficial já integrado — não refazer

- **L00, L02 e L03 concluídos**; L04 parcial com lacunas explícitas; L05 pendente na tabela de estado (o gate `test:l05-delivery:pg` existe e passa 1/1 — não mexa no L05, apenas não o quebre); **L06 concluído** nesta sessão.
- Superfícies financeiras e do painel já existem (auditar, não reescrever):
  - ~37 rotas `/api/fin/*` (receivables, payables, payments, payment-history, recurrence-rules, generate-recurring, attachments, suppliers, cost-centers, bank-statements, bank-transactions, conciliations, collection-*, cashflow-snapshots, aging-receivables, costs, cost-imports, management-results, result-history, expenses, expense-history, fiscal-*, gateway-*, budgets, budget-scenarios, exports, export-logs, report-versions, competence-closures, commission-provisions, commission-provision-history).
  - ~16 rotas `/api/adm/*` (my-day, commercial-snapshots, operational-snapshots, financial-snapshots, renewal-risks, approvals, approval-history, search-favorites, saved-filters, shortcuts, reports, report-logs, business-configs, goals-comparison, management-diary-access, expansion-analyses).
  - Painel do Marcelo: `/admin/marcelo` e `/admin/marcelo/assistente`.
  - Migrações 077–080 (FIN) e 081–082 (ADM) — **não crie migração nova sem comprovar necessidade**.
- Os 28 itens estão `a_revalidar` na matriz: ninguém jamais provou essas jornadas por execução. Trate cada estado `a_revalidar` como **não entregue até prova**.

## O que exatamente falta (transcrito da matriz — a matriz é a fonte)

- **FIN-01** contas a receber vinculadas a contrato, competência, vencimento, recorrência, moeda, valor e situação.
- **FIN-02** contas a pagar, fornecedores, categoria, centro de custo, vencimento, aprovação e anexos.
- **FIN-03** geração recorrente idempotente por contrato/competência/item; pró-rata, reajuste e suspensão conforme regras aprovadas.
- **FIN-04** pagamento/recebimento parcial, estorno, cancelamento, renegociação e baixa auditada; nunca apagar saldo por edição silenciosa.
- **FIN-05** conciliação por importação/extrato ou provedor, sugestão e confirmação; evitar duplicar transações.
- **FIN-06** cobrança com responsável, lembretes, histórico e política aprovada; sem mensagens reais ou bloqueio de portal automático na implementação.
- **FIN-07** fluxo de caixa previsto/realizado, vencidos, próximos pagamentos e aging de recebíveis.
- **FIN-08** custo por cliente/contrato/posto, importação de custos de pessoal, equipamentos, materiais e supervisão com rateio documentado.
- **FIN-09** resultado gerencial por contrato, separando receita contratada, faturada, recebida, custos e caixa; margem sem dados completos exibida como incompleta.
- **FIN-10** despesas/reembolsos e compras com alçada, evidência e segregação entre solicitar/aprovar quando definida.
- **FIN-11** integração contábil/fiscal mediante provedor; determinar NFS-e/NF-e ou outra obrigação conforme atividade, sem assumir uma nota para tudo.
- **FIN-12** boletos/Pix/gateway somente após seleção e sandbox; validar assinatura de webhook, replay, idempotência e conciliação; sem cobrança real em testes.
- **FIN-13** orçamento gerencial e cenários de expansão com premissas explícitas; não prometer resultado.
- **FIN-14** exportação do período com trilha, filtros, totais conciliáveis e acesso limitado do contador.
- **FIN-15** fechamento de competência e reabertura autorizada; preservar versões de relatório.
- **FIN-16** comissões ligadas à regra CRM-25, provisão e revisão; não pagar automaticamente. (CRM-25 está `pronto_local` em escopo técnico L04: regras versionadas em `crm_commercial_versions`, snapshot da regra usada, alterar regra retira aprovação. O L07 conecta comissão a recebível/faturamento real.)
- **ADM-01** painel “Meu dia” com pendências reais, prioridade, responsável e ação.
- **ADM-02** visão comercial com leads novos, oportunidades paradas, propostas e próximas ações.
- **ADM-03** visão operacional com cobertura, ocorrências críticas, SLA e implantação.
- **ADM-04** visão financeira com fonte/competência, saldo, vencimentos e margem por contrato.
- **ADM-05** contratos próximos de renovar, reclamações reincidentes e risco de perda justificado.
- **ADM-06** aprovação unificada de descontos, compras, despesas e exceções permitidas; alçadas por valor/escopo.
- **ADM-07** busca autorizada, favoritos, filtros salvos e atalhos com contexto.
- **ADM-08** relatórios exportáveis e agendados para destinatários autorizados; registrar geração/envio e limitar dados.
- **ADM-09** configurações de negócio versionadas: catálogo, preços, alçadas, conteúdo, SLA e preferências.
- **ADM-10** metas e cenários com comparação prevista/realizada, sem confundir estimativa com resultado.
- **ADM-11** trilha e diário de decisões CON-11 acessíveis conforme permissão.
- **ADM-12** análises de expansão, qualidade e oportunidades adicionais alimentadas pelos módulos reais.

## Lacunas e suspeitas já conhecidas (confirme por leitura antes de corrigir)

1. **Borda de RH nos aliases legados de fin/adm**: as rotas canônicas `/api/fin/*` e `/api/adm/*` existem, mas os aliases históricos `/api/hr/fin-*`, `/api/admin/hr/fin-*`, `/api/crm/hr/fin-*`, `/api/hr/adm-*` etc. **passam pela borda de RH** (`requireHrSession`) — a mesma família de bug corrigida no L06 para ops (OPS-01). Se o gate usar só os caminhos canônicos, isso não bloqueia; se a UI usar alias legado, bloqueia. Referência de correção: `LEGACY_OPS_ALIAS`/isenção na borda em `server.mjs`.
2. **Nada foi provado por execução**: não existe um único teste de integração das 53 rotas fin/adm. Auditoria first: leia os 4 módulos `fin-*` + 2 `adm-*` antes de escrever o gate, ou o gate vai falhar por motivo errado.
3. **UIs financeiras**: verifique quais telas existem de fato (`/admin/financeiro*`? apenas dentro de `/admin/marcelo`?) antes de assumir que falta tela — e quais itens são só API. A matriz exige tela onde diz "tela"; onde não diz, API + dados + autorização bastam, mas a jornada de usuário ainda precisa ser navegável por HTTP real.
4. **Estados `a_revalidar` não viram `pronto_local` por proximidade**: só por evidência de execução no gate.

## Estratégia de entrega (fatias)

Modele no L06: fatias pequenas, cada uma fecha o gate verde, commit revisável, PR própria. Sugestão de sequência (ajuste após a auditoria):

- **Fatia 1 — fundação do gate**: auditar `fin-api`/`fin-management-api` (recebíveis, pagáveis, recorrência, pagamentos); criar `scripts/qa-l07-delivery-postgres.mjs`, `tests/l07-delivery.integration.test.mjs`, script `test:l07-delivery:pg` no `package.json` e workflow `.github/workflows/l07-delivery.yml` (copie a estrutura do `l06-delivery.yml`); primeira rodada com os casos FIN-01..04 que já funcionarem, corrigindo o que quebrar. **Criar o gate primeiro evita fatia sem prova.**
- **Fatia 2 — FIN-01..04**: contas a receber/pagar, geração recorrente idempotente (FIN-03) e baixa parcial/estorno (FIN-04) com transação, bloqueio concorrente e trilha.
- **Fatia 3 — FIN-05..07**: conciliação (importação de extrato sintético, sem duplicar), cobrança com política e histórico (sem mensagens reais), fluxo de caixa e aging.
- **Fatia 4 — FIN-08..10**: custos com rateio documentado, resultado gerencial com margem "incompleta" quando faltam dados, despesas/reembolsos com alçada e segregação.
- **Fatia 5 — FIN-11..12**: provedor fiscal e gateway **apenas como simuladores/sandbox explícitos e rotulados** — assinatura de webhook, replay e idempotência testados contra o simulador; nenhuma nota ou cobrança real.
- **Fatia 6 — FIN-13..16**: orçamento/cenários com premissas, exportação com trilha e contador de acesso limitado, fechamento/reabertura de competência, comissões ligadas ao CRM-25 (provisão, nunca pagamento automático).
- **Fatia 7 — ADM-01..06**: painel do Marcelo — Meu dia com pendências reais, visões comercial/operacional/financeira, risco de renovação justificado, aprovações unificadas com alçada.
- **Fatia 8 — ADM-07..12**: busca/favoritos/filtros/atalhos, relatórios com registro de geração, configurações versionadas, metas prevista vs realizada, diário de decisões, análises de expansão.

## Limites de escopo e segurança

- **Nunca banco ou credencial de produção**: só PostgreSQL descartável (`embedded-postgres` local, prefixo `seg_qa_`) e Chromium local.
- **Nenhuma cobrança, nota fiscal, boleto ou pagamento real** — gateway/fiscal são simuladores com cenários de sucesso, falha e replay, rotulados como sintéticos.
- **A API autoriza; o React só renderiza.** Toda mutação exige sessão + same-origin + papel adequado no servidor. Fail-closed: erro de banco ou auditoria => 503 sem efeito parcial.
- **Não criar entidade paralela** (contrato, empresa, posto, funcionário, cliente, fornecedor): reutilize as canônicas (`crm_*`, `ast_suppliers`, `hr_employees`...).
- **Não inferir número**: margem sem dados completos é exibida como incompleta; estimativa nunca se disfarça de resultado; dado ausente vira lacuna visível, não zero.
- **Saldo nunca é apagado por edição silenciosa**: estorno, cancelamento e renegociação são movimentos auditados.
- **Não remover assertion existente nem transformar teste real em mock.**
- **Migrações: somente aditivas e só se comprovadamente necessárias** (a próxima seria a **124**; atualizar `scripts/migrate-site-visual.mjs`, `scripts/qa-wave0-static.mjs`, testes de checksum/upgrade e a contagem 123→124). Se achar que precisa de migração, questione primeiro — provavelmente o schema 077–082 já tem a coluna.
- **Sem merge de PR sem autorização explícita do usuário** (regra permanente desta série de sessões).

## Casos obrigatórios no gate L07

Além dos negativos padrão (anônimo 401, papel indevido 403, same-origin), o gate precisa provar, com PostgreSQL descartável real:

1. **Contrato gera cobrança sintética única** (FIN-01/03): geração recorrente idempotente — rodar duas vezes, mesma competência, sem duplicar.
2. **Recebimento parcial e estorno conciliam** (FIN-04/05): baixa parcial deixa saldo; estorno devolve; duas baixas simultâneas não passam do valor; estorno repetido é rejeitado; falha parcial não deixa meia baixa (transação).
3. **Compra aprovada gera obrigação** (FIN-02/10): aprovação com alçada cria conta a pagar; quem solicita não aprova a si mesmo quando segregação definida.
4. **Marcelo decide pelo painel e visualiza o efeito** (ADM-01..06): pendência real aparece no Meu dia, decisão pelo painel reflete no dado de origem e a visão financeira mostra fonte/competência.
5. **Webhook de gateway simulado**: assinatura inválida rejeitada; replay idempotente; nenhuma cobrança real (FIN-12).
6. **Fechamento de competência bloqueia o período; reabertura é autorizada e auditada; versão de relatório preservada** (FIN-14/15).
7. **Exportação com trilha e totais conciliáveis; contador vê só o que deve** (FIN-14).
8. **Comissão provisionada sobre recebimento real pela regra vigente do CRM-25; nenhuma provisão sem base; nenhum pagamento automático** (FIN-16).
9. **Jornada por navegador real (Chromium)** em pelo menos: geração de cobrança a partir de contrato, baixa+estorno, e painel do Marcelo com decisão refletida. Um navegador por subteste (o padrão do L06 usa um navegador por subteste com cookie injetado — siga o helper `provisionAndLoginStaff`, senha `Integracao-Sintetica-7!`).
10. **Fail-closed**: com a auditoria fora do ar (ex.: rename temporário da tabela de auditoria), a mutação financeira falha fechada (503, sem efeito parcial). O stderr `relation "audit_log" does not exist` nessa janela é ruído esperado.

## Gate e regressões

- Gates **sempre em série, nunca em paralelo** (disputa do `.next`). **Não encoste rodadas**: deu gate verde, espere a limpeza terminar antes do próximo; se uma rodada falhar em massa com duração várias vezes o normal (ex.: 9 min vs 3 min), suspeite de contenção e re-rodada antes de debugar código — isso já aconteceu localmente (L04 19 falhas que sumiram na re-rodada sem nenhuma mudança).
- Limpar `.next/integration-*` antes de rodadas que falharem estranho: `rm -rf .next/integration-l06` etc.
- Regressão mínima de cada fatia: `npm run typecheck`, `node scripts/qa-wave0-static.mjs`, `npm test`, `npm run test:migrations:pg` (se tocou migração), e os gates dos blocos que você tocou (`l04` se tocou comercial/CRM, `l06` se tocou ops/AST, sempre o `l07`). Bateria completa ao fechar o bloco.
- Os gates reescrevem `next-env.d.ts`/`tsconfig.json`: `git checkout -- next-env.d.ts tsconfig.json` antes de commitar.
- O migrador exige banco `seg_qa_*`; o checksum do 006 no gate de migrações é sucesso esperado.

## Documentação e evidências

- Atualize `docs/CHECKLIST-ENTREGA-LOCAL.md` por item (estado, tela/API/dados/autorização, evidência com comando+números+commit, pendências), `docs/ESTADO-EXECUCAO-LOCAL.md` (linha L07) e crie `docs/ENTREGA-L07.md` no padrão do `ENTREGA-L06.md` (seção por fatia com a tabela de casos do gate).
- Documente só com evidência real. Código vence documentação divergente.

## Critério de conclusão do L07

- FIN-01..16 e ADM-01..12 `pronto_local` com evidência de execução em `docs/CHECKLIST-ENTREGA-LOCAL.md`.
- Gate L07 criado e verde em série (mínimo duas rodadas seguidas) + bateria completa de regressão verde (L02/L03 se aplicável, L04 20/20, L05 1/1, L06 9/9, migrações, unitários, typecheck, build, estático).
- PRs por fatia abertas da branch da sessão; **merge só com autorização explícita**.
- `docs/ESTADO-EXECUCAO-LOCAL.md` com L07 marcado concluído (entrega técnica local) e ressalvas honestas de aceite humano/fronteira externa.
- Prompt de continuação do **L08 — Cliente e expansões** em `docs/PROMPT-CONTINUACAO-L08-CLIENTE-EXPANSAO.md` no mesmo formato deste.

## Armadilhas conhecidas

- `gh run rerun --failed` está quebrado no repo; para revalidar CI, feche e reabra a PR.
- O CI pode falhar por lentidão do runner (timeout de 15 min); mensagens `::error::` com contagens menores que o total no fim do log indicam runner ruim, não código ruim. Re-rodada resolve; mudança de código, não.
- Nunca dois gates/build em paralelo, nem localmente nem esperando CI.
- Chromium por subteste é pesado: mantenha um navegador por subteste e navegações enxutas (networkidle + `waitForSelector` por id/texto específico). Evite assertar estado de carregamento — espere o elemento final (ex.: tabela que só existe pós-fetch), não o título da seção (que renderiza antes dos dados).
- Fallback `||` em campo que aceita `0`/`""` é bug latente (usar `??`); já corrigido em `required_headcount`, procure o padrão em handlers de fin/adm.
- Commits de fechamento de bloco: mensagens longas com o porquê (veja `git log` do L06 como exemplo).

## Comunicação

Português direto. Relate o provado por execução vs. pendente. Em ambiguidade de escopo, **pergunte** — não decida sozinho mudanças de contrato, migrações ou autorização. Ao reportar progresso: o que rodou, números, e o próximo passo.
