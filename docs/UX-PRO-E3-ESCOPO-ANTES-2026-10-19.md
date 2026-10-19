# UX-PRO-E3 — escopo ANTES e bloqueio de decisão (19/10/2026)

**Subfatia:** E3 — datas/horas `timestamptz` exibidas por fatiamento de ISO, sem fuso, em `/admin/operacao`.

**Branch da sessão:** `arena/12ab101d-gruposegsystemseguranca` · **Base confirmada:** `origin/main` = `a93c7e37282814ce090c31c53178360c6849f7c5` (merge da PR #273; contém #271/#272 e a verificação da E2-C1). `git fetch origin main` + `git rev-parse origin/main` conferidos nesta sessão; árvore limpa (`git status --porcelain` vazio); nenhuma PR aberta (`gh pr list --state open` vazio).

**Guardas de arquivo:** `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` e `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23`, conferidos antes de qualquer edição.

**STATUS: decisão registrada em 19/10/2026 (seção 12).** Este documento foi gravado **antes** de qualquer código, medindo o defeito na base real, o que os testes herdados realmente fixam e as três vias possíveis. A decisão do proprietário chegou em seguida e a execução está no [relatório](UX-PRO-E3-RELATORIO-2026-10-19.md).

**Este documento não declara aceite humano, UAT nem conformidade WCAG. Homologação e produção permanecem NO-GO.**

---

## 0. Por que esta sessão para aqui

O pedido de execução contém um **bloqueio de decisão explícito**: "não codar sem resposta". A escolha entre (a), (b) e (c) altera o texto apresentado ao operador e, em (b), exigiria mexer numa asserção herdada do L06. A via (a) está marcada como **preferida**, mas preferência declarada em prompt não é o mesmo que decisão tomada; e a própria instrução manda, na ausência de decisão, "gravar o ESCOPO-ANTES com a pergunta e encerrar sem código". É exatamente o que este documento faz. O código desta fatia **não** foi iniciado.

## 1. Entradas lidas e entradas ausentes

Lidos nesta sessão, antes de qualquer medição:

- [`AGENTS.md`](../AGENTS.md) (raiz — **não existe `docs/AGENTS.md`**), [`README.md`](../README.md), [`docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`](ARENA-PRESERVAR-FUNCIONALIDADES.md);
- [`docs/UX-PRO-09E-PROMPT-PROXIMA-SUBFATIA-2026-10-16.md`](UX-PRO-09E-PROMPT-PROXIMA-SUBFATIA-2026-10-16.md) (padrão de execução);
- [`docs/UX-PRO-E2-C1-ESCOPO-ANTES-2026-10-19.md`](UX-PRO-E2-C1-ESCOPO-ANTES-2026-10-19.md), [`docs/UX-PRO-E2-C1-RELATORIO-2026-10-19.md`](UX-PRO-E2-C1-RELATORIO-2026-10-19.md) e [`docs/UX-PRO-E2-C1-VERIFICACAO-2026-10-19.md`](UX-PRO-E2-C1-VERIFICACAO-2026-10-19.md);
- [`docs/UX-PRO-07D-1-ESCOPO-ANTES-2026-10-15.md`](UX-PRO-07D-1-ESCOPO-ANTES-2026-10-15.md) e [`docs/UX-PRO-07D-1-RELATORIO-2026-10-15.md`](UX-PRO-07D-1-RELATORIO-2026-10-15.md), onde a E3 foi registrada pela primeira vez;
- [`docs/CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md`](CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md), [`docs/UX-PRO-07F-1-ESCOPO-ANTES-2026-10-15.md`](UX-PRO-07F-1-ESCOPO-ANTES-2026-10-15.md), `src/lib/finance-dates.mjs`, `src/app/admin/crm/OpportunitySummary.tsx`, `src/app/admin/operacao/OperacaoWorkspace.tsx` (integral), `tests/l06-delivery.integration.test.mjs`, `tests/ux-ops-workspace.integration.test.mjs`, `tests/ui-surface-locale.test.mjs`, `tests/ux-ops-vocabulary.test.mjs` e as migrações citadas na seção 2.

Ausências encontradas e registradas em vez de presumidas:

| Entrada citada no pedido | Estado real nesta base |
|---|---|
| `docs/UX-PRO-E3-PROMPT-PROXIMA-SUBFATIA-2026-10-19.md` | **Não existe.** `ls docs/UX-PRO-E3*` não encontra nada e `git log --all -- 'docs/UX-PRO-E3*'` é vazio. A instrução operativa desta sessão é a mensagem do pedido, não um documento versionado. |
| `docs/AGENTS.md` | **Não existe.** As regras estão em `AGENTS.md`, na raiz. |
| SHA-base `f38ef3d` | **Ausente do clone.** O checkout é raso (`git rev-list --count HEAD` = 1; `.git/shallow` presente), então só o commit de merge da base está disponível. A base efetiva é `a93c7e3`, que contém as PRs #271/#272/#273; as linhas do defeito medidas abaixo coincidem com as do pedido (1014, 1140, 1209, 1374, 1432, 1513, 1583). |
| `tests/l06-delivery.integration.test.mjs:1149` | Na base atual, a linha 1149 é **comentário**; a asserção de data ISO está em **1160** (`/2026-10-05/`). A referência do pedido está deslocada em 11 linhas. O conteúdo é o mesmo que a documentação anterior já registrava (`:1149`/`:1160`). |

## 2. Defeito medido na base `a93c7e3`

Sete linhas de `src/app/admin/operacao/OperacaoWorkspace.tsx` exibem oito marcas de tempo (a linha 1140 mostra duas) por fatiamento do texto ISO, sem qualquer indicação de fuso:

| # | Linha | Campo exibido | Coluna de origem (migração) | Tipo da coluna | Expressão atual | Exemplo renderizado p/ `2026-10-05T14:32:00Z` |
|---|---|---|---|---|---|---|
| 1 | `:1014` | `validated_at` | `ops_schedule_validations.validated_at` (`070:283`) | `TIMESTAMPTZ` | `String(item.validated_at).slice(0, 16).replace("T", " ")` | `2026-10-05 14:32` |
| 2 | `:1140` | `gap_start` | `ops_coverage_gaps.gap_start` (`070:145`) | `TIMESTAMPTZ` | idem para início e fim | `2026-10-05 14:32 – 2026-10-05 16:32` |
| 3 | `:1140` | `gap_end` | `ops_coverage_gaps.gap_end` (`070:146`) | `TIMESTAMPTZ` | idem | idem |
| 4 | `:1209` | `published_at` | `ops_schedule_versions.published_at` (`070:170`) | `TIMESTAMPTZ` | `String(version.published_at).slice(0, 16).replace("T", " ")` | `2026-10-05 14:32` |
| 5 | `:1374` | `acknowledged_at` | `ops_schedule_acknowledgments.acknowledged_at` (`070:210`) | `TIMESTAMPTZ` | template `` `Ciente desde ${String(...).slice(0, 16).replace("T", " ")}` `` dentro do `StatusBadge` | `Ciente desde 2026-10-05 14:32` |
| 6 | `:1432` | `created_at` | `ops_schedule_history.created_at` (`070:227`) | `TIMESTAMPTZ` | `String(item.created_at).slice(0, 16).replace("T", " ")` | `2026-10-05 14:32` |
| 7 | `:1513` | `handover_date` | `ops_handovers.handover_date` (`071:90`) | `TIMESTAMPTZ` | `String(h.handover_date).slice(0, 16).replace("T", " ")` | `2026-10-05 14:32` |
| 8 | `:1583` | `executed_at` | `ops_checklist_instances.executed_at` (`071:244`) | `TIMESTAMPTZ` | `String(inst.executed_at).slice(0, 16).replace("T", " ")` | `2026-10-05 14:32` |

Varredura de apoio: `grep -rn "slice(0, 16)" src` devolve **8** ocorrências — estas 7 linhas (8 marcas) e `src/app/admin/crm/OpportunitySummary.tsx:82`, que é o resíduo **E3-CRM** registrado no pedido e **não** é tocado aqui.

Prova empírica executada nesta sessão (Node 22, saída real):

```text
atual (slice): 2026-10-05 14:32
São Paulo:     05/10/2026, 11:32
UTC:           05/10/2026, 14:32
```

Ou seja: o mesmo instante aparece **3 horas adiantado** em São Paulo e o texto não declara fuso nenhum. Quem lê não tem como saber se `14:32` é UTC, horário de Brasília ou o fuso da máquina.

### 2.1 Risco de colisão que o teste RED precisa provar

Com duas marcas distintas do mesmo dia:

```text
14:32Z → São Paulo 11:32
17:32Z → São Paulo 14:32
```

Um formatador que exiba **só a data** colapsaria as duas em `05/10/2026`. Um formatador correto mantém `11:32` e `14:32` distintos. O teste RED desta fatia deve, portanto, provar (i) que o texto exibido contém hora e minuto, (ii) que as duas marcas produzem textos diferentes e (iii) que nenhuma delas é o ISO cru de 16 caracteres. A prova não depende de relógio: usa os dois valores literais como massa.

## 3. O que os testes herdados realmente fixam (medido, não presumido)

O pedido afirma que "o texto ISO é fixado por `tests/l06-delivery.integration.test.mjs` (:1149 e vizinhança)". A leitura integral desse bloco mostra uma dependência **mais estreita** do que a premissa sugere — e isso importa para a decisão:

| Asserção herdada | Linha atual | O que ela lê | Depende de qual coluna |
|---|---|---|---|
| `/2026-10-05/` | `l06:1160` | `page.textContent("body")` na aba Dimensionamento | **`gap_date`** (`DATE`, renderizada em `:1139` como `String(gap.gap_date).slice(0, 10)`), não `gap_start`/`gap_end` |
| `tr` com `hasText: "2026-12-01"` | `l06:1171` | linha da versão de escala | **`valid_from`** (`DATE`, `:1207`), não `published_at` |
| `/Revisada → Publicada/` | `l06:1187` | histórico | rótulo de transição, sem carimbo |
| `text=ciente desde` / `/Ciente desde/` | `l06:1205`, `l06:1207` | badge de ciência | prefixo textual `Ciente desde`; **não** o valor do carimbo |
| `/Ciente desde/` | `ux-ops:1174`, `:1199`, `:1222`, `:1230`, `:1247` | badge de ciência | idem prefixo |
| `.toLocale…String()` sem localidade | `ui-surface-locale` | varredura estática | o auxiliar novo precisa declarar locale (e fuso) |

Consequências medidas:

1. **Nenhuma asserção herdada fixa o texto de nenhuma das 8 marcas de tempo.** As duas datas ISO efetivamente assertadas são colunas `DATE` (`gap_date`, `valid_from`), que esta fatia não toca.
2. Por isso, (b) "formato local sem fuso, substituindo a asserção herdada" **não precisaria** editar o L06 para ficar verde nesta base — mas editaria uma asserção herdada apenas para acomodar uma decisão de produto, o que as regras permanentes proíbem sem autorização específica.
3. A via (a) mantém o texto ISO como **texto secundário visível**: além de preservar a premissa do pedido, mantém o instante exato auditável na própria tela, sem depender de `title` (que `textContent` não lê).

## 4. As três vias em avaliação

### (a) Local `America/Sao_Paulo` com fuso explícito + ISO preservado como texto secundário — **preferida no pedido**

Exemplo de renderização (proposta): `05/10/2026 11:32 (America/Sao_Paulo)` e, como texto secundário discreto na mesma célula, `2026-10-05T14:32:00Z`.

- Mantém **todas** as asserções herdadas sem tocar em teste (o prefixo `Ciente desde` é preservado e o ISO continua no DOM).
- Cumpre o defeito por inteiro: mostra a hora local de São Paulo **e** declara o fuso.
- É determinística mesmo com máquina em outro fuso, porque o `Intl` recebe `timeZone` explícito; a prova pode repetir o padrão de `tests/ux-finance-dates.test.mjs` (processo filho com `TZ` diferente).
- Custo: duas representações por marca (texto mais longo) e a necessidade de decidir onde o ISO secundário aparece no badge de ciência (`:1374`), que hoje não tem célula própria.

### (b) Local sem fuso, substituindo a asserção herdada com justificativa

- É a via mais curta visualmente, mas **remove a indicação de fuso** — o oposto do defeito relatado — e **perde o instante exato** na tela.
- Exigiria editar `tests/l06-delivery.integration.test.mjs` (asserção herdada) e justificar por escrito. As regras permanentes dizem "nenhuma asserção afrouxada"; mesmo que a asserção não dependa do carimbo hoje (seção 3), a edição sinalizaria uma mudança de contrato sem necessidade técnica.
- **Não recomendada.**

### (c) Manter ISO apenas rotulado "UTC"

Exemplo: `2026-10-05 14:32 UTC`.

- Menor mudança possível; mantém o L06 intacto e alinha-se à convenção já ratificada em `src/lib/finance-dates.mjs` (carimbo `TIMESTAMPTZ` com `UTC` declarado, determinístico entre máquinas).
- Não resolve a metade "3 h adiantado em São Paulo": apenas nomeia o fuso que já estava implícito. O operador continua precisando converter mentalmente.
- **Recomendada apenas se o proprietário preferir consistência com o financeiro em vez de hora local.**

## 5. Desenho proposto para (a), se autorizada

1. **Auxiliar de tela** `src/lib/ops-dates.mjs` (+ `ops-dates.d.mts`), no mesmo espírito de `finance-dates.mjs` (auxiliar de tela, não vocabulário de servidor):
   - `opsDateTime(value)`: carimbo `TIMESTAMPTZ` → `DD/MM/AAAA HH:mm (America/Sao_Paulo)`, com `Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hourCycle: "h23", ... })`;
   - `opsIsoStamp(value)`: devolve o ISO normalizado (`2026-10-05T14:32:00Z`) para o texto secundário; ausente → string vazia;
   - ausente → `Não informado`; valor fora do padrão → devolvido como veio (nunca `Invalid Date`, `NaN` ou célula vazia);
   - nada de `toLocale…String()` sem localidade (guarda `ui-surface-locale`).
2. **Sete linhas alteradas**, somente a apresentação: `:1014`, `:1140`, `:1209`, `:1374`, `:1432`, `:1513`, `:1583`. As colunas `DATE` da mesma tela (`allocation_date`, `gap_date`, `valid_from`/`valid_to`, `period_start`/`period_end`, `entry_date`, `scheduled_date`, `coverage_date`) **continuam exatamente como estão** — não fazem parte das 7 ocorrências.
3. **Texto secundário** com `styles.hint` (já existe em `UiWorkspace.module.css:54`) na mesma célula; no badge de ciência, o ISO vem logo depois do badge, sem mudar o prefixo `Ciente desde`.
4. **Prova focal estática + determinismo**: `tests/ux-pro-e3-ops-dates.test.mjs` (aditivo, incluído em `npm run test:unit`), com:
   - RED antes do reparo, provando que `2026-10-05T14:32:00Z` e `2026-10-05T17:32:00Z` produzem textos distintos com hora (e que o texto atual é o ISO fatiado sem fuso);
   - GREEN depois, com os valores esperados;
   - determinismo em processo filho com `TZ=Pacific/Kiritimati`, `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo`;
   - varredura das 7 linhas: nenhuma volta a usar `slice(0, 16)`; as colunas `DATE` permanecem intocadas.
5. **Gate de navegador**: caso aditivo em `tests/ux-ops-workspace.integration.test.mjs` injetando, somente em `window.fetch` da página, uma marca conhecida (`2026-10-05T14:32:00Z` e `2026-10-05T17:32:00Z`) em uma das leituras e conferindo o texto renderizado. Nenhum servidor, banco ou permissão é alterado; o gate herdado continua intocado.
6. **Sem tocar** em API, payloads, banco, migrações 001–180, RBAC, sessão, auditoria, ordenação, filtros, estados de domínio, textos de botão ou conteúdo de negócio.

## 6. Decisão necessária (numerada)

**Q1 — Qual via?** `(a)` local São Paulo com fuso explícito + ISO secundário (**preferida**), `(b)` local sem fuso substituindo a asserção herdada, ou `(c)` ISO apenas rotulado `UTC`.

**Q2 — Se (a), qual rótulo de fuso?** `(America/Sao_Paulo)` (**recomendado**: inequívoco e verificável por máquina), `UTC−03:00` (exige calcular o deslocamento de cada instante) ou `(horário de Brasília)` (coloquial; não ratificado em `finance-dates.mjs`).

**Q3 — Se (a), onde fica o ISO secundário?** Nas 7 linhas, inclusive no badge de ciência (**recomendado**), ou só nas células de tabela, deixando o badge apenas com a hora local.

Sem resposta a Q1, esta subfatia permanece **sem código**. Se a resposta for (b), é necessária autorização específica para editar a asserção herdada do L06 e a justificativa de produto correspondente.

## 7. Fora do escopo, registrado (não corrigido)

- **E3-CRM** — `src/app/admin/crm/OpportunitySummary.tsx:82`: `new Date(...).toISOString().slice(0, 16)` preenche `<input type="datetime-local">`. É formato de **entrada** de formulário (valor ISO exigido pelo controle), família própria, rota diferente. Não é tocado.
- **E3-R1** — `src/app/admin/operacao/OperacaoWorkspace.tsx:1478`: `cov.coverage_date || String(cov.requested_at).slice(0, 10)`. `requested_at` é `TIMESTAMPTZ` exibido **só como data**, sem hora e sem fuso — defeito adjacente da mesma família, mas fora das 7 ocorrências autorizadas. Registrado para decisão futura; não corrigido.
- **Colunas `DATE` da rota** (seção 5.2): continuam em ISO por decisão de escopo; convertê-las seria outra fatia (e o L06 fixa `gap_date` e `valid_from`).
- **Demais telas** com o mesmo padrão (`/admin/crm`, `/admin/ti`, `/admin/financeiro` etc.): cada família tem decisão própria; a 07F-1 já tratou o financeiro com a convenção UTC declarado.
- Nada de validação manual, leitor de tela, homologação, revisão humana ou aceite humano.

## 8. Medições da base (antes de qualquer edição)

| Verificação | Resultado real nesta sessão |
|---|---|
| `npm ci` | 83 pacotes, 0 vulnerabilidades |
| `npm test` (gate unitário completo) | **968/968**, `# fail 0`, `# skipped 0`, `# todo 0` |
| `git status --porcelain` | vazio antes e depois das medições |
| `next-env.d.ts` / `tsconfig.json` | MD5 `87a8bf5c65d00003ad1eba1613711943` / `99f7042f814e77e67b785906e5d4df23` |
| `grep -rn "slice(0, 16)" src` | 8 ocorrências (7 linhas desta fatia + `OpportunitySummary.tsx:82`) |
| Node | 22 (ambiente da sessão) |

Nenhum gate de navegador, PostgreSQL, build ou inventário foi executado, porque não houve alteração de código. Eles serão obrigatórios na execução, conforme a seção 9.

## 9. Gates planejados para a execução (após a decisão)

1. RED focal gravado **antes** do reparo, aditivo em `tests/ux-ops-workspace.integration.test.mjs` e/ou `tests/ux-pro-e3-ops-dates.test.mjs`, com a mensagem exata no relatório; prova de que `…T14:32:00Z` e `…T17:32:00Z` não colidem no texto exibido.
2. `npm run test:ux-ops:pg`.
3. `npm run test:l06-delivery:pg` (asserções herdadas intocadas).
4. `npm test` (968+), `npm run typecheck`, `npm run build` (105 páginas).
5. `node scripts/qa-wave0-static.mjs` (5/5).
6. `node scripts/ux-pro-00-inventory.mjs --check` (100 rotas; diff de CSV coluna por coluna — atenção à armadilha de `EMPTY_MARKERS`, que lê o texto-fonte inclusive comentários).
7. `git diff --check`; guardas `next-env.d.ts`/`tsconfig.json` restauradas e reconferidas **depois** do build e de cada gate Next.
8. `npm ci` primeiro em sandbox novo; capturas/evidências somente se a fatia exigir (não é o caso desta apresentação textual, mas a decisão pode incluir).

## 10. Limites

- Este documento **não** é a implementação da E3. Ele mede o defeito, mostra o que os testes fixam e formula a decisão que falta.
- A prova da seção 2 é de leitura de código e de formatação em Node; não é captura de navegador nem validação com leitor de tela.
- A ausência do prompt versionado da E3 e do SHA `f38ef3d` neste clone raso está registrada na seção 1; não foi presumido conteúdo que não existe no repositório.
- Não há aceite humano, UAT, homologação ou conformidade WCAG declarados. Homologação e produção seguem **NO-GO**.

## 11. Reprodução

```text
npm ci
npm test
md5sum next-env.d.ts tsconfig.json
grep -n "slice(0, 16)" src/app/admin/operacao/OperacaoWorkspace.tsx
node -e "const iso='2026-10-05T14:32:00Z'; console.log(String(iso).slice(0,16).replace('T',' ')); console.log(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short',hourCycle:'h23'}).format(new Date(iso)));"
```

## 12. Decisão registrada (19/10/2026)

O proprietário respondeu nesta sessão, item a item:

- **Q1 = via (a)** — formato local `America/Sao_Paulo` com fuso explícito **e** data ISO preservada como texto secundário; asserções herdadas continuam válidas;
- **Q2 = `(America/Sao_Paulo)`** — rótulo IANA, inequívoco e verificável por máquina;
- **Q3 = nas sete linhas, inclusive no selo de ciência** — o instante exato fica auditável em toda ocorrência.

A execução seguiu essa decisão sem alterar nenhuma outra escolha de escopo. RED, GREEN, gates e resíduos estão em [UX-PRO-E3-RELATORIO-2026-10-19.md](UX-PRO-E3-RELATORIO-2026-10-19.md). A via (b) não foi usada; nenhuma asserção herdada foi editada.
