# UX-PRO-08 — fechamento de medição da família (08D, 15/10/2026)

## Situação e limites

**08D concluída como medição/documentação, com resíduos pendentes explícitos; não é certificação de UX sem defeitos.** Escopo escrito antes de código em [UX-PRO-08D-ESCOPO-ANTES-2026-10-15.md](UX-PRO-08D-ESCOPO-ANTES-2026-10-15.md). Nenhuma alteração em código de produto, API, migração, autorização ou publicação. Nenhum aceite humano, homologação, validação manual de jornada ou conformidade WCAG integral. Homologação e produção **NO-GO**.

Base reconfirmada por fetch: `8dfbd7e451787dcf6f56e93b81d8e4edb26ceda5`. PRs #244 (08A, `ab39b6dc`), #245 (08B, `5a02f0e`) e #246 (08C, base acima) MERGED, respectivamente 11/12/41 checks SUCCESS. Os dois checks encontrados no próprio merge commit da main também estavam SUCCESS. Não reabertas. #230 CLOSED. #234 continua aberta/conflitante, fora do escopo. A consulta de proteção da branch retornou 403 por permissão da integração; isso não autoriza bypass: conferir todos os checks reportados na nova PR e não mergear com pendente/falha.

## Entrega pequena e aditiva

- Etapa opt-in `ux-pro-08d` no capturador existente + módulo de medição; demais etapas mantêm seus planos e padrão de escrita.
- Captura em Chromium com PostgreSQL 17 efêmero, migrações 001–180 e sessões emitidas por login real. Credenciais/cookies ficam apenas na memória. Sem mock de respostas de produto; assistentes fazem pergunta real sobre base vazia, HTTP 200, zero fontes e `ollama_used=false`.
- Preferências reais `seg-color-mode` e `segsystem.admin.appearance.v1`, com `data-color-mode`/`data-admin-theme` e cores computadas registrados; não confundir a preferência pública com o tema administrativo.
- Percurso começa no primeiro Tab, sem `.focus()` nem clique de mouse. Tab/Shift+Tab até controles da superfície; conhecimento exercita ArrowRight/End/Home, assistentes digitam/enviam por Tab/Enter, galeria compara layout 01 por Enter, prévias percorrem os dois links sem navegar. Nenhum PUT de publicação é feito.
- Resumos antigos/metadados e PNGs A/B/C preservados; novas entradas têm `stage=ux-pro-08d`. A segunda execução substitui somente entradas e PNGs 08D, não soma capturas duplicadas.
- Teste novo verifica matriz, unicidade, dimensões PNG, tema real, consistência de crédito de teclado e contagem histórica 08B; incluído em `npm test`.

## Cobertura depois — evidências nas pastas próprias

Todas as linhas abaixo possuem **320×780, 390×844, 768×1024 e 1440×900, cada uma em claro e escuro**. Os PNGs são recortes da viewport no ponto final do percurso (não imagens da página inteira); não comprovam todos os estados nem elementos abaixo da dobra.

| Superfície/rota | PNGs novos | Percursos executados/registrados | Percursos creditados pelo critério conservador |
|---|---:|---:|---:|
| `/admin/conhecimento` | 8 | 8 | 4 |
| `/admin/marcelo/assistente` | 8 | 8 | 6 |
| `/admin/rh/assistente` | 8 | 8 | 6 |
| `/cliente/app/assistente` | 8 | 8 | 8 |
| `/admin/aparencia` | 8 | 8 | 6 |
| `/layout-preview?visual=03` | 8 | 8 | 8 |
| `/layout-03` | 8 | 8 | 8 |
| `/layout-preview?visual=99` | 8 | 8 | 8 |
| **Total** | **64** | **64** | **54** |

Pastas: `docs/ux-pro-08-conhecimento-evidencias` (3 históricas + 8 novas), `docs/ux-pro-08-assistentes-evidencias` (12 históricas + 24 novas), `docs/ux-pro-08-aparencia-evidencias` (16 históricas + 32 novas). Total dessas pastas: **95 PNGs**, não 96. O histórico adicional `ux-07-conhecimento-evidencias` não é alterado.

