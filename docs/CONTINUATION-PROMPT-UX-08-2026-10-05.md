> **Atualização de 07/10/2026:** para a execução atual, leia o [plano de fechamento UX/RAG](ARENA-FECHAMENTO-UX-RAG-2026-10-07.md) e o [checklist por fatia](FECHAMENTO-UX-RAG-CHECKLIST-2026-10-07.md). A UX completa e o RAG privado ainda não estão concluídos. Este documento preserva o contexto da sua data; orientações de continuação e estado antigo devem ser reconciliados com a main atual. Não confundir UX-08/09 das extensões posteriores com TI/RAG e auditoria final do plano original.

# Prompt de continuação — SEG System, após UX-07 (fatia A: Operação)

Cole este prompt inteiro na próxima sessão do agente.

---

Você é um agente de código trabalhando no repositório
`github.com/berger33/gruposegsystemseguranca` ("SEG System"). Esta é a
continuação de uma evolução de UX multi-sessão. **A fonte de verdade é o
GitHub `main`** — nunca use ZIP ou snapshot antigo.

## 0. Estado no início desta sessão

- `main` HEAD: verifique com `git log origin/main -1`. Na última sessão
  conhecida, `main` estava em `a6b5c064...` (UX-06, PR #156, merged).
- A sessão anterior abriu a **PR #158** — `arena/d2877acb-gruposegsystemseguranca`
  → `main` — "UX-07 (fatia A): Operação — vocabulário, estado honesto e abas
  acessíveis". Ela cobre **apenas** a família Operação (`/admin/operacao`) de
  UX-07. Verifique o estado atual dela:
  `gh pr view 158 --json state,mergeable,mergeStateStatus`. Se ainda `OPEN`,
  **não a feche, não a reabra, não a mergeie** — é tarefa do dono do
  repositório. Documentação completa dela: `docs/UX-07-OPERACAO-2026-10-05.md`.
- **Esta sessão deve continuar na branch `arena/<seu-id-de-sessão>`** que o
  ambiente já associa a você — nunca force outro nome de branch. Se o
  ambiente já te colocou numa branch nova a partir de `main` atualizado,
  normal; comece o trabalho a partir dela.
- `node_modules` **não persiste** entre sessões: rode `npm ci` (Node 22) antes
  de qualquer teste/typecheck/build.
- **IMPORTANTE (lição aprendida na sessão anterior):** o estado git local do
  workspace pode ficar **dessincronizado** da branch remota no início de uma
  sessão nova (arquivos no disco corretos, mas `HEAD` local apontando para um
  commit anterior). Antes de assumir que não há commits anteriores desta
  sessão: rode `git fetch origin`, compare
  `git log --oneline -5` local com
  `git log origin/<sua-branch> --oneline -5`, e se divergirem, reconcilie com
  `git reset --mixed origin/<sua-branch>` (mantém os arquivos do disco, só
  corrige o ponteiro) antes de commitar qualquer coisa nova.

## 1. Escopo: o que falta

UX-07 tem fatias ainda **não iniciadas**. UX-08 e UX-09 nem começaram. Mapa de
navegação do admin (capturado do próprio HTML renderizado) para orientar o
inventário, cruzado com os workflows de CI (`.github/workflows/*.yml`) que já
existem hoje:

| Grupo do menu | Itens | Workflow de entrega já existe? |
| --- | --- | --- |
| Visão e pendências | Painel do Marcelo, Analytics, Relatórios periódicos | **Não** (nenhum `ux-*-delivery.yml` dedicado) |
| Clientes e comercial | CRM, Carteira, Pedidos do site, Inteligência comercial, Expansão, Satisfação | CRM: `ux-crm-delivery.yml` (feito). Os demais: **não** |
| Entrega de serviços | Contratos, **Operação** (feita nesta sessão anterior), Patrimônio, Frota, Terceiros, Qualidade, Apoio emergencial | Operação: `ux-ops-delivery.yml` (feito). Os demais: **não** (há `l05-delivery.yml` para Contratos e `ext02..ext07` para terceiros/licitações/fornecedores/qualidade/satisfação/compliance, mas são gates de API antigos, não o tratamento de UX — vocabulário/acessibilidade/estado honesto) |
| Pessoas | Funcionários e RH | `ux-hr-delivery.yml` (feito) |
| Financeiro e conformidade | Financeiro, Compliance, Licitações, Fornecedores | **Não** (há `l07-delivery.yml` Finance e `ext03/ext04/ext07` — gates antigos, sem tratamento de UX) |
| Portais e conhecimento | Conhecimento, Acessos do portal | Acessos do portal (portal do funcionário/cliente): `ux-portal-delivery.yml` (feito, UX-06). Conhecimento: **não** |
| Sistema | TI (inclui console RAG), Editor visual | **Não** — candidato natural para **UX-08** |

**Trate esta tabela como ponto de partida, não como verdade absoluta.** A
existência de um workflow `l0X`/`extXX` antigo não significa que a tela já
tenha vocabulário em português, abas acessíveis (`role=tablist/tab/tabpanel`),
`UiState` honesto (falha nunca vira vazio/zero) ou zero `style` inline — isso
só está confirmado para as telas com `ux-*-delivery.yml`. Ao escolher uma
família, abra o arquivo React real e confira o diagnóstico (grep por
`style={{`, por `<button` sem `role="tab"`, por `.catch(() => ...vazio...)`,
por valores de enum impressos crus) antes de prometer o que vai mudar.

Escopo esperado nas próximas sessões (ordem sugerida, não obrigatória):

- **UX-07 (continuação):** demais fatias — financeiro, contratos, compliance,
  e as "demais extensões" (patrimônio, frota, terceiros, qualidade, apoio
  emergencial, licitações, fornecedores, satisfação, conhecimento, carteira,
  pedidos do site, inteligência comercial, expansão, analytics, relatórios
  periódicos, painel do Marcelo, continuidade). Uma família por sessão/commit,
  como nas fatias anteriores.
- **UX-08:** console de TI/RAG, mensagens públicas (se existirem, ex.:
  `publicacao`, `verificacao-manual`, `convite`), polimento global (editor
  visual, tema).
- **UX-09:** auditoria cruzada de tudo que UX-03 a UX-08 produziram, e aceite
  (aceite humano continua **pendente** — não solicite, não invente).

## 2. Pergunte ao usuário antes de codar

Assim que você tiver lido isto, **use a ferramenta de pergunta ao usuário**
para que ele escolha explicitamente:

1. **Qual fatia/família fazer nesta sessão** — ofereça pelo menos: "uma
   família específica de UX-07 (ex.: Financeiro, Contratos, Compliance,
   Patrimônio, Frota, Terceiros...)", "UX-08 (console TI/RAG + polimento
   global)", "inventariar primeiro e só então escolher". Não assuma.
2. **Confirmação do fluxo de PR**: commit + push + `gh pr create` **sem
   merge** (merge é tarefa do dono do repositório — regra permanente deste
   projeto, não uma preferência pontual; não ofereça merge como opção
   disponível a você mesmo, apenas confirme que seguirá esse fluxo).

Não prossiga com a implementação até ter essa resposta.

## 3. Padrão obrigatório (copie os artefatos de UX-05/06/07 como molde)

Para a família escolhida, dentro da mesma rota/página:

1. **Vocabulário dedicado** `src/lib/<dominio>-vocabulary.mjs` +
   `.d.mts` — traduza **todo** código de erro que os arquivos de servidor da
   família podem devolver (grep por `new HttpError(`, `new E(`, por `status:
   4\d\d` e `5\d\d`, por ternários que montam `code`). Valor desconhecido
   **passa cru, nunca é inventado**. Padrão de retorno:
   `describe<Dominio>Error(code, status) -> { kind, title, detail, status,
   canRetry, code }`. Inclua também os pares `label`/`tone` de todo ENUM de
   status/situação da família (grep nas migrações `db/migrations/*.sql` por
   `CHECK (status IN (...))` ou tipos equivalentes).
2. **`opsRequest`-like helper** (`src/lib/<dominio>-request.ts`, ou reuse
   `ops-request.ts` se o padrão servir) — retorna `{ ok: true, data } | { ok:
   false, error }` em vez de lançar erro genérico.
3. **Reescrita de apresentação da tela** (não da lógica de negócio): zero
   `style` inline (use `UiWorkspace.module.css`, estenda com novas classes
   `.xyz` se precisar, nunca duplique CSS já existente), `UiState` em cada
   grupo de leitura independente (loading/empty/error com código canônico
   visível e botão de repetir), abas como `tablist/tab/tabpanel` reais com
   roving tabindex e ←/→/Home/End quando a tela tiver abas.
4. **Teste anti-deriva** (`tests/ux-<dominio>-vocabulary.test.mjs`) — lê os
   arquivos de servidor reais da família e falha se a UI tiver tradução para
   código que não existe mais no servidor, ou se o servidor tiver código sem
   tradução na UI. Adicione ao array de arquivos do `test:unit` em
   `package.json`.
5. **Gate PostgreSQL + Chromium real**
   (`scripts/qa-ux-<dominio>-postgres.mjs`, script `test:ux-<dominio>:pg` em
   `package.json`, teste de integração
   `tests/ux-<dominio>-workspace.integration.test.mjs`) — `embedded-postgres`
   descartável + `@sparticuz/chromium --single-process`; a falha de leitura é
   injetada **apenas** via `page.addInitScript` sobre `window.fetch`, nunca
   enfraquecendo o servidor. Recusa rodar se `DATABASE_URL` estiver definido.
6. **Workflow de CI** `.github/workflows/ux-<dominio>-delivery.yml`,
   copiado exatamente do shape de `.github/workflows/ux-ops-delivery.yml` /
   `ux-portal-delivery.yml` (checkout, setup-node@22, `npm ci`, typecheck,
   `node --test tests/ux-<dominio>-vocabulary.test.mjs`,
   `npm run test:ux-<dominio>:pg`), com `paths:` restrito aos arquivos da
   família.
7. **Evidência**: rode `npm run ux:evidence -- --stage=ux-0<N>-<dominio>`
   (nunca chame os scripts de captura diretamente) e registre no doc de
   entrega quais papéis/viewports foram realmente capturados — se cobrir só
   um papel (ex.: `ti`) e um viewport, **declare isso como pendência
   explícita**, não finja cobertura total.
8. **Doc de entrega** `docs/UX-0<N>-<DOMINIO>-<data>.md`, espelhando a
   estrutura de `docs/UX-07-OPERACAO-2026-10-05.md`: tabela de rotas
   cobertas/pendentes, diagnóstico honesto do defeito anterior, o que mudou/
   não mudou, tabela de validação, pendências explícitas (aceite humano
   sempre pendente).

## 4. Invariantes que nunca podem regredir

Autenticação, permissões granulares ("menu não é autorização" — abrir uma
tela não implica poder escrever nela; o servidor decide, nunca a UI),
isolamento por conta/cliente, idempotência, auditoria fail-closed, históricos,
operação local. **Falha nunca pode renderizar como vazio ou zero.** Nunca
enfraqueça um teste. Nunca promova cosmeticamente um protótipo a "pronto" —
se uma tela é legado/protótipo com defeito estrutural que você não vai
reescrever nesta fatia, diga isso explicitamente no doc (como foi feito com
`OpsAdvanced2Client`/`OpsAdvanced3Client`). Sem dependências pesadas (ambiente
tem 8GB RAM, sem GPU). Nunca exponha segredo ou dado pessoal sensível em log,
commit ou doc.

**Migrações:** 001–174 existem. Nunca altere uma migração existente; só
acrescente 175+ com necessidade funcional comprovada (não para UX).

**Um commit por família**, bem descrito, sem reescrita de regra de negócio —
só camada de apresentação/vocabulário/acessibilidade.

**PR:** commit, push, `gh pr create` contra `main`, **sem merge**. Merge é
tarefa do dono do repositório — regra permanente, confirmada múltiplas vezes
ao longo das sessões anteriores, inclusive quando o usuário pediu para
avaliar se era "apropriado" mergear uma PR com CI verde: a resposta correta
foi recusar e explicar, não mergear.

**Aceite humano (Marcelo, Andreia) não participa** desta automação — nunca
peça a participação deles, nunca invente homologação; declare sempre como
pendente no doc.

## 5. Checklist de validação antes de abrir a PR (ordem recomendada)

1. `npm ci`
2. `npm run typecheck` — exit 0
3. `npm run build` — exit 0 (opcional mas recomendado se mudou algo
   estrutural)
4. `node --test tests/ux-<dominio>-vocabulary.test.mjs` — N/N
5. `npm run test:ux-<dominio>:pg` — N/N, exit 0
6. `npm run test:unit` (suíte completa) — **todos** os testes, 0 falhas
7. **Verifique se existe um gate herdado pré-UX para a mesma família** (grep
   em `.github/workflows/*.yml` pelo caminho da família, ex.:
   `src/app/admin/financeiro`, e rode o `npm run test:<legado>:pg`
   correspondente, ex. `test:l07-delivery:pg`). **Lição da sessão anterior:**
   ao renomear rótulos de aba, títulos de seção, `aria-label` de contêiner ou
   capitalizar valores de célula/badge, uma suíte herdada (ex.:
   `tests/l0X-delivery.integration.test.mjs`) que clica em `button:has-text(
   'Rótulo Antigo (OPS-XX)')` ou compara `assert.match(..., /valor em
   minúscula/)` sem a flag `i` **quebra silenciosamente até você rodar o
   gate**. Rode-o **localmente antes** de abrir a PR, não só confie em
   `gh pr checks` depois. Se quebrar: **repare, nunca enfraqueça** — migre
   para `page.getByRole('tab', { name: 'Rótulo Novo', exact: true })` e
   ajuste a capitalização da regex para o texto vigente, mantendo a mesma
   cobertura de asserções (mesmo preceito já registrado no repo para a suíte
   L03 depois de UX-04).
8. Confira `git status --short` e `git diff tsconfig.json` /
   `git diff next-env.d.ts` antes de commitar: `tsconfig.json` ganhando
   `.next/integration-ux-<dominio>/**` é esperado; `next-env.d.ts` sujo é
   artefato de build/typecheck — reverta com `git checkout next-env.d.ts`.
9. Depois do `gh pr create`: rode `gh pr checks <numero>` e, se algo falhar,
   diagnostique com `gh run view --job <id> --log` (pode falhar com `EOF` por
   instabilidade do sandbox — tente de novo algumas vezes) **ou**, mais
   confiável, reproduza localmente com o script `npm run test:<x>:pg`
   correspondente. CI pode estar com runners esgotados — documente sempre o
   resultado do gate local, que é a evidência que conta.

## 6. Pontos de atenção já conhecidos (não redescubra)

- `embedded-postgres` + `@sparticuz/chromium --single-process` para gates
  reais; nunca leve isso para o `DATABASE_URL` do operador.
- Sobrescreva `window.fetch` via `page.addInitScript` para simular falha;
  nunca enfraqueça o servidor para o teste passar.
- Ancore seletores em `data-ui-state` ou classe de módulo CSS, nunca em
  `main` (muda de contexto facilmente).
- `getByRole(..., { name })` precisa de `exact: true` ou regex ancorada para
  não colidir com rótulos parecidos (ex.: `'Escalas'` é substring de
  `'Métricas e escalas assistidas'`).
- `git stash`/builds sujam `next-env.d.ts` — sempre `git checkout
  next-env.d.ts` antes de commitar, mas **mantenha** as entradas novas de
  `tsconfig.json` (`.next/integration-ux-<dominio>/**`), que são esperadas.
- Uma suíte de teste herdada de uma família **já tratada** por UX pode ter
  seletores/regex que colidem com a próxima renomeação — ver seção 5, item 7.
- O estado git local pode ficar dessincronizado do remoto no início de uma
  sessão nova — ver seção 0.

Comece pedindo ao usuário para escolher o escopo desta sessão (seção 2) antes
de tocar em qualquer código.
