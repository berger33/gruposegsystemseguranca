# Próxima fatia do L07 — jornadas UI de FIN-14, FIN-15 e FIN-16

Prompt preparado em 2026-10-02, ao final da fatia FIN-10 + avaliação adaptativa #47/#53. **Esta fatia não foi iniciada.** Use este documento como instrução executável da próxima sessão.

## Contexto e fonte
- GitHub `berger33/gruposegsystemseguranca` é a fonte oficial. Trabalhe no ambiente remoto Arena, em branch própria criada a partir da main **atual**; não use a cópia do computador do proprietário; sem merge automático e sem force push.
- A fatia anterior entregou FIN-10 (despesas/alçadas) com a migração aditiva **136** (`136-fin10-fin05-policy-history-locks.sql`), registrada em `docs/ENTREGA-L07-FIN10.md`, e gravou a avaliação seletiva dos resíduos #47/#53 em `docs/CONSOLIDACAO-L07-PRS-PENDENTES.md` — nenhuma das duas PRs foi mesclada, copiada ou fechada, e elas não precisam ser reavaliadas.
- **A ligação FIN-12 → FIN-04 já está concluída**: a migração **135** (merge da PR #69) endurece o vínculo cobrança sandbox → webhook → pagamento FIN-04 → baixa/estorno do recebível na mesma transação, provado nos subtestes 25/26 do gate L07 (HMAC recusado, replay 1+5, baixa materializada, estorno reversor). **Não reabra essa ligação.** O que falta em FIN-14/15/16 é a jornada operável na interface; o backend e os testes HTTP já existem (subtestes 33–35).
- SMTP, hospedagem pública, PSP/banco, Pix/boleto, emissão fiscal, cobrança e transações externas reais continuam **fora do escopo**; adaptadores e evidências permanecem explicitamente sintéticos.

## Leitura obrigatória, nesta ordem
1. `README.md` e `AGENTS.md`, se existir.
2. `docs/ESTADO-EXECUCAO-LOCAL.md` (seção "Estado atual").
3. `docs/ENTREGA-L07-FIN10.md` e o bloco "Atualização vigente" de `docs/ENTREGA-L07.md`.
4. `docs/CONSOLIDACAO-L07-PRS-PENDENTES.md` (seção de aproveitamento FIN-10/133 e tabelas #47/#53).
5. `docs/EXECUCAO-ENTREGA-LOCAL.md`, em especial o gate do L07 e a definição de "pronto local".
6. Requisitos FIN-14, FIN-15 e FIN-16 em `docs/CHECKLIST-ENTREGA-LOCAL.md`.
7. Código atual: `src/server/fin-budget-api.mjs` (exportação do período, fechamento/reabertura de competência, provisão de comissão), `src/server/fin-api.mjs` e `src/server/fin-management-api.mjs` (referência de padrões de falha + retry), `src/app/admin/financeiro/*` (abas existentes — FIN-11/13 têm aba própria, FIN-14/15/16 não têm), migrações `079`, `080`, `131`, `133`, `135`, `136` e `tests/l07-delivery.integration.test.mjs` (subtestes 33–35 existentes, 27–32 como o padrão FIN-13 a imitar).

## Estado que deve ser preservado
- L04, L05 e L06 têm entregas técnicas integradas; não refaça nenhuma delas.
- FIN-13 está `pronto_local`: não reabra a sua API, tela, migração 134, revisão, idempotência ou histórico.
- FIN-12/FIN-04 é o vínculo canônico único de baixa via conciliação sandbox (135): proibida qualquer segunda rota de baixa automática.
- FIN-09/FIN-11/FIN-12 exibem falha de leitura + Tentar novamente (nunca lista vazia em `catch`); o padrão se estende obrigatoriamente às abas novas.
- FIN-10 está `pronto_local` nesta base: não reabra handler, migração 136, busca, replay idempotente ou política de alçada.
- Baseline a reconfirmar na base atual antes de alterar negócio: estático 5/5 (001–136), `npm run typecheck` 0 erros, `npm test` 196/196, `npm run test:migrations:pg` 136/136 em dois passes, `npm run test:l07-delivery:pg` **35/35 em duas execuções consecutivas**; regressões L03 1/1, L04 20/20, L05 1/1, L06 9/9 quando rodadas no mesmo SHA.

## Objetivo desta fatia
Completar as **jornadas** de FIN-14 (exportação do período para o contador), FIN-15 (fechamento e reabertura autorizada de competência com versões preservadas) e FIN-16 (provisão de comissão CRM-25 com revisão obrigatória e sem pagamento automático), usando o backend já integrado. **Não inicie L08, não reabra FIN-12→FIN-04 e não declare o L07 inteiro concluído.**

## Primeiro: reproduza as lacunas
Antes de corrigir, confirme cada ponto no código e reproduza por teste real (HTTP + PostgreSQL descartável + Chromium). Se algo já estiver resolvido, preserve e registre a evidência.
1. FIN-14, FIN-15 e FIN-16 não têm abas próprias em `/admin/financeiro`: exportação, fechamento/reabertura e provisão de comissão operam só por API.
2. Verifique se a exportação respeita o acesso limitado do contador na **leitura e no download**, não só no registro da trilha.
3. Verifique se a reabertura preserva todas as versões de relatório e se o fechamento bloqueia lançamentos no período fechado, inclusive por SQL direto.
4. Verifique se a provisão de comissão continua impedida de pagar automaticamente por todos os caminhos, inclusive pela interface, e se a revisão exigida está visível e auditável na tela.

## Implementação esperada
- Abas próprias em `/admin/financeiro` para exportação, fechamento/reabertura e comissões, com seleção por nome/protocolo, moeda em R$ (`Intl.NumberFormat('pt-BR')`), erro de leitura visível + retry, confirmação somente após persistência e ações sensíveis com motivo — o mesmo padrão já homologado nas jornadas FIN-09/11/13.
- Autorização decidida no servidor em todas as rotas novas, TI somente leitura onde o contrato exige, auditoria na mesma transação da alteração com rollback em falha (503 `audit_unavailable`).
- Migrações apenas **aditivas**: 001–136 são imutáveis; descubra o próximo número livre (137 é o candidato) e trate linhas antigas explicitamente, sem inventar autoria nem apagar dados. Constraints novas `NOT VALID` conforme o padrão 124–136.
- Nada de pagamento, cobrança, emissão fiscal ou envio real. Acesso do contador limitado ao período e aos dados autorizados, decidido no servidor.
- Idempotência por chave de negócio sob retry e concorrência, replay idêntico levando ao mesmo registro.

## Validação
Execute: `npm run typecheck`; `npm test`; `npm run build`; `node scripts/qa-wave0-static.mjs`; `npm run test:migrations:pg` com replay e checksum; `npm run test:l07-delivery:pg` em **duas execuções consecutivas** com PostgreSQL descartável, HTTP e Chromium reais; e as regressões `test:l03/l04/l05/l06-delivery:pg` quando o SHA mudar.
Amplie o gate L07 com: papel indevido e anônimo nas rotas novas, erro de leitura na interface das três abas, retry e concorrência da exportação/fechamento/provisão, rollback quando a auditoria falha, reabertura preservando versões e tentativa de pagamento automático recusada, jornada Chromium ponta a ponta das três abas.
Não remova asserções, não ignore testes, não aumente timeout indiscriminadamente e não enfraqueça permissões para obter verde. Se um subteste reprovar por ruído de ambiente, registre o fato e reexecute; não mascare.

## Entrega
1. Implemente e valide a fatia completa.
2. Atualize `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`, `docs/EVIDENCIAS-ENTREGA-LOCAL.md`, `docs/CONTROLE-IMPLEMENTACAO.md` e `docs/ENTREGA-L07.md` + relatório da série `ENTREGA-L07-FINxx.md` — sem abrir nova série de relatórios.
3. Abra PR revisável a partir da sua branch, com resumo, testes e links dos checks. Sem merge automático.
4. Diferencie implementação, validação automática e aceite humano. Não invente aprovação de Marcelo ou Andreia.
5. Promova um requisito a `pronto_local` só quando os critérios forem demonstrados por prova.
6. Entregue o prompt da fatia seguinte (ADM-01..12, painel do Marcelo) sem iniciá-la.
7. Não faça merge sem instrução explícita do proprietário.

Depois desta fatia, a sequência é: ADM-01..12 com indicadores que abrem registros reais; fechamento da matriz e das evidências do L07; handoff para L08. L08–L10 continuam pendentes.
