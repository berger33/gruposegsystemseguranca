# UX-PRO-E3-R2 — observação de instabilidade no CI (20/10/2026)

**Natureza:** registro de observação, **sem alterar timeout, asserções, retries ou workflow**. Nenhum arquivo de produto ou de teste foi modificado por este item.
**Origem da autorização:** decisão do proprietário na sessão de 20/10/2026 — E3-R2 entra como único item da sessão, limitado ao registro da instabilidade ambiental do caso `07D-1`.

## 0. Procedência

O registro original em arquivo foi produzido na sessão de 20/10 mas, tendo vivido apenas em espaço de trabalho efêmero, **não foi commitado em nenhum branch remoto** e se perdeu. Sobreviveu, de forma durável, o **comentário E3-R2 na PR #279** (id `6294060605`, criado em 2026-10-20T15:06:29Z), cujo teor factual é reproduzido aqui integralmente e foi revalidado por API do GitHub nesta mesma data. Este documento é a reconstrução fiel desse registro, acrescido apenas da rechecagem atual do estado do run.

## 1. Escopo autorizado (e o que ficou fora)

- **Dentro:** registrar a suspeita de instabilidade ambiental e o estado do CI, com evidências e limites de inferência.
- **Fora:** mexer no timeout de 45 000 ms, afrouxar/remover asserções, adicionar retry, alterar workflows, pedir rerun para "esverdear" o histórico. Nada disso foi feito.

## 2. Observação local registrada na sessão

- O histórico local documenta timeout de **45 000 ms** no caso herdado de browser **`07D-1: 2xx sem a lista canônica no painel inicial é falha declarada, não vazio`**, aguardando `[role="tablist"]` após repetir a ação.
- Em **execução isolada**, o gate passou **29/29** e o caso consumiu **3,71 s** — duas ordens de grandeza abaixo do limite.
- Isso **não comprova** causa definitiva nem estabilidade contínua; apenas mostra que a falha não é determinística no ambiente isolado.

## 3. Estado do CI na coleta (e revalidação desta sessão)

| Item | Valor |
|---|---|
| Workflow | "UX operacao delivery" (`ux-ops-delivery.yml`) |
| Run | [39377048557](https://github.com/berger33/gruposegsystemseguranca/actions/runs/39377048557) · evento `pull_request` |
| Job | [118477424780](https://github.com/berger33/gruposegsystemseguranca/actions/jobs/118477424780) (`ux-ops-postgres-browser`) |
| Resultado | **FAILURE** — instalou dependências, typecheck e vocabulário passaram; a etapa HTTP/PostgreSQL/Chromium falhou |
| Anotações disponíveis | apenas `exit code 1`, sem caso, stack ou duração |
| Logs completos | download falhou com **EOF** no ambiente da sessão; a causa não pode ser inspecionada |

**Revalidação em 20/10/2026 (reconstrução):** `gh api` no run e no job confirma `conclusion: failure`, `run_attempt: 1`, job concluído em 2026-10-20T05:53:31Z. O run **nunca foi reexecutado**; o estado é o mesmo de quando a observação foi escrita.

## 4. Por que a falha do CI não pode ser atribuída ao timeout E3-R2

1. A única evidência do timeout 07D-1 vem do histórico local; no CI disponível, o job falhou numa etapa ampla (HTTP/PostgreSQL/Chromium) sem dizer qual caso falhou.
2. As anotações resumem tudo a `exit code 1`, e os logs detalhados não puderam ser baixados (EOF).
3. Sem nome do caso, stack e duração, qualquer atribuição seria especulação — exatamente o tipo de inferência que o registro honesto proíbe.

Conclusão mantida: **não é possível atribuir esta falha do CI ao timeout E3-R2.** O resíduo permanece aberto.

## 5. O que é necessário para encerrar E3-R2

- Obter os **logs completos** do job (ou um novo run com logs acessíveis) e classificar **caso, stack e duração** da falha.
- Se o 07D-1 aparecer explicitamente, tratar como defeito de estabilidade real (ambiente, seletor, espera ou carga), com subfatia própria e RED canônico — **sem** reduzir o timeout ou enfraquecer a asserção.
- **Não encerrar o resíduo com base apenas numa reexecução verde.** Um rerun isolado sem diagnóstico não prova estabilidade contínua.

## 6. Verificações e não-ações

- `gh api` no run/job (revalidação de estado acima); leitura do comentário id `6294060605` da PR [#279](https://github.com/berger33/gruposegsystemseguranca/pull/279), que segue sendo o registro canônico público desta observação.
- Guardas locais da sessão: `npm ci` (exit 0), `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `git diff --check`; MD5 de `next-env.d.ts` (`87a8bf5c65d00003ad1eba1613711943`) e `tsconfig.json` (`99f7042f814e77e67b785906e5d4df23`) preservados.
- **Não** foi solicitado rerun, **não** se alterou teste, timeout, retry ou workflow, e **nenhuma** asserção foi afrouxada.

**Homologação/Produção: NO-GO.**
