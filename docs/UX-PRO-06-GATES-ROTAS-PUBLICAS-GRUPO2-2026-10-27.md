# UX-PRO-06 / E6 — Grupo 2: gates das rotas públicas de conversão (27/10/2026)

**Estado:** entregue localmente. Produção segue **NO-GO**. Sem aceite humano, UAT ou Windows real.

## 1. Escopo

Cinco rotas do funil público que o inventário `ux-pro-00` ainda marcava como
**sem gate automatizado que alcance a rota**:

| Rota | O que o gate prova |
|---|---|
| `/orcamento` | POST real em `/api/leads` com protocolo; falha 503 injetada anunciada e focalizada |
| `/simulador` | três etapas por teclado, validações e **nenhum preço** exibido |
| `/pacotes` | distinção entre estado vazio (sem `alert`) e falha de API (com `alert`) |
| `/privacidade` | minuta declarativa preservada e aviso de que não é aprovação formal |
| `/proposta/aceite/[token]` | token inválido anuncia erro, não expõe proposta nem formulário de aceite |

Nenhuma rota, permissão, contrato de API, migração ou regra de negócio foi
alterada. A fatia é composta de workflow + gate + guarda + duas correções de
acessibilidade + documentação.

## 2. RED → GREEN

A primeira execução de `UX_PUBLIC_TEST_PATTERN='E6 grupo 2' … npm run
test:ux-public-routes:pg` deu **3/7**. A investigação com `networkidle` e
inspeção manual separou **três falsos negativos** de **dois defeitos reais**:

- **Falsos negativos (gate, não produto):** os formulários de `/orcamento` e
  `/simulador` são *client components*; interagir logo após
  `domcontentloaded` media o HTML ainda não hidratado (checkbox sem efeito,
  resumo vazio). Correção: `page.waitForLoadState('networkidle')` no
  `openPage`. O sétimo cenário também tinha um seletor ambíguo — o `<h1>`
  contém o mesmo texto do `<h2>` do painel — corrigido com `exact: true`.
- **Defeito real 1 — `/orcamento`:** os estados de carregando, sucesso
  (protocolo) e erro eram `<p>` sem `role`. Um visitante com leitor de tela
  não sabia que o envio falhou, e o foco permanecia no botão — padrão G5 do
  repositório não era seguido. Correção: `aria-busy` no `<form>`,
  `role="status"` em carregando/sucesso, `role="alert"` +
  `ref`/`tabIndex={-1}`/`focus()` no erro.
- **Defeito real 2 — `/proposta/aceite/[token]`:** `Carregando proposta…`, a
  mensagem de link inválido/expirado e o aceite registrado eram `<div>`/`<p>`
  sem `role`. Um token inválido deixava o leitor de tela sem nenhum anúncio de
  erro. Correção: `role="status"` em carregando/aceite, `role="alert"` +
  `ref`/`tabIndex={-1}`/`focus()` no erro. As mensagens honestas
  (`Não foi possível carregar este aceite agora.`, link não encontrado) e a
  recusa em expor valores foram preservadas.

Após as correções: **GREEN 7/7** (`# duration_ms 34203`).

## 3. O gate (PostgreSQL 17 descartável + Chromium real)

Sete cenários em `tests/ux-public-routes.integration.test.mjs`, selecionados
por `UX_PUBLIC_TEST_PATTERN='E6 grupo 2'` no workflow
`.github/workflows/ux-public-routes-group2-delivery.yml`:

1. **HTTP:** as cinco rotas respondem `200` e `/api/public/packages` responde `200`.
2. **Responsividade:** 4 viewports (320/390/768/1440) × 5 rotas = **20 medições**
   de `scrollWidth - clientWidth` (todas ≤ 1px) e `meta[robots]` com `noindex`
   em todas — a prévia não é produção.
3. **Falha de orçamento:** `503 qa_forced_failure` injetado no POST
   `/api/leads`; `main [role="alert"]` aparece, recebe foco, o formulário
   continua habilitado para nova tentativa.
4. **Sucesso de orçamento:** POST real devolve `200/201`, o protocolo aparece
   em `main [role="status"]` acompanhado de `Sem preço automático`.
5. **Aceite inválido:** `main [role="alert"]` anuncia o erro, e `main` não
   contém `Total: R$`, `Carregando proposta…` nem `<form>` de aceite.
6. **Pacotes/privacidade:** três cenários — vazio sem `role="alert"`, falha
   `503` com `role="alert"` e sem a mensagem de vazio, e minuta de privacidade
   com `noindex`, `não comprova a aprovação formal` e `não substitui a política aprovada`.
7. **Simulador:** avanço sem imóvel → `Escolha o tipo de imóvel`; seleção
   `Condomínio` → etapa 2; avanço sem dados → `Informe seu nome`; nenhum `R$`
   no `main` e aviso explícito de que não exibe preços.

Um browser Chromium por viewport/cenário (o Chromium empacotado roda
`--single-process` e não sobrevive ao reaproveitamento entre contextos), e
`role="alert"` sempre escopado a `main` para não confundir com o `RagWidget`
global.

