# Consolidação L07 e comparação dos PRs pendentes — 2026-10-01

## Fonte e alcance
Leitura do GitHub no commit main `fa893d69d2e3205e508a0a3a1e95fd5ff956258f` (PR #64). Comparados os arquivos alterados, migrações, handlers, interfaces e testes propostos dos PRs #47, #53, #59, #60 e #62 com essa base. Esta é revisão estática de integração, não execução das branches antigas nem certificação de equivalência funcional.

O PR #65 ainda estava aberto na consulta. Sua branch `bd26689fa218d6cf12fb649bfb1839fe09564a06` passou nos cinco checks: [baseline](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36936463311), [L04](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36936463272), [L05](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36936463435), [L06](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36936463449), [L07](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36936463324). Resultados: 196 unitários, L04 20/20, L05 1/1, L06 9/9, L07 27/27, zero skips, migrações 133/133. Esses resultados pertencem à branch do PR #65, não à main anterior.

## Decisão sobre os PRs
Nenhum dos cinco deve ser mesclado em bloco ou encerrado como cópia equivalente. Há soluções alternativas e melhorias ainda não integradas. Preservar branches e PRs como referência até portar seletivamente as garantias úteis, com novas migrações e testes na base atual.

| PR / SHA examinado | Diferença observada | Destino recomendado |
|---|---|---|
| [#47](https://github.com/berger33/gruposegsystemseguranca/pull/47) / c24d1ad | Migração 124 com nome diferente da 124 integrada, FKs RESTRICT e exigência no banco de movimento + exatamente uma conta. Propõe importação de extrato e linhas numa transação e teste de sugestões concorrentes. Main já tem API de conciliação e índice único parcial, mas a sua 124 não contém essas mesmas constraints. | Comparar garantias com o schema completo; portar somente lacunas comprovadas, sem inserir uma segunda 124. Manter a interface atual de conciliação. |
| [#53](https://github.com/berger33/gruposegsystemseguranca/pull/53) / 3e202ac | Outra migração 129 e outro catálogo de alçadas: fin_expense_authorities versus fin_expense_approval_authorities integrado. Formato local://synthetic versus synthetic://. Acrescenta limite aplicado no histórico, trava de exclusão e duplicidade natural. | Preservar entidade e contrato HTTP atuais; avaliar snapshot da alçada, retenção/histórico e duplicidade em fatia aditiva. Não importar tabelas paralelas ou trocar formato de evidência sem compatibilidade. |
| [#59](https://github.com/berger33/gruposegsystemseguranca/pull/59) / 6a9328e | FIN-13 alternativo: premissas estruturadas, idempotência, margem calculada, aprovador diferente do autor e cenário base + alternativa para revisão. Move orçamento para fin-management-api e redefine fin_budget_history. | Fonte de testes e garantias; não adotar automaticamente detector textual de promessas nem políticas novas de aprovação como requisitos já decididos. Não substituir a 132. |
| [#60](https://github.com/berger33/gruposegsystemseguranca/pull/60) / da96eff | FIN-13 alternativo: cálculo/validação de margem, bloqueio de revisão aprovada, histórico navegável e fluxo de revisão/aprovação pela UI. Também redefine a 132 e muda o handler canônico. | Aproveitar jornadas e negativas por adaptação. A igualdade de FinanceiroWorkspace.tsx isoladamente não torna o PR equivalente à main. |
| [#62](https://github.com/berger33/gruposegsystemseguranca/pull/62) / 944c8d5 | FIN-13 alternativo: versão de premissas, revisão que revoga aprovação, origem/data-base, estado incompleto explícito, idempotência e cálculo de margem. Sua fin_budget_history usa outro formato. | Principal referência para lacunas de FIN-13, com port seletivo no handler atual e migração nova; nunca copiar sua 132 sobre a já aplicada. |

### Por que o merge direto é inadequado
- Main já contém 124, 129, 132 e 133 com conteúdo próprio. As alternativas não são migrações adicionais independentes.
- #47 e #53 acrescentariam arquivos diferentes com números já usados; #59/#60/#62 disputam o mesmo arquivo 132.
- Os manifestos e runners das branches antigas apontam para estados anteriores do projeto.
- As implementações FIN-13 alternativas mudam rotas, handlers e o formato da tabela de histórico. Copiar só a tela ou só a migration quebra esse contrato.
- Nenhuma migração 001–133 deve ser reescrita; descobrir o próximo número livre antes de cada port.
- Não foi realizado merge, fechamento de PR, exclusão de branch ou alteração financeira nesta revisão.

## Lacunas concretas de FIN-13 na main
Inspeção de `src/server/fin-budget-api.mjs`, `db/migrations/132-fin13-budget-hardening.sql` e `src/app/admin/financeiro/BudgetWorkspace.tsx`:
1. PATCH permite alterar premissas e valores mantendo status aprovado; não revoga a aprovação nem bloqueia a revisão. O trigger atual verifica transições, mas não congela o conteúdo aprovado.
2. POST de cenário aceita projected_margin_percent fornecido pelo navegador, validando faixa; não confere a porcentagem com receita e custo. A UI oferece esse campo ao usuário. Verificar também demais constraints do schema ao reproduzir.
3. A 132 registra histórico de criação/mudança de status, mas não snapshots completos de premissas e números para cada revisão. A identidade do histórico deriva de approved_by_identity, o que não identifica necessariamente o autor de toda edição.
4. Criação de orçamento não tem chave de idempotência no handler atual; repetir envio pode criar outro orçamento.
5. Falhas de leitura na UI são convertidas em listas vazias por catch, confundindo indisponibilidade com ausência de registros.
6. A UI não oferece o fluxo completo de revisão/aprovação/histórico existente nas propostas alternativas.

São achados de código, ainda sem teste negativo novo executado nesta revisão. O gate verde do PR #65 comprova os cenários existentes; não elimina lacunas que ele não exercita.

## Aproveitamento efetivo na fatia aditiva de FIN-13 (2026-10-01)

Registro exigido antes de qualquer encerramento de PR. **Nenhum dos PRs foi mesclado, fechado ou teve branch apagada nesta sessão**; eles continuam abertos como referência. A correção foi feita na base atual, com a migração nova **134**, preservando 001–133 e sem reescrever a 132.

| Melhoria examinada | Origem | Destino nesta fatia | Por quê |
|---|---|---|---|
| Chave de idempotência em `fin_budgets` com índice único parcial e faixa 8–200 | #62 (`fin_budget_idempotency_required`) | **Aproveitada**, reimplementada na 134 | Resolve o achado 3. Diferença: a chave acompanha `content_fingerprint`, para distinguir retry igual (200, `idempotent_replay`) de reuso com conteúdo diferente (409), caso que o #62 não separava |
| Versão de premissas incrementada na revisão | #62 (`premises_version`) | **Aproveitada** como `fin_budgets.version` | Mesmo efeito de preservar a versão anterior; o nome foi generalizado porque a revisão também pode alterar números, não só premissas |
| Revisão revoga a aprovação | #62 (`fin_budget_revision_revokes_approval`) | **Aproveitada**, com transição `aprovado → em_revisao` guardada no banco | Resolve o achado 1. Diferença: o #62 devolvia o orçamento a `rascunho`; aqui ele vai a `em_revisao`, mantendo a máquina de estados já aplicada em produção local |
| Lacuna visível em vez de zero quando falta base | #62 | **Aproveitada** como `margin_basis` gerado (`dados_incompletos`, `receita_zero_sem_percentual`) | Atende “não inventar percentual nem apagar valores conhecidos” sem criar vocabulário novo de estado |
| Origem do número e data-base por cenário | #62 | **Adiada, não descartada** | São campos de cadastro adicionais; exigem decisão de negócio sobre quais origens são válidas. Fora do escopo desta correção, registrado como pendência |
| Coluna de margem calculada conferida contra a declarada | #60 (`projected_margin_percent_calculated` + CHECK de igualdade) | **Aproveitada e endurecida** | Resolve o achado 2. Em vez de duas colunas que precisam concordar, `computed_margin_percent` é **GENERATED ALWAYS** (não é gravável por ninguém) e a constraint confere a coluna legada contra receita e custo |
| Histórico com `event_type` e margem anterior/posterior | #60 | **Aproveitada e ampliada** | Virou `event_type` + `version_before/after` + `snapshot_before/after` completos, o que o achado 4 exigia para reconstruir a revisão inteira |
| `revision_no` sequencial próprio do histórico | #60 | **Descartada** | Redundante com `fin_budgets.version`; duas numerações independentes divergem quando uma escrita falha |
| Autor do histórico por `COALESCE(actor, approved_by_identity, created_by_identity)` | #60 | **Descartada explicitamente** | É atribuição de autoria por suposição — exatamente o defeito do achado 4. Aqui o autor chega por GUC transacional; sem ele, o registro diz “não informado pela origem” em vez de apontar alguém |
| Mover o orçamento para `fin-management-api.mjs` e criar `FinBudgetClient.tsx` em `/admin/ti` | #60 e #62 | **Descartada** | A rota canônica continua `fin-budget-api.mjs` com a aba de `/admin/financeiro`, conforme a retomada; TI permanece somente leitura |
| Aprovador obrigatoriamente diferente do autor; mínimo de dois cenários | #59 | **Não adotada** | É política empresarial ainda não decidida pelo proprietário; não vira requisito por inferência |
| Premissas estruturadas e detector textual de promessa | #59 | **Não adotada nesta fatia** | Mudança de contrato de dados maior que a correção; permanece como referência |
| Garantias de conciliação (#47) e de despesas/alçadas (#53) | #47, #53 | **Fora do escopo desta fatia** | Pertencem a FIN-05 e FIN-10; continuam na fila de reavaliação registrada abaixo |

## Colisão a resolver: PR #67 e PR #68 atacam a mesma fatia (2026-10-01)

Durante esta fatia foi aberta, em paralelo, a **PR #67** (`arena/01a0f9b5-gruposegsystemseguranca`, 2026-10-01T23:47Z), que também corrige FIN-13 e também cria uma migração **numerada 134**, com outro nome de arquivo (`134-fin13-budget-revisions-idempotency-margin.sql`, contra `134-fin13-budget-revision-margin-idempotency.sql` da PR #68).

Consequência prática: **as duas não podem ser integradas**. Além de resolverem o mesmo problema duas vezes, duplicariam o número 134, o que reprova `node scripts/qa-wave0-static.mjs` e quebra o migrador.

Encaminhamento proposto, a decidir pelo dono (nenhuma das duas foi mesclada ou fechada):
1. Escolher **uma** das duas PRs como implementação da fatia e fechar a outra registrando o motivo.
2. Se a escolhida for a #67, a #68 precisa ser renumerada para a próxima migração livre e rebaseada antes de qualquer reaproveitamento (e vice-versa).
3. Não misturar as duas no mesmo merge.

## Estado consolidado
- L03: EMP-01..19 e HR-01..24 registrados como pronto_local; aceite humano e regressão final separados.
- L04: implementação técnica integrada; regressão 20/20 no PR #65.
- L05: contratos CON-01..11 integrados; regressão 1/1 no PR #65.
- L06: OPS-01..16 e AST-01..12 registrados como pronto_local; regressão 9/9 no PR #65.
- L07: em execução. FIN-09, FIN-11 e FIN-12 foram revalidados nesta fatia e estão `pronto_local` na matriz; FIN-04 foi revalidado somente no vínculo de baixa/estorno do gateway. Isso não encerra L07 nem promove FIN-10, FIN-14..16 ou ADM em massa.
- FIN-14..16: backend e testes HTTP integrados, sem abas próprias no workspace financeiro, conforme relatório de entrega.
- FIN-12: a conciliação sintética agora materializa a baixa FIN-04 e o estorno reversor na mesma transação; o que permanece fora de escopo é qualquer PSP, boleto, Pix, banco ou cobrança real.
- ADM-01..12: a_revalidar; /admin/marcelo ainda é protótipo descritivo.
- L08: fechamento do portal cliente e expansões ainda pendente.
- L09: IA/RAG local real e medições no hardware-alvo ainda pendentes; fallback não comprova modelo real.
- L10: integração final, pacote atualizado, restauração, ensaio Windows e aceite humano pendentes.
- SMTP e hospedagem pública continuam fora do escopo. Nada nesta revisão homologa integrações externas.

## Próximos passos, em ordem
1. Integrar/revalidar PR #65 antes de código novo; confirmar main e checks atuais.
2. Corrigir FIN-13 por fatia aditiva: reproduzir aprovação preservada indevidamente e margem inconsistente; definir revisão explícita e fonte dos números; preservar histórico e testar UI/API/DB.
3. Reavaliar o que aproveitar de #47/#53 e fechar referências antigas somente após registrar a substituição testada.
4. Concluir FIN-10 e a avaliação adaptativa dos resíduos de #47/#53; depois completar jornadas FIN-14..16. A ligação sintética FIN-12 → FIN-04 já foi entregue/testada na migração 135.
5. Entregar ADM-01..12, com indicadores que abrem registros reais e navegação de negócio.
6. Fechar matriz/evidências do L07 e produzir handoff L08. Não iniciar L08 nesta consolidação.

Leia [PROMPT-RETOMADA-L07-CONSOLIDADO.md](PROMPT-RETOMADA-L07-CONSOLIDADO.md).
