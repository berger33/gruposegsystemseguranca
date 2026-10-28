# UX-PRO-03 — 5ª promoção com prova: PLT-11 Retenção e descarte (27/10/2026)

**Estado:** entregue localmente. Produção segue **NO-GO**. Sem aceite humano, UAT ou parecer jurídico.

## 1. Escolha e critério

A decisão de 02/10 só permite promover um componente órfão **com prova**: rota
real, autorização decidida no servidor, origem/fonte/data-base, drill-down,
teste focal e subteste no gate. `RetentionClient.tsx` (123 linhas) foi escolhido
porque:

- é um dos **42 órfãos** do inventário reproduzível de TI;
- seus quatro handlers em `src/server/retention-api.mjs` já exigem
  `requireRole(sess,['admin','ti'])` (exceções por id, políticas, jobs e job por
  id) — nenhuma permissão precisou ser alterada;
- o requisito **PLT-11** está entre os **36 IDs `a_revalidar` sem nenhuma
  menção em gate** do inventário de 222 IDs — a promoção ataca duas filas ao
  mesmo tempo, sem inventar aceite;
- o módulo já havia passado pela correção **E17** (`uuidRe` com `8-4-4-4-12`),
  necessária para o PATCH de exceção por UUID.

`IntegrationsClient` (PLT-03) continua deliberadamente fora: seu módulo aceita
qualquer sessão staff e o gate de papel depende de decisão do proprietário.

## 2. Antes e depois

**Antes:** protótipo órfão com `<section style={{...#333...}}>`, `any`, quatro
`fetch` sem verificação de status, `if(p.policies)` aceitando payload arbitrário
e um único `<p style={{color:'#0af'}}>` para sucesso, erro e exceção de rede.

**Depois:** 17ª aba do `TiConsole` no grupo Acesso e governança, com:

- quatro contratos preservados (`policies`, `exceptions`, `disposal/jobs`,
  `disposal/logs`) e os métodos `POST`/`PATCH` intactos;
- quatro estados de leitura distintos (`loading`, `ready`, `denied`, `error`),
  mais o estado `empty`, todos via `UiState` com retry;
- `Promise.all` com **sequência** contra resposta fora de ordem, validação
  `Array.isArray` nos quatro payloads e limpeza das coleções em 401/403/falha;
- **mapa de 27 motivos de erro** do servidor traduzidos para português
  (`description_min_10`, `exceptional_not_allowed`, `invalid_transition`,
  `rejection_reason_min_10`, `job_failed` etc.);
- `aria-busy`, `role="status"` no sucesso, `role="alert"` na falha de operação;
- fonte/data-base declaradas (job e descarte mais recentes, políticas ativas),
  drill-down ao JSON canônico de políticas, exceções, jobs e logs;
- CSS module com tokens compartilhados, breakpoints 900/650 px e
  `:focus-visible`, sem hex inline nem diálogos nativos;
- aviso permanente: o job é **simulação sintética**, **não apaga dados pessoais
  reais**, exige **parecer jurídico** e **Produção: NO-GO**.

Nenhuma rota, migração, permissão, contrato de API ou regra de negócio mudou.

## 3. RED → GREEN

| Etapa | Resultado |
|---|---|
| Teste focal `tests/ux-pro-03-ti-retention-ui.test.mjs` contra o protótipo | **RED 0/4** |
| Após a reescrita + 17ª aba + CSS | **GREEN 4/4** |
| `npm run typecheck` | **0** erros |

A guarda de reauditoria passou a exigir **17 abas** e `17/17` com prova focal;
o registro explícito `PROMOCOES_COM_PROVA` no gerador de inventário subiu para
**5 entradas** e exige este relatório.

## 4. Cenário A/B no gate do portal (PostgreSQL 17 + Chromium)

O 41º cenário de `tests/ux-portal-workspace.integration.test.mjs` roda em
cluster PostgreSQL 17 descartável + Chromium real, com contas `ti` e `rh`
sintéticas. Gate do portal: **40/40 → 41/41**.

