# UX-PRO-03 — 7ª promoção com prova: PLT-10 Pedidos LGPD (28/10/2026)

**Estado:** entregue localmente. Produção segue **NO-GO**. Sem aceite humano, UAT
ou parecer jurídico.

## 1. Escolha e critério

A decisão de 02/10 só permite promover um componente órfão **com prova**: rota
real, autorização decidida no servidor, origem/fonte/data-base, drill-down,
teste focal e cenário A/B no gate. `LgpdRequestClient.tsx` (95 linhas) foi
escolhido porque:

- é um dos **40 órfãos** do inventário reproduzível de TI
  (`docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv`);
- seus handlers em `src/server/lgpd-request-api.mjs` já exigem papel **nomeado**
  — `['admin','ti','rh']` na leitura administrativa, no detalhe e no PATCH
  (`lgpd_restricted_admin_ti_rh` / `lgpd_restricted`), nunca apenas "sessão
  staff" genérica; o canal público do titular (`POST /api/lgpd/requests`) exige
  mesma origem e corpo limitado a 10 KB e **não foi tocado**;
- o requisito **PLT-10** está entre os **21 IDs sem nenhuma menção em gate** do
  inventário de 222 IDs — a promoção ataca duas filas ao mesmo tempo, sem
  inventar aceite;
- nenhuma permissão, rota, migração ou contrato precisou mudar: a UI é
  **mais estreita** do que a API (o console é restrito a `ti`/`admin` por
  `AdminGate`, enquanto a API também aceita `rh`).

`IntegrationsClient` (PLT-03) continua deliberadamente fora: seu módulo aceita
qualquer sessão staff e o gate de papel depende de decisão do proprietário.

## 2. Antes e depois

**Antes:** protótipo órfão com `<div style={{...#e5e7eb...}}>`, `any`, quatro
`fetch` sem verificação de status, `due_date?.slice(0,10)` (data errada quando o
driver devolve ISO em UTC), `j.requests?.length` aceitando payload arbitrário,
um único `<div>` para sucesso, erro e exceção de rede, e o texto "mesmo endpoint
usado em `/privacidade`" — **falso**: `/privacidade` não tem formulário nem
`fetch` (verificado em 28/10).

**Depois:** 19ª aba do `TiConsole` no grupo Acesso e governança, com:

- os **quatro contratos preservados** (lista administrativa, detalhe por UUID,
  canal público do titular, transição por UUID) e os métodos `POST`/`PATCH`
  intactos, mais os **quatro filtros** que a API já aceitava e o protótipo nunca
  usava (`type`, `status`, `email`, `limit`);
- **quatro estados de leitura** distintos (`loading`, `ready`, `denied`,
  `error`), mais `empty` e o estado próprio do detalhe, todos via `UiState` com
  retry;
- **sequência** contra resposta fora de ordem na lista **e** no detalhe,
  validação `Array.isArray`/registro canônico, limpeza das coleções em
  401/403/falha e detalhe descartado **somente** quando o pedido sai da leitura;
- **mapa de 24 motivos de erro** do servidor traduzidos para português
  (`identity_verification_required`, `legal_impediment_must_be_documented`,
  `invalid_transition` com o `detail` do servidor, `invalid_request_id`,
  `lgpd_unavailable` etc.);
- leitura de data corrigida: `parseDateOnly` lê `YYYY-MM-DD` do texto em vez de
  cortar o ISO, e o prazo de 15 dias é dito em dias (vencido / vence hoje /
  faltam N);
- `aria-busy`, `role="status"` no sucesso, `role="alert"` na falha de operação;
- fonte/data-base declaradas (tabelas `lgpd_requests` e `lgpd_request_history`,
  pedido mais recente, prazo mais próximo, contagens de abertos/verificados/
  vencidos), drill-down ao **JSON canônico** e ao **histórico de transições**;
- transições oferecidas só entre as permitidas pela máquina de estados (espelho
  informativo — quem decide é o servidor); em status final o seletor mostra
  apenas o status atual e o `next_status` **não é enviado** — assim é possível
  registrar responsável, impedimento ou resposta sem forçar uma transição que o
  servidor recusaria com `invalid_transition`;
