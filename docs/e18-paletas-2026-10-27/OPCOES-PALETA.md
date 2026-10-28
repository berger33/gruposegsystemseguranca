# E18 — Opções de paleta para decisão

**Data:** 2026-10-27 · Simulação sobre as **2.560 amostras reais** do gate 10B (22 cenários baseline).

> ✅ **DECISÃO TOMADA: OPÇÃO A.** O proprietário escolheu **A — Ajuste mínimo (AA ≥4.5:1)**. A correção foi aplicada em 27/10 e **remedida no gate 10B real: 0 sinais abaixo de 4.5:1** (antes 708). Este documento e as prévias abaixo são o registro da **decisão**, não o estado atual do CSS. Ver `docs/E18-OPCAO-A-RESULTADO-2026-10-27.md`.

## Como ver — três níveis de prévia

1. **Páginas reais (recomendado):** `comparativo-real-GERAL.png` mostra as 4 rotas × 4 opções numa só imagem. Para ver em tamanho grande, abra `comparativo-real-layout-03.png`, `-05`, `-08` e `-09` — cada um tem as quatro variações da **mesma página** lado a lado, capturadas em Chromium real (1440×900), PostgreSQL 17 descartável e servidor Next de verdade. A recolorização aconteceu **só no DOM da screenshot**; nenhum CSS de produção foi alterado. O HTML navegável é `PAGINAS-REAIS.html`.
   - Textos efetivamente recoloridos: `/layout-03` **51**, `/layout-05` **53**, `/layout-08` **48** (1 fundo complexo preservado), `/layout-09` **27** (3 fundos complexos preservados).
2. **Componentes ampliados:** `comparativo.html` / `comparativo.png` — quatro colunas com os mesmos cards, hero e rodapé, e os **ratios medidos** em cada amostra de texto (verde = ok, vermelho = abaixo de 4.5:1).
3. **Dados:** `opcoes.json` (simulação completa), `paginas-reais.json` (capturas), `mapa-{A,B,C}.json` (substituições de cor).

| | Hoje | **A — Ajuste mínimo** | **B — Contraste alto (AAA)** | **C — Marca unificada** |
| --- | ---: | ---: | ---: | ---: |
| Alvo | — | ≥ 4.5:1 | ≥ 7:1 | ≥ 4.5:1 |
| Sinais corrigidos | 0/708 | **708/708** | 704/708 a 7:1 | **708/708** |
| Pior ratio | 2.42:1 | 4.50:1 | 6.49:1 | 4.50:1 |
| Ratio médio | 3.34:1 | 4.52:1 | 7.40:1 | 6.75:1 |
| Cores resultantes | 144 | 158 | 28 | 10 |
| Mudança visual | — | **quase nula** | moderada (cores mais profundas) | **maior** (identidade única) |

## A — Ajuste mínimo (recomendada se o objetivo é só conformidade)

Mantém o matiz de cada uma das 144 cores e aplica **apenas** o deslocamento necessário para a superfície onde o texto está (escurece em fundo claro, clareia em fundo escuro). Aparência praticamente idêntica à de hoje. Custo: gera 158 variantes, porque a mesma cor pode precisar de ajustes diferentes em superfícies distintas — mais declarações CSS para manter.

## B — Contraste alto (AAA)

Mesma ideia, mas levando todo o texto a **≥ 7:1** (WCAG AAA). Cores mais profundas e saturadas; os matizes de cada layout continuam diferentes. **Ressalva honesta:** 4 amostras em `/layout-03` têm fundo `#496172`, sobre o qual nem branco puro atinge 7:1 (máximo 6,49:1). Para fechar 708/708 a 7:1 seria preciso **clarear também esse fundo** — decisão extra de design.

## C — Marca unificada

Uma única identidade para os 10 layouts: **navy `#142f4c`**, **aço `#1e5a8a`**, **terracota `#9c4a2f`** e **neutro `#33414d`**, com variantes claras/escuras por superfície. Reduz de 144 para 10 cores efetivas (4 tokens). É a opção mais fácil de manter e a que cria consistência de marca — mas é a que mais muda a aparência atual das prévias, hoje bem diferentes entre si.

## O que NÃO muda com nenhuma das opções

- As **196 indeterminadas** (`complex_background`) continuam exigindo medição por pixel.
- Os **108 `<option>`** continuam controles nativos, não afetados por CSS.
- **Revisão WCAG manual** (texto grande exige só 3:1), leitor de tela, UAT/Windows e aceite humano seguem pendentes.
- O baseline 10B era `917236ad…` (708 sinais); após a Opção A a evidência foi regenerada com `14ff3232…` (0 sinais) e a guarda passou a exigir zero. O retrato antigo está em `amostras-baseline-708.json`.

## Como a correção será aplicada

Independentemente da opção escolhida: substituir as cores de **texto** nos 10 `src/components/Layout0X.module.css` (≈150 declarações), regenerar a evidência 10B com o gate real em PostgreSQL 17 + Chromium, **atualizar o baseline 708 → 0** com relatório explícito, e rodar a suíte completa. As sugestões são cálculo de luminância — a identidade visual final é sua decisão.

**Produção segue NO-GO.**
