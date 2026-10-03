# L08 — fechamento do critério 7 do gate: aliases `/api/client/` não promovidos

Data: 2026-10-03

Lote: L08, primeira fatia canônica CLI-01..05 (hardening de prova)

Branch da sessão: `arena/01a0ff2c-gruposegsystemseguranca`

Base oficial confirmada: `main` em `31834ec0983ead61ec316df90f8af958594b3c58`

## 1. Confirmação remota antes de qualquer edição

O prompt desta sessão descrevia a `main` como `52afebb` (merge da PR #80). Isso
**estava desatualizado**. O estado remoto real, confirmado por `git fetch` e
`gh` nesta sessão:

| Item | Valor confirmado |
|---|---|
| PR #80 | `MERGED`, `mergedAt` 2026-10-02T23:24:28Z |
| PR #80 — branch/commit | `arena/l08-hardening-20261002` / `a95872de2a29d9ea39773a942cd9e3f7e91bfa4d` |
| PR #80 — merge commit | `52afebb1097d60a383c7219e7f3fe927a52ba3a6` |
| `main` contém `a95872d` | sim (`git merge-base --is-ancestor` exit 0) |
| Commits posteriores na `main` | **sim** — PR #83, mergeada em 2026-10-03T00:31:58Z |
| PR #83 — merge commit | `31834ec0983ead61ec316df90f8af958594b3c58` |
| SHA atual da `main` | `31834ec0983ead61ec316df90f8af958594b3c58` |

Observação metodológica: o clone desta sessão chegou **raso** (`shallow`,
corte em `52afebb`). Nesse estado, `git merge-base --is-ancestor a95872d
origin/main` falhava com `fatal: Not a valid commit name`, o que seria fácil
confundir com "a main não contém a PR #80". Após `git fetch --unshallow`, a
verificação passou corretamente (exit 0). A conclusão só foi declarada depois
de desfazer o corte.

A branch desta sessão foi criada a partir de `52afebb` e, por isso, **não**
partia da main oficial atual. Ela foi avançada por fast-forward até `31834ec`
antes de qualquer edição, satisfazendo a exigência 6 da confirmação remota.
Nenhum merge automático, nenhum force push, nenhum trabalho em `main`.

## 2. O que a PR #83 já havia resolvido

A PR #83 ("L08: auditoria atômica e idempotência em CLI-01..05") entregou, na
prática, as Prioridades 1, 2, 3 e 4 deste prompt. Verificado em código, não em
documentação:

- `audit()` em `client-space-api.mjs` e `client-access-api.mjs` **relança**
  `AuditUnavailableError` após o `console.error`; não há mais captura silenciosa;
- `auditOr503()` converte a falha em `503 audit_unavailable`;
- `handleAdminTicketUpdate` executa `audit(client, ...)` **antes** do `COMMIT`,
  dentro da mesma transação do `UPDATE` e do histórico;
- `streamDocument` conclui a auditoria obrigatória **antes** de `res.writeHead`;
  na falha, só sai o JSON 503, sem `Content-Disposition` e sem bytes;
- migração aditiva 139 adiciona `Idempotency-Key` + fingerprint para
  `client_tickets` e `client_documents`;
- a jornada CLI-01 completa foi incorporada ao gate L08.

Portanto esta sessão **não** reimplementou nada disso. Reconfirmou e foi atrás
da lacuna que sobrou.

## 3. Lacuna real encontrada — critério 7 do gate

O critério 7 do gate L08 exige: "aliases relevantes negam acesso inadequado".
Ele **não era demonstrado pelo próprio gate L08**.

- `tests/l08-delivery.integration.test.mjs` importa apenas
  `client-access.integration` e `client-space.integration`.
- A prova de negação de aliases v2 existia em `tests/cli-v2.integration.test.mjs`,
  executada por outro runner (`test:cli-v2:pg`), fora do gate L08.
- O subteste "L08 contract inventory" é uma checagem estática de regex sobre
  `server.mjs`; ele não exercita alias nenhum.

Pior: quatro aliases roteados sob `/api/client/` **não tinham prova de negação
em nenhum teste do repositório**:

- `/api/client/visits`
- `/api/client/service-requests`
- `/api/client/portal-access-requests`
- `/api/client/email-change-requests`

Os cinco restantes (`documents-v2`, `document-download`, `tickets-v2`,
`reports-v2`, `charges-v2`) tinham prova apenas no runner `cli-v2`.

Risco concreto: os handlers v2 chamam `requireSession`, que no cabeamento de
`server.mjs` é `readSession` — a sessão de **staff**, não o cookie do portal do
cliente. A negação é real, mas era uma propriedade não vigiada pelo gate da
fatia. Alias sob `/api/client/` não prova autorização de cliente, e o gate que
promove CLI-01..05 precisa dizer isso com um teste.

## 4. Mudança desta sessão

Arquivo único alterado em código de teste:
`tests/client-space.integration.test.mjs`.

Subteste novo, dentro do gate L08:

> `non-promoted v2 aliases under /api/client never answer to a valid portal session`

Posicionado **antes** do subteste de revogação de vínculo, de propósito: a
sessão do cliente A ainda está plenamente vinculada, logo a negação não pode
ser creditada à perda de grant. O que ele prova, por HTTP real:

| Verificação | Detalhe |
|---|---|
| Controle positivo | `/api/client/accounts` responde 200 e lista contas para a mesma sessão |
| Negação | nove aliases v2, em `GET` e `POST`, devolvem 401/403/405 |
| Negação anônima | mesmo conjunto, sem cookie |
| Não vazamento | corpo não contém `accountId`, `documentId`, `ticketId` nem `storage_key` |
| Headers | nenhuma resposta traz `Content-Disposition` |
| Bytes privados | `/api/client/document-download` não devolve o buffer do documento, nem com cookie de A nem de B |
| Sem efeito colateral | nenhuma linha de documento/chamado nasce das tentativas |
| Guarda de inventário | a lista de aliases é derivada de `server.mjs`; alias novo reprova o gate |

A guarda de inventário é o ponto que dá durabilidade: hoje o repositório tem
exatamente nove aliases v2 sob `/api/client/`. Se alguém adicionar o décimo, o
gate L08 reprova com a diferença explícita, obrigando a classificar o alias
como promovido (com prova) ou como negado (com prova).

## 5. Controle negativo — o teste pode falhar

Um teste verde só vale se ele souber ficar vermelho. Duas quebras deliberadas
foram executadas e revertidas:

| Mutação | Resultado |
|---|---|
| Exigir status `999` nas negações | gate reprovou, exit 1, 49/51, mensagem registrou o status real `401` |
| Inserir `/api/client/fake-new-alias` em `server.mjs` | gate reprovou, exit 1, 49/51, guarda apontou o alias novo |

Após as duas, `server.mjs` foi restaurado e confirmado idêntico ao da base
(`git diff --quiet server.mjs`).

## 6. Baseline e regressões reais nesta base

Ambiente: Linux, Node 22.22.3, npm 10.9.8, PostgreSQL descartável embarcado.
Todos os comandos abaixo rodaram na base `31834ec`.

### Baseline, antes de editar

| # | Comando | Resultado |
|---|---|---|
| 1 | `node scripts/qa-wave0-static.mjs` | 5/5, exit 0 |
| 2 | `npm run typecheck` | exit 0 |
| 3 | `npm test` | 196/196, exit 0 |
| 4 | `npm run build` | exit 0 |
| 5 | `npm run test:migrations:pg` | 139/139 em dois passes, 524 tabelas, exit 0 |
| 6 | `npm run test:l07-delivery:pg` (1ª) | 43/43 |
| 6 | `npm run test:l07-delivery:pg` (2ª consecutiva) | 43/43 |
| 7 | `npm run test:l03-delivery:pg` | 1/1 |
| 8 | `npm run test:l04-delivery:pg` | **20/20** |
| 9 | `npm run test:l05-delivery:pg` | 1/1 |
| 10 | `npm run test:l06-delivery:pg` | 9/9 |
| 11 | `npm run test:l08-delivery:pg` | 50/50 |

L03, L04, L05 e L06 foram executados em cadeia serial, como exigido.

No gate de migrações, o texto
`migration_checksum_mismatch: 006-admin-identities.sql` é o teste negativo
deliberado de checksum em cluster clone descartável; o comando global terminou
com exit 0 e `QA_PG_TEMP_CLEANED: true`.

### Depois da mudança

| Comando | Resultado |
|---|---|
| `npm run test:l08-delivery:pg` (1ª) | **51/51**, exit 0 |
| `npm run test:l08-delivery:pg` (2ª consecutiva) | **51/51**, exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 |
| `npm run typecheck` | exit 0 |
| `npm test` | 196/196 |
| `npm run build` | exit 0 |
| `npm run test:migrations:pg` | 139/139, exit 0 |
| `npm run test:l07-delivery:pg` (1ª) | 43/43 |
| `npm run test:l07-delivery:pg` (2ª consecutiva) | 43/43 |
| cadeia serial L04/L05/L06 | 20/20, 1/1, 9/9 |
| cadeia serial L03 | **reprovou nesta execução — ver seção 7** |

## 7. Instabilidade observada e não escondida

### 7.1 L03 — duas reprovações reais, com assinaturas diferentes

Na bateria final, `npm run test:l03-delivery:pg` **reprovou duas vezes**. Isto
não é apresentado como aprovação e não é atribuído automaticamente ao ambiente.

| Execução | Contexto | Exit | Assinatura |
|---|---|---|---|
| baseline, antes de editar | cadeia serial | 0 | 1/1 |
| final, cadeia serial | após L07 ×2 | **1** | `a jornada real encontrou respostas inesperadas: 403 /api/employee/offline` |
| rerun isolado #1 | isolado | 0 | 1/1 |
| rerun isolado #2 | isolado | **1** | `locator.waitFor: Timeout 30000ms exceeded` aguardando o heading `Novo cadastro profissional` |
| reruns isolados #3–#5 | com as mudanças desta sessão | 0 | 1/1, 1/1, 1/1 |

Contraprova na base limpa: as mudanças desta sessão foram guardadas com
`git stash` e `test:l03-delivery:pg` rodou **3 vezes no `31834ec` intocado**,
passando 3/3. Depois as mudanças foram restauradas e L03 rodou mais 3 vezes,
passando 3/3.

Placar total: **com as mudanças, 4 aprovações e 2 reprovações em 6 execuções;
na base limpa, 3 aprovações em 3 execuções.**

Classificação: **instabilidade de execução, não falha de código desta fatia.**
O fundamento é causal, não estatístico:

- as duas reprovações têm causas distintas — uma de autorização HTTP numa rota
  de funcionário (`/api/employee/offline`), outra de tempo de renderização no
  Chromium — padrão típico de contenção de recursos, não de defeito
  determinístico;
- o diff desta sessão altera exatamente um arquivo de teste,
  `tests/client-space.integration.test.mjs`, mais documentação. **Nenhum arquivo
  de produção foi alterado** (`git diff --quiet server.mjs` confirmado);
- `tests/l03-delivery.integration.test.mjs` e
  `scripts/qa-l03-delivery-postgres.mjs` **não importam** o arquivo alterado,
  verificado por `grep`. Não existe caminho causal entre a mudança e L03;
- as duas reprovações ocorreram na janela de maior carga da sessão, logo após
  cadeias longas de gates com PostgreSQL embarcado e Chromium.

Não houve skip, remoção de assertiva nem aumento de timeout. A instabilidade de
L03 fica **registrada como pendência aberta** para investigação própria; ela não
é resolvida nem mascarada por esta entrega.

### 7.2 L04 — divergência com a PR #83

A PR #83 registrou `test:l04-delivery:pg` como **19/20 em duas execuções**
(preferência de tema `null` em vez de `tech`; depois Chromium encerrado no
lançamento de CRM-08). Nesta sessão, na cadeia serial, **L04 passou 20/20**.

Isto é registrado como instabilidade dependente de execução, não como
aprovação retroativa: o resultado 19/20 da PR #83 **permanece registrado como
ocorreu** e não é apagado. Não houve skip, aumento de timeout nem
enfraquecimento de assertiva nesta sessão. O código de L04 não foi tocado.

## 8. Correção documental

As seções "Série L08 hardening — 02/10/2026" replicadas em sete documentos
afirmam "nenhuma migração criada; 001–138 permanecem imutáveis; próxima livre:
139". Isso deixou de ser verdade quando a PR #83 criou a migração 139 — e a
PR #83 atualizou apenas `docs/ENTREGA-L08.md` e o próprio relatório dela,
deixando os outros seis documentos obrigatórios desatualizados.

Estado correto, reconfirmado nesta sessão: **139 migrações, 001–139 contínuas,
sem lacuna e sem duplicidade, 001–139 imutáveis, próxima livre 140.**

A correção foi anexada, sem apagar o histórico anterior, em:
`CONTROLE-IMPLEMENTACAO.md`, `ESTADO-EXECUCAO-LOCAL.md`,
`CHECKLIST-ENTREGA-LOCAL.md`, `EVIDENCIAS-ENTREGA-LOCAL.md`,
`EXECUCAO-ENTREGA-LOCAL.md`, `AUDITORIA-TERRENO-L08.md` e `ENTREGA-L08.md`.

## 9. Requisitos

Nenhum requisito novo foi promovido nesta sessão. A mudança é de prova.

- **Provado agora dentro do gate L08:** critério 7 — aliases `/api/client/` não
  promovidos negam acesso a sessão de cliente válida, não vazam identificadores
  nem bytes privados, e um alias novo reprova o gate.
- **Continuam não promovidos:** CLI-06..15, EXT-01..17, componentes órfãos de
  `/admin/ti`, fornecedor restrito, CLI-15, integrações externas e todas as APIs
  e tabelas v2 (`cli_tickets_v2`, mensagens, anexos, visitas, relatórios,
  cobranças, solicitações de serviço, pedidos de acesso ao portal e troca de
  e-mail v2).

Distinção mantida: API legada canônica promovida ≠ alias v2 existente ≠ API v2
staff-only ≠ API v2 ainda não promovida.

## 10. Pendências reais

- A API legada canônica de CLI-05 não expõe protocolo, mensagem nem anexo.
  Esses objetos vivem apenas na superfície v2 não promovida e **não** são
  declarados comprovados nem idempotentes.
- PostgreSQL e filesystem não compartilham transação distribuída. Está provada
  a limpeza nos erros controlados antes do commit, **não** a eliminação da
  janela de órfão em queda abrupta do processo.
- **`test:l03-delivery:pg` é instável neste ambiente** (2 reprovações em 6
  execuções, com duas assinaturas distintas — ver seção 7.1). Não foi corrigido
  nesta sessão por estar fora do recorte e sem caminho causal com o diff. Fica
  como pendência aberta, com a investigação a ser feita no próprio L03.
- A prova de alias cobre os nove aliases sob `/api/client/`. Os aliases
  equivalentes sob `/api/cli/`, `/api/hr/`, `/api/crm/hr/` e `/api/admin/hr/`
  continuam cobertos apenas pelo runner `test:cli-v2:pg`, fora do gate L08.
  Próximo recorte mínimo aprovável.
- Classificação desta entrega: implementação local + validação automática
  Linux/PostgreSQL descartável. Não é aceite humano de negócio e não é
  homologação Windows.

## 11. Preservações

Preservados e não alterados: FIN-13/134; FIN-12→FIN-04/135; FIN-10/136;
FIN-14/15/16/137; ADM-01..12/138; a correção de sincronização do L06-9; o
aceite humano declarado de Marcelo e Andreia no escopo local do L07; a decisão
de promoção dos órfãos por área somente com prova; a pendência Windows; a
imutabilidade de 001–139; e a distinção entre fonte canônica legada e APIs v2
ainda não promovidas.

---

A homologação final Windows continua pendente e adiada até o fechamento
integral do sistema.
