# Próxima fatia do L07 — jornadas FIN-14, FIN-15 e FIN-16 no workspace financeiro

Prompt preparado em 2026-10-02, ao final da fatia FIN-10 (alçada aplicada) + resíduos FIN-05/#47. **Esta fatia não foi iniciada.** Use este documento como instrução executável da próxima sessão.

## Contexto e fonte
- GitHub `berger33/gruposegsystemseguranca` é a fonte oficial. Trabalhe no ambiente remoto Arena, em branch própria criada a partir da main **atual**; não use a cópia do computador do proprietário.
- Fatias já entregues e que **não devem ser refeitas**: FIN-01..08; FIN-09/11/12 revalidadas com a migração 135 (incluindo a ligação sintética FIN-12 → FIN-04: webhook conciliado cria a baixa FIN-04 e o estorno reversor na mesma transação — **não reabra esse vínculo, não crie segunda rota/modelo de baixa de gateway**); FIN-13 `pronto_local` com a 134; **FIN-10 `pronto_local` com a 136** (alçada aplicada persistida, autoria por sessão, idempotência de criação, busca, TI somente leitura, trava de exclusão, painel de política ausente — não reabra o contrato de `/api/fin/expenses`, da 136 nem da tela `ExpenseWorkspace`).
- Confirme a main e os checks antes de escrever código: um SHA histórico não é HEAD, e gate verde de outra branch não comprova o commit novo. Se a PR da fatia FIN-10 ainda estiver aberta, registre o fato e pergunte ao proprietário antes de empilhar mudanças sobre o mesmo terreno; **não faça merge por conta própria e não feche PR de referência sem instrução expressa**.
- SMTP, hospedagem pública, PSP/banco, Pix/boleto, emissão fiscal, cobrança e transações externas reais continuam **fora do escopo**.

## Leitura obrigatória, nesta ordem
1. `README.md` e `AGENTS.md`, se existir.
2. `docs/ESTADO-EXECUCAO-LOCAL.md` (seção “Estado atual”).
3. `docs/ENTREGA-L07.md` (atualização vigente FIN-10) e `docs/CONSOLIDACAO-L07-PRS-PENDENTES.md` (seções “Aproveitamento efetivo”).
4. `docs/EXECUCAO-ENTREGA-LOCAL.md`, em especial o gate do L07 e a definição de “pronto local”.
5. Requisitos FIN-14, FIN-15 e FIN-16 em `docs/CHECKLIST-ENTREGA-LOCAL.md`.
6. Código atual: `src/server/fin-budget-api.mjs` (exportações, fechamentos e comissões — handlers canônicos), `src/app/admin/financeiro/FinanceiroWorkspace.tsx` (abas existentes), migrações `080`, `131`, `133`, `134`, `135`, `136` e `tests/l07-delivery.integration.test.mjs` (subtestes 30–32 já cobrem FIN-14/15/16 por HTTP).

## Estado que deve ser preservado
- L04, L05 e L06 têm entregas técnicas integradas; não refaça nenhuma delas.
- FIN-13 e FIN-10 estão `pronto_local`. Não reabra API/tela/migrações 134/136, idempotência, histórico com snapshots, erro de leitura + retry dessas telas.
- FIN-09/FIN-11 exibem falha de leitura e retry; FIN-12→FIN-04 tem vínculo canônico sintético. Não converta erro de leitura em lista vazia em nenhuma tela nova.
- Não apagar em massa os componentes órfãos de `/admin/ti`; o inventário/destino deles é pendência da fatia ADM-01..12.
- Baseline a reconfirmar na base atual antes de alterar negócio: estático 5/5 (001–136), `npm run typecheck`, `npm test` 196/196, `npm run build`, `npm run test:migrations:pg` 136/136, `npm run test:l07-delivery:pg` **32/32**, L04 20/20, L05 1/1, L06 9/9 (L03 1/1 se algo de EMP/HR for tocado).

## Objetivo desta fatia
Completar as **jornadas de tela** de FIN-14, FIN-15 e FIN-16: o backend e os testes HTTP (subtestes 30–32) existem, mas **não há abas próprias no workspace financeiro** — exportação do período, fechamento/reabertura de competência e provisão de comissões não são operáveis por navegação normal. **Não inicie L08, ADM-01..12 e não declare o L07 inteiro concluído.**

