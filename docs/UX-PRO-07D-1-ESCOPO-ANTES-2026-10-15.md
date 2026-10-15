# UX-PRO-07D-1 — escopo, baseline e medição anterior da leitura de `/admin/operacao`

**Data:** 15/10/2026

**Status deste documento:** registro anterior à implementação. Nenhuma tela, API, regra de autorização, migração, gate herdado, asserção herdada ou CSV foi alterado para produzi-lo.

**Fatia registrada aqui:** UX-PRO-07D-1 — estados honestos das **leituras canônicas (não legadas)** de `/admin/operacao`, com prova de navegador (PostgreSQL descartável, HTTP real e Chromium). A escrita da rota (ciência de escala) e as seis abas legadas avançadas permanecem intactas e ficam para subfatias próprias da 07D.

## 0. Por que 07D e por que o sufixo “-1”

- O mapa vigente `docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`, seção 2, ordena as fatias 07A–07M. Em `origin/main` (`85e1e07`) já estão integradas: 07A patrimônio (#222), 07B-1 (#223), 07B-2 (#224) e continuação B16/B17 (#225), 07C-1 (#226) e 07C-2 (#227). A PR #228 foi fechada como redundante e não é reaplicada.
- `grep 07D docs/*.md` encontra apenas a própria linha do mapa (`:38`) e a menção “próxima fatia” do relatório 07C-2; não existe registro, gate, evidência ou commit de 07D. O inventário vigente (`docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`, linha 28) mostra `/admin/operacao` **sem nenhuma captura reconhecida**. Portanto a próxima fatia realmente pendente é a **07D — `/admin/operacao`**.
- A linha 07D do mapa (`:38`) diz: “Preservar a reescrita UX-07 existente; separar qualquer tratamento do legado avançado e produzir evidência atual.”
- A rota é grande demais para uma PR pequena: `OperacaoWorkspace.tsx` tem 1456 linhas, 17 leituras canônicas, 1 escrita (ciência de escala) e monta dois componentes legados (`OpsAdvanced2Client`, `OpsAdvanced3Client`) em 6 das 14 abas. Seguindo a convenção já usada em 07B-1/07B-2 e 07C-1/07C-2 (leitura primeiro, escrita depois), esta é a **07D-1 (leitura canônica)**. A escrita de ciência fica registrada como **07D-2**; o tratamento do legado avançado fica registrado como subfatia própria da 07D, com identificador a decidir quando for executada. Nenhum desses dois recortes é antecipado aqui.

## 1. Base realmente conferida

Conferência feita no checkout desta sessão, antes de qualquer edição de tela:

- branch de trabalho fixa da sessão: `arena/5bc1f234-gruposegsystemseguranca`;
- `HEAD` local = `origin/main` = `85e1e075ef047018c9e882d87cb642bf27eb1aef` (merge da PR #227, UX-PRO-07C-2, `MERGED` em 2026-10-15T02:32:40Z); `git status --porcelain` vazio antes das verificações;
- PRs abertas: nenhuma; #227 `MERGED`; #228 `CLOSED` (cabeça `eb4c6df` só existe em `refs/pull/228/head` remoto; nada dela é reaplicado);
- `git stash list`: vazio; nenhum stash antigo reaplicado;
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`;
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`;
- dependências instaladas com `npm ci` (81 pacotes, 0 vulnerabilidades); Node 22.22.3;
- `node scripts/ux-pro-00-inventory.mjs --check` → `OK`; 100 entradas de rota (contagem estática; não equivale a passagem visual, teste de estados ou aceite humano).

Foram lidos antes deste registro: `AGENTS.md`, `docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md`, o mapa 07, `docs/UX-PRO-07C-1-ESCOPO-ANTES-2026-10-14.md`, `docs/UX-PRO-07C-1-RELATORIO-2026-10-14.md`, `docs/UX-PRO-07C-2-ESCOPO-ANTES-2026-10-15.md`, `docs/UX-PRO-07C-2-RELATORIO-2026-10-15.md`, `docs/UX-07-OPERACAO-2026-10-05.md`, os dois CSVs vigentes de 13/10/2026, `scripts/ux-pro-00-inventory.mjs`, `scripts/ux-pro-00-keyboard-evidence.mjs`, `scripts/qa-ux-ops-postgres.mjs`, `scripts/qa-ux-supplier-postgres.mjs`, `tests/ux-ops-workspace.integration.test.mjs`, `tests/ux-ops-vocabulary.test.mjs`, `tests/ux-supplier-workspace.integration.test.mjs`, `tests/l06-delivery.integration.test.mjs` (blocos de `/admin/operacao`), `tests/admin-page-gates.test.mjs`, `src/app/admin/operacao/page.tsx`, `src/app/admin/operacao/OperacaoWorkspace.tsx` (integral), `src/lib/ops-request.ts`, `src/lib/ops-vocabulary.mjs` (+ `.d.mts`), `src/server/ops-api.mjs` (leituras e escritas usadas pela tela), `src/server/ops-advanced-api.mjs` (quatro leituras usadas pela tela), `src/components/ui/UiState.tsx`, `src/components/ui/UiWorkspace.module.css`, `src/components/ui/UiTableScroll.tsx`, `src/app/admin/AdminGate.tsx` e `src/app/admin/admin-theme.css`.

Nada de 07A, 07B-1, 07B-2, 07C-1 ou 07C-2 é reaberto: nenhum arquivo de `/admin/patrimonio`, `/admin/emergencial` ou `/admin/fornecedores` é tocado, e nenhuma asserção herdada é editada.

## 2. Mapa da rota `/admin/operacao`

| Item | Valor vigente no SHA-base | Fonte |
| --- | --- | --- |
| Entrada | `/admin/operacao` (1 entrada de rota) | `src/app/admin/operacao/page.tsx` (16 linhas) |
| Arquivos locais | 2 | `page.tsx`, `OperacaoWorkspace.tsx` (1456 linhas) |
| Guarda de UI | `AdminGate allowedRoles={["supervisor","marcelo","admin","ti"]}` | `page.tsx:12`; matriz estática em `tests/admin-page-gates.test.mjs:32` |
| Autorização real | leitura: sessão de staff (`requireSession`, ex.: `src/server/ops-api.mjs:357`, `:425`); escrita: `requireRole(['admin','ti','rh'])` (ex.: `:376`, `:1151`, `:1427`) | `ops-api.mjs`, `ops-advanced-api.mjs` |
| Painel inicial (9 leituras em `Promise.all`) | `posts`, `allocations`, `requests`, `handovers`, `occurrences`, `instances`, `rules`, `qualifications`, `validations` | `OperacaoWorkspace.tsx:354-364`; servidor `ops-api.mjs:454`, `:708`, `:1478`, `:1601`, `:1650`; `ops-advanced-api.mjs:144`, `:558`, `:777`, `:1267` |
| Grupo estrutura (2 leituras) | `roles`, `needs` | `OperacaoWorkspace.tsx:390-393`; `ops-api.mjs:371`, `:586` |
| Grupo dimensionamento (2 leituras) | `dimensionings`, `gaps` | `:406-409`; `ops-api.mjs:931`, `:1057` |
| Grupo escalas (1 leitura) | `versions` | `:422`; `ops-api.mjs:1146` |
| Detalhe da versão (3 leituras por “Ver calendário”) | `entries`, `acknowledgments`, `history` | `:437-441`; `ops-api.mjs:1246`, `:1419`, `:1465` |
| Escrita (fora desta fatia) | `POST /api/ops/schedule-acks` + releitura das ciências | `:459-476` |
| Legado avançado (fora desta fatia) | 6 abas que montam `OpsAdvanced2Client`/`OpsAdvanced3Client` | `:595-622`; `src/app/admin/ti/OpsAdvanced2Client.tsx`, `OpsAdvanced3Client.tsx` |
| Abas | `tablist`/`tab`/`tabpanel` com roving tabindex e ←/→/Home/End (preservar) | `:478-490`, `:514-541` |
| Gate herdado da rota | `npm run test:ux-ops:pg` — 9 casos (HTTP real + PostgreSQL + Chromium), workflow `ux-ops-delivery.yml`, job `ux-ops-postgres-browser` | `scripts/qa-ux-ops-postgres.mjs`, `tests/ux-ops-workspace.integration.test.mjs:189-399` |
| Outro gate que visita a rota | L06 (Fatia B e Fatia E) | `tests/l06-delivery.integration.test.mjs:1106-1240`, `:2058-2079` |
| Captura visual anterior | nenhuma reconhecida pelo inventário | CSV de inventário, linha 28 (`capturas_viewports` vazio) |

### 2.1 Contratos que esta fatia não pode quebrar

- `tests/admin-page-gates.test.mjs:32` — `page.tsx` com `["supervisor","marcelo","admin","ti"]`, nessa ordem.
- `tests/ux-ops-workspace.integration.test.mjs:279` — com o painel inicial em falha, **as abas não aparecem** (`[role="tablist"]` conta 0). Uma resposta ilegível do painel inicial precisa seguir a mesma regra.
- `:293-306` — 14 abas, 1 com `tabindex=0`, 13 com `-1`, 1 `tabpanel`; setas, Home e End.
- `:320-331` — tabela com o posto, selo `ATIVO`, cobertura 70% como `warning`, botão “Ver calendário”.
- `:346-356` — a segunda ciência mostra “já registrada… não duplica efeito” sem `role="alert"` de erro (escrita intocada nesta fatia).
- `:375-378` — falha da aba legada Supervisão continua visível.
- `:391-395` — 390 px sem transbordo; abas com pelo menos 32 px.
- `tests/l06-delivery.integration.test.mjs:1119-1237` — ids `#posts-title`, `#shift-needs-title`, `#dimensioning-title`, `#coverage-gaps-title`, `#schedule-versions-title`, `#schedule-calendar-title`, `section[aria-labelledby='schedule-acks-title']`; textos de data ISO (`/2026-10-05/` em `:1149` e linha `"2026-12-01"` em `:1160`); “Ciente desde” (`:1194`); “Revisada → Publicada” (`:1176`); rótulos exatos das abas. **Consequência:** a apresentação de datas não muda nesta fatia.
- `:2066-2078` — rótulos das 6 abas legadas e `aria-label` da seção legada.
- `tests/ux-ops-vocabulary.test.mjs:86-98` — o vocabulário não pode traduzir código que os servidores não devolvem. **Consequência:** o código de diagnóstico de resposta ilegível não entra em `src/lib/ops-vocabulary.mjs`.
- `tests/ui-surface-locale.test.mjs` — nenhuma chamada `toLocale…String()` sem localidade.

## 3. Estados atuais de leitura — medição anterior

SHA-base = `85e1e07`, `OperacaoWorkspace.tsx` com 1456 linhas.

| ID | Medição anterior | Evidência `file:line` no SHA-base |
| --- | --- | --- |
| D1 | **Resposta `2xx` sem a lista canônica vira vazio falso nas 17 leituras.** Todas usam `data.<chave> \|\| []`. Um corpo `{note}` sem `posts` faz a tela afirmar “Nenhum posto cadastrado ainda — A consulta foi respondida pelo servidor e não encontrou postos no seu escopo”; o mesmo vale para cargos, necessidades, dimensionamento, lacunas, versões e o calendário da versão (“Nenhuma entrada nesta versão”). | `:373-381` (9 do painel inicial), `:396-397`, `:412-413`, `:424`, `:453-455`; textos vazios em `:651`, `:694`, `:724`, `:760`, `:938`, `:1012`, `:1075`, `:1167`, `:1227` |
| D2 | **Resposta atrasada de uma versão escolhida antes sobrescreve a versão atual.** `selectVersion` não tem identidade de requisição: escolher a versão A e, em seguida, a B aplica o que chegar por último. O título continua “Calendário da versão vB”, mas o calendário e a tabela de ciência passam a listar posto e profissional da versão A — e o botão “Registrar ciência” passa a oferecer um profissional que não pertence à versão exibida (o servidor só confere a situação da versão, `ops-api.mjs:1435-1437`). | `:430-457` (sem descarte), `:453-455` (aplicação incondicional), `:1121-1122` (título pela versão selecionada), `:1219-1260` (ciência derivada das entradas) |
| D3 | **Falha do detalhe da versão deixa duas seções mudas.** Com `detailError`, a seção “Ciência da escala” e a seção “Histórico da versão” exibem só o título: nenhum carregando, nenhuma falha, nenhum vazio — a pessoa não sabe se não há ciência/histórico ou se a leitura falhou. | `:1215-1218`, `:1276-1282` |
| D4 | **A coluna “Necessidades” dos postos afirma zero sem leitura confirmada.** Ela conta `shiftNeeds` (grupo estrutura) mesmo enquanto a estrutura está carregando ou depois que ela falhou; o painel inicial termina antes e a tabela mostra `0` para todo posto. | `:674` contra `:684-687` |
| D5 | **Estados de leitura quase não exercitados em navegador e nenhuma captura.** O gate herdado exercita só a falha 503 do painel inicial e a falha da aba legada; não há captura em 320/390/768/1440, noite nem percurso de teclado registrado. | `tests/ux-ops-workspace.integration.test.mjs:269-284`, `:363-383`; CSV de inventário linha 28 (`capturas_viewports` vazio, `capturas_primeiro_foco = nao`); matriz linha 28 (`sem captura; 320/390/768/1440 px nao verificados`; `marcadores de teclado no codigo; nao verificado em navegador`) |
| D6 | **O runner do gate não audita o resumo TAP.** Só repassa o código de saída: skip, todo, resumo ausente ou menos casos que o esperado não reprovam. | `scripts/qa-ux-ops-postgres.mjs:74-90` |

### 3.1 Achados da elaboração do gate (registrados, fora do recorte desta rota)

Durante a elaboração do gate novo, uma execução exploratória contra este mesmo SHA-base (sem nenhuma edição de tela) mediu, além de D1–D4:

- **E8 — contraste da aba ativa no tema noite: 1,95:1.** A aba ativa usa `.tabActive` do estilo **compartilhado** (`src/components/ui/UiWorkspace.module.css:103`: texto `#fff` sobre `var(--ux-color-brand)`), e no tema noite `--ux-color-brand` vale `#92bdf2` (`src/app/admin/admin-theme.css:154`). O mesmo par existe em `.actions .primary` (`UiWorkspace.module.css:72`). A classe é usada por cerca de vinte rotas administrativas; corrigi-la muda todas elas, e o critério 2 do plano mestre pede correção central e documentada, não sobreposição local de cor. **Não é corrigido nesta subfatia**: a medição é registrada em `problems` da evidência noturna e fica proposta como item transversal para decisão do proprietário.
- **E5 — rolagem horizontal interna das tabelas sem região focável.** Em 390 e 320 px, as 3 tabelas visíveis da aba inicial rolam dentro do próprio contêiner (`div.tableWrap`, sem `tabindex`, papel ou rótulo); em 768 e 1440 px não há rolagem interna. As 17 tabelas usam o mesmo contêiner. O critério 9 do plano exige rolagem indicada e operável por teclado. **Não é corrigido nesta subfatia** (é recorte de responsividade/teclado, não de estado de leitura): a medição é registrada na evidência.

O registro oficial dessas medições é a execução do gate novo contra a implementação anterior, gravada em `docs/ux-pro-07-operacao-evidencias/antes/`.

## 4. Gates herdados executados na base intacta (antes da implementação)

| Verificação | Resultado em `85e1e07` |
| --- | --- |
| `npm test` | **933/933**, 0 falhas, 0 pulados, 0 todo |
| `npm run typecheck` | exit **0** |
| `node scripts/qa-wave0-static.mjs` | **5/5** verificações OK (migrações 001–180 contínuas) |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 entradas; CSVs não alterados |
| `node --test tests/ux-ops-vocabulary.test.mjs` | **8/8** |
| `npm run test:ux-ops:pg` (gate herdado da rota) | **9/9**, `UX_OPS_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` |
| `npm run test:l06-delivery:pg` | **9/9**, `L06_DELIVERY_TEST_EXIT: 0`, `QA_L06_PG_TEMP_CLEANED: true` |
| `npm run test:l08-delivery:pg` | **51/51**, `L08_DELIVERY_TEST_EXIT: 0`, `QA_L08_PG_TEMP_CLEANED: true` |
| `npm run test:ext04-suppliers:pg` | **28/28**, `EXT04_TAP_SUMMARY: pass=28 fail=0 skipped=0 todo=0 minimo_exigido=28` |
| `next-env.d.ts` / `tsconfig.json` após os gates Next | restaurados por `git checkout --`; SHA-256 `18b697c4…` / `2128c956…`; árvore limpa |

## 5. Subfatia UX-PRO-07D-1 — incluído e excluído

### Incluído

1. **Leitura de lista validada (D1)** nas 17 leituras canônicas: mesma URL, mesmo método, mesmas credenciais e cabeçalhos (via `opsRequest`); um `2xx` sem a lista canônica vira **falha declarada** com código de diagnóstico `invalid_ops_response`, a resposta HTTP real no rodapé e “Tentar carregar novamente”. O código é de diagnóstico da tela e não entra no vocabulário dos servidores. No painel inicial, a falha segue a regra herdada: sem leitura completa, as abas não aparecem.
2. **Descarte da resposta superada do detalhe da versão (D2):** só a resposta da última versão escolhida é aplicada; uma resposta atrasada de versão escolhida antes é ignorada.
3. **Seções dependentes declaram a falha do detalhe (D3):** “Ciência da escala” e “Histórico da versão” dizem que não são exibidas porque a leitura da versão falhou; nenhuma ação de ciência é oferecida sem essa leitura.
4. **Coluna “Necessidades” sem zero presumido (D4):** “Aguardando leitura” enquanto a estrutura é lida e “Não confirmado” se ela falhou; a contagem real só aparece com a estrutura confirmada.
5. **Gate aditivo (D5/D6):** 10 casos novos acrescentados ao final de `tests/ux-ops-workspace.integration.test.mjs` (os 9 herdados ficam intactos); `scripts/qa-ux-ops-postgres.mjs` passa a auditar o resumo TAP e exigir 19 aprovações, reprovando falha, skip, todo ou resumo ausente. Falhas, atrasos e corpos ilegíveis são injetados **somente** em `window.fetch` da página e somente em `GET /api/ops/*`.
6. **Evidência atual** em `docs/ux-pro-07-operacao-evidencias/` (estágio `ux-pro-07-operacao`): estados (carregando, resposta ilegível do painel e da estrutura, necessidades aguardando e não confirmadas, falha e resposta ilegível do detalhe, versão superada), repouso em 1440/768/390/320 px no tema dia, 768 px no tema noite e percurso de teclado em 390 px, com `resumo.json` derivado das medições. A linha de base fica em `antes/` **sem** `resumo.json`, para não ser contada como evidência vigente.
7. **Inventário** regenerado somente pelo gerador, com diff restrito à linha 28 dos dois CSVs.

### Excluído (registrado, não corrigido)

- **E1 — escrita de ciência (07D-2):** `acknowledgeSchedule` (`:459-476`) sem estado de envio, sem guarda de duplo clique, com falha da releitura ignorada (`:474-475`), releitura com `|| []` (`:475`) e aplicação da releitura mesmo depois de trocar de versão. Método, URL, corpo e idempotência (`duplicate_ack`) não mudam.
- **E2 — legado avançado:** as 6 abas e os componentes `OpsAdvanced2Client`/`OpsAdvanced3Client` (`:595-622`), com `prompt()`/`confirm`, campos sem rótulo e estilos fixos já declarados em `docs/UX-07-OPERACAO-2026-10-05.md`, seção 6.
- **E3 — datas e horas:** carimbos `timestamptz` exibidos por `String(...).slice(0, 16)` sem fuso (`:905`, `:1031`, `:1098`, `:1246`, `:1296`, `:1377`, `:1447`) e datas em ISO; o L06 fixa o texto ISO (`tests/l06-delivery.integration.test.mjs:1149`, `:1160`), então a mudança exige decisão e subfatia próprias.
- **E4 — acoplamento das 9 leituras do painel inicial**, que oculta as 14 abas quando qualquer uma falha (`:367-372`, `:512`): preservado, porque é contrato herdado (`tests/ux-ops-workspace.integration.test.mjs:279`).
- **E5 — rolagem interna das tabelas sem região focável/indicada** (seção 3.1): medida e registrada.
- **E6 — `<main>` aninhado** (`src/app/admin/AdminGate.tsx:115` + `OperacaoWorkspace.tsx:495`): padrão transversal de 19 rotas, fora do recorte.
- **E7 — releitura explícita e hora da última leitura:** a rota não tem controle de releitura; criá-lo seria capacidade nova, fora do recorte.
- **E8 — contraste da aba ativa no tema noite** (seção 3.1): estilo compartilhado; medido e registrado em `problems`.
- `page.tsx`, `AdminGate`, papéis, metadados, navegação, servidor, migrações, `src/lib/ops-request.ts`, `src/lib/ops-vocabulary.mjs` e qualquer outra rota.
- Qualquer edição, remoção ou relaxamento de asserção herdada (`tests/ux-ops-*.test.mjs`, `tests/l06-delivery.integration.test.mjs`, `tests/l08-delivery.integration.test.mjs`, `tests/admin-page-gates.test.mjs`).
- Validação manual, homologação, revisão humana e aceite humano.

## 6. Prova exigida para encerrar a UX-PRO-07D-1

1. **Gate focal com navegador real**, aditivo aos 9 casos herdados, executado por `scripts/qa-ux-ops-postgres.mjs` (PostgreSQL descartável, `DATABASE_URL` remoto recusado, migrações reais, servidor HTTP real, Chromium, limpeza confirmada mesmo em falha; falhas injetadas somente em `window.fetch` da página), provando: contrato das 17 leituras (anônimo 401 sem vazar a lista; sessão de staff 200 com a lista canônica); carregamento inicial sem abas, vazio ou falha presumidos; `2xx` ilegível como falha declarada no painel inicial (com repetição que realmente relê), na estrutura, no dimensionamento, nas versões e no detalhe; “Necessidades” sem zero presumido; falha do detalhe declarada em ciência e histórico, sem ação de ciência; descarte da resposta atrasada de versão anterior; 1440/768/390/320 px, noite e percurso de teclado medidos.
2. O gate novo é **executado primeiro contra a implementação anterior**, com resultado e capturas em `docs/ux-pro-07-operacao-evidencias/antes/`, sem fingir que isso é regressão de gate herdado.
3. **Gate final em 2 execuções independentes**, ambas com `UX_OPS_TAP_SUMMARY: pass=19 fail=0 skipped=0 todo=0 minimo_exigido=19`.
4. **Preservação:** os 9 casos herdados continuam passando sem edição; L06, L08 e EXT-04 continuam verdes.
5. **Relatório depois** com D1–D6 e E1–E8 antes/depois por `file:line` do SHA-base e da implementação final, contratos preservados, gates executados e limitações.
6. **Inventário:** CSVs somente via `node scripts/ux-pro-00-inventory.mjs`, com prova estruturada de que o diff se limita à linha 28 (`/admin/operacao`).
7. **Bateria completa** antes da PR: `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `npm run test:l06-delivery:pg`, `npm run test:l08-delivery:pg`, `npm run test:ext04-suppliers:pg`, `node --test tests/ux-ops-vocabulary.test.mjs` e `npm run test:ux-ops:pg`; `git diff --check` limpo; `next-env.d.ts`/`tsconfig.json` restaurados e SHA-256 reconferidos depois do build e de cada gate Next.

Este documento não aprova as subfatias seguintes, não conclui a 07D nem a UX-PRO-07 e não declara aceite humano. A PR desta subfatia só pode ser mergeada com todos os checks visíveis verdes, estado `MERGEABLE`/`CLEAN` confirmado e revisão técnica automatizada publicada em comentário — sem alegar revisão humana.
