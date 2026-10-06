# UX-11 / EXT-10 — portal do cliente de continuidade — 2026-10-06

## Base e escopo

Antes de editar, esta sessão executou `git fetch origin main` e
`git log origin/main -1`. A base conferida foi
`a476ef538127e03a30d0391c37383c67efd38d0f` (`Merge pull request #179`), ou
seja, o merge exigido já estava presente em `origin/main`.

Esta fatia encerra a **pendência 1** no que se refere à apresentação e à
prova automatizada própria do portal `/cliente/app/continuidade`:

- eliminar o `fetch` cru e o único `.catch` que confundia falhas;
- reutilizar vocabulário e transporte discriminado de continuidade;
- manter data de calendário no fuso UTC e dizer ausência de data;
- produzir evidência visual autenticada do portal;
- criar gate PostgreSQL + HTTP + Chromium próprio, com piso TAP;
- acionar tudo em workflow focal de CI.

Nada foi alterado em `server.mjs`, em `src/server/ext-continuity-api.mjs`, em
migração, em scheduler ou no contrato HTTP. Nenhuma rota foi inventada.

## Mudança de apresentação

`src/app/cliente/app/continuidade/page.tsx` agora usa
`continuityRequest`, que preserva status/corpo e retorna rede como
`status: 0`, e o vocabulário de `continuity-vocabulary.mjs`:

- **carregando**, **vazio**, **falha** e **NEGADO** são estados explícitos por
  `data-ui-state`; uma lista só é vazia após resposta `200` com `plans` como
  array;
- resposta `200` sem array de planos é dita como **“Resposta de planos
  incompleta”**, nunca convertida em vazio;
- 403 `forbidden` aparece como **Acesso negado**, limpa a lista anteriormente
  mostrada e não oferece repetição inútil (`canRetry: false`);
- 503 `audit_unavailable` e rede `status: 0` aparecem como falha recuperável;
- há **Atualizar lista** no estado lido e **Tentar novamente** somente quando
  o vocabulário autoriza nova tentativa;
- `honestTestDate` e `honestNextTest` substituíram a construção local
  `new Date("…T00:00:00")`: uma data `2026-03-11` é renderizada como
  `11/03/2026` no fuso `America/Sao_Paulo`, sem deslocar um dia; ausência é
  “Simulado nunca realizado” / “Próximo teste não agendado”.

A tela continua somente leitura, minimizada e sem acionamento externo. A
projeção continua vindo exclusivamente do servidor e não inclui contatos,
justificativa interna ou resultado de simulado.

## Provas adicionadas

| Artefato | Função |
|---|---|
| `tests/ux-continuity-client-portal-vocabulary.test.mjs` | anti-deriva: todos os erros literais do handler do cliente têm vocabulário; 403/404 não repetem, 503/rede repetem; data usa UTC; a página não volta a usar `fetch` nem `new Date` local. |
| `tests/ux-continuity-client-portal.integration.test.mjs` | servidor HTTP real, PostgreSQL real e Chromium real, com dados fictícios. Nenhuma resposta é falsificada por `window.fetch` ou `page.route`. |
| `scripts/qa-ux-continuity-client-postgres.mjs` | PostgreSQL 17 descartável, ledger completo, recusa banco remoto e audita `MINIMO = 9` no resumo TAP. |
| `.github/workflows/ux-continuity-client-delivery.yml` | workflow focal Node 22: tipos, vocabulário, EXT-10 herdado, gates EXT-10/UX-11 herdados, novo gate, captura e `npm audit`. |
| `scripts/ux-evidence-capture.mjs`, etapa `ux-11-continuidade-cliente` | cria identidade, vínculo e conta fictícios; o plano nasce, é aprovado, exercitado e publicado pelas APIs HTTP canônicas antes da captura autenticada. |
| `docs/ux-11-continuidade-cliente-evidencias/` | PNGs de desktop/mobile e de estados do gate, `resumo.json` e README de reprodução/limites. |

O gate novo executou nove casos e seu piso também é nove: remover, falhar ou
pular caso reprova o script mesmo que a saída principal de `node:test` seja
zero.

### Falhas reais exercitadas

