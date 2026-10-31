# UX-PRO-03 — Jornada do RH em reclamações compartilhadas: verificação na base atual e correção do estado de escrita

**Data:** 30/10/2026 · **Base:** `6303213ffadf0505fb54efd51df393629f60e69b` (`main`, merge da PR #317) · **Branch da sessão:** `arena/69c29855-gruposegsystemseguranca`.

**Natureza:** entrega local, com prova em PostgreSQL 17 descartável + HTTP real + Chromium. Não é aceite humano, UAT, homologação nem autorização de produção. Produção permanece **NO-GO** (`docs/PRODUCAO-GATE.md`).

## 1. Sincronização, leitura e reconciliação do pedido

`git fetch origin` e `git status` foram executados antes de qualquer edição. A árvore estava **limpa** e `HEAD` era **idêntico** a `origin/main` (`6303213…`), portanto **nenhum reset foi necessário** e nenhum trabalho foi descartado. A `main` real já estava **avançada** em relação ao SHA citado no pedido (`d9d011c…`, merge da PR #307): entre eles entraram as PRs #311–#317 (11ª aba ADM, E22, E23, E25, E27, E7 e a promoção anterior do console).

Foram lidos, na ordem pedida, `AGENTS.md`, `README.md`, `docs/STATUS-VIGENTE.md`, `docs/UX-PRO-03-PROMOCAO-RECLAMACOES-COLABORADORES-2026-10-29.md`, `docs/PRODUCAO-GATE.md`, `src/server/employee-complaint-api.mjs`, o despacho em `server.mjs`, `src/app/admin/funcionarios/RhWorkspace.tsx` e o gate da página.

**Achado de reconciliação que mudou o escopo:** a jornada aditiva do RH pedida nesta sessão **já estava entregue e mergeada na base** — API própria `/api/admin/hr/employee-complaints` com `handleHrWorkspace`, aba `Reclamações compartilhadas` em `RhWorkspace`, teste focal em `test:unit` e cenário próprio no gate do portal, com relatório em `docs/UX-PRO-03-RH-RECLAMACOES-COMPARTILHADAS-2026-10-29.md`. Reimplementar isso violaria o `AGENTS.md` (duplicação de rota, permissão e componente) e produziria um RED falso. A decisão foi **verificar a base de verdade antes de escrever qualquer código** e só então corrigir o que estivesse realmente quebrado.

Os números citados no pedido também estavam defasados em relação à base medida nesta sessão: **24 abas** do `TiConsole` (24/24 com prova), **35 órfãos** e **11 promoções** — não 23/36/10. Nada disso foi alterado por esta fatia.

## 2. Sonda real antes de editar

| Verificação (base limpa, sem edição) | Resultado medido |
|---|---|
| `node --test tests/ux-pro-03-rh-reclamacoes-compartilhadas.test.mjs` | **4/4**, 0 falhas |
| `UX_PORTAL_TEST_PATTERN='browser UX-PRO-03 RH' node scripts/qa-ux-portal-postgres.mjs` | **1/1**, PostgreSQL 17 descartável (001–181) + Chromium, cluster descartado |
| Projeção mínima, 404 de relato não compartilhado, 403 de comercial/Marcelo, 500 legado preservado | confirmados pela execução acima, não por leitura de documento |

Depois da sonda, a auditoria do componente encontrou um **defeito real de comportamento** na sequência de escrita (abaixo). Nada mais foi alterado: contratos, papéis, projeções, migrações e o PATCH legado ficaram intactos.

## 3. Defeito encontrado e correção

**Sintoma reproduzido em navegador real:** o RH abre um relato, informa situação e motivo, confirma e — antes de a resposta chegar — abre outro relato (ou clica em “Atualizar lista”). A resposta antiga é corretamente descartada, mas o formulário do relato novo **permanece preso em “Salvando situação…” e desabilitado até recarregar a página inteira**.

**Causa:** `busy` era ligado no início do `PATCH` e só era desligado no `finally` quando a sequência de **detalhe** ainda coincidia. Como abrir outro relato (ou reler a lista) incrementa essa sequência, o `finally` desistia de liberar o estado, e as duas transições que trocam de relato também não o liberavam.

**Correção (aditiva, no próprio componente):** sequência de escrita própria (`writeSequence`), separada da sequência de leitura. Abrir um relato ou reler a lista incrementa a sequência de escrita e libera o formulário imediatamente; o `finally` do envio só libera o formulário se ele ainda for **o envio mais recente**. Assim:

- a resposta fora de ordem continua **descartada** (não sobrescreve o relato aberto);
- um envio mais novo **não** é destravado por um envio antigo que chega atrasado;
- o RH volta a salvar sem recarregar a página.

Nenhum contrato de API, projeção, papel, permissão, migração, rota ou consumidor foi alterado. O PATCH legado do RH continua **500** e a asserção que o registra foi mantida sem afrouxamento.

## 4. Prova RED → GREEN

| Prova | Antes (RED) | Depois (GREEN) |
|---|---|---|
| Teste focal `tests/ux-pro-03-rh-reclamacoes-compartilhadas.test.mjs` (5º teste, no `test:unit`) | **4/5** — falha em “cada envio precisa reivindicar a sequência de escrita” | **5/5**, 0 falhas |
| Guarda por mutação (fix removido do componente, teste mantido) | **4/5** — a guarda morde | **5/5** com o fix restaurado |
| Cenário `browser UX-PRO-03 RH: …` (PostgreSQL 17 + HTTP + Chromium) | **0/1** — `AssertionError: actual 'Salvando situação…'` | **1/1**, 0 falhas |
| Gate do portal completo | — | **49/49**, 0 falhas, 0 skips (cluster descartado) |

O cenário de navegador prova, na mesma execução e sem afrouxar nada do que já existia: a escrita lenta **é real** (a situação de B vira `resolvida` no PostgreSQL), a resposta fora de ordem **não** altera o detalhe aberto (A continua `Pendente`), o botão volta a “Salvar situação” habilitado, RH autorizado lê/atualiza relato compartilhado, relato não compartilhado devolve **404**, comercial e Marcelo recebem **403**, `admin|ti` mantêm o contrato legado com corpo completo, a projeção mínima continua sem descrição/referência/hash/conta/identidades, o histórico e o `audit_log` reais são conferidos no banco, a falha induzida de auditoria devolve **503 com rollback**, o 503 de transporte tem retry, e 320/390/768/1440 px não transbordam.

## 5. Limites que permanecem abertos (não resolvidos por esta fatia)

- O **PATCH legado** `PATCH /api/admin/employee-complaints` continua **500** para RH e sem escrita: preservado de propósito, para não reabrir o vazamento de `RETURNING *` de relato não compartilhado (42P08 documentado na fatia anterior).
- As rotas separadas de **mensagens e evidências** continuam verificando `is_hr_visible` por item e **não** o compartilhamento do relato. **Essa dívida não foi corrigida nem restringida aqui** e a nova interface não chama essas rotas.
- A leitura administrativa de `admin|ti` continua **global**, sem escopo automático por conta (contrato legado).
- Sem upload de bytes, sem anonimização, sem remoção de referência, sem parecer jurídico, sem leitor de tela, sem UAT/Windows e sem aceite humano (**0/222**).
- Backup real, F02, B2, provedores, RPO/RTO e domínio seguem pendências do proprietário; nenhum provedor foi escolhido.
- Migrações **001–181** não foram criadas nem alteradas; a próxima livre continua **182**.
- **Não é promoção do `TiConsole`:** `EXPECTED_TABS` (24) e `PROMOCOES_COM_PROVA` (11) não foram incrementados; a jornada do RH está em `/admin/funcionarios`.

## 6. Reconciliação do ledger (fonte única de estado)

Duas correções no `docs/STATUS-VIGENTE.md`:

1. A linha `| Testes |` declarava `npm test **1244/1244**` e gate do portal **48/48**. O medido nesta sessão é **1245/1245** asserções (o 5º teste focal desta fatia) e **49/49** cenários no gate do portal. A diferença de 48 → 49 **não é desta fatia**: o arquivo tem **49** declarações `test(` e este diff **não adiciona nenhuma** — o 49º cenário veio da base (PR #317, ADM-01..06) sem registro no ledger. A contagem de arquivos do `test:unit` permanece **161**, conferida pela guarda E27.
2. Foi registrada a própria jornada do RH (lista, detalhe, atualização transacional com motivo, projeção mínima e campos explicitamente compartilhados) e esta correção de estado de escrita; antes, o ledger só descrevia a dívida do PATCH legado e não mencionava a via aditiva existente.

O inventário de 222 foi **regenerado pelo gerador** (nunca à mão) porque ele varre `docs/`: o novo relatório somou **1** arquivo ao total varrido (1.628 → 1.629) e o índice apenas ganhou menções documentais — **nenhuma classe de evidência mudou**. O retrato continua **46 `a_revalidar`, 20 sem menção em gate**, **0/222 aceite humano** e **0/222 reauditoria integral**. A guarda E23 exige que o texto do relatório de reauditoria cite o número do artefato; a citação foi corrigida de **1.628** para **1.629** e a guarda voltou a **7/7** — nenhuma classe ou aceite foi promovido.

## 7. Bateria de verificação (30/10/2026, nesta sandbox)

`AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x` em todas as execuções de Node/Next.

| Verificação | Resultado |
|---|---|
| `npm test` | **1245/1245**, 0 falhas, 0 skips |
| `npm run test:unit` | **1245/1245**, 0 falhas, 0 skips; **161** arquivos explícitos; o focal desta área está incluído |
| `npm run typecheck` | **0 erros** |
| `npm run build` | **106/106** páginas geradas |
| `node scripts/qa-wave0-static.mjs` | **5/5**; 0 imports e 0 migrações ausentes |
| `node scripts/ux-pro-03-ti-inventory.mjs --check` | **OK** — 84 componentes, 24 abas (24 com prova), 35 órfãos, 11 promoções, 403 literais, 0 sem despacho |
| `node scripts/requisitos-222-inventory.mjs --check` | **OK** — 222 IDs, 20 `a_revalidar` sem gate, 0/222 aceite humano |
| `node scripts/ux-pro-00-inventory.mjs --check` | **OK** — 101 rotas, 101/101 com gate |
| `node scripts/ux-pro-10b-contrast-inventory.mjs --check` | **OK** — 3 artefatos conferem |
| `npm run reaudit:sec` | **OK** — 35/35 âncoras, 3 artefatos |
| `npm audit --audit-level=moderate` | **0 vulnerabilidades** |
| `node scripts/qa-ux-portal-postgres.mjs` | **49/49**, 0 falhas, 0 skips, migrações 001–181, cluster descartado |
| `npm run test:ux-hr:pg` | **20/20** em **2 execuções consecutivas** |
| `git diff --check` | limpo |
| SHA-256 `next-env.d.ts` / `tsconfig.json` | `1862ac4b…9db2b` / `2128c956…8d65`, preservados |
| Migrações | nenhuma criada/alterada; 001–181 imutáveis, próxima livre **182** |

**Flakiness observada e não reproduzida:** a primeira execução de `test:ux-hr:pg` nesta sessão fechou **18/20** — o cenário 16 morreu com **SIGSEGV no launch do Chromium** (`browser has been closed`) e o cenário 20 falhou em cascata, ambos em áreas alheias a esta fatia (ponto e folha). A base limpa passou **20/20**, e a árvore com esta alteração passou **20/20 duas vezes seguidas**. O evento é registrado como não reproduzido, no mesmo espírito do E9; **não** se declara estabilidade do gate.

Nenhuma sonda temporária permaneceu no repositório. Nenhum segredo, cookie, log ou dado real foi versionado; toda a massa é sintética e o cluster é descartado pelo próprio runner.
