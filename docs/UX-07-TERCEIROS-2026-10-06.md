# UX-07 — Terceiros (EXT-02): workspace, vocabulário e gate focal

**Fatia:** UX-07 / EXT-02 — TERCEIROS
**Rota:** `/admin/terceiros`
**Servidor canônico:** `src/server/ext-third-party-api.mjs` (1.404 linhas, NÃO alterado)
**Data:** 2026-10-06
**SHA de base (main do GitHub):** `de9ac7b28740049b39e3b91d18cd893cda52efc9`
**Aceite humano:** **PENDENTE**. Marcelo e Andreia não participaram desta fatia.
Nada aqui é homologação.

Esta fatia reescreve a **APRESENTAÇÃO** da família TERCEIROS. Nenhum contrato
de servidor, banco ou migração foi tocado: `server.mjs`,
`src/server/ext-third-party-api.mjs` e `db/migrations/**` (001–174, incluindo a
085 e a 148 desta família) permanecem byte a byte iguais à main. Nenhuma
migração nova. Nenhum scheduler.

---

## 0. Reconciliação de pendências antes de editar (ETAPA 0)

1. **Branch atualizada a partir da main do GitHub.** `git fetch origin main`
   redescobriu o SHA após o merge da **#172** (EXT-01 / Frota):
   `de9ac7b28740049b39e3b91d18cd893cda52efc9`. O SHA anterior não foi
   presumido. A branch de trabalho desta sessão é
   `arena/eb436d0e-gruposegsystemseguranca`, criada a partir desse commit.
2. **Trabalho anterior preservado, nunca descartado.** Uma sessão anterior
   havia publicado parte desta fatia em
   `arena/cfd23bbd-gruposegsystemseguranca`. Essa branch foi trazida de forma
   **aditiva** (`git fetch` + `git merge --ff-only`), auditada arquivo a
   arquivo e então completada. Nenhum `git reset --hard`, nenhum `git clean`,
   nenhuma alteração local descartada.
   A auditoria encontrou três lacunas sérias naquele material, todas corrigidas
   aqui e registradas na seção 9:
   - `TerceirosWorkspace.tsx` havia sido reduzido de 751 para 29 linhas
     minificadas, perdendo vínculo de contrato, concessão e revogação de
     acesso, registro e desativação de documento, regra de antecedência e
     registro de avaliação. A reescrita desta fatia **preserva toda a
     capacidade do protótipo**;
   - `scripts/qa-ux-third-party-postgres.mjs` era um esboço de 9 linhas que só
     reexecutava testes unitários: não subia cluster, não aplicava migrações,
     não usava servidor real nem Chromium. Foi reescrito no molde de
     `scripts/qa-ux-fleet-postgres.mjs`;
   - `tests/ux-third-party-workspace.integration.test.mjs` não existia, e a
     pasta de evidências tinha apenas um `resumo.json` escrito à mão.
3. **PRs abertas que tocam terceiros/EXT-02 ou arquivos compartilhados
   (`package.json`, `scripts/ux-evidence-capture.mjs`,
   `src/components/ui/**`).** `gh pr list --state open` devolveu uma única PR
   aberta: a **#170** — *“UX-07 EXT-01 frota: workspace honesto, vocabulário de
   50 códigos e primeiro gate PG da família”*, da branch
   `arena/c2ce0741-gruposegsystemseguranca`. Ela é de FROTA, não de terceiros,
   e o conteúdo equivalente **já entrou na main pelo merge da #172**.
   **Recomendação registrada: fechar a #170 como duplicada.** Ela não foi
   excluída nem alterada por esta fatia.
