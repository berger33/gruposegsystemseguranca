# UX-PRO-E2-C1 — escopo ANTES (19/10/2026)

**Subfatia:** E2-C1 — resíduo `sem rótulos` do legado operacional (`OpsAdvanced2Client.tsx` e `OpsAdvanced3Client.tsx`), declarado no limite da E2.

**Branch:** `arena/955d1208-gruposegsystemseguranca` · **Base:** `origin/main` = `3f771ccaf96f8a5d52b255e63124dfcd99bfead5` (merge da PR #271, UX-PRO-E2), confirmada por `git fetch origin main` + `git rev-parse origin/main` nesta sessão. Árvore limpa antes de qualquer alteração.

**Guardas de arquivo:** `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` e `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23` — conferidos **antes**; serão refeitos após `next build` (restauração por cópia do HEAD, sem bypass).

**PRs abertas no início:** nenhuma (`gh pr list --state open` vazio).

**Este documento não declara aceite humano, UAT nem conformidade WCAG. Homologação e produção permanecem NO-GO.**

---

## 1. Origem do resíduo — memória da E2

A [UX-PRO-E2](UX-PRO-E2-RELATORIO-2026-10-19.md) removeu as 13 chamadas bloqueantes a `prompt()` e moveu as onze decisões humanas para o `UiActionDialog`, mas registrou explicitamente no item de limites:

> "Os demais campos antigos das abas ainda baseados apenas em `placeholder` continuam fora deste recorte e devem ser tratados em uma fatia própria, sem ampliar retroativamente E2."

O [CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15](CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md) descreve o item E2 do resíduo transversal como `OpsAdvanced2/3Client: prompt()/confirm, sem rótulos` — a E2 tratou `prompt()/confirm`; falta `sem rótulos`. **UX-PRO-E2-C1 fecha exatamente essa segunda metade**, na mesma família de componentes, sem ampliar a E2 retroativamente.

## 2. Defeito reproduzido no código-base (base `3f771cc`)

As seis abas avançadas de `/admin/operacao` (composição histórica também alcançável por `/admin/ti`) montam `src/app/admin/ti/OpsAdvanced2Client.tsx` e `src/app/admin/ti/OpsAdvanced3Client.tsx` via `src/app/admin/operacao/OperacaoWorkspace.tsx:41-42`. Os 19 formulários de criação desses dois componentes possuem **108 controles de formulário** (`<input>`/`<select>`/`<textarea>`) e **nenhum** `<label>`, `htmlFor` ou `aria-label` (varredura literal: `labels hoje: 0`, `htmlFor hoje: 0`):

| Componente | Controles | Com `placeholder` como único nome | Sem nenhuma orientação (datas/seletores) | Rótulos |
|---|---|---|---|---|
| `OpsAdvanced2Client.tsx` | 47 | 36 | 11 | 0 |
| `OpsAdvanced3Client.tsx` | 61 | 38 | 23 | 0 |
| **Total** | **108** | **74** | **34** | **0** |

Formulários e linhas (base `3f771cc`):

| # | Formulário | Arquivo:linhas | Controles | O que falta |
|---|---|---|---|---|
| 1 | `visitForm` (criar visita de supervisão) | `OpsAdvanced2Client.tsx:224-229` | 6 | 5 com só `placeholder`; `scheduled_date` (data) sem nenhuma orientação |
| 2 | `inspForm` (criar inspeção) | `OpsAdvanced2Client.tsx:241-244` | 4 | 3 com só `placeholder`; `inspection_type` (seletor) sem nenhuma orientação |
| 3 | `apForm` (plano de ação) | `OpsAdvanced2Client.tsx:255-261` | 7 | 5 com só `placeholder`; `due_date` (data) e `priority` (seletor) sem nenhuma orientação |
| 4 | `patrolForm` (ronda) | `OpsAdvanced2Client.tsx:273-275` | 3 | 2 com só `placeholder`; `patrol_date` (data) sem nenhuma orientação |
| 5 | `pointForm` (ponto de ronda) | `OpsAdvanced2Client.tsx:285-292` | 8 | 7 com só `placeholder`; `location_unavailable` (seletor) sem nenhuma orientação |
| 6 | `keyForm` (chave/material) | `OpsAdvanced2Client.tsx:304-307` | 4 | 3 com só `placeholder`; `key_type` (seletor) sem nenhuma orientação |
| 7 | `movForm` (movimentação de custódia) | `OpsAdvanced2Client.tsx:316-322` | 7 | 6 com só `placeholder`; `movement_type` (seletor) sem nenhuma orientação |
| 8 | `reportForm` (relatório ao cliente) | `OpsAdvanced2Client.tsx:333-342` | 8 | 5 com só `placeholder`; `report_type` (seletor), `period_start`/`period_end` (datas) sem nenhuma orientação |
| 9 | `defForm` (definição de métrica) | `OpsAdvanced3Client.tsx:203-208` | 6 | 3 com só `placeholder`; `metric_type`, `source`, `window_type` (seletores) sem nenhuma orientação |
| 10 | `snapForm` (snapshot de métrica) | `OpsAdvanced3Client.tsx:214-224` | 11 | 5 com só `placeholder`; 4 seletores e 2 datas sem nenhuma orientação |
| 11 | `reincForm` (reincidência) | `OpsAdvanced3Client.tsx:230-233` | 4 | 2 com só `placeholder`; `first_date`, `last_date` (datas) sem nenhuma orientação |
| 12 | `propForm` (proposta de escala) | `OpsAdvanced3Client.tsx:240-245` | 6 | 4 com só `placeholder`; `period_start`, `period_end` (datas) sem nenhuma orientação |
| 13 | `entryForm` (entrada de escala) | `OpsAdvanced3Client.tsx:254-258` | 5 | 4 com só `placeholder`; `entry_date` (data) sem nenhuma orientação |
| 14 | `envForm` (ambiente de limpeza) | `OpsAdvanced3Client.tsx:266-269` | 4 | 3 com só `placeholder`; `environment_type` (seletor) sem nenhuma orientação |
| 15 | `routForm` (rotina de limpeza) | `OpsAdvanced3Client.tsx:275-278` | 4 | 2 com só `placeholder`; `routine_type`, `frequency` (seletores) sem nenhuma orientação |
| 16 | `execForm` (execução de rotina) | `OpsAdvanced3Client.tsx:284-289` | 6 | 6 com só `placeholder` |
| 17 | `ncForm` (não conformidade) | `OpsAdvanced3Client.tsx:295-301` | 7 | 6 com só `placeholder`; `due_date` (data) sem nenhuma orientação |
| 18 | `connForm` (conector de monitoramento) | `OpsAdvanced3Client.tsx:308-309` | 2 | 1 com só `placeholder`; `connector_type` (seletor) sem nenhuma orientação |
| 19 | `evForm` (evento sintético) | `OpsAdvanced3Client.tsx:315-320` | 6 | 3 com só `placeholder`; `event_type`, `severity` (seletores) e `occurred_at` (data/hora) sem nenhuma orientação |

Defeito em cada controle: o `placeholder` é o único nome do campo — ele **desaparece ao digitar** e **não é anunciado como rótulo** por leitor de tela após a entrada de valor; os 34 controles sem `placeholder` não têm nome acessível algum. É o mesmo defeito `sem rótulos` já corrigido nas famílias UX-04/RH, UX-05/Marcelo, UX-06/Portais e UX-07 (frota, terceiros, qualidade, satisfação…), ainda vivo só nestes dois componentes legados.

## 3. Decisão de escopo E2-C1

1. **Corrigir os 108 controles dos 19 formulários acima, somente nestes dois arquivos.** A memória E2 nomeou os campos "baseados apenas em `placeholder`" (74) por serem a maioria visível; os outros 34 (datas/seletores) carregam o **mesmo defeito `sem rótulos` da mesma família E2** (CRONOGRAMA: `prompt()/confirm, sem rótulos`), nas mesmas linhas de formulário. Deixá-los sem rótulo manteria o defeito vivo ao lado dos campos corrigidos e dividiria um contrato único em duas fatias. Precedente aditivo análogo: a E6-C1 corrigiu a duplicidade de `nav` em `/cobrancas` como consequência direta do mesmo reparo (relatório E6-C1, §1).
2. **Forma aditiva:** cada controle recebe `id` único + `<label htmlFor>` visível com texto persistente, agrupados visualmente por um `<span>` colunar (o controle preserva **byte a byte** todos os seus atributos: `value`, `onChange`, `placeholder`, `type`, `style` de largura, ordem no DOM). O `placeholder` **permanece como dica** (regras `5..200`, vocabulário do campo) — nenhum texto existente é removido.
3. **Vocabulário:** rótulos em português, no mesmo registro dos rótulos já criados pela E2 no `UiActionDialog` (`Responsável pela verificação`, `Notas da verificação`…); identificadores técnicos que o operador precisa digitar viram sufixo reconhecível (`Posto (UUID)`, `Empresa (ID)`, `Chave (ID)`).
4. **Ids estáveis com prefixo de componente** (`ops2-…`, `ops3-…`) para serem únicos mesmo com os dois componentes vivos no mesmo documento (as abas de `/admin/operacao` montam ambos).
5. **Dia/noite:** rótulos sem cor explícita — herdam o texto do tema administrativo nos dois modos, como no restante do legado desta seção.

## 4. Contratos preservados (item a item)

URLs, métodos HTTP, payloads, estados de domínio (`pendente_verificacao`, `verificado`, `visitado`, `em_revisao`, `aprovado`, `em_analise`, `publicado`, `reconhecido`, `em_tratamento`, `resolvido`…), mensagens de sucesso, recargas (`loadAll`/`loadInspections`/`loadActionPlans`/`loadPoints`/`loadMovements`/`loadConflicts`/`loadRoutines`/`loadExecs`), as onze ações do `UiActionDialog` da E2, motivo canônico da publicação, nota canônica de encerramento do evento sintético, campos opcionais enviados como string vazia, avisos de decisão humana/privacidade/conflitos/natureza sintética (textos `GPS/QR isolado não prova execução…` e `Não construir substituto de central 24h…`), botões e seus textos, servidor, banco, migrações, RBAC, autenticação e auditoria: **intocados**.

## 5. Teste RED canônico (a ser gravado antes do reparo)

**Arquivo:** `tests/ux-pro-e2-c1-field-labels.test.mjs` (estático, incluído em `npm run test:unit`). Contratos:

1. todo `<input>`/`<select>`/`<textarea>` de `OpsAdvanced2Client.tsx` e `OpsAdvanced3Client.tsx` possui `id` único e `<label htmlFor>` com texto não vazio (listagem de cada ocorrência com `arquivo:linha` na falha);
2. nenhuma associação órfã (todo `htmlFor` resolve para um controle do mesmo arquivo);
3. preservação: cada controle mantém `value` + `onChange` controlados, as contagens de controles (47/61) e de `placeholder` (36/38) permanecem — a fatia não apaga campos nem dicas para passar no teste.

A mensagem exata da falha RED será registrada no relatório a partir da saída real desta sessão, antes de qualquer reparo.

## 6. Fora do escopo

- Não redesenhar as seis abas, não mudar layout além do empilhamento rótulo+controle, não alterar larguras/alvos dos controles legados (44 px valem para o `UiActionDialog` da E2, não para estes campos).
- Não migrar as dicas de `placeholder` para `aria-describedby` programático (a dica visível permanece; o **nome** do campo deixa de depender dela).
- Não tratar `OpsAdvancedClient.tsx` (29 `placeholder`, órfão — não é importado por nenhuma rota), `AdmAdvancedClient.tsx` ou os demais ~1.600 `placeholder` do repositório: são outras famílias, cada uma com decisão própria.
- Não alterar servidor, banco, migrações, RBAC, autenticação, auditoria, contratos de API ou dados.
- Não remover vocabulário de banco dos `placeholder` existentes (decisão de vocabulário é de outra fatia, se o proprietário quiser).
- Esta fatia não declara conformidade WCAG, teste com leitor de tela, homologação humana ou prontidão de produção.

## 7. Gates planejados

- teste focal RED → GREEN `tests/ux-pro-e2-c1-field-labels.test.mjs`;
- `npm run typecheck`;
- `node scripts/qa-wave0-static.mjs`;
- `node scripts/ux-pro-00-inventory.mjs --check`;
- regressões E2 (`ux-pro-e2-action-dialog`), E5 (`ux-pro-e5-table-scroll`), E6 (`ux-pro-e6-single-main`, `ux-pro-e6-c1-single-main`) e inventário (`ux-pro-00-inventory`);
- `npm run build` (com restauração das guardas) e `git diff --check`.
