# UX-PRO-06 / E6 — Grupo 3: raiz, prévias de layout e índice QA (27/10/2026)

**Estado:** entregue localmente. Produção segue **NO-GO**. Sem aceite humano, UAT ou Windows real.

**Resultado central:** as **13 últimas rotas sem gate automatizado** passam a ter
workflow de `paths:` precisos + gate PostgreSQL 17/Chromium. A matriz de 100
rotas fica com **100/100 com gate de jornada e 0 lacunas**. Isso **não** significa
aprovação: **0/100 seguem com validação manual e aceite humano**.

## 1. Escopo

| Rota | O que o gate prova |
|---|---|
| `/` | lê `/api/site-visual`, renderiza o layout publicado, mantém o atalho de aparência (D7) e a navegação de prévias em desenvolvimento |
| `/layout-01`…`/layout-10` | respondem 200, declaram `Prévia interna` + `não é o site público`, oferecem volta à raiz e à publicação auditada, e não transbordam em 4 larguras |
| `/layout-preview` | `?visual=09`/`?visual=03` mostram o layout pedido; id inválido declara `não foi reconhecido` e cai no padrão `06` |
| `/qa/modulos` | **fail-closed**: 404 fora do cluster descartável de homologação, sem vazar o roteiro interno, contas QA ou IDs de casos |

Nenhuma rota, permissão, contrato de API, migração, layout ou regra de negócio
foi alterada. A única mudança de código de produto desta fatia é **zero**: o
trabalho é de cobertura, guarda e uma correção no **gerador de inventário**.

## 2. O defeito de infraestrutura (RED → GREEN)

O gerador `scripts/ux-pro-00-inventory.mjs` só reconhecia como gate de jornada
os filtros `src/app/<segmento>/**`. Um filtro preciso no arquivo da raiz,
`src/app/page.tsx`, virava o prefixo absurdo `/page.tsx`; e o prefixo `/` era
descartado por ser reservado a filtros amplos (`src/**`, baseline). Resultado:
**a raiz nunca poderia ter gate**, mesmo com workflow dedicado.

Correção aditiva: `src/app/page.tsx` (ou `.jsx/.ts/.js`) agora gera o prefixo
`/` como gate **preciso**, sem transformar filtros amplos em gate de jornada.

- **RED:** com o reconhecimento removido, o novo teste
  `E6 grupo 3: o filtro preciso em src/app/page.tsx vira gate de jornada da raiz`
  falhou — `tests/ux-pro-00-inventory.test.mjs` **4/5**, com
  `o workflow do grupo 3 precisa ser reconhecido como gate de jornada da raiz`.
- **GREEN:** com o reconhecimento restaurado, **5/5**.

O teste novo precisou ler o **inventário vigente de 13/10**, não o CSV histórico
de 10/10 usado pelos testes de reconciliação; a guarda do grupo 3 congela isso.

O gate de navegador, por sua vez, **nasceu verde (6/6)**: não havia defeito de
produto conhecido nessas rotas. Registramos isso honestamente — o RED desta
fatia é de cobertura/infraestrutura, não de UI.

## 3. O gate (PostgreSQL 17 descartável + Chromium real)

`.github/workflows/ux-public-routes-group3-delivery.yml` com **13 filtros
`paths:` precisos** (um por rota), executando seis cenários isolados por
`UX_PUBLIC_TEST_PATTERN: 'E6 grupo 3'`:

1. **HTTP:** 12 rotas respondem `200`; `/api/site-visual` responde `200`;
   `/qa/modulos` responde `404` e o corpo não contém
   `Roteiro de homologação local`, `QA-HOM-002` nem a conta de cliente QA.
2. **Responsividade:** 4 viewports (320/390/768/1440) × 12 rotas = **48
   medições** de `scrollWidth - clientWidth` (todas ≤ 1px), `noindex` em todas e
   espera explícita pelo conteúdo (atalho da raiz ou
   `[data-testid="site-preview-notice"]`).
3. **Prévias:** as 11 rotas de prévia exibem `Prévia interna`, negam ser o site
   público e oferecem os links `Abrir Aparência do site` e `Ver site atual`;
   `Tab` alcança um link real de volta (percurso de teclado).
4. **`/layout-preview`:** quatro consultas (`09`, `03`, id inválido e sem
   query) verificam o layout exibido, a declaração de id não reconhecido, o
   fallback para `06` e o `noindex`.