Cada `resumo.json` registra `theme`, `keyboardSteps` (alvo, indicador, geometria), `keyboardActions`, `keyboardProblems`, problemas de página e bloqueios externos. Só recebe `percursoTeclado` se TODOS os alvos forem integralmente visíveis e tiverem indicador computado no próprio elemento. Os dez percursos não creditados não foram apagados nem tratados como sucesso: veja D9/D10. Isso não significa dez defeitos de produto.

**Resultado técnico das 64 capturas:** nenhum overflow horizontal do documento, erro de console local, requisição local falha ou HTTP 5xx registrado. Os recursos externos de fonte foram bloqueados pelo ambiente; são registrados à parte, não omitidos. Na aparência, o iframe pode ter rolagem interna intencional. O ERR_ABORTED histórico da 08C não se repetiu; não houve correção de produto para isso.

## Lacunas numeradas: resolvidas e pendentes

| ID | Medição/reprodução e evidência | Destino |
|---|---|---|
| **D1** | Conhecimento: matriz 8/8, vazio canônico concluído, tablist e teclado. Estados malformado/desatualizado/negado da 08A preservados. | Medição entregue; não alegar matriz de todos os estados. |
| **D2** | Assistentes Marcelo/RH/cliente: 24/24; 320/768 agora presentes, além de 390/1440; pergunta sem fonte via API real. Estados com fonte/ocupado/falha/negado continuam nas evidências históricas e gate. | Medição entregue. Público não foi reimplementado nem recapturado nesta fatia privada. |
| **D3** | 08B dizia 13 PNGs, mas lista conferida contém 12. `reconciliacao08d` conserva a declaração original e lista os 12 arquivos reais. | Corrigida apenas a contagem documental, inclusive relatório 08B. Nenhum 13º arquivo fabricado. |
| **D4** | Aparência/prévias: 32/32 novas, dia/noite e percurso explícitos; comparação não publica. | Medição entregue no mesmo recorte de quatro rotas da 08C. Não representa avaliação visual integral dos dez layouts. |
| **D5** | ERR_ABORTED do iframe em 320 na 08C: zero requisições locais falhas na nova matriz. | Não reproduzido; histórico preservado, nenhuma correção presumida. |
| **D6** | Inventário regenerado pelo gerador intacto: 100 rotas, 58 com gate, **27 → 30 com captura reconhecida** (três assistentes). Conhecimento ganha 320/768; teclado é creditado só onde o contrato existente aceita. | Resolvida a atualização. O gerador não interpreta tema e não normaliza query strings: o CSV ainda diz “noite não comprovado”; o detalhe verificável está nos resumos 08D, sem alargar artificialmente o critério. |
| **D7** | **Baixa legibilidade do widget RAG staff noturno**. Ex.: `08d-w320-escuro-marcelo.png` e `08d-w1440-escuro-rh.png`. Root night, texto herdado `rgb(229,237,247)` sobre fundo fixo Marcelo `rgb(245,243,255)` ou RH `rgb(236,253,245)`. Razão calculada dessas amostras opacas: **1,08:1 / 1,12:1**; não é auditoria de todos os textos/estados. | **Pendência de PR própria do RagWidget**, com medição de rótulo/escopo/status, tokens e estados nas duas áreas; preservar contrato FECH-01, papéis e gates. Nenhum ajuste nesta PR. |
| **D8** | Conhecimento noturno: aba ativa com texto claro sobre azul claro, visível em `08d-w320-escuro-conhecimento.png`. Cor e classe vêm do compartilhado `UiWorkspace`. | Vinculada ao **E8** já registrado; exige autorização explícita do dono. Não corrigida, não reclassificada como autorização. |
| **D9** | Conhecimento 390, nos dois temas: último Tab chega ao `knowledge-articles`, painel maior que a viewport; foco computado presente, mas `fullyVisible=false`. | **Limite conservador da medição**, não prova de controle inacessível: região não cabe inteira em uma captura. Preservar traço; eventual PR de instrumentação pode distinguir regiões de controles, sem alterar produto. |
| **D10** | Nas quatro rotas staff em 1440, ambos os temas, busca lateral registra `focusVisible=false` no input (8 percursos). `AdminChrome.module.css:36` já aplica contorno ao ancestral `.moduleSearch:focus-within`; o capturador mede apenas o elemento. | **Limite do detector, não defeito demonstrado da busca**. Não corrigir CSS transversal. Futuro ajuste isolado pode medir ancestral/oclusão e recapturar antes de creditar esses percursos. |
| **D11** | Cliente e prévias foram medidos nas duas preferências, mas as superfícies amostradas mantêm suas cores; não estão no escopo de tema staff. | Característica/limite registrado, não garantia de modo noturno integral do portal/site. Ampliar tema exige escopo próprio; não aplicar CSS público por consequência. |
| **D12** | Google Fonts sem saída de rede: 16/48/116 eventos externos nas três pastas (podem incluir requisição + console para o mesmo recurso). | Limitação do sandbox/fonte substituta; não prova de tipografia final em ambiente com rede. Não vendorizar nem trocar fonte nesta PR. |

