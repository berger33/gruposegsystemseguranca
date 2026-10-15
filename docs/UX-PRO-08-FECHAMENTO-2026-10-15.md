# UX-PRO-08 — fechamento reconciliado e complemento da matriz (15/10/2026)

## 1. Governança: merge concorrente preservado, não reaberto

A sessão iniciou na main `8dfbd7e451787dcf6f56e93b81d8e4edb26ceda5`, árvore limpa, com #244/#245/#246 MERGED (11/12/41 checks SUCCESS). Durante a coleta independente, a **#247 (UX-PRO-08D)** foi mergeada por outra sessão. O fetch antes de abrir PR detectou a main **`3d807a420db6c63c3f754ae02144053e29da1469`**; #247 confirmada MERGED com 6 checks SUCCESS. Não reaberta nem duplicada.

O escopo foi reduzido **antes de adaptar o código**: [escopo do complemento](UX-PRO-08D-COMPLEMENTO-ESCOPO-ANTES-2026-10-15.md). O levantamento inicial desta sessão foi escrito antes de código e permanece no histórico `0beb1fc`. A branch incorpora a main concorrente e preserva integralmente seu [escopo canônico](UX-PRO-08D-ESCOPO-ANTES-2026-10-15.md), [relatório 08D](UX-PRO-08D-RELATORIO-2026-10-15.md), testes, metadados e capturas. Os IDs D1–D8 daquele relatório não são renumerados aqui.

#230 está CLOSED; #234 permanece aberta/conflitante (financeiro), fora desta fatia. A consulta de proteção da branch retornou 403 por permissão da integração; não é autorização de bypass: exigir todos os checks reportados verdes na PR complementar antes de tentar merge.

## 2. Entrega limitada ao que ainda faltava

A #247 cobriu dia nas quatro larguras, noite em **768px nas quatro rotas staff**, e teclado em 390px. Este complemento acrescenta **somente 12 PNGs noturnos: 320/390/1440px × quatro rotas staff**. Nenhuma repetição das capturas dia, da noite768, do público ou do cliente.

| Superfície | PNGs preservados da main #247 | PNGs novos | Total na pasta |
|---|---:|---:|---:|
| Conhecimento | 9 | 3 | 12 |
| Assistentes | 29 | 6 (Marcelo/RH) | 35 |
| Aparência/prévias | 20 | 3 (painel) | 23 |
| **Total** | **58** | **12** | **70** |

Agora as quatro rotas staff têm captura dia/noite em 320/390/768/1440; os demais estados e os percursos da #247 continuam preservados. Cliente e prévias não têm garantia de tema staff e não foram tematizados artificialmente.

**Proveniência honesta:** a coleta independente havia gerado 64 imagens sobre 8dfbd7e. Só as 12 ainda ausentes foram aproveitadas na PR. A #247 não mudou `src/`, `server.mjs` ou migrações, portanto o código de produto capturado é idêntico. Os resumos registram separadamente base de captura 8dfbd7e e main reconciliada 3d807a4; não fingem captura posterior ao merge. As outras 52 imagens não compõem o diff final da PR. Todos os 58 PNGs da main são preservados byte a byte.

## 3. Instrumentação e limites do teclado

Etapa opt-in `npm run ux:evidence -- --stage=ux-pro-08d`, limitada às 12 combinações faltantes, usando servidor/HTTP reais, PostgreSQL 17 descartável, migrações 001–180, Chromium e sessões staff reais. O coletor preserva todas as entradas/metadados e só substitui suas próprias entradas (`stage=ux-pro-08d`) ao repetir. As outras etapas mantêm seus planos e comportamento.

Sem resposta forjada de produto: nos assistentes há pergunta digitada e enviada por Tab/Enter, HTTP 200, zero fontes e `ollama_used=false`. Preferências reais `seg-color-mode`/`segsystem.admin.appearance.v1`, atributo efetivo e cores computadas registrados; não confundir preferência pública com tema administrativo. Conhecimento espera vazio canônico concluído antes de medir. Galeria compara layout 01 por Enter; nenhum PUT/publicação.

As 12 entradas novas registram `keyboardSteps`, `keyboardActions`, `keyboardProblems` e `theme`. Os PNGs são recortes da viewport no final do percurso, não páginas inteiras nem revisão de todos os estados. Teclado começa no primeiro Tab, sem `.focus()` nem clique de mouse; pausa após Tab evita medir a posição transitória da rolagem suave.

