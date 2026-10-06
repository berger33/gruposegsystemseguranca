# UX-07 — Terceiros (EXT-02)

**Rota:** `/admin/terceiros`  
**Servidor canônico:** `src/server/ext-third-party-api.mjs` (não alterado)  
**Data:** 2026-10-06  
**SHA de base:** `de9ac7b28740049b39e3b91d18cd893cda52efc9`  
**Aceite humano:** **PENDENTE**. Marcelo e Andreia não participaram; nada aqui é homologação.

## 0. ETAPA 0

`git fetch origin main` confirmou a main no SHA acima, já contendo a PR #172. O clone era raso e `git diff origin/main...origin/pr-170` falhou com `no merge base`; foi executado o fetch aditivo `git fetch --unshallow origin main`, sem reset, clean ou descarte local.

A única PR aberta que tocava os arquivos compartilhados era a **#170**. Foram executados `gh pr view 170`, o fetch de `pull/170/head`, o diff tríplice e o diff direto. Contra a main atual, seu delta efetivo se resume a pequenas diferenças repetidas no documento/evidência de Frota (o restante já entrou pela #172): é **duplicada** e recomenda-se fechá-la, sem reproduzir conteúdo. A branch remota `arena/32d9d78c-gruposegsystemseguranca`, da PR #167 fechada e sem conteúdo exclusivo, ainda existe em `014bd7cc103f949759fc27cdae782e88c2e0ec4f`; recomenda-se ao proprietário removê-la. Nada foi apagado.

## 1. Diagnóstico

| Defeito anterior | Medição | Tratamento |
|---|---:|---|
| Workspace monolítico | 751 linhas | Reorganizado por leituras e oito abas |
| Classes utilitárias avulsas | 167 `className` | Zero literal; somente `UiWorkspace.module.css` |
| Campos sem rótulo | 22 `placeholder`, 0 `label` | Zero placeholder; todo controle possui label real |
| Abas sem semântica | 0 tab/tablist/aria-selected | tablist/tab/tabpanel, roving tabindex, setas, Home/End |
| Estado compartilhado/confuso | sem `UiState` | Estado independente para lista, dossiê, acessos, documentos, regras, avaliações, autorização e eventos |
| Recusa de papel genérica | 401/403 no mesmo erro | estado **NEGADO** e código técnico |
| Ausência sujeita a zero fictício | formatação local | ausência nomeada; zero real permanece zero |

O CSS compartilhado **não foi alterado**: as classes existentes cobriam a tela.

## 2. Levantamento robusto dos códigos

O teste anti-deriva lê o servidor real e, antes da extração, remove operandos de `.includes("...")` e comparações de ENUM. Em seguida mede literais `error:`, inclusive os que aparecem em `deny` e ternários, e procura wrappers `bad`/`unavailable`, `HttpError`/`E` e exceções convertidas. Resultado: **49 códigos reais**. Não há wrapper, `HttpError` nem `throw new` convertido nesta família. Os `deny` são devolvidos por `runMutation`. As rotas legadas continuam religadas; portanto `legacy_route_retired` e `invalid_third_party_id` entram no vocabulário. Não foi encontrado handler morto: o teste fixa o dispatch canônico e legado.

## 3. O que mudou

- `third-party-vocabulary.mjs`/`.d.mts`: 49 erros traduzidos; situações, escopos, janelas, vencimentos, decisões e eventos; valor desconhecido passa cru.
- `third-party-request.ts`: resultado discriminado `{ok,data}|{ok,error}`, rede em status 0, corpo não JSON, erro HTTP e payload cru preservado.
- Workspace com oito abas acessíveis, rótulos reais, `UiState`, motivos/justificativas sempre preenchidos pela pessoa operadora e chaves `ext02-*` preservadas.
- A fronteira é explícita: **não existe login/canal de terceiro externo**. A tela interna consulta a decisão do servidor; não simula ator externo.
- Grant é granular por contrato ou OS e depende de vínculo, situação e janela canônicos. A UI não decide autorização.
- Gate focal com PostgreSQL descartável, migrações, servidor, HTTP e Chromium reais, além do workflow.

## 4. O que não mudou

`server.mjs`, `src/server/ext-third-party-api.mjs`, `db/migrations/**` (001–174, inclusive 085 e 148), contratos HTTP, banco, scheduler e AdminGate (`marcelo`, `admin`, `ti`) não foram alterados. Nenhuma migração foi criada. Rotas legadas permanecem vivas de propósito: leitura compatível e escrita 410 com `use` canônico.

## 5. Testes e gates

- `npm run typecheck`: OK.
- `node --test tests/ux-third-party-vocabulary.test.mjs`: 8/8.
- `node --test tests/ext02-third-parties.test.mjs`: 50/50.
- `npm run test:ext02-third-parties:pg`: 22/22, cluster limpo.
- `npm run test:ux-third-party:pg`: a primeira execução confirmou o teste HTTP (401/403), mas o Chromium local ficou bloqueado no lançamento até o timeout do executor; uma repetição isolada também bloqueou no launch. Não houve asserção enfraquecida. O workflow mantém o gate integral para ambiente limpo de CI.
- `npm run test:unit`: 808/808 (790 subtests).
- `npm run ux:evidence -- --stage=ux-07-terceiros`: OK em 1440×900 e 390×844, `problems: []`.

## 6. Evidência

A etapa `ux-07-terceiros` espera pelo H1 real **“Terceiros, acessos e documentos”**. Banco limpo representa vazio honesto. As capturas previstas são 1440×900 e 390×844, com `resumo.json`; a jornada com massa fica no gate e não é substituída pela captura.

## 7. Limitações

Aceite humano pendente; sem ator externo autenticado; documentos registram metadados, não upload de bytes; decisão e validade são tão atuais quanto a data-base e os vínculos declarados pelo servidor; limite de 200 registros permanece do servidor. O bloqueio local do Chromium está registrado acima, sem converter falha em aprovação.

## 8. Arquivos

Workspace; vocabulário e wrapper; dois testes UX; gate PostgreSQL/Chromium; workflow focal; `package.json`; etapa de evidência; este documento e a pasta de evidências.

## 9. Próxima fatia

EXT-03 — Licitações, mantendo contrato e migrações intactos.