## Validação local

| Verificação | Resultado |
|---|---|
| `npm test` | **947/947**, zero falhas/pulados/todo; inclui `site-appearance.focal` e 5 testes da nova matriz |
| `npm run typecheck` | aprovado |
| `npm run test:ux-knowledge:pg` | **9/9**, PostgreSQL + HTTP + Chromium |
| `npm run test:ai-rag-widget:pg` | **25/25**, mínimo 20; provedor determinístico do gate, não Ollama real |
| `npm run test:ext08-knowledge:pg` | **15/15**, mínimo 15 |
| `npm run test:ext12-visual:pg` | **14/14**, mínimo 14 |
| `node --test tests/site-appearance.focal.test.mjs tests/ux-pro-00-precision.test.mjs` | **9/9** |
| `node scripts/qa-wave0-static.mjs` | **5/5**, ledger 001–180 intacto |
| `node scripts/ux-pro-00-inventory.mjs --check` | aprovado após regeneração |
| `git diff --check` | aprovado |

Reprodução da coleta: `npm ci`, depois `npm run ux:evidence -- --stage=ux-pro-08d`, sem DATABASE_URL/DATABASE_MIGRATION_URL/RUN_DATABASE_INTEGRATION_REMOTE. Neste Linux foi necessário disponibilizar os sonames do PostgreSQL embutido como nos gates existentes e passar `LD_LIBRARY_PATH` apontando para `node_modules/@embedded-postgres/linux-x64/native/lib`; isso não é configuração de produto. Não registrar senhas/URLs de banco nos artefatos.

O êxito do coletor significa que a medição terminou, não que todas as observações de acessibilidade passaram. `keyboardProblems` e a ausência de crédito conservador continuam visíveis e testados.

## Preservação e continuidade

Intactos rotas, dados, papéis/grants, vínculos de conta, sessão, APIs, idempotência, auditoria, migrações e funcionalidades das três áreas. Nenhuma reimplementação das 08A/B/C, nenhum layout publicado, nenhum site público alterado. E2–E9/C11 não tratados. RAG real/Ollama, Windows, leitores de tela, zoom 200%, contraste integral, todos os dez layouts e aceite dos usuários continuam não comprovados por esta fatia.

Próxima subfatia da fila: **UX-PRO-09A — entradas**, com [prompt pronto](UX-PRO-09A-PROMPT-PROXIMA-SUBFATIA-2026-10-15.md). Os resíduos acima permanecem pendências separadas, não devem ser embutidos na PR de entradas. O estado final da PR 08D e o SHA de merge devem ser confirmados no GitHub/na main remota antes da próxima execução.
