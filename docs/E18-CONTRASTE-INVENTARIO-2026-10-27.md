# E18 — Inventário acionável de contraste das prévias 10B

**Data:** 2026-10-27 · **Status:** diagnóstico entregue e **correção aplicada** pela **Opção A** (decisão do proprietário). O retrato abaixo é o **DEPois da correção**: **0 sinais abaixo de 4.5:1**.

> **Atualização 27/10.** O inventário original apontava **708** sinais abaixo de 4.5:1 em **165 pares de cor**. O proprietário escolheu a **Opção A — Ajuste mínimo (AA)** entre três propostas com prévia visual. As 144 cores de texto foram ajustadas nos 10 módulos de layout e em `src/app/globals.css`, com 2 regras pontuais e variantes claras/escuras para as 2 cores de superfície mista. O gate 10B foi **reexecutado em PostgreSQL 17 + Chromium**: 2.560 amostras, **0 abaixo de 4.5:1**. O baseline histórico (708) está preservado em `docs/e18-paletas-2026-10-27/amostras-baseline-708.json`; o SHA `917236ad…` citado abaixo é o do baseline ANTES da correção. Relatório: `docs/E18-OPCAO-A-RESULTADO-2026-10-27.md`. Permanecem **196 indeterminadas** (`complex_background`) e **108 textos não medidos** (`<option>` de `<select>`), fora do escopo deste método. Revisão WCAG manual, leitor de tela, UAT/Windows e aceite humano seguem pendentes; **NO-GO**.

## Por que esta fatia existe

O gate 10B media em Chromium real e congelava os totais em
`docs/UX-PRO-10B-PREVIAS-MEDICOES-2026-10-27.json`: **2.560 amostras,
708 abaixo de 4.5:1, 196 indeterminadas, 108 textos visíveis não medidos**.
O JSON guardava só CONTAGENS. Sem as amostras, "708 sinais" era um número
que não apontava para nenhum arquivo, cor ou componente. Esta fatia passa a
guardar as amostras brutas e as transforma em um inventário de causas.

Na fatia de **diagnóstico**, **NENHUM CSS**, token, paleta ou decisão de
design foi alterado — o baseline 10B (SHA `917236ad…`, hoje `14ff3232…`) apenas registrava a
pendência. Na fatia **posterior**, a decisão do proprietário autorizou a
correção (ver aviso acima); o baseline foi então atualizado para **0** e a
guarda `tests/ux-pro-10b-previas-medicoes.test.mjs` passou a bloquear
qualquer sinal novo.

## Validação cruzada

As amostras dos 22 cenários principais (11 rotas × 2 esquemas)
reproduzem **exatamente** o baseline congelado:

| Métrica | Baseline | Amostras |
| --- | ---: | ---: |
| Amostras | 2560 | 2560 |
| Abaixo de 4.5:1 | 0 | 0 |
| Indeterminadas | 196 | 196 |
| Textos não medidos | 108 | 108 |

Há ainda 2 cenários complementares (Layout 09 com zoom 200% em
light/dark): 190 amostras,
0 abaixo de 4.5:1,
40 indeterminadas. Eles **não** entram no
baseline e ficam fora do inventário de causas abaixo — estão contabilizados
no JSON (`totais.complementar`) para não inflar os números do proprietário.

## Causa 1 — 0 sinais abaixo de 4.5:1

São **0 pares foreground/background distintos**. Não é um
defeito único: é um padrão de texto secundário/link em azul claro e tons
pastel sobre fundos claros. Os 12 pares com mais ocorrências:

| Foreground | Background | Ratio | Ocorrências | Rotas | Sugestão técnica (não aplicada) |
| --- | --- | ---: | ---: | ---: | --- |


**Armadilha encontrada e corrigida nesta fatia:** 4 amostras usam foreground
com alpha (ex.: `rgba(182, 227, 255, 0.72)` sobre `rgb(22, 79, 216)`).
Quem recalcula o ratio a partir do RGB puro obtém 4.9:1 — parece aprovado —,
mas o helper PU4 compõe o alpha sobre o fundo e mede **3.3:1**. O inventário
usa o **ratio medido pelo helper** como fonte de verdade e expõe o
`foregroundEfetivo` composto; a sugestão parte dele, não do RGB cru.

