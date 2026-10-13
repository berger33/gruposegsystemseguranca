# UX-PRO-06 — estados honestos e tema noturno de `/admin/comercial`

**Base:** `main` `267fb55f183ec6ec1252d2d920c4627d5d7f5b12` (merge da PR #213, conferido por `git fetch` antes de editar).
**Escopo registrado antes de tocar em tela:** [`UX-PRO-06-COMERCIAL-ESCOPO-2026-10-13.md`](UX-PRO-06-COMERCIAL-ESCOPO-2026-10-13.md) (commit `dae8d66`).
**Superfície desta PR:** a tela `/admin/comercial` — "Vistoria, orçamento, proposta e contrato" — pela casca em etapas e pelo bloco "Histórico de versões comerciais". Não é a conclusão de UX-PRO-06.

**Fora desta PR, deliberadamente:** `/admin/contratos` (próxima candidata), `/admin/clientes`, o portal `/cliente/app/*`, `/admin/crm`, `/admin/leads`, `/admin/carteira` (já entregues), os componentes de domínio `src/app/admin/ti/*` (compartilhados com `/admin/ti`), `UiWorkspace.module.css` (32 consumidores) e todas as APIs, papéis e permissões.

## Antes (medido em `267fb55`, checkout descartável limpo)

Suíte nova do gate `test:ux-crm:pg` (11 casos) rodada contra a `main`, sem nenhuma edição de tela: **6 passaram e 5 falharam**. Os seis que passaram são **preservações** medidas, não defeitos.

| # | Caso | Resultado na `main` | Evidência |
|---|---|---|---|
| 1 | API do histórico: sessão, papel, identificador | passa | contrato preservado |
| 2 | Matriz de papéis das leituras das etapas | passa | [`antes/matriz-papeis-leituras.json`](ux-pro-06-comercial-evidencias/antes/matriz-papeis-leituras.json) |
| 3 | Oito etapas por teclado e foco visível | passa | — |
| 4 | Sem transbordo em 320/390/768/1440 px, nas 8 etapas | passa | [`antes/transbordo-por-etapa.json`](ux-pro-06-comercial-evidencias/antes/transbordo-por-etapa.json) |
| 5 | Histórico: "sem versões" explícito e identificador inválido sem código cru | **falha** — resultado vazio não mostra nada (`text=/nenhuma versão/i` nunca aparece) | timeout |
| 6 | Falha após leitura concluída: mantém a versão, avisa com hora, repete | **falha** — não existe aviso `desatualizado` nem repetição | timeout |
| 7 | Consulta em curso: estado de espera e botão bloqueado | **falha** — nenhum `role="status"` durante a consulta | timeout |
| 8 | Papel `comercial`: negativa em linguagem clara | **falha** — aparece o código cru `role_required` | asserção |
| 9 | Tema noturno: contraste do texto ≥ 4,5:1 | **falha** — etapa ativa a **1,95:1** | [`antes/contraste-noturno.json`](ux-pro-06-comercial-evidencias/antes/contraste-noturno.json) |
| 10 | Gate administrativo barra papel `rh` | passa | `data-admin-gate="forbidden"` |

**Causas verificadas no código:**

- `CommercialHistory.tsx` só tinha `setRows(b.items)` no sucesso. Sem estado vazio, sem consulta em curso, sem hora da última leitura, e o erro exibia `e.message` bruto (`invalid_entity`, `role_required`).
- No tema noturno, `--ux-color-brand` vira `#92bdf2` (azul claro), mas `.tabActive` (módulo compartilhado) mantém `color: #fff`. Resultado: 1,95:1. Os demais textos medidos ficaram entre 7,96:1 e 12,92:1.

## Depois

Na branch, **os 11 casos passam** (suíte completa do gate; ver checks abaixo).

- **Histórico com estados distintos.** Vazio vira `role="status"` ("Nenhuma versão encontrada…", com a hora da consulta). Identificador recusado vira `role="alert"` com instrução ("Confira o identificador… no formato UUID"), sem `invalid_entity`. Falha de rede ou de servidor, *depois de leitura concluída*, mantém a última versão, mostra `role="alert"` com `data-testid="historico-desatualizado"`, a hora da última leitura concluída, a frase "isso não significa que o registro esteja sem versões" e o botão **Tentar novamente**. Ao repetir com sucesso, aparece `role="status"` ("Histórico atualizado às HH:MM") e o aviso sai.
- **Consulta em curso.** `role="status"` ("Consultando o histórico de versões…") e botão com `disabled` + `aria-busy`; o rótulo do botão não muda.
- **Negativa fail-closed.** Para 401/403 (`role_required`, `session_required`), a tela troca o texto por uma frase de papel, **descarta** qualquer resultado anterior e não oferece repetir. Identificador inválido também descarta o resultado anterior, porque não corresponde mais à consulta exibida.
- **Tema noturno.** O texto da etapa ativa usa `--ux-color-canvas` apenas no tema noturno desta rota: **1,95:1 → 8,87:1** (medido na evidência final). Demais medições: título da etapa 12,92:1; dica 7,96:1.
- **Estilos.** O bloco do histórico passou de `style` inline para `Comercial.module.css` (tokens `--ux-*`; nenhum valor de cor fixo). `UiWorkspace.module.css` **não foi alterado**.

Preservado sem alteração: as 8 etapas, rótulos, perguntas e "próximo passo"; os componentes montados por etapa; `aria-pressed`; os links para CRM, leads, carteira e contratos; a consulta `GET /api/crm/commercial-versions` (mesmo endpoint, parâmetros, tipos e campos exibidos; campos ocultos iguais); o `AdminGate` com `comercial | marcelo | admin | ti`.

## Evidência própria

Pasta [`ux-pro-06-comercial-evidencias/`](ux-pro-06-comercial-evidencias/):

- `depois/resumo.json` — formato lido pelo inventário (`entries[]`): 16 capturas (320, 390, 768, 1440 px × dia/noite × Vistoria/Relatórios) + `390-dia-teclado.png` com o percurso de Tab e o Enter. **Nenhum transbordo de documento em nenhuma captura.**
- `depois/` — capturas e medições da execução final (contraste, matriz, transbordo, histórico em curso, desatualizado, negado, identificador).
- `antes/` — mesmas medições, produzidas pelo mesmo teste em `267fb55`. Não são evidência vigente (`antes/antes-medicoes-sem-entries.json` não é lido pelo gerador).

Massa 100% sintética (biblioteca comercial criada pela API; papéis `marcelo` e `comercial` provisionados pelo gate). Sem credencial, dado pessoal ou URL efêmera.

## Matriz de papéis (achado para decisão do proprietário)

Medida nas leituras das etapas, com papéis `comercial` e `marcelo`: **todas** as leituras de `/api/crm/*` e `/api/catalog` retornam 200 para `comercial`, **exceto o histórico de versões**, que a API restringe a `admin | marcelo | ti` (`authorize` com papéis padrão em `src/server/publication-core.mjs`). Como `/admin/comercial` libera o papel `comercial`, esse papel vê a etapa, mas recebe 403 no histórico.

- **Esta PR não altera esse controle.** Mudar a permissão do histórico é decisão de autorização do proprietário, fora do pedido. A tela agora explica a restrição em linguagem clara (caso 8).
- **Decisão pendente:** (a) manter o histórico restrito a Marcelo/admin/TI, ou (b) liberar `comercial` na API. A opção (b) exige mudança de permissão explícita e teste próprio do isolamento.

## Preservações e escopo técnico

- Nenhuma rota, método, payload, cabeçalho, papel do `AdminGate`, permissão, transição, auditoria ou regra de negócio foi alterada. Nenhuma migração foi criada; nenhum dado é gravado pela tela de histórico.
- `ComercialWorkspace.tsx` teve uma única mudança: a classe local `etapaAtiva` no botão da etapa ativa.
- `next-env.d.ts` e `tsconfig.json` conferidos por hash (`18b697c4…` e `2128c956…`) após os gates; o `npm run build` alterou `next-env.d.ts` numa execução e o arquivo foi restaurado do Git.
- Inventário: o par de CSVs de 13/10 foi regenerado pelo próprio gerador. Conferência por coluna: **somente a linha `/admin/comercial` mudou** (colunas de captura e de responsividade/evidência/lacuna).

## Verificações

| Check | Resultado |
|---|---|
| `npm run typecheck` | aprovado (EXIT 0) |
| `npm test` | **933/933**, 0 pulados |
| `npm run build` | aprovado (EXIT 0) |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK |
| `npm run test:ux-crm:pg` | **37/37**, 0 pulados (inclui os 11 casos novos) |
| `npm run test:l04-delivery:pg` | **20/20** na execução final (ver nota) |
| `next-env.d.ts` / `tsconfig.json` | restaurados; hashes conferidos |

**Nota sobre o L04 (intermitência observada, não resolvida por esta PR).** Execuções na branch: 19/20 (1 falha), 20/20, 20/20. Na `main`: 20/20. Numa execução o L04 teve **1 falha em CRM-07** (`strict mode violation`: o seletor `getByText('aceita. Somente o delegado altera a situação.')` achou dois elementos, "Delegada a qa-staff-comercial…"). A mesma falha **não se reproduziu** nas duas reexecuções seguintes da branch nem na execução em `267fb55`. CRM-07 testa tarefas delegadas em `/admin/crm`, e esta PR não altera esses arquivos. A origem é provavelmente uma condição de corrida no próprio teste (dois itens de delegação visíveis ao mesmo tempo), mas **isso não foi demonstrado**. Registrado como limitação; se o CI do GitHub reproduzir a falha, a PR não é mesclada.

## Limitações

- **Componentes de domínio das etapas não foram tratados.** `src/app/admin/ti/*` é compartilhado com `/admin/ti`. Por leitura de código (não medido pelo gate), há dois casos em que a falha de leitura apaga o conteúdo já carregado: `CatalogClient` (`setServices([])`) e `ReportClient` (`setReports(null)`). Corrigir exige decisão sobre `/admin/ti`.
- **Contraste dentro dos componentes de domínio não medido.** Na captura noturna, o bloco "CRM-25 — Metas e comissões" mantém texto cinza de baixo contraste sobre fundo escuro, na etapa Relatórios. Não foi medido por contraste e não foi alterado.
- **Teclado** foi exercitado no percurso das etapas e do histórico; não foi exercitado o interior dos formulários de domínio das etapas.
- **Tema noturno e 320/390/768 px** foram medidos pela casca e pelo histórico; a varredura dos componentes de domínio é lacuna declarada.
- Os testes rodam em Chromium automatizado com massa sintética. **Não são validação manual nem aceite** de Marcelo, Andreia ou comercial; nenhum aceite foi registrado.
- Não há validação em Windows, em HTTPS hospedado ou no banco do operador.
- Os CSVs de inventário de 10/10 permanecem como registro histórico.