| Prova | Resultado |
|---|---|
| Autorização no servidor | `rh` → **403** em `/policies` e `/disposal/jobs`; `ti` → **200** |
| Quatro larguras (320/390/768/1440) | aba recebe foco por teclado, `Enter` abre, `Fonte:`/`Data-base:`/avisos visíveis, **0 transbordo**, B não vaza |
| POST política pela UI | **200** com descrição válida; registro aparece na lista |
| Erro real traduzido | `description_min_10` → "A descrição da finalidade precisa ter pelo menos 10 caracteres." |
| POST exceção formal | **201**, com motivo/justificativa ≥ 10 caracteres |
| PATCH exceção por UUID (E17) | **200** — transição `solicitado → aprovado` com 200 dias aprovados |
| POST job de descarte | **201**, `status=concluido`, contagens de varredura/expirados/descartes; mensagem declara simulação sintética |
| Troca A → B no banco | `QA-PLT11-ALFA`, o registro criado em A e as mensagens antigas **não sobrevivem** à releitura |
| 503 injetado | `UiState` de erro + retry que sai do erro sem recarregar a página |
| 403 injetado | `UiState` negado, distinto de erro e de vazio |

**Defeito real encontrado pelo gate:** os labels `Motivo` e `Justificativa`
colidiam com `Motivo da rejeição`, e o texto de ajuda entrava no nome acessível —
`getByLabel` não encontrava os campos. Corrigido para `Motivo da exceção` e
`Justificativa da exceção` (labels únicos); RED 1/1 → GREEN 1/1 no cenário
isolado e 41/41 no gate completo. Nenhuma permissão ou contrato mudou.

## 5. Inventário e estado

- `scripts/ux-pro-03-ti-inventory.mjs` regenerou
  `docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv`/`.json`: 83 componentes,
  **17 abas**, 25 em workspaces e **41 órfãos** (eram 42), 5 promoções com prova.
- `scripts/requisitos-222-inventory.mjs` foi regenerado: **PLT-11 deixa de
  estar entre os `a_revalidar` sem gate** e passa a `mencionado_em_gate`
  (de 36 para 35 IDs no núcleo duro). Isso é **índice de evidência**, não
  reauditoria integral nem aceite humano — o campo `reauditoria_integral`
  continua `nao_executada` em todos os 222.

## 6. Bateria final

Executada em 27/10/2026 no branch `arena/6d37ed49-gruposegsystemseguranca`,
base `6b4212d7e45d58003391dd0291e6c504c5c2964a`:

| Verificação | Resultado |
|---|---|
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1119/1119** (205 arquivos `.mjs`, 142 no `test:unit`) |
| `npm run typecheck` | **0** erros |
| `npm run build` | **105/105** páginas |
| `qa-wave0-static` | **5/5** |
| `ux-pro-00` / `ux-pro-03-ti` / `requisitos-222` `--check` | **OK / OK / OK** (inclusive após os gates) |
| `npm audit --audit-level=moderate` | **0** vulnerabilidades |
| `git diff --check` | **limpo** |
| Gate do portal | **41/41** |
| Gates E6 grupos 1 / 2 / 3 | **6/6 · 7/7 · 6/6** |
| Gate 10B prévias | **5/5** (evidência com SHA `917236ad…` à época; hoje `14ff3232…` após a Opção A) |
| Workflows | **49** (nenhum novo) |
| `next-env.d.ts` `1862ac4b…` / `tsconfig.json` `2128c956…` | **preservados** |

Os cinco gates de navegador usam clusters descartáveis e `NEXT_DIST_DIR`
próprio; `next-env.d.ts`/`tsconfig.json` foram restaurados após cada um.

## 7. Limitações

- O **job de descarte continua sendo simulação sintética**: varre contagens e
  grava logs minimizados, mas não executa eliminação real de dados pessoais.
- A retenção efetiva, bases legais, prazos e descarte real dependem de
  **parecer jurídico** e decisão do proprietário (LGPD/CLT/fiscal).
- **0/222 IDs com aceite humano**; produção **NO-GO**. Sem UAT, Windows real,
  leitor de tela ou provedores reais.
- Restam **41 órfãos** de TI; D7/C11/E18, E3/E4, E9, E15/E16 e F14 seguem na fila.