5. **Raiz:** `/api/site-visual` devolve um `visual` string, a página renderiza o
   site, mantém `PRÉVIAS · SOMENTE DESENVOLVIMENTO`, o atalho público de
   aparência e o `noindex` global de prévia.
6. **Fail-closed:** `/qa/modulos`, `?modo=homologacao` e `?visual=09` devolvem
   `404` com corpo genérico, sem o índice interno.

Um browser Chromium por viewport/cenário, como nos grupos 1 e 2.

## 4. Guardas e matriz

- `tests/ux-public-routes-group3-gate.test.mjs` (5 testes) congela os 13
  filtros, o ajuste do gerador, a leitura do CSV vigente, a matriz zerada, os
  seis cenários, as quatro larguras, o `noindex`, o fallback, o teclado, o
  fail-closed e a inclusão da guarda no `test:unit`.
- As guardas dos grupos 1 e 2 foram atualizadas de **13 → 0** lacunas globais.
- `node scripts/ux-pro-00-inventory.mjs` regenerou os CSVs: **100 rotas, 100
  com gate de jornada, 0 sem gate** (25 → 18 → 13 → 0 ao longo dos três
  grupos). Todas continuam com `validacao manual: nao_registrado` e
  `aceite humano: nao_registrado`.
- Workflows: **47 → 48**.

## 5. Validação da fatia

| Verificação | Resultado |
|---|---|
| Guarda de inventário RED → GREEN | **4/5 → 5/5** |
| Guardas estáticas grupos 1 + 2 + 3 + inventário | **20/20** |
| Gate E6 grupo 3 (PostgreSQL 17 + Chromium) | **6/6** (`# duration_ms 58957`) |
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1104/1104** (202 arquivos `.mjs`, 139 no `test:unit`) |
| `npm run typecheck` | **0** erros |
| `npm run build` | **105/105** páginas |
| `qa-wave0-static` | **5/5** |
| `ux-pro-00-inventory --check` / `ux-pro-03-ti-inventory --check` | **OK / OK** |
| `npm audit --audit-level=moderate` | **0** vulnerabilidades |
| `git diff --check` | **limpo** |
| Gate do portal | **40/40** |
| Gates E6 grupos 1 / 2 / 3 | **6/6 · 7/7 · 6/6** |
| `next-env.d.ts` SHA `1862ac4b…` / `tsconfig.json` SHA `2128c956…` | **preservados** |
| Workflows | **48** |

Bateria executada em 27/10/2026 no branch
`arena/6d37ed49-gruposegsystemseguranca`, base
`6b4212d7e45d58003391dd0291e6c504c5c2964a`.

## 6. Limitações que esta fatia **não** fecha

- **0/100 rotas com validação manual ou aceite humano.** Zerar a lacuna de
  *gate automatizado* não é homologação. `docs/STATUS-VIGENTE.md` continua
  sendo a fonte única de estado e a produção segue **NO-GO**.
- **`/qa/modulos` só foi provada no modo fail-closed.** O modo positivo exige
  `QA_HOMOLOGATION_MODE=true`, `BIND_HOST=127.0.0.1` e um `DATABASE_URL` cujo
  banco se chame exatamente `seg_qa_homologacao`; quem faz isso hoje é
  `scripts/qa-homologacao-local.mjs` (local, não CI). O gate de CI usa o banco
  `seg_qa_public_routes` e, portanto, não pode abrir a rota sem enfraquecer a
  regra. Registramos a limitação em vez de falsificar um 200.
- `D7` (inline dinâmico do Layout 09 e foco do atalho público) segue com a
  passagem integral das prévias pendente; esta fatia prova apenas que o atalho
  existe, é alcançável por teclado e que as prévias não transbordam.
- PGlite degradado fora dos gates (E7), `pg_dump`/`pg_restore` 17 ausentes
  localmente (E8), uma falha isolada não reproduzida (E9), E3/E4 (IA/RAG),
  E14 (42 órfãos TI), E15 (`server.mjs` monolítico) e E16 (worker/scheduler)
  seguem na fila.
- Produção, provedores reais, mensagens reais e publicação continuam fora de
  escopo sem autorização expressa.

## 7. Próxima fatia sugerida

Com o E6 de cobertura automatizada encerrado, a fila volta para
**UX-PRO-06/04/05** (reauditoria dos 222 IDs, CRM/comercial, perfil Marcelo e
jornada do titular) ou para o **grupo de dívida** (D7/C11/09E-8/10B, F02
Windows/UAT, flakiness). Nenhuma dessas foi iniciada aqui.
