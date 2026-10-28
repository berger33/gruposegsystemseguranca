# UX-PRO-03 — 6ª promoção com prova: PLT-13 Configurações e rollout (27/10/2026)

**Estado:** entregue localmente. Produção segue **NO-GO**. Sem aceite humano, UAT ou autorização de mudança.

## 1. Escolha e critério

A decisão de 02/10 só permite promover um componente órfão **com prova**: rota
real, autorização decidida no servidor, origem/fonte/data-base, drill-down,
teste focal e subteste no gate. `ConfigClient.tsx` (167 linhas) foi escolhido
porque:

- é um dos **41 órfãos** restantes do inventário reproduzível de TI;
- os quatro handlers de `src/server/config-api.mjs` (`flags`, `flagById`,
  `maintenance`, `rollouts`) já exigem `requireRole(sess,['admin','ti'])` —
  nenhuma permissão precisou ser alterada;
- a API **já mascara segredos** nos GETs (`value: { masked: true }`), e a UI
  antiga não declarava isso — a fatia tornou o mascaramento explícito;
- o requisito **PLT-13** estava entre os **35 IDs `a_revalidar` sem nenhuma
  menção em gate** do inventário de 222 IDs.

`LgpdRequestClient` (PLT-10) foi avaliado e **deixado de fora**: seu endpoint
público `POST /api/lgpd/requests` não exige sessão administrativa, então a
promoção exigiria antes uma decisão de papel/escopo que não cabe nesta fatia.
`IntegrationsClient` (PLT-03) continua bloqueado pelo mesmo motivo de sempre.

## 2. Antes e depois

**Antes:** protótipo órfão com `<section style={{...#333...}}>`, `any` em
quatro tipos, `JSON.parse` sem tratamento, sete `fetch` sem verificação de
status, `if(f.flags)` aceitando payload arbitrário e um único
`<p style={{color:'#0af'}}>` para sucesso, erro e exceção de rede. Nenhum aviso
de que a tela é inventário e não ativa produção.

**Depois:** 18ª aba do `TiConsole` no grupo Saúde e operação, com:

- três contratos de leitura + o detalhe de flag por UUID, e os métodos
  `POST`/`PATCH` intactos;
- quatro estados de leitura distintos (`loading`, `ready`, `denied`, `error`),
  mais `empty`, via `UiState` com retry;
- `Promise.all` com **sequência** contra resposta fora de ordem, validação
  `Array.isArray` nos três payloads, validação do objeto `flag` no detalhe e
  limpeza das coleções em 401/403/falha;
- **mapa de 23 motivos de erro** traduzidos (`secret_cannot_be_business`,
  `invalid_transition`, `schedule_required`, `no_changes`, `value_must_be_object`
  etc.) e `parseObject`/`parseArray` que recusam JSON inválido com mensagem
  clara, sem `any` e sem exceção não tratada;
- `aria-busy`, `role="status"` no sucesso, `role="alert"` na falha de operação;
- fonte/data-base declaradas (flag, janela e rollout mais recentes; contagem de
  negócio/infra/produção), drill-down ao JSON canônico de flags, histórico,
  janelas e rollouts;
- **separação explícita negócio × infra**, rótulo de valor **mascarado pelo
  servidor** para `is_secret`, `environment` com ajuda declarativa e
  `rollback_plan` visível;
- CSS module com tokens compartilhados, breakpoints 900/650 px e
  `:focus-visible`, sem hex inline nem diálogos nativos;
- aviso permanente: **inventário declarativo**, **não ativa produção**, não
  conecta provedores, não altera tráfego, depende de **decisão do
  proprietário** e **Produção: NO-GO**.

Nenhuma rota, migração, permissão, contrato de API ou regra de negócio mudou.

## 3. RED → GREEN

| Etapa | Resultado |
|---|---|
| Teste focal `tests/ux-pro-03-ti-config-ui.test.mjs` contra o protótipo | **RED 0/4** |
| Após a reescrita + 18ª aba + CSS | **GREEN 4/4** |
| `npm run typecheck` | **0** erros |

A guarda de reauditoria passou a exigir **18 abas** e `18/18` com prova focal;
o registro `PROMOCOES_COM_PROVA` no gerador subiu para **6 entradas** e exige
este relatório.

## 4. Cenário A/B no gate do portal (PostgreSQL 17 + Chromium)

O 42º cenário de `tests/ux-portal-workspace.integration.test.mjs` roda em
cluster PostgreSQL 17 descartável + Chromium real, com contas `ti` e `rh`
sintéticas. Gate do portal: **41/41 → 42/42**.

| Prova | Resultado |
|---|---|
| Autorização no servidor | `rh` → **403** em `/flags`, `/maintenance` e `/rollouts`; `ti` → **200** |
| Quatro larguras (320/390/768/1440) | aba recebe foco por teclado, `Enter` abre, `Fonte:`/`Data-base:`/avisos e mascaramento visíveis, **0 transbordo**, B não vaza |
| POST flag pela UI | **201**; chave normalizada para minúsculas pelo servidor |
| Erro real traduzido | `secret_cannot_be_business` → " Uma flag secreta de infraestrutura não pode ser marcada como regra de negócio." |
| GET detalhe + PATCH flag | **200**, histórico registrado; rollout alterado para 60% |
| POST rollback por UUID (E17) | **200** — volta ao valor anterior do histórico |
| POST manutenção | **201** com janela, serviços afetados e `rollback_plan` |
| POST rollout + PATCH aprovação | **201 / 200** — transição `rascunho → aprovado` |
| Troca A → B no banco | `QA-PLT13-ALFA`, a flag criada em A, a **seleção órfã** e as mensagens antigas **não sobrevivem** à releitura |
| 503 injetado | `UiState` de erro + retry que sai do erro sem recarregar |
| 403 injetado | `UiState` negado, distinto de erro e de vazio |

