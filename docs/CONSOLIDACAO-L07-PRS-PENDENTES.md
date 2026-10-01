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

## Estado consolidado
- L03: EMP-01..19 e HR-01..24 registrados como pronto_local; aceite humano e regressão final separados.
- L04: implementação técnica integrada; regressão 20/20 no PR #65.
- L05: contratos CON-01..11 integrados; regressão 1/1 no PR #65.
- L06: OPS-01..16 e AST-01..12 registrados como pronto_local; regressão 9/9 no PR #65.
- L07: em execução. FIN-01..16 possuem trabalho integrado, mas isso não equivale ao fechamento das jornadas. FIN-09..16 continuam a_revalidar na matriz até conciliar cada critério; não promover em massa.
- FIN-14..16: backend e testes HTTP integrados, sem abas próprias no workspace financeiro, conforme relatório de entrega.
- FIN-12: gateway sintético não dá baixa automaticamente no recebível FIN-04; falta definir e testar a ligação.
- ADM-01..12: a_revalidar; /admin/marcelo ainda é protótipo descritivo.
- L08: fechamento do portal cliente e expansões ainda pendente.
- L09: IA/RAG local real e medições no hardware-alvo ainda pendentes; fallback não comprova modelo real.
- L10: integração final, pacote atualizado, restauração, ensaio Windows e aceite humano pendentes.
- SMTP e hospedagem pública continuam fora do escopo. Nada nesta revisão homologa integrações externas.

## Próximos passos, em ordem
1. Integrar/revalidar PR #65 antes de código novo; confirmar main e checks atuais.
2. Corrigir FIN-13 por fatia aditiva: reproduzir aprovação preservada indevidamente e margem inconsistente; definir revisão explícita e fonte dos números; preservar histórico e testar UI/API/DB.
3. Reavaliar o que aproveitar de #47/#53 e fechar referências antigas somente após registrar a substituição testada.
4. Completar jornadas FIN-14..16, revisar telas de contas a pagar e fluxo compra→obrigação, conectar a baixa sintética de FIN-12 a FIN-04 com autorização/idempotência.
5. Entregar ADM-01..12, com indicadores que abrem registros reais e navegação de negócio.
6. Fechar matriz/evidências do L07 e produzir handoff L08. Não iniciar L08 nesta consolidação.

Leia [PROMPT-RETOMADA-L07-CONSOLIDADO.md](PROMPT-RETOMADA-L07-CONSOLIDADO.md).