**12 percursos executados e registrados, 7 creditados pelo detector conservador:** conhecimento 1/3, Marcelo 2/3, RH 2/3, aparência 2/3. Cinco não recebem `percursoTeclado`, por limites explícitos do detector (08D-C2 abaixo). Isso não apaga nem invalida os percursos 390 já registrados pela #247 sob seu próprio critério.

Nenhum overflow horizontal do documento, erro local de console, requisição local falha ou HTTP 5xx foi registrado nas novas capturas. Recursos externos de Google Fonts ficaram bloqueados e estão em `externalBlocked`; portanto a tipografia final com rede não foi comprovada. O ERR_ABORTED histórico da 08C já fora tratado pela #247 e não se repetiu neste complemento.

## 4. Lacunas numeradas e destino

| ID | Constatação | Encaminhamento |
|---|---|---|
| **08D-C1** | Noite 320/390/1440 ausente nas quatro rotas staff após #247. | **Medição entregue: 12 capturas** em pastas próprias, teste de unicidade/dimensões/tema/teclado; nenhum código de produto alterado. |
| **08D-C2a** | Conhecimento 390 noite: Tab alcança `knowledge-articles`, painel maior que viewport. Foco medido presente, `fullyVisible=false`. | Limite conservador: região não cabe inteira na captura, não prova de controle inacessível. Traço preservado; sem crédito novo. Eventual instrumentação futura pode distinguir região de controle. |
| **08D-C2b** | Quatro rotas staff 1440 noite: input da busca lateral sem indicador no próprio input. A main já tem `.moduleSearch:focus-within` no ancestral (`AdminChrome.module.css:36`), que o novo detector não mede. | Limite do detector, **não defeito demonstrado da busca**. Quatro traços preservados sem crédito. Não alterar CSS transversal; eventual PR de medição pode avaliar ancestral/oclusão. |
| **08D-C3 / D5 da #247** | Legibilidade do widget RAG staff noturno: amostra de texto herdado `rgb(229,237,247)` sobre fundo fixo Marcelo `rgb(245,243,255)` ou RH `rgb(236,253,245)`, razões **1,08:1 / 1,12:1**. Também envio RH `3,77:1`, já medido na #247. Ex.: `08d-w320-escuro-marcelo.png`. | **Pendência de PR própria do RagWidget**; não reimplementar aqui. Preservar contrato FECH-01, papéis e gates. |
| **08D-C3 / D6 da #247** | Cartões/controles da aparência noturna mantêm fundo claro com texto noturno claro (cartão `1,18:1`, medido pela #247). Novas capturas confirmam o resíduo em outras larguras. | **Pendência de PR própria de aparência**; nenhum ajuste de CSS/publicação nesta PR. |
| **08D-C3 / D7 da #247** | Inline dinâmico Layout09 e foco do atalho público. | Mantidos com justificativa no relatório canônico; fora deste complemento. |
| **08D-C3 / D8 da #247** | E8 aba ativa noturna conhecimento `1,95:1`, E6 main aninhado, demais prévias para UX-PRO-10A. | E2–E9/C11 continuam fora do escopo sem autorização explícita do dono. Não corrigidos por consequência desta medição. |

A contagem histórica **13 PNGs × 12 reais da 08B já foi reconciliada pela #247**: preservada, não “resolvida de novo”. Os resumos recebem 3/6/3 entradas aditivas; o total de assistentes é atualizado de 29 para 35 PNGs, preservando a explicação histórica.

## 5. Inventário, testes e reprodução

Gerador UX-PRO-00 intocado: 100 rotas, 58 com gate e **32 com captura reconhecida**, como na main #247. O complemento não deve reduzir 32 para a medição inicial de 30 desta sessão. O gerador não interpreta tema; o CSV continua conservador sobre noite, com detalhe nas entradas legíveis por máquina.

Validações locais repetidas na main incorporada, com zero falhas/pulados/todo:

| Verificação | Resultado |
|---|---|
| `npm test` | **948/948**, incluindo 5 testes do complemento e `site-appearance.focal` |
| `npm run typecheck` | aprovado |
| `test:ux-knowledge:pg` | **10/10** |
| `test:ai-rag-widget:pg` | **26/26**, mínimo 20; provedor determinístico do gate, não Ollama real |
| `test:ext08-knowledge:pg` | **15/15**, mínimo 15 |
| `test:ext12-visual:pg` | **14/14**, mínimo 14 |
| `site-appearance.focal` + `ux-pro-00-precision` | **9/9** |
| `qa-wave0-static` | **5/5**, ledger 001–180 intacto |
| Inventário `--check` e `git diff --check` | aprovados |

