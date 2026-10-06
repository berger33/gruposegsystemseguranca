# UX-11 / EXT-10 — encerramento das pendências 1 e 2 — 2026-10-06

Fatia de continuação da PR #178, que já está em `main`. A base verificada
desta sessão é `origin/main` em `acfdb75c40c76f3227f33d8fd0dee1fb16dc8971`,
confirmada com `git fetch origin main` e `git log origin/main -1`: o merge da
PR #178 ("UX-11 / EXT-10: continuidade de negócios") está presente.

O escopo foi exatamente o das duas pendências herdadas que continuavam **não
provadas**: (1) gerar as evidências visuais de `/admin/continuidade`; (2)
ampliar o gate focal, que tinha mínimo de dois casos e nenhuma execução de
HTTP ou navegador. A pendência 3 — homologação humana — permanece aberta por
definição e **não** é afirmada em lugar nenhum.

## ETAPA 0 — inventário antes de mexer

Lidos integralmente, sem alteração: `src/server/ext-continuity-api.mjs`
(104 linhas), `src/app/admin/continuidade/page.tsx`, o `AdminGate`, o
vocabulário `src/lib/continuity-vocabulary.mjs` (+ `.d.mts`), o wrapper
`src/lib/continuity-request.ts`, as provas herdadas
`tests/ext10-continuity.test.mjs`,
`tests/ext10-continuity.integration.test.mjs`,
`scripts/qa-ext10-continuity-postgres.mjs` e o capturador compartilhado
`scripts/ux-evidence-capture.mjs`.

Confirmado no servidor real, não de memória:

- autorização é por grant (`continuity.read`, `continuity.write`,
  `continuity.activate`), consultada em `auth_permissions`; sem grant a
  resposta é **403 `forbidden`**;
- escopo `account` limita à própria conta; fora do escopo o servidor devolve
  **404 `plan_not_found`**, para não vazar a existência do plano;
- escritas exigem `Idempotency-Key` de 8–200 caracteres, mesma origem e
  fingerprint SHA-256; a falha dentro de `mutate` faz `ROLLBACK` e, por isso,
  **não consome a chave**;
- o gate de `/admin/continuidade` continua exatamente
  `admin, ti, marcelo, operacao, supervisor`.

Nada foi alterado em `server.mjs`, no servidor canônico, em migração ou em
scheduler. Nenhum endpoint novo, nenhuma mudança de contrato HTTP.

## Pendência 1 — evidências visuais: ENCERRADA por execução

A etapa `ux-11-continuidade` foi executada com PostgreSQL 17 descartável
(ledger 001–174 aplicado no próprio cluster) e Chromium real, nos dois
viewports:

```
UX_EVIDENCE /admin/continuidade 1440x900 OK [externos ignorados: 2]
UX_EVIDENCE /admin/continuidade 390x844  OK [externos ignorados: 2]
UX_EVIDENCE_EXIT: 0
```

`problems: []` nas duas entradas de `docs/ux-11-continuidade-evidencias/resumo.json`:
sem rolagem horizontal do documento, `Tab` levando a foco real com
`outline: auto`, nenhum erro de console originado na aplicação e nenhuma
resposta 5xx. Os dois itens em `externalBlocked` são a fonte do Google, sem
saída de rede neste ambiente — limitação registrada em campo separado, não
contada como defeito.

Uma correção foi necessária **na captura, não no teste**: a etapa não
provisionava grant algum, de modo que a tela abriria legitimamente em NEGADO.
A etapa passou a declarar `grants: ['continuity.read','continuity.write','continuity.activate']`,
reproduzindo o provisionamento administrativo real em `auth_permissions`,
igual ao que a etapa `ux-07-qualidade` já fazia. A recusa sem grant não ficou
sem prova: virou caso executável do gate focal, com 403 real do servidor.

A pasta `docs/ux-11-continuidade-evidencias/` ganhou `README.md` declarando,
arquivo por arquivo, quem gerou cada imagem e o que ela não prova.

## Pendência 2 — gate focal ampliado: ENCERRADA por execução