4. **Branch `arena/32d9d78c-gruposegsystemseguranca` (PR #167, fechada).**
   Conferida em `git ls-remote origin`: **ainda existe** no remoto, apontando
   para `014bd7cc103f949759fc27cdae782e88c2e0ec4f`. Como a PR #167 foi fechada
   sem conteúdo exclusivo, fica a **recomendação de remoção da branch** — que
   não foi executada aqui: nenhuma branch é apagada por esta fatia.
5. **`src/components/ui/UiWorkspace.module.css` NÃO foi alterado.** A tela usa
   apenas classes que já existiam (`workspace`, `panel`, `panelTitle`, `tabs`,
   `tab`, `tabActive`, `tabPanel`, `fieldset`, `fieldRow`, `field`, `full`,
   `actions`, `metrics`, `metric`, `metricValue`, `metricLabel`, `tableWrap`,
   `table`, `card`, `cardTitle`, `facts`, `scrollList`, `dividedItem`,
   `rowWrap`, `footnote`, `hint`, `kicker`, `lede`, `breadcrumbNav`). Nenhuma
   classe nova foi necessária.

---

## 1. Contexto

EXT-02 é a jornada interna de **terceiros**: cadastro, vínculo de contrato
validado, documentos com vencimento, **janela de acesso temporária por escopo
autorizado** e avaliação. O critério do plano é *“terceiro acessa só OS/contrato
autorizado e perde acesso ao término”*, e o servidor o cumpre por derivação
determinística de `access_end` — nunca por marcação manual.

A **fronteira externa é declarada, não simulada**: não existe hoje ator externo
“terceiro” autenticado neste sistema. As sessões canônicas são de staff, de
cliente e de colaborador. Esta fatia **não** cria sessão, login ou canal externo
de terceiro; ela mostra a declaração que o próprio servidor devolve em
`external_actor_boundary` e nomeia o ponto de imposição real
(`GET /api/ext/third-party/parties/<id>/authorization`).

---

## 2. Diagnóstico do protótipo (medido antes de editar)

`src/app/admin/terceiros/TerceirosWorkspace.tsx`, 751 linhas na main.

| # | Defeito medido | Evidência no protótipo | Correção nesta fatia |
|---|---|---|---|
| 1 | Classe utilitária avulsa | 167 `className=`, todas literais; `"border rounded px-2 py-1.5 text-sm"` ×20, `"text-xs text-gray-500"` ×12, `"font-semibold text-sm"` ×9, `"border rounded p-3 space-y-2"` ×8, `"px-4 py-3 text-left font-medium text-gray-500"` ×7 | 100% das classes vêm de `UiWorkspace.module.css`; o teste anti-deriva falha se aparecer `className` literal |
| 2 | Campo sem rótulo | 22 `placeholder=`, **0** `<label>` | todo controle tem `<label htmlFor>` real; zero `placeholder` |
| 3 | Sem abas reais | `role="tab"`, `role="tablist"`, `aria-selected`: 0 ocorrências | oito abas `tablist/tab/tabpanel` com roving tabindex e ←/→/Home/End |
| 4 | Sem estado honesto de leitura | nenhum `UiState`; falha virava um parágrafo e a tabela continuava renderizável | `UiState` por leitura; em falha a tabela e os contadores ficam **ausentes do DOM** |
| 5 | Recusa de papel confundida com falha | `403 forbidden_role` caía no mesmo texto genérico de erro | estado **NEGADO** (`data-ui-state="denied"`), distinto de falha, com o código no rodapé técnico |
| 6 | Falha de uma leitura contaminando a outra | `decisionError` existia, mas a falha da consulta de autorização ficava ao lado do dossiê sem distinguir “não decidiu” de “negou” | três leituras independentes; a falha da decisão diz explicitamente que **falha de consulta não é negativa de acesso** |
| 7 | Motivo e chave compartilhados entre linhas | `deactivateForm.document_id` e `revokeForm.grant_id` eram campos de texto únicos: o motivo digitado valia para qualquer documento/janela | motivo e chave de idempotência **por registro**, em campo rotulado da própria linha |
| 8 | Chave de idempotência invisível na falha | a mensagem dizia “a chave foi preservada”, sem mostrá-la | a chave aparece na íntegra junto do erro, e a repetição reaproveita a mesma |
| 9 | Ausência exibida como traço mudo | `"—"`, `"— não declarada"`, `"— sem avaliação canônica"` | ausência **nomeada** pelo vocabulário; nota 0 real continua `0/10` |
| 10 | Valor cru do banco na tela | `tp.status`, `grant.scope_kind`, `event.event_type` saíam como `ativo`, `ordem_servico`, `acesso_concedido` | ENUMs traduzidos; valor desconhecido passa cru |

Sem `style=` inline no protótipo (0 ocorrências) — e continua em zero.

---

## 3. Método do levantamento de códigos de erro

Cinco buscas independentes sobre o **arquivo real** do servidor canônico. O
método está repetido no cabeçalho de `src/lib/third-party-vocabulary.mjs` e é
verificado por `tests/ux-third-party-vocabulary.test.mjs`.

| Busca | Comando | Resultado |
|---|---|---|
| literais | `grep -oE "error:\s*['\"][a-z_0-9]+['\"]" … \| sort -u` | **49 códigos distintos** |
| ramo `deny` | `grep -nE 'deny' …` | 21 ocorrências; 13 códigos só nascem em `{ deny: { code, body: { error } } }` — todos já contidos nos 49 |
| wrappers/exceções | `grep -nE 'function (bad\|fail\|deny)\(\|HttpError\|throw new' …` | **nada**: a família não tem wrapper local nem exceção convertida |
| ternários | `grep -nE '\?.*error:' …` | **nada** (diferente de EXT-01 `duplicate_plate` e de EXT-06) |
| template/variável | `grep -nE 'error:\s*(\`\|[A-Za-z_]+[,}])' …` | **nada**: nenhum código montado por concatenação |

O extrator do teste remove antes os operandos de `.includes("…")` e de
`[=!]==? "…"` — são valores de ENUM e nomes de método HTTP, não códigos.

**Decisões registradas**

- **Rota legada VIVA ⇒ entra no vocabulário.** `handleLegacyThirdParties` e
  `handleLegacyThirdPartyDocuments` continuam religados em `server.mjs`
  (oito aliases) e respondem 200 em leitura e 410 `legacy_route_retired` com
  `use: <canônica>` em escrita. `legacy_route_retired` entra no vocabulário,
  mesmo critério de EXT-01 e EXT-06. **A tela não consome rota legada alguma**
  — provado estaticamente e no gate.
- **Nenhum handler morto.** Os doze handlers exportados por
  `createExtThirdPartyApi()` estão no dispatch. O teste falha se algum sair.
- **Total:** 49 códigos do servidor + 1 descritor de falha de rede
  (`status: 0`), que não é código do servidor e por isso é nomeado à parte.

---

## 4. O que mudou

**Apresentação** (`src/app/admin/terceiros/TerceirosWorkspace.tsx`, reescrito)

- oito abas reais: Terceiros registrados, Registrar terceiro, Dossiê e
  contrato, Janelas de acesso, Decisão de autorização, Documentos e regra,
  Avaliações, Trilha de eventos;
- três leituras independentes — lista (`GET /parties`), dossiê
  (`GET /parties/{id}`, que o servidor devolve com janelas, documentos, regra,
  avaliações e trilha numa única resposta canônica) e decisão
  (`GET /parties/{id}/authorization`);
- falha nunca vira lista vazia nem indicador zero; vazio legítimo diz que *a
  leitura funcionou*;
- recusa de papel vira NEGADO; a chave de idempotência fica visível na falha;
- todo texto de justificativa/motivo vem de campo rotulado preenchido por quem
  opera — a tela nunca escreve no lugar de ninguém;
- responsivo a 390px, provado por medição de transbordo.

**Camadas novas**

- `src/lib/third-party-vocabulary.mjs` + `.d.mts` — 49 códigos traduzidos,
  ENUMs (situação, escopo, janela, situação de acesso, decisão, vencimento,
  evento), ausência nomeada, fronteira externa declarada, formatação pt-BR;
- `src/lib/third-party-request.ts` — `{ok,data} | {ok,error}`, cobre rede
  (`status: 0`), resposta sem JSON e HTTP de erro, e **preserva o payload cru**
  (`use`, `note`, `grant_id`, `status`, `contract_status`,
  `service_order_status`, `blocking_statuses`).

**Testes e gates**

- `tests/ux-third-party-vocabulary.test.mjs` (15 testes, estático anti-deriva);
- `tests/ux-third-party-workspace.integration.test.mjs` (10 testes, HTTP +
  PostgreSQL + Chromium reais);
- `scripts/qa-ux-third-party-postgres.mjs` (cluster descartável, migrações
  reais, servidor real, Chromium, limpeza do temporário, marcas
  `UX_THIRD_PARTY_SETUP: …`);
- `package.json`: `test:ux-third-party:pg` e o teste de vocabulário dentro de
  `test:unit`;
- `.github/workflows/ux-third-party-delivery.yml`, com paths restritos,
  typecheck, vocabulário, teste herdado `tests/ext02-third-parties.test.mjs`,
  gate herdado `npm run test:ext02-third-parties:pg` e gate novo
  `npm run test:ux-third-party:pg`, no molde de `ux-fleet-delivery.yml`;
- `scripts/ux-evidence-capture.mjs`: etapa `ux-07-terceiros`.

---

## 5. O que NÃO mudou

- `server.mjs` — intacto;
- `src/server/ext-third-party-api.mjs` — intacto;
- `db/migrations/**` (001–174) — intactas; **nenhuma migração nova**;
- `src/components/ui/UiWorkspace.module.css` — intacto;
- AdminGate de `/admin/terceiros` — continua `["marcelo","admin","ti"]`, não
  alargado; quem autoriza é o servidor;
- rotas legadas — continuam vivas no servidor, e continuam não sendo
  consumidas pela tela;
- nenhum scheduler, nenhum job, nenhuma credencial, nenhum dado pessoal.

---

## 6. Testes e gates executados localmente

| Comando | Resultado |
|---|---|
| `npm run typecheck` | **OK** |
| `node --test tests/ux-third-party-vocabulary.test.mjs` | **15/15** |
| `node --test tests/ext02-third-parties.test.mjs` | **50/50** |
| `npm run test:unit` | **815/815** |
| `npm run test:ext02-third-parties:pg` | **22/22** (`EXT02_TAP_SUMMARY: pass=22 fail=0 … minimo_exigido=21`) |
| `npm run test:ux-third-party:pg` | **10/10** (`UX_THIRD_PARTY_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true`) |
| `npm run ux:evidence -- --stage=ux-07-terceiros` | **OK**, `UX_EVIDENCE_EXIT: 0` |

Nenhuma asserção foi enfraquecida para ficar verde.

---

## 7. Evidência

`docs/ux-07-terceiros-evidencias/`:

- `desktop-terceiros.png` — 1440×900;
- `mobile-terceiros.png` — 390×844;
- `resumo.json` — gerado por `scripts/ux-evidence-capture.mjs`, sem problema
  de acessibilidade registrado (os únicos itens externos bloqueados são as
  fontes do Google, que não têm saída de rede no ambiente de captura).

A captura roda em **banco limpo**: a tela aparece com o **vazio honesto**
(“A leitura funcionou e nenhum terceiro canônico está registrado”), nunca com
lista zerada. A jornada com massa real — contrato validado, janela vigente,
documento *a vencer* com regra explícita, nota **zero real**, recusa 403,
falha independente e teclado nas abas — é provada pelo gate de integração
(`UX_THIRD_PARTY_EVIDENCE_DIR`). **Cobertura parcial declarada.**

---

## 8. Decisões registradas

- **Fronteira externa.** Declarada na tela e conferida no teste: não existe
  ator externo “terceiro” autenticado; nenhum login, sessão ou portal de
  terceiro é simulado. A tela nomeia o ponto de imposição do servidor.
- **Grant granular.** O `grant` desta família é permissão de **negócio**
  (janela de acesso do terceiro a um contrato ou a uma OS), não permissão de
  sessão. O acesso à tela continua decidido por sessão de equipe, papel e
  origem. Por isso a etapa de evidência não declara o gancho opcional
  `grants`: ele seria no-op aqui.
- **Provisionamento mínimo de outra família.** Conceder janela exige contrato
  canônico em `crm_contracts` (migração 027), que não tem rota nesta jornada. O
  contrato e a proposta mínima exigida pela chave estrangeira são inseridos por
  SQL no gate — exatamente como já faz o gate herdado. **Nenhuma tabela
  `ext_third_party_*` é escrita por SQL**: toda a massa de EXT-02 nasce pelas
  APIs canônicas, por HTTP.
- **Datas ancoradas no servidor.** `SELECT CURRENT_DATE` pelo pool, nunca o
  relógio do processo de teste.

---

## 9. O que ficou legado de propósito

- os oito aliases legados continuam religados no servidor (leitura 200,
  escrita 410). Aposentá-los é mudança de contrato de servidor, fora do escopo
  desta fatia de apresentação;
- `ext_third_party_access_logs` (migração 085) continua existindo e **não
  decide acesso**; a tela não a lê;
- o registro de documento continua sendo apenas metadado: esta fatia não faz
  upload de arquivo real, e a ausência de bytes é declarada na tela.

---

## 10. Limitações

- **Aceite humano PENDENTE.** Marcelo e Andreia não participaram. Nada aqui é
  homologação.
- A captura de evidência é de banco limpo; a jornada com massa é coberta pelo
  gate, não pelas duas imagens.
- O gate roda com o Chromium empacotado em `--single-process`; o laço de
  retomada repete apenas crash de navegador e **nunca** engole
  `ERR_ASSERTION`.

---

## 11. Arquivos

```
src/app/admin/terceiros/TerceirosWorkspace.tsx   (reescrito)
src/lib/third-party-vocabulary.mjs               (novo)
src/lib/third-party-vocabulary.d.mts             (novo)
src/lib/third-party-request.ts                   (novo)
tests/ux-third-party-vocabulary.test.mjs         (novo)
tests/ux-third-party-workspace.integration.test.mjs (novo)
scripts/qa-ux-third-party-postgres.mjs           (novo)
scripts/ux-evidence-capture.mjs                  (etapa ux-07-terceiros)
package.json                                     (test:ux-third-party:pg + test:unit)
.github/workflows/ux-third-party-delivery.yml    (novo)
docs/ux-07-terceiros-evidencias/                 (novo)
docs/UX-07-TERCEIROS-2026-10-06.md               (este documento)
```

---

## 12. Próxima fatia

**EXT-03 — LICITAÇÕES**, rota `/admin/licitacoes`, servidor canônico
`src/server/ext-bidding-api.mjs`, com o mesmo molde: levantamento de códigos com
método registrado, vocabulário, wrapper seguro, reescrita de apresentação,
teste anti-deriva, gate focal em PostgreSQL real, workflow focal e evidência.