- CSS module com tokens compartilhados, breakpoints 900/650 px e
  `:focus-visible`, sem hex inline nem diálogos nativos (`alert`/`prompt`/
  `confirm` retirados do fluxo);
- aviso permanente: marcar "identidade verificada" é **declaração do operador**,
  a tela **não envia** e-mail, **não elimina** dados, o documento do titular
  existe **apenas como hash**, e o procedimento exige **parecer jurídico** e
  decisão do proprietário. **Produção: NO-GO.**

Nenhuma rota, migração, permissão, contrato de API ou regra de negócio mudou.

## 3. RED → GREEN

| Etapa | Resultado |
|---|---|
| Teste focal `tests/ux-pro-03-ti-lgpd-requests-ui.test.mjs` contra o protótipo | **RED 0/4** |
| Após a reescrita + 19ª aba + CSS | **GREEN 4/4** |
| `npm run typecheck` | **0** erros |

A guarda de reauditoria passou a exigir **19 abas** e `19/19` com prova focal; o
registro explícito `PROMOCOES_COM_PROVA` no gerador de inventário subiu para
**7 entradas** e exige este relatório (sem o arquivo, o `--check` falha).

## 4. Cenário A/B no gate do portal (PostgreSQL 17 + Chromium)

O 43º cenário de `tests/ux-portal-workspace.integration.test.mjs` roda em
cluster PostgreSQL 17 descartável + Chromium real, com contas `ti`, `rh` e
`comercial` sintéticas.

| Prova | Resultado |
|---|---|
| Autorização no servidor | `comercial` → **403** `lgpd_restricted_admin_ti_rh` na leitura **e** no PATCH; `ti` → **200**; `rh` → **200** na API |
| UI mais estreita que a API | `rh` em `/admin/ti` vê `[data-admin-gate="forbidden"]` e **nenhuma** aba "Pedidos LGPD" |
| Canal público preservado | `POST /api/lgpd/requests` sem sessão → **201**, com `requester_document_hash` e **sem** o documento em claro |
| Quatro larguras (320/390/768/1440) | aba recebe foco por teclado, `Enter` abre, `Fonte:`/`Data-base:`/prazo em dias/avisos visíveis, **0 transbordo**, B não vaza |
| Hash do documento | só o prefixo aparece na tela; o hash completo semeado **não** aparece |
| POST pela UI | **201** via canal público; o pedido entra na fila |
| Erro real traduzido | `description_min_10` → "A descrição do pedido precisa ter pelo menos 10 caracteres." |
| Filtro com vazio honesto | e-mail inexistente → `UiState` **empty**, **0** estado de erro; "Limpar filtros" devolve a fila |
| PATCH pela UI (E17) | **200** — `recebido → em_verificacao` com motivo gravado no histórico |
| Regra real do servidor | aprovar sem identidade verificada → **400** `identity_verification_required` traduzido, status **inalterado** no banco |
| Mesma transição com verificação | **200** → `aprovado`, `is_identity_verified=true`, histórico com ≥ 2 transições conferido na tela |
| Troca A → B no banco | `QA-PLT10-ALFA` → `QA-PLT10-BETA`: o estado A, o registro criado em A e as mensagens antigas **não sobrevivem** à releitura |
| 503 injetado | `UiState` de erro + retry que sai do erro sem recarregar a página |
| 403 injetado | `UiState` negado, distinto de erro e de vazio |

**Execução:** o cenário nasceu **RED** e foi corrigido em três passos, todos de
UI/teste (nenhum contrato mudou): (1) a frase de privacidade estava oculta;
(2) a releitura após o `201` remonta o painel e o `<details>` volta recolhido —
o teste reabre a seção e repete os campos obrigatórios, sem os quais o servidor
responderia `invalid_requester_name` antes de `description_min_10`; (3) dois
`UiState empty` conviviam (fila e detalhe sem seleção), violando o modo estrito
do Playwright — o detalhe sem seleção deixou de ser `UiState`. Depois disso:
**GREEN 1/1** isolado e **43/43** no gate completo.

