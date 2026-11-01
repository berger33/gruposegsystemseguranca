# UX-PRO-03 — 15ª promoção "com prova": mensuração de origem, conversão e A/B (PUB-10)

**Data:** 31/10/2026 (America/Sao_Paulo)
**Base:** `3ebdef50df83be6991d7929c82713fd6b24df4c5` (`origin/main`, merge da PR #323)
**Branch:** `arena/3f450206-gruposegsystemseguranca`
**Fatia:** `OriginMetricsClient` deixa de ser órfão e passa a montar a **28ª aba** do `TiConsole` (*Mensuração de origem e A/B*, grupo *Inteligência e monitoramento*).
**Natureza:** promoção com prova (focal RED→GREEN + mutações + cenário de navegador).
**Não** é aceite humano, **não** é homologação e **não** marca item de produção.

---

## 0. Por que não foi o `AdmAdvancedClient`

A primeira escolha era `AdmAdvancedClient` (ADM-07..12). Medido antes de escrever: `/admin/marcelo` (`MarceloPanel` + `/api/adm/panel/*`) **já lê e escreve as mesmas tabelas** (`adm_search_favorites`, `adm_saved_filters`, `adm_shortcuts`, `adm_reports`, `adm_business_configs`, `adm_goals_comparison`, `adm_expansion_analyses`). Promovê-lo criaria a segunda superfície para o mesmo dado — exatamente o que o critério registrado em `tests/ux-pro-03-ti-reaudit.test.mjs` proíbe. O trabalho foi descartado antes de qualquer commit.

`OriginMetricsClient` (PUB-10) foi o órfão seguinte **sem superfície equivalente**: nenhum arquivo de `src/app` fora de `/admin/ti` chama as três rotas (`origin-metrics`, `conversion-events`, `ab-tests`).

## 1. Cinco defeitos reais no protótipo

| Defeito | Medido | Correção |
|---|---|---|
| três leituras com `.catch(()=>({items:[]}))` | 401/403/500 viravam "nenhum registro" | `classificarLista` separa `ok / vazio / negado / falha / invalido` |
| status do A/B por botões fixos em **qualquer** linha | botões "Aprovar", "Iniciar", "Concluir" apareciam em teste já concluído | `TRANSICOES` + `proximosEstados`; a lista só oferece o próximo passo válido |
| motivo de auditoria fixo no código | o histórico imutável recebia `"Aprovação A/B hipótese e tratamento definidos…"` que o operador nunca viu | campo de motivo com faixa 10..1000; o texto gravado é o digitado (provado no gate) |
| vencedor via `prompt()` | texto livre, sem lista, sem validação | `select` com `A/B/empate/inconclusivo`; concluir **exige** vencedor |
| `channel` da métrica é **CHECK fechado** no banco | `"organico"` no INSERT → **500** (o servidor não valida o enum) | `CANAIS` espelha o CHECK e a tela oferece `select`, não texto livre |

## 2. Dois defeitos encontrados no próprio servidor

Os dois apareceram **no gate**, não no focal — e por isso o cenário os prova.

1. **Toda transição de A/B respondia 500.** O `UPDATE` usava o mesmo parâmetro `$2` em `status=$2` (enum `ab_test_status`) e em `CASE WHEN $2 IN ('aprovado', …)` (texto). O PostgreSQL recusa a dedução: `42P08 inconsistent types deduced for parameter $2`. Reproduzido fora do gate com um cluster descartável contendo só o tipo e a tabela:

   ```
   REAL FALHOU: 42P08 inconsistent types deduced for parameter $2
   FIX OK em_revisao
   ```

   Corrigido tipando o parâmetro como texto e convertendo na coluna (`$2::text::ab_test_status`, `$2::text IN (…)`). O valor continua validado contra a lista antes do SQL. **Nenhum botão de A/B do produto jamais funcionou antes disso.**

2. **O hash do evento nunca existiu.** `hashValue` do `origin-metrics-api.mjs` chama `require('node:crypto')` dentro de um **módulo ESM**: o `require não existe`, o erro é engolido pelo `catch { return null }` e o `INSERT` grava `NULL`. O evento é aceito, mas **nenhum hash é produzido** — a frase "IP será hasheado" do protótipo não correspondia a nada.

   Nesta fatia o servidor **não** foi alterado nesse ponto (mudar retenção de dado pessoal não cabe numa promoção de UI): a tela passou a declarar o fato (`AVISO_HASH`), a mensagem de sucesso depende do `ip_hash` que o servidor devolveu e a lista mostra `sem hash gravado`.

## 3. O que foi entregue

| Item | Antes | Depois |
|---|---|---|
| `OriginMetricsClient.tsx` (mesmo arquivo, promovido) | 84 linhas, `style` inline, `prompt()`, `any`, erro cru | **392 linhas**, CSS module, 3 cards, validação espelhada do servidor |
| `pub-metrics-state.ts` | não existia | **372 linhas** puras: `classificarLista`, `validarMetrica/Evento/Teste/Transicao`, `TRANSICOES`, `proximosEstados`, `situacaoExperimento`, `situacaoHash`, `taxaConversao`, `dataCurta`, `traduzirErroPub` (**29 códigos**), `CANAIS`, `AVISO_ORDEM`, `AVISO_INGESTAO`, `AVISO_LEAD`, `AVISO_HASH`, `AVISO_MINIMIZACAO` |
| `OriginMetricsClient.module.css` | não existia | **35 linhas**, tokens, `:focus-visible`, breakpoint 740 px, zero hex |
| `src/server/origin-metrics-api.mjs` | transição de A/B → 500 (`42P08`) | parâmetro tipado; transição real com histórico |
| `TiConsole.tsx` | 27 abas | **28 abas** (`pub_metricas`), grupo *Inteligência e monitoramento* = `monitoramento_ext, pub_metricas` |
| `tests/ux-pro-03-ti-mensuracao-origem-ui.test.mjs` | não existia | focal **11/11** (RED → GREEN) + 5 mutações |
| `tests/ux-pro-03-ti-reaudit.test.mjs` | `EXPECTED_TABS = 27` | `28` |
| `scripts/ux-pro-03-ti-inventory.mjs` | 14 promoções | **15** (órfãos **32 → 31**) |

### O que a tela faz — e o que ela recusa

- **Métricas:** origem 3..100, campanha opcional 3..100, canal do enum do banco (`site`, `whatsapp`, `phone`, `referral`, `other`, `email`, `organic`, `paid`, `social`), período com datas reais (`2026-02-31` recusado), inteiros ≥ 0 e **convertidos ≤ total**. `is_minimized` nunca vem do formulário.
- **Eventos:** tipo da lista do servidor, origem/campanha/canal opcionais, **lead precisa ser UUID** e a tela avisa que ele tem de existir (FK para `public_leads` — UUID desconhecido vira erro de servidor, traduzido sem fingir sucesso). IP e user-agent são campos de ingestão e não voltam na lista; a tela **não** afirma hash.
- **A/B:** criar em rascunho exige chave 3..100 (minúsculas, números, `.`, `-`, `_`), hipótese 20..2000, descrição 10..2000, métrica 3..200, tráfego ≥ 10, tratamento 10..2000 e variantes em JSON. O ciclo oferecido é `rascunho → em_revisao → aprovado → em_execucao → concluido`, com `cancelado`/`arquivado` como saída; concluir exige vencedor e todo passo exige motivo.
- **Honestidade declarada na tela:** a ordem do ciclo é **política local** (o servidor confere o valor, não a sequência), o POST de eventos é **ingestão pública por desenho**, papel sem permissão recebe `401 unauthorized` (não 403) e o hash não é produzido nesta entrega.

## 4. Prova

### 4.1 Focal — `tests/ux-pro-03-ti-mensuracao-origem-ui.test.mjs`

```
RED  (módulo ausente)                      → # tests 1  # pass 0  # fail 1
GREEN                                      → # tests 11 # pass 11 # fail 0
```

| Mutação | Detectada em |
|---|---|
| `proximosEstados` devolve todos os status | `not ok 6` |
| 403 classificado como `vazio` | `not ok 1` |
| concluir sem vencedor | `not ok 7` |
| convertidos > total passa | `not ok 3` |
| leitura volta a devolver lista ok-vazia no `catch` | `not ok 9` |

Depois das mutações o focal volta a **11/11** (restauração verificada).

### 4.2 Navegador — `browser UX-PRO-03 PUB-10`

Sessão `ti` real, PostgreSQL 17 descartável, Chromium:

1. anônimo **401** na leitura; `rh` **401 `unauthorized`** (não 403 — declarado na tela); `ti` **200** nas três leituras;
2. métrica com convertidos > total → **400 `converted_exceeds_total`**; métrica válida → **201** com `is_minimized=true`; repetida → **409 `duplicate_period_origin`**;
3. evento **sem sessão** → **201** (ingestão pública declarada) com `ip_hash` **null**; leitura anônima → **401**;
4. A/B: vencedor `"C"` → **400 `invalid_winner`**; motivo curto → **400 `invalid_reason`**; `aprovado` → **200**; retrocesso para `rascunho` → **200** (prova de que a ordem é da tela);
5. **métrica criada pela interface** → `pub-ok` + banco com `is_minimized=true`, 20 leads, 5 convertidos (taxa 25,00% na lista);
6. **evento com lead inválido** → recusado antes do POST, nada gravado; **UUID bem formado e inexistente** → erro de servidor traduzido (`pub-erro`), nada gravado; **evento válido** → gravado, `ip_hash` nulo, lista diz "sem hash gravado" e o IP não aparece na lista lida do servidor;
7. **A/B criado pela interface** em rascunho: só `em_revisao`/`cancelado`/`arquivado` são oferecidos (nenhum botão de execução/conclusão); ao mover para `em_revisao`, o banco confirma `status='em_revisao'` e o histórico imutável guarda **o motivo digitado**;
8. **320 / 390 / 1440** e **tema noturno** — `sobraDocumentoPx: 0` em todos;
9. **negação** (`403` injetado em `window.fetch`) → `pub-estado-metricas` `data-situacao="negado"` e a tela **não** diz "Nenhum registro";
10. **`rh` no gate** → `data-admin-gate="forbidden"` e a mensuração não monta.

Evidência: `docs/ux-pro-03-mensuracao-origem-evidencias/` — **9 PNGs** + `resumo.json` (`problems: []`, `sobraDocumentoPx: 0` em todos).

## 5. Limites declarados

1. **Sem aceite humano, sem homologação, sem UAT:** produção **NO-GO**, **0/222**.
2. **O hash do evento não é produzido nesta entrega.** O valor digitado não é armazenado, mas também não vira hash. Corrigir isso é alterar retenção de dado pessoal — decisão do operador, fora desta fatia.
3. **O servidor não impõe ordem de status.** A sequência é política da tela; a API aceita qualquer um dos sete valores, inclusive retrocesso (provado no gate).
4. **A ingestão de eventos é pública por desenho.** Um `POST` anônimo grava evento; a leitura exige `admin|ti`.
5. **Sem leitor de tela e sem Windows:** teclado, foco e contraste medidos só no Chromium empacotado.
6. **Os outros 31 órfãos continuam órfãos.**

## 6. Reconciliação

- `origin/main` na base: `3ebdef5…`; a **#324** segue **aberta, sem merge**.
- Inventários regenerados **somente** pelos geradores (`ux-pro-00-inventory.mjs`, `ux-pro-03-ti-inventory.mjs`, `requisitos-222-inventory.mjs`, `requisitos-sec-reaudit.mjs`), todos com `--check` verde. O snapshot histórico de 08/10 **não** foi regenerado (mesma razão da fatia anterior).
- `test:unit`: **167 → 168** arquivos; `EXPECTED_TABS` **27 → 28**; promoções **14 → 15**; órfãos **32 → 31**; gate do portal **53 → 54** cenários.
- Retrato do inventário 222 **não mudou**: PUB-10 já era `mencionado_em_gate`, então segue **23 gate_nomeado / 115 mencionado_em_gate / 84 somente_documento** (arquivos varridos **1.656 → 1.660**). É evidência textual acrescentada, **não** promoção de aceite — 0/222 continua.
