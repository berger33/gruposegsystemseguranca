# Próxima fatia do L07 — jornadas FIN-14, FIN-15 e FIN-16 e a ligação FIN-12 → FIN-04

Prompt preparado em 2026-10-01, ao final da fatia aditiva de FIN-13. **Esta fatia não foi iniciada.** Use este documento como instrução executável da próxima sessão.

## Contexto e fonte
- GitHub `berger33/gruposegsystemseguranca` é a fonte oficial. Trabalhe no ambiente remoto Arena, em branch própria criada a partir da main **atual**; não use a cópia do computador do proprietário.
- A fatia anterior entregou FIN-13 (orçamento gerencial e cenários) com a migração aditiva **134**. Confirme a main e os checks antes de escrever código: um SHA histórico não é HEAD, e gate verde de outra branch não comprova o commit novo.
- SMTP, hospedagem pública e transações externas reais continuam **fora do escopo**.

## Leitura obrigatória, nesta ordem
1. `README.md` e `AGENTS.md`, se existir.
2. `docs/ESTADO-EXECUCAO-LOCAL.md` (seção “Estado atual”).
3. `docs/ENTREGA-L07-FIN13.md` (fatia aditiva) e `docs/CONSOLIDACAO-L07-PRS-PENDENTES.md` (seção “Aproveitamento efetivo nesta fatia”).
4. `docs/EXECUCAO-ENTREGA-LOCAL.md`, em especial o gate do L07 e a definição de “pronto local”.
5. Requisitos FIN-04, FIN-12, FIN-14, FIN-15 e FIN-16 em `docs/CHECKLIST-ENTREGA-LOCAL.md`.
6. Código atual: `src/server/fin-budget-api.mjs` (exportações, fechamento e comissões), `src/server/fin-management-api.mjs` (gateway e despesas), `src/app/admin/financeiro/*`, migrações `079`, `080`, `131`, `133`, `134` e `tests/l07-delivery.integration.test.mjs`.

## Estado que deve ser preservado
- L04, L05 e L06 têm entregas técnicas integradas; não refaça nenhuma delas.
- FIN-13 está `pronto_local` na validação automática. Não reabra o contrato da sua API nem reescreva a migração 134: a edição de orçamento aprovado recusada, a revisão versionada, a margem calculada no banco, a idempotência de criação e o histórico com snapshots são comportamentos exigidos por teste.
- Baseline a reconfirmar na base atual antes de alterar negócio: estático 5/5 (001–134), `npm run typecheck`, `npm test` 196/196, `npm run test:migrations:pg` 134/134, `npm run test:l07-delivery:pg` **31/31**, L03 1/1, L04 20/20, L05 1/1, L06 9/9.

## Objetivo desta fatia
Completar as **jornadas** de FIN-14, FIN-15 e FIN-16 e fechar a ligação entre a baixa sintética do gateway (FIN-12) e o recebível (FIN-04). Backend desses três requisitos já existe; o que falta é a jornada utilizável e a integração entre módulos. **Não inicie L08 e não declare o L07 inteiro concluído.**

## Primeiro: reproduza as lacunas
Antes de corrigir, confirme cada ponto no código e reproduza por teste real (HTTP + PostgreSQL descartável + Chromium). Se algo já estiver resolvido, preserve e registre a evidência.
1. FIN-14, FIN-15 e FIN-16 não têm abas próprias no workspace financeiro: a exportação, o fechamento de competência e a provisão de comissão não são operáveis por navegação normal.
2. FIN-12 não dá baixa no recebível de FIN-04: o webhook sintético quita a cobrança do gateway e o recebível correspondente permanece em aberto, sem ligação definida nem idempotência dessa baixa.
3. Verifique se a exportação respeita o acesso limitado do contador na **leitura e no download**, não só no registro.
4. Verifique se a reabertura de competência preserva as versões de relatório e se o fechamento bloqueia lançamentos no período.
5. Verifique se a provisão de comissão continua impedida de pagar automaticamente em todos os caminhos, inclusive pela interface.

## Implementação esperada
- Abas próprias em `/admin/financeiro` para exportação, fechamento/reabertura e comissões, com seleção por nome/protocolo, moeda em R$, erro de leitura visível (nunca lista vazia por `catch`), confirmação somente após persistência e ações sensíveis com motivo — o mesmo padrão já aplicado em FIN-13.
- Ligação FIN-12 → FIN-04 explícita: webhook sintético conciliado dá baixa no recebível vinculado, em transação única, com idempotência por evento, valor conferido contra o saldo, recusa quando não há vínculo autorizado e trilha em ambos os lados. Nenhuma cobrança real; o adaptador continua identificado como sintético.
- Autorização decidida no servidor em todas as rotas novas, com TI somente leitura onde essa é a regra, e auditoria na mesma transação da alteração, com rollback em falha.
- Nada de pagamento, cobrança ou emissão fiscal reais. Acesso do contador limitado ao período e aos dados autorizados.
- Migrações apenas **aditivas**: 001–134 são imutáveis; descubra o próximo número livre (135 é o candidato) e trate linhas antigas explicitamente, sem inventar autoria nem apagar dados.

## Reuso dos PRs de referência
#47 (conciliação, FIN-05) e #53 (despesas e alçadas, FIN-10) continuam abertos e contêm garantias úteis: limite aplicado registrado no histórico, trava de exclusão, duplicidade natural e constraints de movimento/conta. Avalie-os nesta fatia **por adaptação**: não faça merge em bloco, não copie handlers inteiros, não crie uma segunda migração com número já usado e não troque o formato de evidência. Registre o que foi aproveitado e o que foi descartado, com motivo, antes de propor o encerramento de qualquer PR.

## Validação
Execute: `npm run typecheck`; `npm test`; `npm run build`; `node scripts/qa-wave0-static.mjs`; `npm run test:migrations:pg` com replay e checksum; `npm run test:l07-delivery:pg` com PostgreSQL descartável, HTTP e Chromium reais, em duas execuções consecutivas; e as regressões `test:l03/l04/l05/l06-delivery:pg`.
Amplie o gate com: papel indevido e anônimo, erro de leitura na interface, retry e concorrência da baixa, rollback quando a auditoria falha, reabertura preservando versões e tentativa de pagamento automático recusada.
Não remova asserções, não ignore testes, não aumente timeout indiscriminadamente e não enfraqueça permissões para obter verde. Se um subteste reprovar por ruído de ambiente, registre o fato e reexecute; não mascare.

## Entrega
1. Implemente e valide a fatia completa.
2. Atualize `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`, `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e o relatório de entrega correspondente — sem abrir nova série de relatórios.
3. Abra PR revisável a partir da sua branch, com resumo, testes e links dos checks.
4. Diferencie implementação, validação automática e aceite humano. Não invente aprovação de Marcelo ou Andreia.
5. Promova um requisito a `pronto_local` só quando os critérios forem demonstrados.
6. Entregue o prompt da fatia seguinte (ADM-01..12, painel do Marcelo) sem iniciá-la.
7. Não faça merge sem instrução explícita do proprietário.

Depois desta fatia, a sequência é: ADM-01..12 com indicadores que abrem registros reais; fechamento da matriz e das evidências do L07; handoff para L08. L08–L10 continuam pendentes.