| Situação | Produção no gate | Resultado medido |
|---|---|---|
| 401 | chamada HTTP sem sessão de cliente | sem `plans` no corpo |
| 403 | vínculo ativo da conta A é revogado depois da tela listar e o usuário atualiza | estado NEGADO, sem vazio, sem botão de repetir |
| 404 | `GET /api/client/continuity/plans/{uuid-inexistente}` contra o servidor canônico | `plan_not_found`, sem vazamento e `canRetry: false` no vocabulário |
| 503 | trigger PostgreSQL falha a inserção de auditoria durante a releitura | “Auditoria indisponível”, código técnico, HTTP 503 e repetição oferecida |
| rede | o processo HTTP é derrubado com a página aberta | “Rede indisponível”, `status: 0`, sem lista vazia; recuperação após o servidor voltar |

A prova de datas abre Chromium em `America/Sao_Paulo` e mede
`11/03/2026` e `11/09/2026`, eliminando a falsa confiança que seria obtida
com navegador configurado em UTC.

## Evidência visual executada

A etapa `npm run ux:evidence -- --stage=ux-11-continuidade-cliente` terminou
com saída `0` nos dois viewports:

```text
UX_EVIDENCE /cliente/app/continuidade 1440x900 OK [externos ignorados: 2]
UX_EVIDENCE /cliente/app/continuidade 390x844 OK [externos ignorados: 2]
UX_EVIDENCE_EXIT: 0
```

`resumo.json` registra `problems: []`, foco inicial real (`a`, outline `auto`)
e nenhuma rolagem horizontal. Os dois recursos externos bloqueados são a
fonte Google sem saída de rede no ambiente; foram registrados separadamente,
não suprimidos nem contados como erro da aplicação.

## Validação executada nesta sessão

| Comando | Resultado observado |
|---|---|
| `npm run typecheck` | passou, sem erro |
| `npm run test:unit` | passou, incluindo o novo anti-deriva do portal |
| `node --test tests/ext10-continuity.test.mjs` | passou (`24` casos) |
| `npm run test:ext10-continuity:pg` | passou contra PostgreSQL descartável |
| `npm run test:ux-continuity:pg` | `UX11_TAP_SUMMARY: pass=14 fail=0 skipped=0 todo=0 minimo_exigido=14` |
| `npm run test:ux-continuity-client:pg` | `UX11_CLIENT_TAP_SUMMARY: pass=9 fail=0 skipped=0 todo=0 minimo_exigido=9` |
| `npm run ux:evidence -- --stage=ux-11-continuidade-cliente` | passou nos viewports 1440×900 e 390×844, ambos `OK` |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| `git diff --check` | passou, sem apontamento |

Os gates reescreveram `next-env.d.ts` e `tsconfig.json`. Conforme a higiene
exigida, ambos foram restaurados ao conteúdo de `origin/main`; eles não entram
no diff desta fatia.

## O que ficou provado por execução

- um cliente fictício, com vínculo real e login real, vê somente o plano
  expressamente publicado para sua conta;
- conta vinculada sem plano publicado recebe vazio honesto;
- 403 por vínculo revogado é uma recusa visual, não lista vazia;
- 503 de auditoria e queda real do servidor são falhas recuperáveis e não
  afirmações de ausência;
- 404 canônico de plano inexistente não vaza conteúdo e sua tradução não
  oferece repetição;
- o calendário do portal mantém o dia no fuso brasileiro por usar UTC;
- o portal cabe em 390px sem rolagem horizontal nas massas medidas;
- a captura visual autenticada, o gate próprio e o workflow focal são
  executáveis com banco descartável e massa fictícia.

## O que permanece **NÃO provado**

- **404 apresentado por esta lista em Chromium.** O endpoint canônico de
  *listagem* só devolve 401/400/403/503/200 para uma conta ativa; o 404 existe
  no endpoint de detalhe, que a tela atual não chama. Esta fatia prova o 404
  por HTTP real e a tradução/`canRetry` por anti-deriva, mas não afirma uma
  captura visual de 404 de lista que o contrato não produz.
- **Transição, documentação de simulado e publicação/retirada pela interface
  de equipe.** Continuam provadas por HTTP na suíte EXT-10, não por navegador;
  a pendência 2 permanece aberta.
- **Homologação humana.** Não há aceite de Marcelo nem de Andreia e nada nesta
  entrega o infere.
- **WCAG integral e produção.** Foram verificados foco inicial e ausência de
  transbordo nos viewports citados; não houve auditoria WCAG completa, leitor
  de tela real, medição em produção ou uso de dados reais.
- **A inconsistência registrada do `AdminGate` interno.** O papel
  `operacao` e a ausência da rota em `ADMIN_MODULES` não foram modificados,
  pois exigem decisão do proprietário.