Comparação estrutural com os resumos da main: todas as **9/29/20 entradas e demais metadados** preservados (exceto atualização declarada do total de assistentes). Nenhum PNG anterior alterado no diff da PR.  Os testes de evidência da #247 mantêm TODAS as asserções; só as contagens exatas passam de 9/29/20 para **12/35/23**. Teste adicional confere o recorte de 12, dimensões PNG, tema efetivo, ausência de crédito indevido e preservação dos 29 arquivos anteriores dos assistentes.

Reprodução: `npm ci`, depois `npm run ux:evidence -- --stage=ux-pro-08d`, sem variáveis de banco externo. Neste Linux, sonames do PostgreSQL embutido disponibilizados como nos gates e `LD_LIBRARY_PATH` em `node_modules/@embedded-postgres/linux-x64/native/lib`. Segredos/cookies/senhas ficam só na memória; não versionar logs de ambiente. O êxito do coletor significa medição concluída, não aprovação de todas as observações de acessibilidade.

### CI remoto — registro da primeira rodada da PR #248

A [PR complementar #248](https://github.com/berger33/gruposegsystemseguranca/pull/248) foi aberta apenas após incorporar #247. No head `ece685e`, **41/42 checks SUCCESS** e `ux-ops-postgres-browser` FAILURE ([run 38801890800](https://github.com/berger33/gruposegsystemseguranca/actions/runs/38801890800)). Nenhum merge foi feito com essa falha. O log detalhado não ficou acessível pela rede deste ambiente; as anotações da API só informam exit 1, portanto **a causa não foi estabelecida** e não é correto declarar flake comprovado.

Diagnóstico adicional local no mesmo head: `npm run test:ux-ops:pg` **27/27**, zero falhas/pulados/todo, sem mudar nenhum arquivo de Operação ou seu gate. A reexecução remota por API foi recusada com 403 (`Actions: write` não concedido). Esta atualização documental registra o ocorrido e aciona uma nova rodada normal da CI; nenhum teste/workflow é retirado ou enfraquecido. O estado atual deve ser lido nos checks da #248 e no registro de merge do GitHub. **Só mergear após todos os checks reportados verdes**, sem bypass; se a falha persistir, manter a PR aberta.

## 6. Preservações e próxima subfatia

Nenhuma alteração em código de produto, APIs, migrações, autorização/papéis/grants, vínculos, sessão, idempotência, auditoria ou dados. Conhecimento, RagWidget, assistentes, SitePreviewNotice/noindex/selo e publicação de aparência permanecem intactos. Nenhum layout publicado, nenhum site público alterado.

**Fechamento de medição, com resíduos pendentes — não UX sem defeitos.** Sem validação manual de jornada, aceite humano ou declaração WCAG integral. Ollama real, Windows, leitores de tela, zoom 200%, contraste integral e todos os layouts não são comprovados por este complemento. Homologação/produção **NO-GO**.

Próxima subfatia da fila: **UX-PRO-09A — entradas**, com [prompt pronto](UX-PRO-09A-PROMPT-PROXIMA-SUBFATIA-2026-10-15.md). Os resíduos permanecem separados, nunca embutidos numa PR de entradas. Conferir a PR complementar e o SHA final na main antes da próxima execução.

## 7. Adendo posterior — UX-PRO-08E

A continuidade da família nesta sessão reabriu **somente** os resíduos de produto D5 e D6, que eram explicitamente pendências de PR própria neste fechamento:

- D5 foi corrigido em `RagWidget.tsx` com papéis de cor sobrescritos pelo tema administrativo noturno em `admin-theme.css`. O gate focal agora exige `>= 4,5:1` no rótulo e no envio e preserva os alvos de sugestão `>= 44px`.
- D6 foi corrigido em `AppearanceGallery.module.css` para cartões, opção selecionada, controles, botões, selo, diálogo e textarea no tema noturno; a miniatura/iframe continua clara por representar o site público em comparação.

O adendo não invalida as capturas históricas de 08D nem as reclassifica como posteriores à correção. O relatório da continuidade é [`UX-PRO-08E-CONTRASTE-NOTURNO-2026-10-15.md`](UX-PRO-08E-CONTRASTE-NOTURNO-2026-10-15.md). D7, D8/E6/E8, as demais prévias, aceite humano, homologação e produção continuam pendentes/NO-GO.