`tests/ux-continuity-workspace.integration.test.mjs` deixou de ser apenas
leitura de código: agora sobe servidor HTTP real contra PostgreSQL real e
abre Chromium real. São **14 casos**, e
`scripts/qa-ux-continuity-postgres.mjs` passou a exigir esse piso
(`MINIMO = 14`, antes 2), de modo que remover ou pular um caso reprova o gate
mesmo com `node:test` saindo 0.

Os cinco itens cobrados pelo prompt, e onde cada um é provado:

| Exigência | Caso | Como a falha é produzida |
|---|---|---|
| 403 exibido como NEGADO | `browser: recusa 403 do servidor é estado NEGADO…` | papel `ti`, que está no `AdminGate` e **não** tem grant: 403 `forbidden` real |
| 404 de escopo que não vira "removido" nem vazio | `browser: 404 de escopo não vira "plano removido"…` | grant do supervisor reescopado da conta A para a B com a página aberta: 404 `plan_not_found` real |
| falha de leitura distinta de lista vazia | `browser: queda do servidor é dita como rede indisponível…` | o servidor HTTP é **derrubado** e "Atualizar lista" encontra `status: 0` |
| ausência de data que não vira `01/01/1970` nem "em dia" | `browser: ausência de data é dita…` | plano sem simulado ao lado de plano com simulado documentado (11/03/2026 e 11/09/2026) |
| chave de idempotência preservada na falha e descartada após sucesso | `browser: a chave de idempotência sobrevive à falha real…` | 503 `audit_unavailable` real, por gatilho de banco, como já faz a suíte EXT-10 |

Nenhuma resposta do servidor é falsificada: **não há injeção em
`window.fetch` nem em `page.route()`**. A única instrumentação do navegador
registra passivamente o cabeçalho `Idempotency-Key` que a página envia e
repassa a chamada original — é isso que permite afirmar, com o que de fato
trafegou, que a repetição após a falha usou a **mesma** chave (`cont-…`) e
que a operação seguinte usou outra. O banco confirma: um único plano com o
título repetido.

Os outros nove casos cobrem contrato HTTP (401 sem sessão, 400
`idempotency_key_required`, 403 `origin_forbidden`, 404 `not_found`),
isolamento por conta, ausência nula vinda do servidor, replay 200 e conflito
409, tablist real com roving tabindex e teclado, e 390px sem transbordo nas
duas abas visíveis.

O workflow focal `.github/workflows/ux-continuity-delivery.yml` passou a
executar também a captura de evidência, de modo que a pendência 1 não volta a
ficar sem prova no CI.

## Defeitos de apresentação corrigidos nesta fatia

Todos encontrados olhando a tela real, e corrigidos na apresentação:

- as abas eram botões nativos sem classe: não usavam a superfície
  compartilhada e a aba ativa não era distinguível. Agora usam
  `.tab`/`.tabActive`;
- não havia `role="tabpanel"`: o tablist apontava para nada. Agora cada painel
  tem `role="tabpanel"`, `id`, `aria-labelledby` e o botão tem `aria-controls`;
- **recusa convidava a repetir**: o 403 e o 404 de escopo ofereciam "Tentar
  novamente", convite falso para algo que o servidor recusaria de novo. O
  `canRetry` do vocabulário passou a ser respeitado;
- não havia como reler a lista sem recarregar a página: entrou "Atualizar
  lista", que é também o que torna a queda de rede observável pelo operador;
- a chave de idempotência preservada era invisível: a falha agora diz "Chave
  preservada para repetição segura: cont-…";
- o cartão do plano empilhava o botão no meio do cabeçalho; passou a usar
  `.cardTitle` e a faixa `.actions` da superfície compartilhada, e o selo de
  situação ganhou `srPrefix="Situação"` para leitor de tela.

Preservados sem exceção: URLs, métodos, corpos, cabeçalhos, estados HTTP,
prefixo `cont-`, os placeholders `Título`, `Descrição e escopo`,
`Responsável`, passos de contingência e de recuperação, o rótulo
`Registrar plano` e a aba inicial `Novo plano` — todos contrato verificado
pelo teste Chromium herdado de `tests/ext10-continuity.integration.test.mjs`,
que continua passando 31/31.

