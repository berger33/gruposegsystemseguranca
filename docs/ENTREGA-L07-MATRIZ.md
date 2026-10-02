# ENTREGA L07 — fechamento de matriz e evidências (FIN-01..16 + ADM-01..12)

Sessão Arena `arena/01a0fd38-gruposegsystemseguranca`, criada da `main` em
`bbcf31119cfff7a43163a7e049b849b3b7fac4d3` (merge da PR #74, que entregou
ADM-01..12 com o gate em 43 subtestes). Nenhum merge automático, nenhum force
push, nenhuma reavaliação das PRs de referência #47/#53/#59/#60/#62.

Objetivo da sessão: **fechar a matriz e as evidências do L07** — percorrer
FIN-01..16 e ADM-01..12 conferindo, requisito a requisito, tela/API/dados/
autorização reais e subteste existente do gate que de fato prova cada linha —
e produzir a matriz de fechamento
([`docs/MATRIZ-FECHAMENTO-L07.md`](./MATRIZ-FECHAMENTO-L07.md)).

## 1. Baseline reconfirmada antes de qualquer edição (SHA `bbcf311`)

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5 (migrações 001–138) |
| `npm run typecheck` | exit 0 |
| `npm test` (unitários) | 196/196 |
| `npm run test:migrations:pg` | exit 0 — 138/138 checksums, 524 tabelas, clone com checksum adulterado recusado como esperado |
| `npm run test:l07-delivery:pg` | **execução 1: 42/43 (1 falha, ver §5)** · execuções 2–5: **43/43** cada |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run build` | exit 0 |

Máquina da sessão: Linux, **2 núcleos, ~4 GB RAM** — o mesmo perfil associado
às instabilidades transitórias já registradas (subteste 22). O ruído conhecido
(`next-env.d.ts`/`tsconfig.json` reescritos pelos gates/build) foi revertido
antes do commit.

## 2. Auditoria requisito a requisito — o que foi conferido

Para cada um dos 28 requisitos, a conferência verificou: (a) a tela/rota
existe e é navegável; (b) as APIs citadas estão roteadas em `server.mjs` (não
existem route handlers do App Router); (c) as tabelas canônicas existem nas
migrações 077–080/124–138; (d) a autorização citada é decidida no servidor; e
(e) **o subteste citado existe no gate atual e prova a afirmação**. O mapa
completo, com o número exato de cada subteste (1–43), está na
[MATRIZ-FECHAMENTO-L07.md](./MATRIZ-FECHAMENTO-L07.md).

Resultado geral: **nenhuma lacuna de rota/tabela/autorização** foi encontrada
em FIN-01..16 nem em ADM-01..12. Três divergências entre a evidência citada e
a prova efetiva foram encontradas e tratadas:

### 2.1 FIN-15 — trava SQL provada só em recebíveis (corrigida com prova)

O CHECKLIST afirmava que a migração 137 “bloqueia SQL direto em recebíveis,
pagáveis e custos” do mês fechado. Os triggers existem nas três tabelas, mas o
gate provava o INSERT direto apenas em `fin_accounts_receivable`.
**Correção:** o subteste 36 (“FIN-14/15/16 aditivo”) passou a inserir
diretamente em `fin_accounts_payable` (com fornecedor canônico) e `fin_costs`
(com conta/contrato canônicos e rateio válido) no mês fechado — ambos
recusados com `fin_competence_closed` — e a aceitar os mesmos INSERTs após a
reabertura explícita. A citação passou a bater com o teste; nada foi
enfraquecido.

### 2.2 ADM-05 — período vazio provado só no cartão ADM-01 (corrigida com prova)

A entrada citava `record_count:0` + `empty_reason:'sem_registro_canonico_no_periodo'`
+ `amount_cents:null` para renovações, mas a asserção rodava apenas no cartão
`ADM-01.pendencias` (mesmo pipeline de indicadores). **Correção:** o subteste
39 (“ADM-01/03: falha de leitura…”) passou a asserir o mesmo comportamento
especificamente em `ADM-05.renovacoes` no período 1990.

### 2.3 ADM-04 — “margem por contrato” sem implementação no painel (lacuna funcional real, implementada e provada)

O texto do requisito ADM-04 exige “visão financeira com fonte/competência,
saldo, vencimentos e **margem por contrato**”. O painel entregue tinha apenas
os cartões de recebíveis vencidos e pagáveis a vencer; **nenhum** cartão ou
registro exibia margem. Pior: o relatório `ENTREGA-L07-ADM01-12.md` afirmava
que “a margem por contrato de ADM-04 é apresentada” — afirmação sem
sustentação no código. A afirmação foi corrigida com nota explícita no próprio
relatório (§6 deste documento).

**Implementação (aditiva, sem migração nova — próxima migração livre continua
sendo 139):**

- Novo indicador **`ADM-04.margem_por_contrato`** em
  `src/server/adm-panel-api.mjs`, lendo exclusivamente o resultado canônico de
  FIN-09 (`fin_management_results`), com `source.tables`,
  `source.period_field` (competência do resultado gerencial), `period` e
  `as_of` como todos os cartões.
- Novo tipo de registro canônico `fin_management_result` na projeção
  allowlist de `/api/adm/panel/record` (protocolo, contrato, competência,
  recebido, custos, margem em centavos e percentual, `is_complete`,
  `incomplete_reason`, status).
- **A margem nunca é calculada pelo painel**: o percentual é o derivado no
  banco (`computed_margin_percent`, migração 135) e o valor é o `margin_cents`
  gerado (079). Base incompleta é declarada com motivo — margem desconhecida
  permanece `null`, nunca zero. Status `rascunho`/`arquivado` ficam fora da
  visão executiva; `incompleto`/`em_revisao`/`aprovado` entram com sua
  declaração.

**Prova (subtestes existentes ampliados, nenhum subteste novo criado — o gate
continua com 43):**

- O universo semeado (`seedPanelUniverse`) passou a criar dois resultados
  gerenciais do contrato sintético: um completo (`margin_percent=60`,
  `margin_cents=120000`, status `aprovado`) e um incompleto
  (`margin_cents=null`, motivo declarado, status `incompleto`).
- `EXPECTED_COUNTS["ADM-04.margem_por_contrato"] = 2` — o subteste 38 exige a
  publicação dos **13 cartões**, confere contagem/período/fonte/data-base de
  cada um e **abre cada linha de cada cartão no registro canônico real**,
  incluindo os dois de margem.
- O subteste 38 ganhou asserções específicas: registro completo com
  `margin_percent=60` e `margin_cents=120000` vindos do cálculo canônico;
  registro incompleto com `margin_cents:null`, `margin_percent:null` e
  `is_complete=false`.
- Falha de leitura, ausência e autorização do novo cartão seguem o pipeline
  comum já provado (subtestes 38/39): fonte ilegível → `indisponivel` com
  `value:null`; período sem registro → `empty_reason` com `amount_cents:null`;
  anônimo 401, papel fora de `admin|marcelo|ti` 403, TI somente leitura.

A UI não precisou de mudança: os cartões são renderizados genericamente por
`MarceloPanel.tsx` (o cartão novo exibe contagem, fonte
`fin_management_results`, período e botão de drill-down como os demais).

## 3. Bateria final no mesmo SHA da sessão (com as mudanças)

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5 |
| `npm run typecheck` | exit 0 |
| `npm test` (unitários) | 196/196 |
| `npm run test:migrations:pg` | exit 0 — 138/138, 524 tabelas, clone negativo recusado |
| `npm run build` | exit 0 |
| `npm run test:l07-delivery:pg` #6 | **43/43, 0 skips** (subtestes 36/38/39 ampliados; cartão de margem exercitado) |
| `npm run test:l07-delivery:pg` #7 | **43/43, 0 skips** (segunda consecutiva no estado final) |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` | 9/9 |

