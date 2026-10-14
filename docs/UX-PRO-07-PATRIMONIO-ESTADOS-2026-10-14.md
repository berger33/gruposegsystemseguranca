# UX-PRO-07A — estados honestos de patrimônio e almoxarifado

**Data:** 14/10/2026

**Base:** `ad8c6b4127850a3ee30f657ce28ff504d1ccd52b` (`origin/main`, merge da PR #221).

**Escopo registrado antes de editar a tela:** [`UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`](UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md), commit isolado `6d932fd`.

## 1. Resultado da fatia

A UX-PRO-07A ficou restrita a `/admin/patrimonio` e às seis leituras já existentes. Não mudou URL, método, corpo, migração, escrita, papel do `AdminGate`, autorização do servidor nem regra de estoque/manutenção.

A tela agora diferencia:

- leitura inicial, com mensagem específica da aba e sem vazio prematuro;
- vazio depois de resposta válida, com causa e próximo passo;
- falha inicial transitória, com o código real e `Tentar novamente`;
- releitura em curso, preservando o conteúdo já lido e declarando que ele ainda é da leitura anterior;
- falha transitória de releitura, com faixa `role="alert"`, hora da última leitura concluída, código real, dado preservado marcado como possivelmente desatualizado e repetição;
- autenticação/negativa depois de sucesso, falhando fechado: o dado anterior sai e a mesma chamada não recebe convite de repetição;
- sucesso, com hora da leitura e quantidade real em `caption`.

As abas passaram a `tablist`/`tab`/`tabpanel`, roving tabindex e setas, Home e End. As seis tabelas preservam as colunas anteriores, acrescentam rótulos textuais de situação/prioridade e continuam com rolagem interna por teclado em largura estreita. Os valores canônicos desconhecidos continuam visíveis, apenas com `_` convertido em espaço; a tela não inventa um significado.

Não há escrita ou ação principal de domínio em `PatrimonioWorkspace`; o único botão operacional desta fatia é `Atualizar dados`, desabilitado enquanto a leitura da aba está em curso.

## 2. Medição anterior e posterior do gate focal

O gate novo foi escrito antes da tela e executado contra a implementação anterior. Resultado registrado em [`antes/antes-medicoes.json`](ux-pro-07-patrimonio-evidencias/antes/antes-medicoes.json):

| Momento | Resultado | Interpretação |
| --- | --- | --- |
| Antes da tela | **1/7 passou; 6/7 falharam**, exit 1 | Só a autorização das seis APIs já estava preservada; não existiam estados/seletores semânticos, repetição, preservação, tablist ou superfície mensurável. |
| Depois | **7/7 passaram; 0 falharam**, exit 0 | PostgreSQL descartável, HTTP real e Chromium; falhas injetadas somente em `window.fetch` da página. |

A execução anterior usou timeout de 5 s somente para registrar defeitos conhecidos sem esperar seis vezes o timeout normal. A entrega usa 45 s. O servidor nunca foi alterado ou enfraquecido pelo gate.

## 3. Antes/depois por lacuna registrada

| ID | Antes no SHA-base | Depois nesta fatia |
| --- | --- | --- |
| A1 — vazio antes da leitura | `PatrimonioWorkspace.tsx:73-83`, `:162-171`: arrays vazios e `loading=false` permitiam “Nenhum produto” antes do efeito. | `PatrimonioWorkspace.tsx:81-91`, `:226-279`, `:361-369`: cada recurso começa em `idle`, apresentado como leitura contextual; vazio só existe em `ready` (`:402-406`). |
| A2 — seis recursos em um estado global | `PatrimonioWorkspace.tsx:72-124`: um `loading` e um `error` atendiam seis endpoints. | `PatrimonioWorkspace.tsx:226-275`: mapa por aba, contador de requisição por recurso e descarte de resposta superada; cada aba preserva seu próprio dado/hora/falha. |
| A3 — `Erro: HTTP n`, sem repetição | `PatrimonioWorkspace.tsx:86-124`, `:163`. | `src/lib/asset-request.ts:22-116` classifica rede/401/403/5xx e resposta inválida sem mudar o contrato; `PatrimonioWorkspace.tsx:371-380` apresenta `UiState` e repetição somente quando segura. |
| A4 — releitura escondia dado anterior | `PatrimonioWorkspace.tsx:73-80`, `:165`, `:205`, `:245`, `:285`, `:331`, `:369`. | `PatrimonioWorkspace.tsx:238-262` preserva `ready` em falha transitória e falha fechado em auth/denied; `:384-401` declara atualização/desatualização, hora e repetição sem esconder tabela. |
| A5 — vazio sem causa/próximo passo | `PatrimonioWorkspace.tsx:171`, `:211`, `:251`, `:291`, `:337`, `:378`. | Configuração das seis abas em `PatrimonioWorkspace.tsx:104-181` e `UiState empty` em `:402-405`: cada vazio declara consulta concluída, ausência apenas no recorte e quando atualizar. |
| A6 — botões sem semântica/percurso de abas | `PatrimonioWorkspace.tsx:138-159`. | Teclado em `PatrimonioWorkspace.tsx:281-298`; papéis, estados, controles e roving tabindex em `:312-338`. |
| A7 — cores locais fixas e noite não medida | Classes `text-gray-*`, `bg-white`, `bg-gray-*`, `text-red-*` e `border-blue-*` em `PatrimonioWorkspace.tsx:131-415`. | A superfície usa `UiWorkspace.module.css`, `UiState`, `UiBadge`, `UiTableScroll` e tokens (`PatrimonioWorkspace.tsx:3-14`, `:303-420`); contraste noturno e da faixa foram medidos no Chromium. |
| A8 — gate herdado não exercitava estados | `tests/l06-delivery.integration.test.mjs:1558-1598`, `:1915-1942` verificava título, dados e cliques. | O arquivo herdado não foi alterado e continua 9/9. O gate aditivo está em `tests/ux-asset-workspace.integration.test.mjs:290-512`, executado por `scripts/qa-ux-asset-postgres.mjs` e `.github/workflows/ux-asset-delivery.yml`. |

## 4. Provas do gate novo

`npm run test:ux-asset:pg` cobre sete casos:

1. anônimo recebe 401 e `comercial` recebe 403 nas seis leituras; a negativa não vaza `items`; `admin` recebe 200;
2. carregamento inicial específico e vazio concluído de reservas não se confundem;
3. falha inicial 503 mostra causa/código e `Tentar novamente` realmente emite outra leitura;
4. falha de releitura preserva o produto antigo e a hora; um produto criado pela API durante a falha não aparece no recorte preservado e só entra depois da repetição bem-sucedida;
5. 403 depois de sucesso remove a tabela, não vira faixa desatualizada e não oferece repetição;
6. seis abas, exatamente um `tabindex=0`, um painel ativo e setas/Home/End;
7. 320/390/768/1440 px, tema noite pelo controle real, alvos e percurso de teclado.

As asserções existentes de L06 não foram removidas, alteradas nem relaxadas.

## 5. Evidências visuais e medições

A pasta [`ux-pro-07-patrimonio-evidencias/`](ux-pro-07-patrimonio-evidencias/) contém oito entradas vigentes no [`resumo.json`](ux-pro-07-patrimonio-evidencias/resumo.json), todas com `problems: []`:

- repouso em 1440×900, 768×1024, 390×844 e 320×844 no tema dia;
- 768×1024 no tema noite;
- percurso por Tab em 390×844 (`firstFocus: true`; `Sair` → `Início` → `patrimonio-tab-produtos`);
- falha inicial em 1440×900;
- releitura falha com dado preservado em 1440×900.

Medições produzidas pelo navegador:

| Medição | Resultado |
| --- | --- |
| Overflow do documento em 320/390/768/1440 | **0 px** |
| Menor altura das seis abas nas quatro larguras | **44 px** |
| Contraste do título no tema noite | **12,92:1** |
| Contraste de texto da tabela no tema noite | **12,92:1** |
| Contraste da faixa de dado desatualizado | **14,33:1** |
| `problems` | `[]` em todas as oito entradas |

A tabela larga continua rolável dentro de `UiTableScroll`; isso não é overflow do documento.

## 6. Inventário regenerado — somente a rota justificada

O gerador foi executado, e a comparação estruturada com os CSVs anteriores mostrou alteração apenas em `/admin/patrimonio` (linha 29 nos dois arquivos):

- componentes: `UiTableScroll|UiTaskWorkspace` → `UiBadge|UiState|UiTableScroll|UiTaskWorkspace`;
- estilo compartilhado: vazio → `UiWorkspace`;
- erro: `nao` → `sim`;
- marcador de teclado: `nao` → `sim`;
- gate: vazio → `ux-asset-delivery.yml` / job `ux-asset-postgres-browser`;
- capturas: vazio → `1440x900|320x844|390x844|768x1024`;
- stage: vazio → `ux-pro-07-patrimonio`;
- primeiro foco: `nao` → `sim`;
- classe da matriz: `codigo` → `captura visual`.

Nenhuma outra rota mudou nos CSVs.

**Limitação do inventário estático:** o gerador atual escreve “noite não comprovado por captura” e “estados não exercitados em navegador” para toda rota administrativa, sem ler `entry.theme` nem os casos de estado do resumo. Por isso a linha 29 ainda contém essas duas lacunas genéricas, embora o gate e o `resumo.json` desta fatia registrem noite, falha inicial, dado preservado e negativa. O gerador não foi ampliado nesta fatia para não misturar uma mudança global de metodologia com a tela de patrimônio.

## 7. Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm test` | **933/933**, 0 falhas, 0 pulados |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; `/admin/patrimonio` presente |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 rotas |
| `npm run test:ux-asset:pg` | **7/7** |
| `npm run test:l06-delivery:pg` | **9/9**, antes e depois; suíte preservada |
| `npm run test:l08-delivery:pg` | **51/51** |
| `next-env.d.ts` / `tsconfig.json` | restaurados depois de build e de cada gate Next; SHA-256 finais `18b697c4…` / `2128c956…` |

## 8. Limitações explícitas

- A evidência visual usa `admin`; os outros papéis declarados no `AdminGate` não receberam passagem visual nesta fatia. A decisão real das APIs continua no servidor e não foi alargada.
- Os estados de navegador foram injetados na leitura de produtos. As seis abas compartilham o mesmo modelo de estado, e as seis APIs tiveram autorização exercitada, mas não foi produzida uma captura de falha para cada endpoint.
- A falha transitória exercitada foi HTTP 503. O helper também distingue falha de rede sem resposta (`status=0`), mas esse ramo não ganhou captura própria.
- A massa é fictícia e o banco foi destruído ao final. Horários nas faixas são o relógio do navegador no instante da resposta; não são persistidos nem estimados.
- Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu. Este relatório não afirma conformidade WCAG integral.
