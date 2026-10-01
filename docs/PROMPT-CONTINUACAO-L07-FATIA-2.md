# Prompt de continuacao — L07, fatia 2 (FIN-01..04 endurecidos + tela financeira)

Esta sessao continua o L07 — Financeiro e Marcelo a partir da fatia 1 integrada na PR #43. O escopo exclusivo e entregar FIN-01..04 endurecidos, tela financeira real em `/admin/financeiro` e jornada Chromium no gate, sem iniciar FIN-05..16 nem ADM-01..12.

## Regras de execucao

- Trabalhar somente na branch da sessao e no ambiente remoto Arena/GitHub, usando dados sintéticos, PostgreSQL descartável e Chromium remoto.
- Não usar produção, credenciais ou integrações reais.
- Não criar migração sem comprovar necessidade; o schema 077–082 cobre a fatia.
- Não remover os componentes mortos de `src/app/admin/ti/` nesta fatia.
- Gates em série; não executar gates/build em paralelo.
- Não fazer merge da PR sem autorização explícita do usuário.

## Escopo obrigatório

1. Endurecer `handlePayments` com uma única transação, `SELECT ... FOR UPDATE`, rollback completo e rejeição 409 `overpayment` quando o total exceder o valor da conta.
2. Rejeitar estorno repetido com 409 `estorno_already_exists`; exigir mesma conta/tipo; limitar o valor ao pagamento de origem.
3. Tornar a auditoria financeira fail-closed: `auditLog` deve propagar erro e ocorrer na mesma transação de `handlePayments`, `handleReceivables`, `handlePayables` e `handleGenerateRecurring`; falha deve retornar 503 sem mutação parcial.
4. Isentar aliases históricos `fin-*`/`adm-*` da autorização legada de RH na borda, mantendo autorização própria dos handlers e 404 para alias desconhecido.
5. Criar `/admin/financeiro` no padrão `OperacaoWorkspace`, consumindo apenas `/api/fin/*`, com abas Recebíveis, Recorrência e Pagamentos, criação/filtros, aprovação/geração, baixa/estorno/histórico, estados de carregamento/vazio/erro, `data-testid` estáveis e visibilidade por `financeiro`/`admin`/`ti`. Ausência de saldo/margem deve ser explícita, nunca zero implícito.

## Gate e evidências

Adicionar à suíte L07 um subteste Chromium real cobrindo login financeiro, criação/aprovação/geração pela tela e recusa 409 da segunda geração, além de baixa parcial e estorno com motivo de 10–1000 caracteres. Adicionar teste fail-closed renomeando `audit_log` durante a janela e restaurando em `finally`, comprovando 503 e nenhum efeito parcial. Manter os negativos existentes (401, 403, same-origin, 400 e 409).

Pré-voo e regressão: `npm run typecheck`, `node scripts/qa-wave0-static.mjs`, `npm run test:migrations:pg`, `npm test`, `npm run test:l07-delivery:pg` (duas rodadas), `npm run test:l06-delivery:pg` e `npm run build`. Documentar apenas evidência real em `docs/ENTREGA-L07.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md` e `docs/ESTADO-EXECUCAO-LOCAL.md`; FIN-01..04 só podem ser `pronto_local` com tela/API/dados/autorização e evidência de execução.

A base esperada contém o merge da PR #43 e a fatia 1 já integrada. Este arquivo deve ser versionado primeiro, em commit próprio, antes das demais mudanças da fatia 2.
