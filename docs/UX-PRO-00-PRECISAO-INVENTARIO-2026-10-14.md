# UX-PRO-00 — precisão do inventário, sem alteração de tela

**Data:** 14/10/2026. **Base medida:** `main` `80538fe095ae26ff9b18c8a16cc966129e789aac`, após o merge documental da PR #219. O branch preservado `arena/14fe7e70-gruposegsystemseguranca` continua em `affb2a9`; nenhum código, gate ou PNG da implementação paralela foi importado.

## 1. Fronteira e método

Nenhum arquivo de `src/`, API, papel, permissão, formulário, estado de tela ou contrato foi alterado. A implementação entregue pela PR #218 e seus testids `clientes-cadastros-*` permanecem intactos.

- O detector continua **léxico**, não uma análise de comportamento. Acrescenta somente o marcador canônico `data-testid` **ou prop** `testId` terminado em `-desatualizada`/`-desatualizado`. Não acrescenta `role="alert"` à regex: `contracts-write-error` é erro de **escrita**, não prova de falha de leitura (`src/app/admin/contratos/ContractWorkspace.tsx:227`).
- O novo sinal de teclado exige `entry.percursoTeclado`: array não vazio de strings não vazias, emitido pelo gate a partir dos alvos focados no navegador. `firstFocus`, nome de PNG, `state: percurso_teclado` e marcadores no código **não** são promovidos a prova de percurso. Ver `scripts/ux-pro-00-keyboard-evidence.mjs:7` e `scripts/ux-pro-00-inventory.mjs:227`.
- `marcadores_teclado` agora aceita marcador no código **ou** esse registro explícito. A matriz distingue registro em navegador, primeiro foco isolado e marcador apenas estático. Não afirma percurso completo da rota.
- Os gates de clientes e contratos recebem somente acréscimos de coleta/emissão, depois das asserções já existentes de Tab e foco visível. **Nenhuma asserção existente foi alterada/removida.** Comercial já emitia o campo; seu teste e resumo versionado não precisaram mudar.
- CI: acrescenta apenas a execução de `tests/ux-pro-00-precision.test.mjs` ao baseline. Nenhum passo, filtro de paths, asserção, timeout ou check existente foi reduzido/desativado.

## 2. Antes e depois — exatamente 14 células

`I` = `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`.
`M` = `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`.

**K** = `percurso de teclado registrado em navegador (recorte automatizado do gate); primeiro foco registrado em captura`.
**L** = troca somente `percurso de teclado nao verificado` por `teclado limitado ao recorte registrado no gate`; os demais trechos da célula permanecem iguais.

Cada linha abaixo é **uma célula**, com justificativa própria na fonte:

| CSV / rota / coluna | Antes → depois | Justificativa individual (`file:line`) |
|---|---|---|
| I `/admin/comercial` `estados_erro` | `nao` → `sim` | `src/app/admin/comercial/CommercialHistory.tsx:145`: faixa de falha de releitura com `historico-desatualizado`; :146–149 declara motivo, hora e registros preservados. |
| I `/admin/contratos` `estados_erro` | `nao` → `sim` | `src/app/admin/contratos/ContractWorkspace.tsx:119` renderiza `data-testid={testId}`; :389 passa `contratos-desatualizada`, com leitura em :390. Não é o aviso de escrita de :227. |
| I `/admin/clientes` `marcadores_teclado` | `nao` → `sim` | `tests/ux-client-admin-workspace.integration.test.mjs:379–404`: alvos medidos a cada Tab, alcance de `#new-account-name` e contorno afirmados antes de emitir `percursoTeclado`; registro em `docs/ux-pro-06-clientes-evidencias/resumo.json:42`. |
| I `/admin/comercial` `marcadores_teclado` | `nao` → `sim` | `tests/ux-crm-workspace.integration.test.mjs:1909–1927` mede três Tabs entre etapas e Enter; :1953 já emite a sequência. Registro explícito em `docs/ux-pro-06-comercial-evidencias/depois/resumo.json:204`. |
| I `/admin/contratos` `marcadores_teclado` | `nao` → `sim` | `tests/ux-contract-workspace.integration.test.mjs:574–599`: percurso por Tab até o link do contrato, com contorno afirmado; registro em `docs/ux-pro-06-contratos-evidencias/resumo.json:43`. |
| I `/admin/clientes` `capturas_primeiro_foco` | `nao` → `sim` | `tests/ux-client-admin-workspace.integration.test.mjs:393–403`: `firstFocus: true` só é emitido após a asserção de foco visível da captura de teclado; resumo em `docs/ux-pro-06-clientes-evidencias/resumo.json:41`. |
| M `/admin/comercial` `estados` | `vazio` → `erro/vazio` (ocorrência estática) | `src/app/admin/comercial/CommercialHistory.tsx:145–149`; o erro de releitura com dados preservados já era entregue, faltava reconhecer seu marcador. |
| M `/admin/contratos` `estados` | `carregando/vazio` → `carregando/erro/vazio` (ocorrência estática) | `src/app/admin/contratos/ContractWorkspace.tsx:119` + :389–392; mesma faixa de leitura por prop, não escrita. |
| M `/admin/clientes` `teclado` | `sem marcador e sem verificacao` → K | `tests/ux-client-admin-workspace.integration.test.mjs:379–404`; a captura agora transporta a medição que o gate já exercitava. |
| M `/admin/comercial` `teclado` | `primeiro foco registrado em captura; percurso completo nao verificado` → K | `tests/ux-crm-workspace.integration.test.mjs:1910–1927` + :1953; sequência emitida pelo gate, não inferida de `firstFocus`. |
| M `/admin/contratos` `teclado` | `primeiro foco registrado em captura; percurso completo nao verificado` → K | `tests/ux-contract-workspace.integration.test.mjs:574–599`; sequência até o link, sem alegar operação de todas as abas/formulários. |
| M `/admin/clientes` `lacuna` | L | `tests/ux-client-admin-workspace.integration.test.mjs:376–404` limita a prova ao campo da seção 1; `scripts/ux-pro-00-inventory.mjs:384` preserva essa limitação. |
| M `/admin/comercial` `lacuna` | L | `tests/ux-crm-workspace.integration.test.mjs:1908–1927` cobre o recorte entre etapas comerciais; `scripts/ux-pro-00-inventory.mjs:384` não o promove a cobertura global. |
| M `/admin/contratos` `lacuna` | L | `tests/ux-contract-workspace.integration.test.mjs:571–599` cobre o caminho ao link do contrato; `scripts/ux-pro-00-inventory.mjs:384` mantém o limite do percurso registrado. |