## 4. Guarda e matriz

- `tests/ux-public-routes-group2-gate.test.mjs` (6 testes) congela: filtros
  `paths:` precisos nos cinco diretórios (sem `src/**` amplo), presença do
  gate/da guarda/da auditoria no workflow, seleção do padrão `E6 grupo 2`,
  `--check` do inventário, os sete cenários, as quatro larguras, a espera de
  hidratação, os `role`s das duas páginas corrigidas e a inclusão da própria
  guarda no `test:unit`.
- A guarda do **grupo 1** foi atualizada de 18 para **13** lacunas globais.
- `node scripts/ux-pro-00-inventory.mjs` regenerou
  `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv` e
  `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`: **100 rotas, 87 com gate
  de jornada, 13 sem gate** (eram 25 antes do grupo 1 e 18 antes do grupo 2).
  As cinco rotas deste grupo agora citam
  `teste automatizado de jornada: ux-public-routes-group2-delivery.yml` e
  continuam com `validacao manual: nao_registrado` / `aceite humano:
  nao_registrado` — nada foi inventado.
- Restam sem gate: `/`, `/layout-01`…`/layout-10`, `/layout-preview` e
  `/qa/modulos` (grupo 3, próxima fatia).

## 5. Validação da fatia

| Verificação | Resultado |
|---|---|
| Gate E6 grupo 2 (PostgreSQL 17 + Chromium) | **7/7** (`# duration_ms 34203`) |
| Guardas estáticas grupo 1 + grupo 2 | **10/10** |
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1098/1098** (201 arquivos `.mjs`, 138 no `test:unit`) |
| `npm run typecheck` | **0** erros |
| `npm run build` | **105/105** páginas geradas |
| `qa-wave0-static` | **5/5** |
| `ux-pro-00-inventory --check` / `ux-pro-03-ti-inventory --check` | **OK / OK** |
| `npm audit --audit-level=moderate` | **0** vulnerabilidades |
| `git diff --check` | **limpo** |
| Gate do portal (PostgreSQL 17 + Chromium) | **40/40** |
| Gate E6 grupo 1 (isolado por `UX_PUBLIC_TEST_PATTERN`) | **6/6** |
| `next-env.d.ts` SHA `1862ac4b…` / `tsconfig.json` SHA `2128c956…` | **preservados** antes, durante e depois dos gates |
| Workflows | **47** (46 + `ux-public-routes-group2-delivery.yml`) |

## 6. Bateria final

Executada em 27/10/2026 no branch `arena/6d37ed49-gruposegsystemseguranca`,
base `6b4212d7e45d58003391dd0291e6c504c5c2964a`:

```
AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test                 # 1098/1098
npm run typecheck                                              # 0
npm run build                                                  # 105/105
node scripts/qa-wave0-static.mjs                               # 5/5
node scripts/ux-pro-00-inventory.mjs --check                   # OK
node scripts/ux-pro-03-ti-inventory.mjs --check                # OK
npm audit --audit-level=moderate                               # 0
git diff --check                                               # limpo
AWS_EXECUTION_ENV=… npm run test:ux-portal:pg                  # 40/40
UX_PUBLIC_TEST_PATTERN='E6 grupo 1' … test:ux-public-routes:pg # 6/6
UX_PUBLIC_TEST_PATTERN='E6 grupo 2' … test:ux-public-routes:pg # 7/7
```

Os três gates de navegador usam `NEXT_DIST_DIR` próprio e restauram
`next-env.d.ts`/`tsconfig.json`; os SHAs foram conferidos após cada etapa.

**Isolamento das fatias:** os seis cenários do grupo 1 foram renomeados para
`E6 grupo 1: …` e seu workflow passou a definir `UX_PUBLIC_TEST_PATTERN:
'E6 grupo 1'`. Assim cada workflow prova apenas a própria fatia em vez de
rodar os 13 cenários do arquivo de integração. A guarda do grupo 1 foi
atualizada para exigir esse padrão e para acompanhar as 13 lacunas globais.

## 7. Limitações que esta fatia **não** fecha

- **0/100 rotas com validação manual ou aceite humano** — o gate prova
  comportamento automatizado, não aprovação de pessoa.
- **13 rotas ainda sem gate de jornada** no fechamento desta fatia (raiz, 11
  prévias de layout e `/qa/modulos`). **Atualização:** o grupo 3, entregue em
  seguida no mesmo dia, zerou essas lacunas — ver
  `docs/UX-PRO-06-GATES-ROTAS-PUBLICAS-GRUPO3-2026-10-27.md`.
- O ambiente local usa **PGlite degradado** fora do gate; `pg_dump`/`pg_restore`
  17 não estão disponíveis localmente (E7/E8).
- E9 (uma falha isolada não reproduzida em `npm test`) segue aberta.
- E3 (`AiBotWidget`/`/api/ai/bot` 410), E4 (RAG legado), E14 (42 órfãos TI),
  E15 (`server.mjs` monolítico) e E16 (worker/scheduler) seguem na fila.
- Produção, provedores reais, mensagens reais e publicação continuam fora de
  escopo sem autorização expressa.