A sugestão escurece apenas o foreground mantendo o fundo, até 4.5:1. É um
cálculo de luminância — **não** é uma proposta de identidade visual. A tabela
completa (com seletores normalizados e exemplos de texto) está em
`docs/UX-PRO-10B-CONTRASTE-INVENTARIO-2026-10-27.csv` e no JSON.

Distribuição por rota (light + dark):

| Rota | < 4.5:1 | Pares distintos | Indeterminadas | Não medidos |
| --- | ---: | ---: | ---: | ---: |
| `/layout-01` | 0 | 0 | 0 | 0 |
| `/layout-02` | 0 | 0 | 38 | 12 |
| `/layout-03` | 0 | 0 | 0 | 12 |
| `/layout-04` | 0 | 0 | 0 | 12 |
| `/layout-05` | 0 | 0 | 0 | 12 |
| `/layout-06` | 0 | 0 | 0 | 12 |
| `/layout-07` | 0 | 0 | 38 | 12 |
| `/layout-08` | 0 | 0 | 6 | 12 |
| `/layout-09` | 0 | 0 | 40 | 0 |
| `/layout-10` | 0 | 0 | 0 | 12 |
| `/layout-preview` | 0 | 0 | 74 | 12 |

## Causa 2 — 196 indeterminadas

Todas têm `reason = complex_background`: existe `background-image`
(gradiente/imagem) em algum ancestral, e o helper PU4 desiste de compor a cor
porque não amostra pixels. **Isso é uma limitação do medidor, não uma aprovação
nem uma reprovação de contraste.** A ação é medir sobre pixel renderizado
(screenshot + amostragem) antes de decidir; o valor continua registrado como
indeterminado, nunca convertido em "passou".

Motivos encontrados: `complex_background` (196).

## Causa 3 — 108 textos não medidos

**108 são `<option>` dentro de `<select>`**, todos com
`reason = no_client_rect`. O Chromium não dá `getClientRects()` para um
`<option>` enquanto o controle está fechado — o texto existe e está visível
no DOM, mas não é renderizado como caixa própria. São **controles nativos**,
não texto corriqueiro: o contraste deles depende do tema do widget nativo do
sistema operacional, não do CSS do site.

Conclusão honesta: esses 108 casos devem ser
**reclassificados como "não aplicável a este método"**, não como 108 defeitos de
contraste escondidos. Eles NÃO podem ser zerados do baseline sem uma decisão
explícita — por isso o baseline e a guarda 10B foram preservados.

## Ações recomendadas (nenhuma executada)

1. **Decisão de paleta (proprietário):** escolher, entre as sugestões da tabela,
   os tokens de texto secundário/link que serão escurecidos. São
   0 pares; os 12 primeiros cobrem 0 ocorrências.
2. **Revisão WCAG manual:** texto grande (≥18,66px negrito ou ≥24px) exige
   apenas 3:1; o helper usa 4.5:1 para tudo. Parte dos 0 pode ser
   legítima — exige leitura humana, não automação.
3. **Medição por pixel** para as 196 indeterminadas com fundo complexo.
4. **Leitor de tela e UAT/Windows** seguem não executados.
5. **Reclassificar** os 108 `<option>` como não aplicáveis — com nova
   fatia, relatório e atualização explícita do baseline (nunca por acidente).

## Artefatos

- Amostras brutas (escritas pelo gate 10B): `docs/UX-PRO-10B-CONTRASTE-AMOSTRAS-2026-10-27.json` — SHA `9faea36df5f7…`
- Inventário estruturado: `docs/UX-PRO-10B-CONTRASTE-INVENTARIO-2026-10-27.json`
- Inventário tabular: `docs/UX-PRO-10B-CONTRASTE-INVENTARIO-2026-10-27.csv`
- Baseline original (intacto): `docs/UX-PRO-10B-PREVIAS-MEDICOES-2026-10-27.json` — SHA `917236ad…` à época; hoje `14ff3232…` (0 sinais)

## Limites

Revisão manual de tema/contraste não executada; WCAG integral não verificado;
leitor de tela não executado; aceite humano/UAT/Windows não executado.
**Produção segue NO-GO.**