Conferência automatizada de todos os campos: **6 células em I + 8 em M**, somente três linhas em cada CSV. Continuam 100 rotas, mesmas colunas, ordem, papéis, gates, stages, viewports e classes de evidência. Nenhum CSV histórico de 10/10 foi reescrito. Regeneração: `node scripts/ux-pro-00-inventory.mjs`; confirmação: `node scripts/ux-pro-00-inventory.mjs --check`.

### Controles que não foram promovidos

As outras sete rotas apontadas no pedido mantêm `estados_erro = nao`: `/admin`, `/admin/emergencial`, `/admin/entrar`, `/admin/fornecedores`, `/admin/pendencias`, `/admin/publicacao`, `/admin/relatorios`.

Isso **não afirma ausência de erro na tela**. Alertas genéricos, de sessão/escrita ou compartilhados entre leitura e escrita não são convertidos indiscriminadamente pelo novo padrão de desatualização. Por exemplo, fornecedores já declara falha de leitura em `src/app/admin/fornecedores/FornecedoresWorkspace.tsx:167` por `data-ui-state="error"`; pendências compartilha `error` entre leitura (:41), varredura (:58) e escrita (:75), renderizado em `src/app/admin/pendencias/PendencyWorkspace.tsx:92`. Esses outros vocabulários continuam limitações explícitas do detector, não novas fatias de tela a implementar. Não se tentou zerar as nove células com `role="alert"`.

## 3. Evidências realmente geradas

Gates completos, sem filtros de nome, em PostgreSQL 17 descartável, migrações 001–180 e Chromium real. Massa sintética provisionada pelos próprios gates; nenhum banco do operador ou dado real foi usado.

- Clientes: `docs/ux-pro-06-clientes-evidencias/clientes-390-teclado.png` e `resumo.json`. Mantidas as nove entradas; só a entrada de teclado recebe `firstFocus` e `percursoTeclado`. Sequência medida termina em `new-account-name`.
- Contratos: `docs/ux-pro-06-contratos-evidencias/contratos-390-teclado.png` e `resumo.json`. Mantidas as sete entradas; só a entrada de teclado recebe os dois campos. Sequência medida termina em `Abrir composição e implantação`. O CSV já tinha primeiro foco por evidência de estágio anterior, portanto essa célula não mudou.
- Comercial: gate reexecutado com saída isolada; a sequência reemitida foi comparada à versionada e é idêntica: `Orçamentos (MO/técnico/custos)` → `Preço & descontos` → `Propostas & envio`. Não se reescreveram as outras capturas/contrastes de comercial.
- Capturas foram produzidas em `.data/arena-pr2-2026-10-14/`; somente as duas PNGs de teclado e seus resumos foram copiadas para os caminhos vigentes. Nenhuma PNG dos outros estados foi versionada novamente. O emissor preserva as demais entradas/metadados do resumo; esse comportamento tem teste dedicado.