## Achado registrado, sem alterar nada

O `AdminGate` de `/admin/continuidade` aceita o papel `operacao`, mas
`operacao` **não** é um papel provisionável: desde a migração 102 o
`CHECK` de `auth_staff_profiles.role` admite apenas
`admin, ti, rh, marcelo, supervisor, comercial, financeiro`. Hoje isso é
inofensivo (o gate de menu não concede autorização, e quem decide é o grant
no servidor), mas é uma inconsistência real entre a lista da página e o
esquema. Não foi tocada nesta fatia: mudar `allowedRoles` está fora do escopo
autorizado e exigiria decisão de quem define o papel. A rota também não
consta de `ADMIN_MODULES`, isto é, não aparece no menu lateral.

## Validação executada nesta sessão

Toda ela rodada, com a saída conferida:

| Comando | Resultado |
|---|---|
| `npm run typecheck` | sem erro |
| `npm run test:unit` | `# pass 846  # fail 0  # skipped 0  # todo 0` |
| `node --test tests/ext10-continuity.test.mjs` | `# pass 24  # fail 0` |
| `npm run test:ext10-continuity:pg` | `EXT10_TAP_SUMMARY: pass=31 fail=0 skipped=0 todo=0` |
| `npm run test:ux-continuity:pg` | `UX11_TAP_SUMMARY: pass=14 fail=0 skipped=0 todo=0 minimo_exigido=14` |
| `npm run ux:evidence -- --stage=ux-11-continuidade` | `UX_EVIDENCE_EXIT: 0`, `problems: []` nos dois viewports |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| `git diff --check` | sem apontamento |

Higiene de diff: rodar os gates reescreveu `next-env.d.ts` e acrescentou
entradas em `tsconfig.json` apontando para `.next/integration-ux-continuity`.
Ambos foram restaurados ao conteúdo de `main` antes do commit; o diff da PR
não os contém.

## O que ficou provado por execução

- a rota `/admin/continuidade` renderiza em Chromium real, autenticada por
  login real, em 1440×900 e 390×844, sem rolagem horizontal, com foco de
  teclado visível, sem erro de console da aplicação e sem resposta 5xx;
- recusa de grant (403) aparece como NEGADO, nunca como vazio nem como falha,
  e não oferece repetição inútil;
- 404 de escopo de conta é dito como indisponibilidade de escopo, não como
  remoção, e não apaga a lista já lida;
- queda real do servidor é dita como rede indisponível e nega explicitamente
  a hipótese de lista vazia, com recuperação pelo próprio botão;
- ausência de data é dita e nunca vira `01/01/1970`, zero ou "em dia";
- a chave de idempotência `cont-` sobrevive a uma falha real do servidor e é
  descartada só após o sucesso, sem duplicar registro no banco;
- as provas herdadas de EXT-10 continuam íntegras (31/31 e 24/24).

## O que permanece NÃO provado

- **Homologação humana.** Nada nesta fatia prova aceite de Marcelo ou de
  Andreia. Não houve sessão de homologação; não há aceite registrado.
- **Comportamento em produção.** Tudo foi medido em cluster descartável, com
  servidor em modo desenvolvimento e massa fictícia.
- **Conformidade WCAG integral.** O que foi medido é pontual: foco por
  teclado, tablist, ausência de transbordo e rótulos. Não houve auditoria de
  acessibilidade completa, contraste medido em todos os estados nem teste com
  leitor de tela real.
- **Jornada de negócio completa pela tela.** O gate exercita criação,
  listagem, detalhe, recusa, escopo, falha e idempotência; transição de
  estado, documentação de simulado e publicação no portal continuam provadas
  por HTTP na suíte EXT-10, não por navegador.
- **Alertas externos.** Não existem nesta família: o sistema registra o
  procedimento e não aciona fornecedor nem envia notificação externa.
- **A inconsistência do papel `operacao`** foi registrada, não corrigida.