**Quatro defeitos reais encontrados pelo gate** (todos corrigidos nesta fatia,
nenhuma permissão ou contrato mudou):

1. **Labels ambíguos**: o texto de ajuda (`<small>`) entra no nome acessível e
   `Motivo`/`Descrição`/`Título` colidiam entre seções. Renomeados para nomes
   **globalmente únicos** (`Descrição da flag`, `Título da janela`,
   `Descrição do rollout`, `Início da janela`, etc.) — melhora de acessibilidade.
2. **`<details>` reabertos cedo demais**: o `mutate` mostra a mensagem de
   sucesso **antes** de terminar o reload, que remonta a aba e fecha os painéis.
   O helper passou a esperar `aria-busy="false"` antes de abrir e a setar
   `open` diretamente (sem toggle).
3. **Chave normalizada**: a API faz `key.toLowerCase().replace(/\s+/g,'_')`,
   então `QA-PLT13-UI flag` vira `qa-plt13-ui_flag`. As buscas e a asserção A/B
   foram ajustadas para case-insensitive.
4. **Limpeza case-sensitive**: o `DELETE ... WHERE key LIKE 'QA-PLT13-%'` do
   cenário não apagava a flag criada pela UI (minúscula), que sobrevivia ao
   estado B e foi **detectada pela asserção A/B**. Corrigido para `ILIKE`.

**Guardas focais de promoções anteriores:** o teste do PLT-11 congelava
`keys.length === 17` e quebrou ao adicionar a 18ª aba. Ambas as guardas focais
passaram a verificar **presença** (`>= 17` / `>= 18`) em vez de total exato —
novas promoções não derrubam fatias já entregues.

**Flakiness E9 (registro honesto):** a primeira execução do portal completo
deu **41/42**, com falha no cenário 19 (`ID3: reclamações restritas`, antigo e
sem relação com esta fatia: "o protocolo precisa estar visível"). O cenário
passou **1/1 isolado** e a repetição do gate completo fechou **42/42**. Nenhuma
regressão desta fatia; E9/flakiness segue aberta na fila.

## 5. Inventário e estado

- `scripts/ux-pro-03-ti-inventory.mjs` regenerou
  `docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv`/`.json`: 83 componentes,
  **18 abas**, 25 em workspaces e **40 órfãos** (eram 41), 6 promoções com prova.
- `scripts/requisitos-222-inventory.mjs` foi regenerado: **PLT-13 deixa de
  estar entre os `a_revalidar` sem gate** e passa a `mencionado_em_gate`
  (de 35 para 34 IDs no núcleo duro). Isso é **índice de evidência**, não
  reauditoria integral nem aceite humano — o campo `reauditoria_integral`
  continua `nao_executada` em todos os 222.

## 6. Bateria final

Executada em 27/10/2026 no branch `arena/6d37ed49-gruposegsystemseguranca`,
base `6b4212d7e45d58003391dd0291e6c504c5c2964a`:

| Verificação | Resultado |
|---|---|
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1123/1123** (206 arquivos `.mjs`, 143 no `test:unit`) |
| `npm run typecheck` | **0** erros |
| `npm run build` | **105/105** páginas |
| `qa-wave0-static` | **5/5** |
| `ux-pro-00` / `ux-pro-03-ti` / `requisitos-222` `--check` | **OK / OK / OK** (inclusive após os gates) |
| `npm audit --audit-level=moderate` | **0** vulnerabilidades |
| `git diff --check` | **limpo** |
| Gate do portal | **42/42** (1ª execução 41/42 por flakiness E9; repetição 42/42) |
| Gates E6 grupos 1 / 2 / 3 | **6/6 · 7/7 · 6/6** |
| Gate 10B prévias | **5/5** (evidência com SHA `917236ad…` à época; hoje `14ff3232…` após a Opção A) |
| Workflows | **49** (nenhum novo) |
| `next-env.d.ts` `1862ac4b…` / `tsconfig.json` `2128c956…` | **preservados** |

Os cinco gates de navegador usam clusters descartáveis e `NEXT_DIST_DIR`
próprio; `next-env.d.ts`/`tsconfig.json` foram restaurados após cada um.

## 7. Limitações

- A tela **não é um sistema de feature flags ativo**: gravar uma flag no banco
  não muda comportamento de produção nem publica rollout.
- `environment='production'` é apenas uma anotação de destino. Ativação real,
  rollout, reversão e janela de manutenção dependem de aprovação e **decisão do
  proprietário** (D7/C11).
- Segredos reais exigem cofre; o mascaramento é do servidor, mas o valor
  continua no banco — não armazene credencial real sem decisão explícita.
- **0/222 IDs com aceite humano**; produção **NO-GO**. Sem UAT, Windows real,
  leitor de tela ou provedores reais.
- Restam **40 órfãos** de TI; D7/C11/E18, E3/E4, E9, E15/E16 e F14 seguem na fila.