Para reproduzir a emissão, aponte `UX_CLIENT_ADMIN_EVIDENCE_DIR` ou `UX_CONTRACT_EVIDENCE_DIR` para uma pasta isolada, copie para ela o `resumo.json` vigente se quiser preservá-lo e execute o respectivo gate completo. Sem essa variável, o gate afirma o percurso, mas não escreve arquivos. `UX_COMERCIAL_EVIDENCE_DIR` controla a emissão própria já existente do CRM.

## 4. Verificações e ocorrência de ambiente

| Verificação | Base `80538fe` | Depois |
|---|---|---|
| `npm ci` | lockfile; 0 vulnerabilidades | manifest/lockfile intactos |
| `npm test` | 933/933, 0 falhas/pulados | 933/933, 0 falhas/pulados |
| `npm run typecheck` | exit 0 | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 | 5/5 |
| `node scripts/ux-pro-00-inventory.mjs --check` | fresco | fresco após regeneração |
| Nova suíte de precisão | 2/4: falharam os casos canônicos por prop/literal e de percurso explícito, antes de editar o gerador | 7/7, incluindo três testes adicionais do emissor |
| `node --test tests/admin-navigation.test.mjs` | não repetido na base | 2/2 |
| `npm run build` | não repetido na base | exit 0 |
| `npm run test:ux-client-admin:pg` | não repetido na base | 6/6, 0 pulados |
| `npm run test:ux-contract:pg` | não repetido na base | 16/16, 0 pulados |
| `npm run test:ux-crm:pg` | não repetido na base | 37/37, 0 pulados |
| `npm run test:l08-delivery:pg` | não repetido na base | primeira execução 50/51 por crash de lançamento do Chromium; repetição **completa**, sem mudança de código/flags/asserts: 51/51, 0 pulados |

A falha inicial do L08 ocorreu em `tests/l08-delivery.integration.test.mjs:65`, no `browserType.launch`: processo terminou em **SIGSEGV antes de navegar**. Não foi uma asserção de negócio nem foi ocultada: logs `after-l08-delivery.log` e `after-l08-delivery-retry.log` preservados fora do Git. Nenhum arquivo do L08 foi alterado para obter sucesso. Os outros gates passaram na primeira execução completa desta fatia.

A nova suíte (`node --test tests/ux-pro-00-precision.test.mjs`) usa o gerador real em árvores sintéticas isoladas e verifica: marcadores por prop/literal, alerta de escrita recusado, percurso explícito, falso crédito por PNG/foco/array inválido recusado, freshness, preservação de resumos e emissão idempotente. Sua execução foi acrescentada ao CI, além da bateria existente.

`tests/ux-pro-00-inventory.test.mjs` foi preservado **byte a byte**, sem skip ou enfraquecimento: SHA-256 `7c12a3c784bb3d3f64957d90de42512aa22d86560a324295ee164b3897411886`.

Após **cada** gate Next e após o build, inclusive na execução falha, foram executados `git checkout -- next-env.d.ts tsconfig.json` e conferência SHA-256. Ambos ficam fora do diff:

- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`

Logs, snapshot das células antes e diff completo das 14 células ficam em `.data/arena-pr2-2026-10-14/`, fora do Git. Resultados acima são locais; os checks da PR devem ser conferidos no head publicado, sem presumir que execução local substitui CI.

## 5. Limitações e continuação

- **Nenhuma validação manual nem aceite humano.** A matriz mantém `validacao manual: nao_registrado` e `aceite humano: nao_registrado` em todas as rotas.
- Registro de Tab/foco em um recorte não prova operação completa de todas as seções, todas as larguras nem tecnologia assistiva. O novo texto preserva esse limite.
- O detector de estados permanece léxico. Reconhecer um testid de desatualização não prova que ele foi montado/exercitado; os gates focais são a evidência comportamental separada.
- Não se corrigiram nesta fatia os textos genéricos de tema noturno/estados na matriz nem todos os demais vocabulários de erro. Isso evitaria uma expansão de células sem justificativa própria.
- A PR 3 opcional (preservação entre seções, cadastro criado durante falha e contraste da faixa de clientes) **não está incluída**. Campos `problems` existentes nos resumos foram preservados, não inventados como nova medição de contraste.
- Nenhum merge desta fatia deve ocorrer sem revisão própria concluída e checks verdes. A autorização de revisão automatizada da continuação da PR #219 foi específica daquela PR; não se declara revisão humana ou aprovação automática para esta.