## 4. O que mudou no repositório

- `src/server/adm-panel-api.mjs` — registro canônico `fin_management_result`
  + indicador `ADM-04.margem_por_contrato` (aditivo; nenhum comportamento
  existente alterado).
- `tests/l07-delivery.integration.test.mjs` — semeadura dos dois resultados
  gerenciais, `EXPECTED_COUNTS` com o 13º cartão, asserções de margem no
  subteste 38, período vazio de `ADM-05.renovacoes` no subteste 39 e trava SQL
  de competência nas três tabelas no subteste 36. **Nenhum timeout alterado,
  nenhum skip, nenhuma assertiva removida ou enfraquecida** — apenas
  asserções acrescentadas.
- `docs/MATRIZ-FECHAMENTO-L07.md` (novo) — matriz de fechamento completa.
- CHECKLIST/ESTADO/EVIDÊNCIAS/EXECUCAO/CONTROLE/ENTREGA-L07 atualizados;
  correção registrada em `ENTREGA-L07-ADM01-12.md`.

## 5. Transparência das execuções (sem maquiagem)

- A **primeira** execução da baseline (SHA `bbcf311`, sem nenhuma edição)
  terminou **42/43 com 1 falha** cujo subteste não pôde ser identificado: o log
  foi consumido por um pipe para `tail` e descartido antes da inspeção — erro
  de procedimento da sessão, registrado aqui. A partir da execução 2 todos os
  logs completos foram salvos. As execuções 2–5 (baseline) e 6–7 (estado
  final) passaram **43/43**. Hipótese mais provável da falha da execução 1,
  **não confirmada**: o subteste 22 (jornada Chromium legada do FIN-10), dada
  a máquina de 2 núcleos e a ausência de mudança de código; nenhuma ação foi
  tomada contra esse subteste (nem timeout, nem skip, nem enfraquecimento).
- Nenhum subteste ADM reprovou em nenhuma execução. L03, L04, L05 e L06
  passaram nas duas baterias (baseline e final).

## 6. Limites honestos

- **Aceite humano pendente** para FIN-01..16 e ADM-01..12: Marcelo e Andreia
  não validaram nenhuma destas entregas; `pronto_local` significa validação
  automática apenas. **O L07 não está concluído.**
- Nada externo ou real: sem PSP, banco, SMTP, emissão, pagamento ou dado de
  cliente; somente dados sintéticos em PostgreSQL descartável.
- Dívidas abertas: **80 componentes órfãos de `/admin/ti`** (critério de saída
  em [`INVENTARIO-ADMIN-TI.md`](./INVENTARIO-ADMIN-TI.md)) e as instabilidades
  de ambiente listadas na matriz (§4.2), nenhuma delas mascarada.
- Windows permanece não executado; todas as evidências são Linux 2 núcleos.
- Próxima migração livre: **139** (nenhuma migração foi criada nesta sessão).
