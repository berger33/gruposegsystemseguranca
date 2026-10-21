# UX-PRO-09E PU6 — prévia montada de Layout 09

**Base:** `main` `acb4d7f3dfa3cb14eb214821fc6a4357b7e0dbe6`
**Escopo prévio:** [PU6 — escopo e riscos](UX-PRO-09E-PU6-ESCOPO-ANTES-2026-10-21.md), commit `1224d73215383e0025ee3dc066194843c99773d9`.
**Alvo:** rótulos e números das três etapas em `Layout09`, montado em `/layout-preview?visual=09`.

## Antes e depois

| Estado do componente | Antes | Depois |
|---|---:|---:|
| Texto e números das etapas pendentes | `#9aabba` sobre o fundo claro, **2,36:1** | token existente `var(--navy-2)`, **9,81:1** |
| Texto e números da etapa ativa/concluída | azul existente, **5,51:1** | sem mudança, **5,51:1** |
| Viewports, preferência do navegador e etapas observadas | 320/390/768/1440 px; claro/escuro; etapas 1/2/3 | mesmas 24 combinações |
| Navegação horizontal do documento | 0/24 capturas com overflow | 0/24 capturas com overflow |

O resultado anterior reproduziu o sinal histórico em todos os estados: 24 rótulos e 24 números pendentes medidos em **2,36:1**. O after mediu os mesmos 48 elementos pendentes em **9,81:1**. Os 48 rótulos e 48 números ativos/concluídos permaneceram em **5,51:1**. Cada uma das 48 navegações respondeu HTTP 200, sem `pageerror` do browser.

A mudança de produto está limitada a uma declaração em `src/components/Layout09.module.css`: a cor base de `.progressStep` agora usa `var(--navy-2)`. `.progressActive`, os círculos ativos, os estados/conteúdo das etapas, dimensões, links e demais cores permanecem inalterados. Não houve escrita em API, banco, auditoria ou configuração de publicação.

## Evidências

- [Capturas e medidas antes](ux-pro-09e-pu6-evidencias-2026-10-21/antes/resumo.json), com manifesto SHA-256 em `integridade.json`.
- [Capturas e medidas depois](ux-pro-09e-pu6-evidencias-2026-10-21/depois/resumo.json), com manifesto SHA-256 em `integridade.json`.
- 24 PNGs por fase: 4 larguras × 2 preferências `prefers-color-scheme` × 3 etapas. As razões foram calculadas sobre cores e fundos computados dos nós montados; ausência de amostra não foi tratada como aprovação.
- Percurso automatizado de teclado em 320 e 1440 px, claro e escuro: `Tab` alcançou o cartão, `Enter` selecionou o espaço e `Enter` avançou para a etapa 2. A contagem de teclas e os alvos estão no `keyboard` de `depois/resumo.json`.
- Inspeção visual das capturas: 320 px/claro/etapa 1 e 1440 px/escuro/etapa 3 antes e depois. O indicador de desenvolvimento do Next aparece nas imagens e fica fora da interface medida.

## Limitações e observações

- A medição foi automatizada com Chrome 156 headless contra a rota pública de prévia montada. A galeria autenticada `/admin/aparencia` não foi aberta com identidade sintética; a inspeção estática confirma que seu `iframe` aponta para `/layout-preview?visual=09` e para o mesmo componente `Layout09`.
- Claro/escuro representa `prefers-color-scheme`, não o controle de tema do produto. O layout mantém a mesma paleta nas duas preferências. Não houve validação manual de teclado, leitor de tela, zoom, homologação, UAT ou aceite humano.
- Durante a coleta, o servidor local PGlite emitiu logs `L04_ERROR` com código `42P01`. A causa não foi atribuída ao fluxo de prévia; as navegações observadas foram 200 e o browser não registrou `pageerror`. É uma observação do ambiente, não ocultada nem classificada como corrigida por PU6.
- O resultado não é auditoria WCAG integral, nem valida outros layouts ou estados não exercitados.

## Gates locais

| Gate | Resultado | Detalhe |
|---|---|---|
| `npm run test:ux-pro-09e-pu6` | **2/2 passou** | O mesmo teste foi executado contra a base antes da correção: o teste de contraste falhou em 2,36:1. Após a mudança, ambos os testes passaram. |
| `npm run typecheck` | **passou** | `tsc --noEmit`. |
| `npm test` | **980/983; 3 falhas de ambiente** | Três testes intactos falharam com `EPERM` ao criar symlinks em `qa-backup-coverage-inventory.test.mjs`, `qa-cli-v2-local-provider.test.mjs` e `qa-cli-v2-transfer.test.mjs`. Não foram pulados, enfraquecidos ou declarados aprovados. |
| `npm run build` | **passou** | Next.js 16.3.8/Turbopack compilou e gerou as 105 páginas. |
| `node scripts/qa-wave0-static.mjs` | **5/5 passou** | Sem imports ausentes ou migrações divergentes. |
| `node scripts/ux-pro-00-inventory.mjs --check` | **passou** | 100 rotas; inventário e matriz conferem; PU6 não alterou a cobertura. |
| `git diff --check` | **passou** | Sem erro de whitespace. |
| Integridade de arquivos gerados | **preservada** | Após typecheck/build, `next-env.d.ts` foi restaurado ao SHA-256 `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`; `tsconfig.json` permaneceu em `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`. |

**Decisão de entrega:** o `npm test` local ainda é um gate falho por EPERM. A PR pode ser usada para obter CI Linux e review, mas PU6 não deve ser mergeada nem a próxima fatia iniciada enquanto o gate obrigatório não estiver resolvido e todos os checks/review exigidos não estiverem concluídos.
