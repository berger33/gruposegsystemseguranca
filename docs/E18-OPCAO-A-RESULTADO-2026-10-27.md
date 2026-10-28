# E18 — Opção A aplicada: contraste das prévias corrigido

**Data:** 2026-10-27 · **Decisão do proprietário:** Opção A — Ajuste mínimo (WCAG AA, ≥ 4.5:1) · **Produção segue NO-GO.**

## Resultado

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| Amostras medidas | 2.560 | 2.560 |
| **Sinais abaixo de 4.5:1** | **708** | **0** |
| Indeterminadas (`complex_background`) | 196 | 196 (fora do escopo) |
| Textos visíveis não medidos (`<option>`) | 108 | 108 (fora do escopo) |
| Pares de cor problemáticos | 165 | 0 |
| Pior razão medida | 2,42:1 | ≥ 4,50:1 |

Medição **real** no mesmo gate (`AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x UX_PUBLIC_TEST_PATTERN='UX-PRO-10B previas' node scripts/qa-ux-public-routes-postgres.mjs`): PostgreSQL 17 descartável + Chromium, 11 rotas × light/dark, **5/5**. Não é simulação.

## O que foi alterado

- **144 cores de texto** ajustadas somente na medida necessária para a superfície onde aparecem (escurecendo em fundo claro, clareando em fundo escuro), preservando o matiz e a identidade de cada layout.
- **10 arquivos** `src/components/Layout01..10.module.css` + `src/app/globals.css` (esta última por causa de `#c76748`, usada pela própria rota `/layout-preview`). Foram ~190 substituições de declarações `color:`.
- **2 regras pontuais:**
  - `.visualIndex > span { color: #626262; }` no Layout05 — o único caso de texto branco sobre superfície clara (`#d6e0e6`), que media 1,34:1 e agora mede **4,55:1**.
  - `.artNumber { color: #b6e3ff; }` no Layout06 — remoção do alpha `#b6e3ffb8` (0,72), que compunha 3,31:1 sobre `#164fd8`; opaco mede **4,90:1**.
- **2 cores de superfície mista** (`#207d98` no Layout02 e `#9a641f` no Layout04) receberam variantes claras em regras mais específicas para os blocos de fundo escuro, mantendo a cor base nas superfícies claras.
- A variável `--muted` do Layout03 foi ajustada; as variáveis de **fundo** (`--white`, `--paper`, `--sand`) permaneceram intactas.

**Escopo rigoroso:** apenas declarações `color:` e variáveis CSS usadas como cor de texto, nos arquivos das prévias. Nenhuma rota, contrato, permissão, migração, dado, comportamento ou regra de layout/estrutura foi alterado.

## Defeito encontrado e corrigido durante a aplicação

A primeira tentativa de aplicação fazia **substituição textual de qualquer hex**. Isso trocou `#ffffff` de `background` e `border` por `#626262` em **5 telas fora do escopo** (`themes.css`, `ux-tokens.css`, `ClientApp.module.css`, `EmployeePortal.module.css`, `VisualAdmin.module.css`) e em `globals.css`. Foi detectado antes de qualquer validação, **revertido por `git checkout HEAD`** e a aplicação foi reescrita para:

1. atingir somente `color:` (com `!important` preservado);
2. limitar-se aos 11 arquivos das prévias;
3. **excluir `#ffffff` da substituição global** — ele é texto ótimo sobre fundos escuros e só falhava em um lugar;
4. tratar o único caso falho de branco com regra pontual.

A guarda `tests/e18-palette-a-applied.test.mjs` congela exatamente essa proteção (teste 2 verifica que nenhum fundo/borda branco foi alterado fora do escopo).

## Guardas e baseline

- `tests/e18-palette-a-applied.test.mjs` — **RED 1/4 → GREEN 5/5**; valida o plano sobre o baseline de 708, as regras mistas/pontuais, a integridade estrutural e exige **0** na medição nova. Incluída no `test:unit`.
- `tests/ux-pro-10b-previas-medicoes.test.mjs` — baseline atualizado de **708 → 0**; qualquer sinal novo derruba a suíte. `TOTALS = { samples: 2560, under45: 0, indeterminate: 196, unmeasured: 108 }`.
- `tests/ux-pro-10b-contrast-inventory.test.mjs` — retrato corrigido: **0 pares**, 196 indeterminadas, 108 `<option>`, e o baseline histórico de 708 preservado.
- `docs/e18-paletas-2026-10-27/amostras-baseline-708.json` — cópia integral das amostras **antes** da correção (o gate 10B reescreve o arquivo original a cada execução).
- `docs/e18-paletas-2026-10-27/plano-A.json` e `aplicacao-A.json` — plano calculado e registro da aplicação.
- Inventário E18 (`docs/UX-PRO-10B-CONTRASTE-INVENTARIO-2026-10-27.{json,csv}` + `docs/E18-CONTRASTE-INVENTARIO-2026-10-27.md`) regenerado: **0 pares de cor, 122 grupos** (indeterminadas + não medidos).

## O que NÃO foi resolvido

- As **196 indeterminadas** são fundos com imagem/gradiente; o medidor amostra a cor CSS, não o pixel. Exigem medição por pixel ou revisão manual.
- Os **108 textos não medidos** são `<option>` dentro de `<select>` (controle nativo sem `getClientRects()`); não são um defeito oculto, mas também não foram aprovados.
- **Revisão WCAG manual** (texto grande exige só 3:1), leitor de tela, UAT/Windows real e **aceite humano (0/100 rotas, 0/222 requisitos)** seguem pendentes.
- Nenhum provedor real, túnel/Funnel, backup operacional ou dado real foi ativado.

## Como revalidar

```bash
AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x UX_PUBLIC_TEST_PATTERN='UX-PRO-10B previas' \
  node scripts/qa-ux-public-routes-postgres.mjs     # 5/5
node scripts/ux-pro-10b-contrast-inventory.mjs      # regenera inventário
AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test    # 1151/1151
```

Artefatos de decisão (três opções, prévias visuais em páginas reais, comparativos) permanecem em `docs/e18-paletas-2026-10-27/`.
