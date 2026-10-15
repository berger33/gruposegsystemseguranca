# UX-PRO-07D-1 — relatório antes/depois da leitura canônica de `/admin/operacao`

**Data:** 15/10/2026

**Branch:** `arena/5bc1f234-gruposegsystemseguranca` · **Base:** `origin/main` = `85e1e075ef047018c9e882d87cb642bf27eb1aef` (merge da PR #227)

**Escopo registrado antes da implementação:** `docs/UX-PRO-07D-1-ESCOPO-ANTES-2026-10-15.md` (commit `b3a0c8d`).

**Commits da subfatia, na ordem:** `b3a0c8d` (escopo) → `7adc958` (gate aditivo, mínimo 19) → `8fa66e5` (linha de base do gate contra a tela anterior) → `33f2fa9` (implementação) → `0c630b8` (evidência vigente) → `49d9ff6` (inventário regenerado) → `18813bb` (espaços finais do log da linha de base) → este relatório.

**Esta subfatia fecha somente o recorte UX-PRO-07D-1 — estados honestos das leituras canônicas (não legadas) de `/admin/operacao`. Ela não conclui a fatia 07D nem a UX-PRO-07.** A escrita de ciência de escala (07D-2), as seis abas legadas avançadas e os demais itens excluídos continuam pendentes (seção 5).

## 1. O que mudou e o que não mudou

| Arquivo | Mudança | Tamanho |
| --- | --- | --- |
| `src/app/admin/operacao/OperacaoWorkspace.tsx` | D1–D4 (seção 3) | +110 / −36 (1456 → 1530 linhas) |
| `tests/ux-ops-workspace.integration.test.mjs` | 10 casos novos **acrescentados após a linha 399**; os 9 casos herdados e o auxiliar `openOps` não foram tocados (diff só de acréscimo: `@@ -399,0 +400,665 @@`) | +665 / −0 |
| `scripts/qa-ux-ops-postgres.mjs` | auditoria do resumo TAP: falha, skip, todo, resumo ausente ou menos de 19 aprovações reprovam o gate | +38 / −5 |
| `docs/ux-pro-07-operacao-evidencias/` | evidência vigente (14 capturas + `resumo.json` + logs das 2 execuções finais) e `antes/` (linha de base, sem `resumo.json`) | novo |
| `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`, `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` | regenerados pelo gerador; diff só na linha 28 | 1 linha cada |

**Não mudou:** nenhuma URL, método, corpo, cabeçalho, credencial ou chave de idempotência (as 17 leituras continuam saindo por `opsRequest`, agora chamado por `opsReadList`); `src/lib/ops-request.ts`, `src/lib/ops-vocabulary.mjs` e `.d.mts`; servidor (`server.mjs`, `src/server/ops-*.mjs`); migrações; `page.tsx`, `AdminGate` e papéis; `acknowledgeSchedule` (escrita de ciência, `:506-523` no arquivo final); `OpsAdvanced2Client`/`OpsAdvanced3Client`; CSS compartilhado; workflows. Nenhuma asserção herdada foi editada, removida ou relaxada.

## 2. Gate: antes e depois

Gate: `npm run test:ux-ops:pg` (PostgreSQL embutido e descartável, `DATABASE_URL` remoto recusado, migrações reais, servidor HTTP real, Chromium `@sparticuz/chromium`). Falhas, atrasos e corpos ilegíveis são injetados **somente** em `window.fetch` da página e somente em `GET /api/ops/*`; nenhuma escrita passa pelo injetor.

| Execução | Resultado | Registro |
| --- | --- | --- |
| Antes — gate `7adc958` contra a tela de `85e1e07` | **13/19**; `UX_OPS_TAP_SUMMARY: pass=13 fail=6 skipped=0 todo=0 minimo_exigido=19`; `UX_OPS_GATE_REJECTED` | `docs/ux-pro-07-operacao-evidencias/antes/antes-gate-completo.txt`, `antes-medicoes.json`, `antes-capturas.json` e 14 capturas do estado anterior. Os 9 herdados passam; reprovam exatamente os casos de D1 (13, 14, 17), D4 (15), D3 (16) e D2 (18). Não é regressão de gate herdado. |
| Depois — execução 1 (código `33f2fa9`) | **19/19**; `pass=19 fail=0 skipped=0 todo=0 minimo_exigido=19`; `UX_OPS_TEST_EXIT: 0`; `QA_PG_TEMP_CLEANED: true` | `docs/ux-pro-07-operacao-evidencias/depois-gate-execucao-1.txt`; gravou as capturas e o `resumo.json` vigentes |
| Depois — execução 2, independente (sem diretório de evidência, como no CI) | **19/19**; mesmo resumo TAP; `UX_OPS_TEST_EXIT: 0`; `QA_PG_TEMP_CLEANED: true` | `docs/ux-pro-07-operacao-evidencias/depois-gate-execucao-2.txt` |

Transparência: uma execução anterior a um ajuste puramente visual da nota da coluna “Necessidades” (classe `hint` → `footnote`, sem efeito em asserção) também terminou 19/19; ela **não** conta como uma das duas execuções finais e suas capturas foram descartadas antes da execução 1.

### 2.1 Casos novos (todos em `tests/ux-ops-workspace.integration.test.mjs`)

| Caso | Linha | O que prova |
| --- | --- | --- |
| 10 | `:644` | massa sintética pelas APIs reais: 2 profissionais, 2 postos, 1 turno, 1 necessidade por turno no posto A, versões A (+30 dias) e B (+60 dias) com entradas distintas |
| 11 | `:711` | contrato preservado das 17 leituras: anônimo `401 unauthorized` sem vazar a lista; sessão `ti` `200` com a lista canônica |
| 12 | `:725` | carregamento inicial (posts atrasado 5 s): estado carregando, sem abas, sem vazio, sem falha |
| 13 | `:742` | `2xx` sem `posts`: falha declarada `invalid_ops_response` com `HTTP 200`, sem “Nenhum posto…”, sem abas; repetição emite leitura nova e recupera |
| 14 | `:769` | `2xx` sem lista em estrutura (`roles`), dimensionamento (`gaps`) e versões (`versions`): falha declarada em cada grupo, sem vazio falso |
| 15 | `:805` | coluna “Necessidades”: “Aguardando leitura” durante a leitura e “Não confirmado” após falha 503 da estrutura — nunca `0`; com a estrutura confirmada, a contagem real (`1`) aparece |
| 16 | `:840` | falha 503 nas ciências da versão B: calendário com a falha real; Ciência e Histórico declaram a dependência; nenhum “Registrar ciência”; repetição recupera |
| 17 | `:875` | `2xx` sem `entries`: falha declarada no calendário, sem “Nenhuma entrada…” e sem “Nenhum profissional…” |
| 18 | `:899` | versão A atrasada 3,5 s e versão B escolhida em seguida: depois da entrega das três respostas atrasadas de A, título, calendário e ciência continuam sendo de B |
| 19 | `:938` | 1440/768/390/320 px (transbordo do documento ≤ 1 px, menor controle ≥ 44 px), contrastes dia/noite, percurso de teclado do início do documento até a aba ativa com foco visível, setas preservadas; problema fora do recorte registrado em `problems` |

## 3. D1–D6 — antes e depois (`file:line`)

Antes = `85e1e07` (`OperacaoWorkspace.tsx` com 1456 linhas). Depois = `33f2fa9` (1530 linhas).

| ID | Antes | Depois | Prova |
| --- | --- | --- | --- |
| D1 — `2xx` sem lista vira vazio | 17 leituras com `\|\| []`: `:373-381`, `:396-397`, `:412-413`, `:424`, `:453-455`; vazios afirmavam “a consulta foi respondida…” (`:651`, `:760`) | `opsReadList` exige a lista canônica e devolve falha `invalid_ops_response` (`kind: retry`, `canRetry: true`, status HTTP real) — `:317-344`; chamadas `:397-407`, `:433-436`, `:449-452`, `:465`, `:481-485`; atribuições sem fallback `:416-424`, `:439-440`, `:455-456`, `:467`, `:500-502`. O código não entra em `ops-vocabulary.mjs` (anti-deriva `tests/ux-ops-vocabulary.test.mjs:86-98` continua 8/8) | casos 13, 14, 17; capturas `operacao-1440-resposta-invalida`, `-estrutura-resposta-invalida`, `-detalhe-resposta-invalida` (antes: vazio falso; depois: falha declarada) |
| D2 — resposta superada sobrescreve a versão atual | `selectVersion` sem identidade de requisição `:430-457`; aplicação incondicional `:453-455`. Antes, o título dizia v3 e o calendário/ciência listavam posto e profissional da v2, com “Registrar ciência” para quem não está na versão exibida | identidade `detailRequest` `:389-392`; número da seleção `:474`; descarte da resposta superada `:486-488` | caso 18; `antes/operacao-1440-versao-superada.png` × `operacao-1440-versao-superada.png`; trecho do erro em `antes/antes-medicoes.json` (caso 18) |
| D3 — seções mudas na falha do detalhe | Ciência `:1215-1218` e Histórico `:1276-1282` só com o título | Ciência `:1280-1285` e Histórico `:1347-1352` declaram que não são exibidos porque a leitura da versão falhou; nenhuma ação de ciência sem leitura | caso 16; `operacao-1440-detalhe-falha` antes/depois |
| D4 — “Necessidades” com zero presumido | `:674` contava `shiftNeeds` com a estrutura carregando/falhando (`:684-687`) → `0` | `:721-729`: “Aguardando leitura” / “Não confirmado” / contagem real; nota explicativa `:737-743` | caso 15; `operacao-1440-necessidades-aguardando` e `-nao-confirmadas` (antes `0`; depois texto declarado) |
| D5 — estados sem navegador e sem captura | gate herdado só exercitava a falha 503 inicial e a legada; nenhuma captura (CSV linha 28 vazio) | 10 casos de navegador; 14 capturas com `resumo.json` (estágio `ux-pro-07-operacao`); inventário linha 28 com 1440/768/390/320, primeiro foco e percurso registrados | casos 12–19; seção 6 e 7 |
| D6 — runner sem auditoria TAP | só repassava o código de saída (`scripts/qa-ux-ops-postgres.mjs:74-90` no SHA-base) | `auditTap` e mínimo 19 (`:54-73`); captura da saída `:100-115`; resumo/rejeição `:116-122`; saída `:123` | linha de base rejeitada com `UX_OPS_GATE_REJECTED`; execuções finais `pass=19 … minimo_exigido=19` |

## 4. Contratos preservados

- **Os 9 casos herdados** (`tests/ux-ops-workspace.integration.test.mjs:189-399`) passaram sem edição na linha de base e nas duas execuções finais — inclusive `:279` (falha do painel inicial mantém as abas ocultas, regra também aplicada à resposta ilegível), `:293-306` (14 abas, roving tabindex, teclado), `:346-356` (ciência idempotente) e `:391-395` (390 px).
- **L06** (`tests/l06-delivery.integration.test.mjs:1106-1240`, `:2058-2079`): ids, rótulos de aba, datas ISO e jornada de ciência continuam válidos — L06 verde na bateria final (seção 8).
- `tests/admin-page-gates.test.mjs:32` (papéis de `page.tsx`) e `tests/ui-surface-locale.test.mjs` continuam verdes em `npm test`.
- Contrato HTTP das 17 leituras provado pelo caso 11 (401 sem vazamento; 200 com a lista canônica).

## 5. Itens excluídos e achados (registrados, não corrigidos)

| ID | Situação | Onde |
| --- | --- | --- |
| E1 — escrita de ciência (próxima subfatia, 07D-2) | sem estado de envio, sem guarda de duplo clique, falha da releitura ignorada, releitura com `\|\| []` e aplicação da releitura mesmo depois de trocar de versão | `OperacaoWorkspace.tsx:506-523` (final; `:459-476` no SHA-base) |
| E2 — legado avançado | 6 abas com `OpsAdvanced2Client`/`OpsAdvanced3Client`: `prompt()`/`confirm`, campos sem rótulo, estilos fixos | `:642-669` (final; `:595-622` no SHA-base) |
| E3 — datas e horas | `timestamptz` por `String(...).slice(0, 16)` sem fuso; datas em ISO fixadas pelo L06 (`tests/l06-delivery.integration.test.mjs:1149`, `:1160`) | 7 ocorrências, ex.: `:1246`/`:1296` no SHA-base |
| E4 — acoplamento das 9 leituras iniciais | preservado (contrato herdado `:279`) | `:410-415` e `:559` (final; `:367-372` e `:512` no SHA-base) |
| E5 — rolagem interna de tabela sem região focável | em 390 e 320 px, 3 de 3 tabelas visíveis rolam dentro do contêiner sem `tabindex`/papel/rótulo; 0 em 768 e 1440 | `resumo.json` (`tabelasComRolagemInterna`, `tabelasComRolagemSemRegiaoFocavel`) |
| E6 — `<main>` aninhado | transversal (19 rotas) | `src/app/admin/AdminGate.tsx:115` + `OperacaoWorkspace.tsx:542` |
| E7 — releitura explícita e hora da última leitura | capacidade nova, fora do recorte | — |
| E8 — contraste da aba ativa no tema noite **1,95:1** | estilo **compartilhado** `.tabActive` (texto `#fff` sobre `--ux-color-brand` noturno `#92bdf2`); o mesmo par existe em `.actions .primary`. Registrado em `problems` da captura noturna; proposta de correção central e documentada para decisão do proprietário | `src/components/ui/UiWorkspace.module.css:72`, `:103`; `src/app/admin/admin-theme.css:154` |
| E9 — quebra de palavra no cabeçalho das tabelas em 768 px (achado nas capturas) | “CONTRA·TO”, “NECESSID·ADES”, “SITUAÇÃ·O”: `overflow-wrap: anywhere` do `.workspace` compartilhado, sem largura mínima de célula acima de 700 px; transversal | `src/components/ui/UiWorkspace.module.css:11`; `src/app/admin/admin-theme.css:129-146`; capturas `operacao-768-dia`/`-noite` |

Observação para o proprietário (servidor fora do recorte, nada alterado): `POST /api/ops/schedule-acks` só confere a situação da versão, não se o profissional tem entrada nela (`src/server/ops-api.mjs:1435-1446`). D2 removia, na tela, o caminho pelo qual a interface oferecia esse registro indevido.

## 6. Evidência vigente — `docs/ux-pro-07-operacao-evidencias/`

`resumo.json` (estágio `ux-pro-07-operacao`, papel `ti`, 14 entradas) é escrito pelo próprio gate a partir das medições:

| Captura | Medições |
| --- | --- |
| `operacao-1440-dia` | transbordo 0 px; menor controle 44 px; link de texto em linha 19 px (só registrado); contraste título 15,54, tabela 15,54, aba ativa 9,58, aba inativa 9,58 |
| `operacao-768-dia` | transbordo 0 px; menor controle 44 px; sem rolagem interna de tabela |
| `operacao-768-noite` | transbordo 0 px; menor controle 44 px; contraste título 12,92, tabela 12,92, aba inativa 7,83; **aba ativa 1,95 → `problems` (E8)** |
| `operacao-390-dia` | transbordo 0 px; menor controle 44 px; 3/3 tabelas com rolagem interna sem região focável (E5) |
| `operacao-390-teclado` | primeiro foco visível; percurso `GrupoSEG System → Menu → Ativar modo noite → Sair → Início → Contratos → Empresas e funil → ops-aba-postos`; foco visível na aba ativa; ←/→ preservadas |
| `operacao-320-dia` | transbordo 0 px; menor controle 44 px; 3/3 tabelas com rolagem interna sem região focável (E5) |
| estados (1440) | `operacao-1440-carregando`, `-resposta-invalida`, `-estrutura-resposta-invalida`, `-necessidades-aguardando` (célula “Aguardando leitura”), `-necessidades-nao-confirmadas` (célula “Não confirmado”), `-detalhe-falha`, `-detalhe-resposta-invalida`, `-versao-superada` |

`docs/ux-pro-07-operacao-evidencias/antes/` guarda as mesmas 14 capturas do estado anterior (cada caso captura antes de afirmar) e `antes-capturas.json` — propositalmente **não** chamado `resumo.json`, para que o inventário não conte a linha de base como evidência vigente. Nenhuma evidência existente de outra rota foi sobrescrita.

`problems` é derivado das medições automatizadas; ele **não** está vazio na captura noturna porque E8 foi medido e não corrigido. **As medições automatizadas não equivalem a auditoria WCAG completa**: os contrastes cobrem elementos escolhidos (título, primeira célula, abas), os alvos cobrem botões/abas/campos do espaço de trabalho, e o percurso de teclado cobre do início do documento até a aba ativa e as setas — não todos os painéis, estados e componentes montados sob demanda.

## 7. Inventário regenerado — diff restrito à linha 28

Gerado somente por `node scripts/ux-pro-00-inventory.mjs`; `--check` termina `OK` (100 entradas). Comparação estruturada com os CSVs anteriores: mesmo cabeçalho, mesmas 101 linhas, **única linha alterada = 28 (`/admin/operacao`) nos dois arquivos** (`git diff -U0` mostra só `@@ -28 +28 @@` em cada um).

- Inventário: `capturas_viewports` vazio → `1440x900|320x844|390x844|768x1024`; `capturas_stage` vazio → `ux-pro-07-operacao`; `capturas_primeiro_foco` `nao` → `sim`. Componentes, estilos, tabelas (17), marcadores de estado/teclado, gates e chamadas de localidade não mudaram.
- Matriz: responsividade → “capturado em 1440x900, 320x844, 390x844, 768x1024; faltam nenhum”; teclado → “percurso de teclado registrado em navegador (recorte automatizado do gate); primeiro foco registrado em captura”; evidência acrescenta “captura visual: ux-pro-07-operacao @ …”; classe `teste automatizado de jornada` → `captura visual`; lacuna → “captura ausente em — ; tema noturno sem captura ; teclado limitado ao recorte registrado no gate ; estados nao exercitados em navegador ; validacao manual e aceite humano nao registrados”.
- Totais: rotas com captura visual 24 → 25; classe `captura visual` 24 → 25, `teste automatizado de jornada` 34 → 33.

Limitação conhecida do gerador (a mesma registrada em 07A–07C): ele sempre escreve “tema noturno sem captura” e “estados nao exercitados em navegador” para rotas administrativas, sem ler `theme` nem os estados do `resumo.json`; não foi alterado para não misturar mudança global de metodologia com esta rota.

## 8. Bateria final (árvore `49d9ff6`, antes deste relatório)

Executada em sequência sobre `49d9ff6` (código final `33f2fa9` + evidência + CSVs), com `next-env.d.ts` e `tsconfig.json` restaurados por `git checkout --` e conferidos depois de cada etapa. Os commits posteriores (`18813bb` e este relatório) só tocam documentação.

| Verificação | Resultado |
| --- | --- |
| `npm ci` | 81 pacotes, 0 vulnerabilidades |
| `npm test` | **933/933**, 0 falhas, 0 pulados, 0 todo |
| `npm run typecheck` | exit **0** |
| `npm run build` | exit **0**; `/admin/operacao` gerada como rota estática (`○`) |
| `node scripts/qa-wave0-static.mjs` | **5/5** (migrações 001–180 contínuas) |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 entradas |
| `node --test tests/ux-ops-vocabulary.test.mjs` | **8/8** |
| `npm run test:l06-delivery:pg` | **9/9**, `L06_DELIVERY_TEST_EXIT: 0`, `QA_L06_PG_TEMP_CLEANED: true` |
| `npm run test:l08-delivery:pg` | **51/51**, `L08_DELIVERY_TEST_EXIT: 0`, `QA_L08_PG_TEMP_CLEANED: true` |
| `npm run test:ext04-suppliers:pg` | **28/28**, `EXT04_TAP_SUMMARY: pass=28 fail=0 skipped=0 todo=0 minimo_exigido=28`, `QA_EXT04_PG_TEMP_CLEANED: true` |
| `npm run test:ux-ops:pg` (3ª execução, dentro da bateria) | **19/19**, `UX_OPS_TAP_SUMMARY: pass=19 fail=0 skipped=0 todo=0 minimo_exigido=19`, `UX_OPS_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` |
| `git diff --check 85e1e07 HEAD` | na bateria acusou espaços finais em 8 linhas vazias do log copiado da linha de base; corrigido em `18813bb` (só espaços, nenhum conteúdo do log) e reexecutado **limpo** |
| Arquivos protegidos | `next-env.d.ts` `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`; `tsconfig.json` `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65` — iguais à base depois de cada build/gate |

Na base intacta `85e1e07` (antes de qualquer edição), a mesma bateria herdada havia dado: `npm test` 933/933, typecheck 0, wave0 5/5, inventário `OK`, vocabulário 8/8, `test:ux-ops:pg` 9/9, L06 9/9, L08 51/51, EXT-04 28/28 (registrado no escopo, seção 4).

## 9. Limitações

- Capturas feitas com o servidor em modo de desenvolvimento (`server.mjs --dev`, como em todos os gates PostgreSQL do repositório): o indicador do Next.js (“N”) aparece no canto inferior esquerdo e, em 320 px, cobre parte da aba “Passagem de turno” na imagem — artefato do modo de desenvolvimento, não da tela.
- A fonte do Chromium do ambiente não desenha o glifo “→”: nas capturas, “cliente → unidade atendida → …” e “rascunho → publicada → revisada” aparecem com espaços; o texto do DOM contém as setas (o L06 confere “Revisada → Publicada” pelo texto).
- Em modo de desenvolvimento o React executa os efeitos de carga duas vezes; por isso as regras de injeção do gate são persistentes (falham ou atrasam todas as chamadas do recurso até serem desligadas), o que torna o resultado determinístico com uma ou duas chamadas.
- Massa inteiramente sintética, criada pelas APIs reais no banco descartável, destruído ao fim de cada execução (`QA_PG_TEMP_CLEANED: true`). A evidência usa o papel `ti`; os papéis `supervisor`, `marcelo` e `admin` não foram capturados.
- Horários exibidos continuam em UTC sem fuso (E3); não fazem parte deste recorte.
- Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu. Este relatório não declara conformidade WCAG integral, não conclui a 07D nem a UX-PRO-07 e não autoriza as subfatias seguintes.

## 10. Próximo passo sugerido

**UX-PRO-07D-2 — escrita de ciência de escala em `/admin/operacao`** (E1): estado de envio e guarda de duplo clique no “Registrar ciência”, reconciliação honesta da releitura (falha declarada, lista canônica exigida e descarte quando a versão mudou), sem alterar método, URL, corpo, papel exigido nem a idempotência `duplicate_ack` provada pelo caso herdado `:338-361`. As decisões transversais E8 e E9 (estilo compartilhado) e E3 (datas) dependem do proprietário e não devem ser misturadas a ela.