## Primeiro: reproduza as lacunas
Antes de corrigir, confirme cada ponto no código e reproduza por teste real (HTTP + PostgreSQL descartável + Chromium). Se algo já estiver resolvido, preserve e registre a evidência.
1. FIN-14: não existe aba/jornada de exportação; verifique se o acesso limitado do contador é respeitado na **leitura e no download**, não só no registro (`is_accountant_limited`/`access_role`), e se a trilha (`fin_export_logs`) é visível.
2. FIN-15: não existe aba/jornada de fechamento de competência; verifique se a reabertura exige autorização + motivo, se as versões de relatório são preservadas e exibidas, e se o fechamento bloqueia lançamentos no período (ou registre a ausência dessa trava como lacuna a tratar).
3. FIN-16: não existe aba/jornada de comissões; verifique se a provisão continua impedida de pagar automaticamente em **todos** os caminhos (API, SQL direto e interface) e se a revisão exige motivo/autor.

## Implementação esperada
- Abas próprias em `/admin/financeiro` para exportação, fechamento/reabertura e comissões, com o padrão já aplicado em FIN-10/13: seleção por nome/protocolo, moeda em R$ via `Intl.NumberFormat('pt-BR')`, erro de leitura visível com “Tentar novamente” (nunca lista vazia por `catch`), confirmação somente após persistência, ações sensíveis com motivo e autor real da sessão (sem `COALESCE` de autoria inferida).
- Autorização decidida no servidor em todas as rotas novas (anônimo 401, papel indevido 403, TI somente leitura onde essa é a regra) e auditoria na mesma transação da alteração, com rollback e `503 audit_unavailable` em falha injetada.
- Migrações apenas **aditivas**: 001–136 são imutáveis; descubra o próximo número livre no checkout (137 é o candidato, confirme) e trate linhas antigas explicitamente, sem inventar autoria nem apagar dados.
- Nada de pagamento, cobrança, emissão fiscal ou efeito externo real; documentos/arquivos permanecem metadados sintéticos validados.

## Reuso dos PRs de referência
#47 e #53 já tiveram seus resíduos úteis avaliados e registrados na [consolidação](CONSOLIDACAO-L07-PRS-PENDENTES.md) (aproveitados na 136: FK RESTRICT/CHECK/clamp de conciliação; alçada aplicada, trava de exclusão, autoria por sessão; adiados: importação de extrato em lote atômico). Os PRs **continuam abertos** até decisão expressa do proprietário. #59 (aprovador distinto) segue pendente como política de negócio — não a implemente por inferência. Não copie handlers inteiros nem migrações numeradas dessas PRs.

## Validação
Execute: `npm run typecheck`; `npm test`; `npm run build`; `node scripts/qa-wave0-static.mjs`; `npm run test:migrations:pg` com replay e checksum; `npm run test:l07-delivery:pg` com PostgreSQL descartável, HTTP e Chromium reais, **em duas execuções consecutivas**; e as regressões `test:l03/l04/l05/l06-delivery:pg`.
Amplie o gate com jornadas Chromium das três telas novas e negativos: papel indevido e anônimo, erro de leitura na interface com retry, contador limitado tentando acessar além do autorizado, reabertura sem motivo/autorização recusada com versões preservadas, e tentativa de pagamento automático de comissão recusada em todos os caminhos.
Não remova asserções, não ignore testes, não aumente timeout indiscriminadamente e não enfraqueça permissões para obter verde. Se um subteste reprovar por ruído de ambiente (Chromium/dev server sob disputa de CPU), registre o fato e reexecute; não mascare. Atenção aos padrões já mapeados: use `serviceWorkers:"block"` em contextos que simulam falha de rede, escope seletores por `data-testid` de linha (a base é compartilhada entre subtestes) e resolva pendências criadas pelo próprio teste antes do subteste seguinte.

## Entrega
1. Implemente e valide a fatia completa.
2. Atualize `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`, `docs/EVIDENCIAS-ENTREGA-LOCAL.md`, `docs/CONTROLE-IMPLEMENTACAO.md`, `docs/CONSOLIDACAO-L07-PRS-PENDENTES.md` e `docs/ENTREGA-L07.md` — sem abrir nova série de relatórios. Registre separadamente: lacuna reproduzida, solução, comandos/resultados, limitações externas e aceite humano pendente.
3. Abra PR revisável a partir da sua branch, com resumo, testes e links dos checks.
4. Diferencie implementação, validação automática e aceite humano. Não invente aprovação de Marcelo ou Andreia.
5. Promova um requisito a `pronto_local` só quando os critérios forem demonstrados por execução real.
6. Entregue o prompt da fatia seguinte (ADM-01..12, painel do Marcelo) sem iniciá-la.
7. Não faça merge sem instrução expressa do proprietário.

Depois desta fatia, a sequência é: ADM-01..12 com indicadores que abrem registros reais (incluindo o inventário/destino dos componentes órfãos de `/admin/ti`); fechamento da matriz e das evidências do L07; handoff para L08. L08–L10 continuam pendentes.