**Defeito real encontrado pelo gate (primeira execução RED 0/1):** a frase
"armazenado apenas como hash" existia só dentro do `<details>` recolhido do
cadastro público, então `innerText` — que ignora conteúdo oculto — não a
encontrava em nenhuma das quatro larguras. A declaração de privacidade foi
movida também para a nota permanente de limites (sempre visível), sem remover o
texto de ajuda do campo.

## 5. Inventário e estado

- `scripts/ux-pro-03-ti-inventory.mjs` regenerou
  `docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv`/`.json`: 83 componentes,
  **19 abas**, 25 em workspaces e **39 órfãos** (eram 40), 7 promoções com prova.
- `scripts/requisitos-222-inventory.mjs` foi regenerado: **PLT-10 deixa de estar
  entre os IDs `a_revalidar` sem nenhuma menção em gate** e passa a
  `mencionado_em_gate` (o teste focal é nomeado por área, não pelo ID, de
  propósito — o mesmo critério usado em PLT-11). Isso é **índice de evidência**,
  não reauditoria integral nem aceite humano: `aceite_humano` continua
  `nao_registrado` e `reauditoria_integral` continua `nao_executada` nos 222.

## 6. Bateria final

Executada em 28/10/2026 no branch `arena/f74d6cd2-gruposegsystemseguranca`,
base `cd3a4cfd806e660573f03427e5e1db2192b7a4ce`:

| Verificação | Resultado |
|---|---|
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1182/1182** (216 `.mjs` em `tests/`, **153** no `test:unit`) |
| `npm run typecheck` | **0** erros |
| `npm run build` | **106/106** páginas, `101` `page.tsx` |
| `qa-wave0-static` | **5/5** |
| `ux-pro-00` `--check` | **OK** — 101 rotas, 101 com gate |
| `ux-pro-03-ti` `--check` | **OK** — 83 componentes, 19 abas, 7 promoções com relatório |
| `requisitos-222` `--check` | **OK** — 222 IDs, **20** `a_revalidar` sem gate |
| `requisitos-sec-reaudit` `--check` | **OK** — 35/35 âncoras |
| `npm audit --audit-level=moderate` | **0** vulnerabilidades |
| `git diff --check` / `git status --porcelain` | **limpo** (só os arquivos desta fatia) |
| Gate do portal — cenário PLT-10 isolado (`UX_PORTAL_TEST_PATTERN`) | **1/1** |
| Gate do portal — execução completa | **43/43** (era 42/42) |
| `npm run test:migrations:pg` | **181/181**, **581** tabelas, checksum negativo rejeitado |
| `next-env.d.ts` `1862ac4b…` / `tsconfig.json` `2128c956…` | **preservados** |
| Workflows | **49** (nenhum novo; `ux-portal-delivery.yml` já cobre `src/app/admin/ti` via `server.mjs`/`tests/ux-portal-workspace.integration.test.mjs`) |

**Nota de ambiente (E22):** neste sandbox o Chromium empacotado
(`@sparticuz/chromium`) só inicia se as bibliotecas AL2023 do próprio pacote
(`libnspr4`, `libnss3`, `libnssutil3`) forem extraídas para `/tmp/al2023/lib` —
o `inflate` de `al2023.tar.br` é pulado quando `/tmp/al2023` já existe vazio.
Com isso, os **dois** testes que historicamente falhavam por falta de
bibliotecas do Chromium passaram, e `npm test` fecha **1182/1182** em vez de
1174/1176. Isso **não** é correção do E22: nenhuma configuração do repositório
mudou; a dependência de bibliotecas do SO continua existindo em outra máquina.

## 7. Limitações

- A verificação de identidade continua **declarativa**: o operador marca a
  caixa; o servidor grava `verified_by`/`verified_at`, mas nenhum método de
  verificação real (e-mail, documento, presencial, vídeo) é executado.
- A resposta ao titular **não é enviada**: `atendido` apenas registra
  `response_sent_at`. Depende de provedor SMTP e decisão do proprietário.
- Nenhuma eliminação/anonimização real de dados é executada por esta tela.
- **0/222 IDs com aceite humano**; produção **NO-GO**. Sem UAT, Windows real,
  leitor de tela ou provedores reais.
- Restam **39 órfãos** de TI; D7/C11, E3/E4, E7–E9, E15/E16, E22 e F14/F15
  seguem na fila.
