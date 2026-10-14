# UX-PRO-06 — estados de releitura do detalhe do contrato (`/admin/contratos/[id]`)

**Base:** `main` `f066768dec841bf6f1e2cb6ce54c96cab1044b4f` (merge da PR #216; a ponta esperada no pedido, `267fb55` da PR #213, já havia sido sucedida por #214 e #216 — ver §0 do documento de escopo).
**Escopo registrado antes de tocar em tela:** [`UX-PRO-06-CONTRATO-DETALHE-ESCOPO-2026-10-14.md`](UX-PRO-06-CONTRATO-DETALHE-ESCOPO-2026-10-14.md) (commit isolado `0056d6b`, anterior à implementação).
**Superfície desta PR:** a tela `/admin/contratos/[id]` — ciclo de vida, composição, alertas, obrigações, implantação, fiscalização, diário e encerramento — e um módulo CSS local novo. **Não é a conclusão de UX-PRO-06.**

**Fora desta PR, deliberadamente:** `/admin/contratos` (lista, entregue na #216), `/admin/comercial` (#214), `/admin/crm` (#212), `/admin/leads` (#210/#211), `/admin/carteira` (#213) — nenhuma reaberta; `/admin/clientes`; o portal `/cliente/app/*`; `UiWorkspace.module.css` (compartilhado, **não alterado**); `contract-request.ts` e `contract-vocabulary.mjs` (compartilhados com a lista e com as APIs, **não alterados**); APIs, papéis, permissões, auditoria, idempotência, transições de ciclo de vida e migrações. A PR #215 (aberta, conflitante e obsoleta) **não** é tocada aqui.

## Antes (medido em `f066768`, worktree descartável limpo, só com o arquivo de teste novo)

A suíte nova do gate (`UX_CONTRACT_TEST_PATTERN='UX-PRO-06 detalhe'`, 4 casos) rodada contra a `main`, **sem nenhuma edição de tela**: **2 falharam (defeitos) e 2 passaram (preservações)**. Medições em [`antes/antes-medicoes.json`](ux-pro-06-contrato-detalhe-evidencias/antes/antes-medicoes.json).

| Caso | Resultado na `main` | Evidência |
|---|---|---|
| Falha na releitura preserva o que já foi lido, com hora e repetição | **falha** | timeout de 30 s esperando `contract-alerts-desatualizada`: `ler()` aplicava `dado: null` e o caminho de falha apagava as regras já lidas |
| Releitura em curso mantém o conteúdo visível com `role="status"` | **falha** | timeout de 30 s esperando `contract-detail-atualizando`: `carregando` substituía o conteúdo pelo bloco em tela cheia, e `lendoCabecalho = detalhe.carregando` fazia o `<h1>` sumir |
| Negativa na releitura falha fechada, sem dado nem repetição | passa | preservação que a correção precisava manter |
| 320/390/768/1440 dia e noite sem transbordo, com percurso de teclado | passa | preservação de layout, tema e foco |

O mesmo defeito já havia sido corrigido no funil (#212), na carteira (#213), no comercial (#214) e na lista de contratos (#216); o detalhe era a tela da família que ficou com o comportamento antigo.

## Depois

Na branch, a suíte completa do gate passa **16/16** (12 pré-existentes + 4 novos).

- **Falha na releitura preserva o que já foi lido**, nas oito leituras: faixa `role="alert"` (`data-testid="*-desatualizada"`) com o motivo real, a hora da última leitura concluída (relógio do navegador no instante do sucesso; nada estimado nem gravado), a declaração de que os dados podem estar desatualizados sem significar que a tela esteja vazia e o botão "Tentar novamente" quando o erro permite repetição. Ao repetir com sucesso, a faixa sai e a lista é a leitura nova.
- **Releitura em curso mantém o conteúdo visível** com indicador `role="status"` (`data-testid="*-atualizando"`). O bloco de carregamento em tela cheia continua existindo **apenas** enquanto não houve nenhuma leitura concluída.
- **O cabeçalho deixa de sumir.** O `<h1>` e a vigência permanecem na tela durante a releitura e durante a falha transitória; antes, `lendoCabecalho = detalhe.carregando` trocava o cabeçalho inteiro pelo bloco "Lendo o contrato…" a cada releitura.
- **Autorização continua falhando fechada**: falha `denied`/`auth` depois de uma leitura concluída descarta o dado, substitui o conteúdo pelo estado negado completo e **não** oferece repetir a mesma chamada (caso exercitado em navegador, depois de leitura concluída, com a independência das outras leituras conferida em seguida).
- **A aba Composição não mostra zero não medido.** Sem leitura concluída o painel declara o estado honesto em vez de exibir "Itens 0 / Unidades 0 / Responsáveis 0" — um zero que não havia sido apurado (defeito D5 do escopo).
- **Estilos**: as duas classes novas vivem em `DetalheContrato.module.css`, local da pasta da rota, com os mesmos tokens de aviso da lista/carteira/funil. `UiWorkspace.module.css` não foi alterado e nenhum `style` inline foi criado.
- **O layout em repouso não mudou.** As capturas de 1440/320/390/768 px em dia, 768 px à noite, do percurso de teclado e do estado negado são **byte a byte idênticas** às medidas na `main` sem a correção (SHA-256 conferido par a par) — a mudança é invisível quando nada está carregando nem falhando.

**Preservado sem alteração:** `AdminGate` (`marcelo | admin | comercial`); as oito URLs de leitura e as doze escritas, com métodos, corpos e cabeçalhos; a independência das oito leituras (`Promise.allSettled`); os `data-testid` herdados (incluindo os oito `*-error`); o `tablist` das seis abas com roving tabindex e ←/→/Home/End; o vocabulário em português com o código canônico só no rodapé; o aviso de gravação e o alerta de falha de escrita; e os títulos exigidos pelo gate herdado L05.

## Evidência própria

Pasta [`ux-pro-06-contrato-detalhe-evidencias/`](ux-pro-06-contrato-detalhe-evidencias/): `resumo.json` (formato do inventário) com 9 entradas — 320/390/768/1440 px em dia, 768 px à noite (pelo controle real do envelope), percurso de teclado em 390 px até a aba do contrato com foco visível medido, a faixa de dados preservados no cabeçalho e nas regras de alerta (1440 px) e o estado negado. **Nenhum transbordo de documento em nenhuma largura.** Massa 100% sintética; sem credencial, dado pessoal ou URL efêmera. Isto **não** é aceite humano.

A subpasta [`antes/`](ux-pro-06-contrato-detalhe-evidencias/antes/) guarda as capturas e medições da `main` **sem** a correção, fora do `resumo.json` vigente de propósito: documentam o defeito corrigido, não a evidência vigente.

## Verificações

| Check | Resultado |
|---|---|
| `npm run typecheck` | aprovado |
| `npm test` | **933/933**, 0 pulados |
| `npm run build` | aprovado; `/admin/contratos/[id]` presente na lista de rotas |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK |
| `npm run test:ux-contract:pg` | **16/16**, 0 pulados (12 pré-existentes + 4 novos) |
| `npm run test:l05-delivery:pg` | **1/1** |
| `npm run test:l04-delivery:pg` | não aplicável: conferido por busca, o teste L04 não referencia a UI de contratos |
| `next-env.d.ts` / `tsconfig.json` | baseline conferido por SHA-256 após **cada** execução; o `next build` alterou `next-env.d.ts` e o arquivo foi restaurado do Git (hash final `18b697c4…` / `2128c956…`) |
| CSVs do inventário | regenerados pelo próprio gerador; conferência **por linha** mostra que **somente `/admin/contratos/[id]`** mudou (3 células no inventário, 5 na matriz) |
| Worktree descartável | removido ao fim da sessão |

## Limitações

- A faixa usa o relógio do navegador no instante do sucesso da leitura; não há servidor de tempo nem campo novo em banco.
- Enquanto a faixa está visível, o conteúdo mostrado é o da última leitura concluída — a faixa diz isso, e repetir a consulta atualiza de verdade.
- A aba **Composição** compartilha o recurso do cabeçalho e não repete a faixa: o aviso aparece uma única vez, acima das abas, onde está sempre visível. As outras sete leituras têm faixa própria dentro do painel correspondente.
- O gate exercita a faixa em navegador com itens reais para **detalhe** (cabeçalho/composição) e **alertas**; para as outras seis leituras a mesma função (`Painel`) é exercitada pela falha inicial, que os testes pré-existentes cobrem. Declarado, não escondido.
- O texto estático da matriz ("tema noturno sem captura; estados nao exercitados em navegador") é fixo do gerador e não interpreta o `resumo.json`; as capturas e os estados desta fatia existem e estão registradas, como nas fatias anteriores.
- Chromium automatizado com massa sintética **não é validação manual nem aceite** de Marcelo, Andreia ou comercial. Sem Windows, HTTPS hospedado ou banco do operador.
- A PR #215 (aberta, conflitante com a `main`, com todos os checks verdes mas obsoleta desde a #216) permanece intocada; a decisão sobre ela é do proprietário.
