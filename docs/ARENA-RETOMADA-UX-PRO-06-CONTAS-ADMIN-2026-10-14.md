# Retomada UX-PRO-06 — "contas administrativas do cliente": base confirmada, fatia ausente e limitação Windows/EPERM verificada

**Data:** 14/10/2026
**Status deste documento:** registro de verificação e de bloqueio. Nesta sessão **nenhuma tela, teste, API, migração, inventário ou contrato foi alterado**. O único arquivo acrescentado é este registro.
**O que este documento não é:** não declara validação manual, não declara aceite humano (de Marcelo, Andreia, TI ou comercial) e não declara que a fatia UX-PRO-06 de contas administrativas do cliente foi implementada. Ela **não** foi.

---

## 0. Base (`main`) sincronizada e confirmada antes de qualquer avanço

| Item | Comando | Resultado |
|---|---|---|
| Ponta da `main` remota | `git fetch origin main` + `git rev-parse origin/main` | `0e21c82df87860df786cadb995f687a4c9d8d213` (merge da PR #217) |
| HEAD local | `git rev-parse HEAD` | `0e21c82df87860df786cadb995f687a4c9d8d213` — **igual à `main`**, sem divergência |
| `main` local | `git rev-parse main` | `0e21c82df87860df786cadb995f687a4c9d8d213` |
| Árvore de trabalho | `git status --porcelain` | vazia no início (clone novo, sem edição pendente) |
| Trabalho guardado | `git stash list` | vazio |
| Histórico da sessão | `git reflog` | 2 entradas: `clone` e `checkout` para o branch da sessão — **nenhum commit local pré-existente** |
| Checks na ponta da `main` | `gh api .../commits/0e21c82.../check-runs` | `static-and-smoke` **success**; `backup-restore-postgres` **success**; 2 check-runs, nenhum pendente, falho ou cancelado |
| PRs abertas | `gh pr list --state open` | `[]` — nenhuma PR aberta no repositório |
| Proteção de branch | `gh api .../branches/main/protection` | **HTTP 403 `Resource not accessible by integration`** — não foi possível enumerar os checks obrigatórios por proteção de branch. A referência usada é a lista de checks da PR #217 (9 checks, todos `pass`): `static-and-smoke`, `backup-restore-postgres`, `admin-entry-postgres-browser`, `client-portal-postgres-browser`, `contracts-postgres-browser`, `crm-postgres-browser`, `finance-postgres-browser`, `operations-postgres-browser`, `ux-contract-postgres-browser` |

**Ambiente desta verificação:** Linux (kernel `6.1.158+`, uid `1001`), Node `v22.22.3`, npm `10.9.8`, dependências instaladas por `npm ci` (lockfile íntegro, `found 0 vulnerabilities`). Todos os workflows de `.github/workflows/` são `runs-on: ubuntu-latest`, portanto este ambiente é da mesma família de plataforma do CI — **não** é o host Windows do operador.

---

## 1. Bloqueio: o branch pedido e o trabalho local não existem aqui

O pedido era retomar `arena/ux-pro-06-client-admin-accounts`, preservando "o commit de escopo e o trabalho local existente". Verificado antes de qualquer edição:

| Verificação | Comando | Resultado |
|---|---|---|
| Branch remoto pedido | `git ls-remote --heads origin \| grep -i ux-pro-06` | **nenhuma correspondência** (exit 1) |
| Total de heads remotos | `git ls-remote --heads origin \| wc -l` | 204 heads; os únicos com `ux-pro` no nome: `arena/ux-pro-05-jornada-funcionario`, `ux-pro-01-shared-tokens-chrome`, `ux-pro-02-theme-coverage`, `ux-pro-03-auditoria-observabilidade`, `ux-pro-03-rag-fontes`, `ux-pro-03-rbac-governanca`, `ux-pro-03-ti-integracoes` |
| PR com esse head (qualquer estado) | `gh pr list --state all --search "ux-pro-06"` | 8 PRs: #210/#211 (fila de pedidos), #212 (funil), #213 (carteira), #214 (comercial), #215 (fechada, obsoleta), #216 (contratos lista), #217 (contratos detalhe). **Nenhuma** de contas administrativas do cliente |
| Branch local pedido | `git branch -a` | só `arena/<sessão>` e `main` |
| Eventos recentes do repositório | `gh api .../events` | refs citadas: apenas branches `arena/<hash>-gruposegsystemseguranca`; nenhum `ux-pro-06-client-admin-accounts` |

**Consequência registrada, sem contorno:** não existe commit de escopo a preservar, não existe implementação parcial a retomar e não existe diff de fatia a levar para uma PR. Nada foi inventado para preencher a lacuna (nem tela, nem teste, nem doc de escopo, nem captura). Se o trabalho existe, ele está **fora deste clone** — no host do operador (worktree/branch não publicado) ou em outra sessão cujo branch não foi enviado ao remoto. Publicar esse branch (`git push origin <branch>`) o torna retomável aqui.

Sobre o nome do branch: esta sessão está fixada pela plataforma ao branch `arena/14fe7e70-gruposegsystemseguranca`. Todo o trabalho desta sessão ficou nele; nenhum outro branch foi criado, alterado ou enviado.

---

## 2. A fatia também não está na `main` (evidência de código)

Para não confundir "branch ausente" com "fatia já entregue por outra PR", o estado vigente de `/admin/clientes` foi lido na `main` (`0e21c82`):

- `src/app/admin/clientes/page.tsx` — a leitura dos cadastros ainda engole a falha em silêncio:
  ```ts
  const loadAccounts = useCallback(async () => {
    try {
      const data = await callApi("/api/admin/client-accounts");
      setAccounts((data.accounts as AdminAccount[]) ?? []);
    } catch {
      /* As seções exibem erro próprio quando necessário. */
    }
  }, []);
  ```
  Não há faixa de desatualização, não há hora da última leitura concluída, não há "Tentar novamente", não há `role="status"` de releitura em curso — exatamente a classe de defeito corrigida em #212, #213, #214, #216 e #217 nas outras telas.
- `src/app/admin/clientes/AccountsSection.tsx` (153 linhas) — sem nenhum `data-testid`; apenas `role="alert"`/`role="status"` locais de erro/aviso de **escrita** (linhas 106–107), não de leitura.
- As nove seções (`Accounts`, `Grants`, `Contracts`, `Documents`, `Tickets`, `Visits`, `Reports`, `Invites`, `Recoveries`) somam 1.768 linhas e compartilham `accounts` vindo dessa única leitura.
- `docs/UX-PRO-06-CONTRATO-DETALHE-ESCOPO-2026-10-14.md` declara `/admin/clientes` (gestão interna de contas, vínculos, grants, convites) **fora do recorte** da última fatia, "família distinta, com risco próprio de escopo".
- Não existe nenhum documento `docs/UX-PRO-06-*CONTAS*`, `*CLIENTES*` ou `*ACCOUNTS*`; os docs UX-PRO-06 presentes na `main` são: `CARTEIRA-ESTADOS`, `COMERCIAL-ESCOPO`, `COMERCIAL-ESTADOS`, `CONTRATO-DETALHE-ESCOPO`, `CONTRATO-DETALHE-ESTADOS`, `CONTRATOS-ESCOPO`, `CONTRATOS-ESTADOS`, `FILA-PEDIDOS`, `FUNIL-ESTADOS`.

Rota e papéis vigentes (inventário de 13/10, linha 7): `/admin/clientes`, área `administrativo staff`, papéis `marcelo|ti` no `AdminGate` (UI; a autorização real fica na API `/api/admin/client-*`).

---

## 3. Os três testes de backup/CLI que falham com `EPERM` no Windows

### 3.1 Quais são e o que cada um afirma

| Arquivo | Teste | Symlink criado | Recusa afirmada |
|---|---|---|---|
| `tests/qa-backup-coverage-inventory.test.mjs` (linha 70) | `PLT-BAK-001: não aceitar diretório fora da raiz QA antes de ler banco ou bytes` | `await symlink(tmpdir(), path.join(f.qaRoot, 'outside-link'))` | `qa_inventory_external_dir_refused` |
| `tests/qa-cli-v2-local-provider.test.mjs` (linha 67) | `PLT-BAK-001 / CLI-04: diretório operador e symlink fora do QA são recusados` | `await symlink(tmpdir(), path.join(root, 'objects'))` | `qa_object_external_dir_refused` |
| `tests/qa-cli-v2-transfer.test.mjs` (linha 103) | `PLT-BAK-001: falha após 1/3 importa, remove só arquivo criado; desconhecido permanece e permite retry` | `await symlink(path.join(destinationRoot,'objects',canary), unsafe)` | `qa_cli_inventory_file_unsafe` |

Os três são **guardas negativos de segurança**: o symlink é criado de propósito pelo teste para provar que o provedor QA, o inventário de cobertura e a transferência CLI v2 **recusam** um caminho que sai da raiz QA. O `EPERM` acontece no `fs.symlink` do **setup do teste** (não no código de produto): no Windows a chamada vai a `CreateSymbolicLinkW`, que exige o privilégio `SeCreateSymbolicLinkPrivilege`; sem ele, libuv devolve `EPERM` e o teste falha antes de afirmar qualquer coisa.

### 3.2 Por que `TEMP`/`TMP=F:\SegSystem-QA-Temp` não resolve

A restrição é do **token do processo**, não do diretório. Os testes usam `os.tmpdir()` (que respeita `TEMP`/`TMP`) tanto para o alvo quanto para o link, então mover o temporário para `F:` apenas muda o lugar onde a criação é negada. Duas condições adicionais que também produzem `EPERM`/`EINVAL` nesse cenário, a conferir no host: se `F:` for volume de rede, removível ou formatado em exFAT/FAT32, a criação de symlinks não é suportada pelo sistema de arquivos; e o "Controlled folder access" do Defender pode negar a escrita na pasta.

### 3.3 Formas suportadas de executar esses testes (sem tocar nos testes)

Qualquer uma destas torna a suíte completa executável no Windows; nenhuma exige alterar código ou teste:

1. **Modo Desenvolvedor** (Windows 10 1703+/11): Configurações → Sistema → Para desenvolvedores → **Modo de desenvolvedor: ativado**. Concede a criação de symlinks ao usuário interativo sem elevação. É o caminho recomendado para QA local.
2. **Shell elevado**: executar o terminal de QA como Administrador (o token do processo passa a ter `SeCreateSymbolicLinkPrivilege`).
3. **Concessão explícita do privilégio**: `secpol.msc` → Políticas Locais → Atribuição de Direitos de Usuário → **Criar links simbólicos** → adicionar o usuário; depois sair e entrar de novo na sessão.
4. **Plataforma equivalente à do CI**: WSL2 ou contêiner Linux com Node 22 (`npm ci` + `npm test`), que é exatamente o que o check obrigatório executa.

Sondagem de 5 segundos para confirmar antes de rerodar a bateria (deve imprimir `SYMLINK_OK`):

```bat
node -e "const fs=require('fs'),os=require('os'),p=require('path');const d=fs.mkdtempSync(p.join(os.tmpdir(),'probe-'));fs.symlinkSync(os.tmpdir(),p.join(d,'l'));console.log('SYMLINK_OK')"
```

Complemento opcional de diagnóstico (como Administrador): `fsutil behavior query SymlinkEvaluation`.

### 3.4 Por que os testes não foram enfraquecidos

Substituir `symlink` por junction (`fs.symlink(..., 'junction')`, que não exige privilégio), pular os três casos em `win32`, ou relaxar as asserções retiraria a única prova automatizada de que um diretório/link **fora da raiz QA** é recusado antes de ler banco ou escrever bytes — cobertura P0 registrada em `docs/RELATORIO-CONSOLIDADO-TESTES.md` (`PLT-BAK-001.AI`, `PLT-BAK-001.AS`). Nenhuma dessas alterações foi feita, e este documento não autoriza fazê-las: a correção pertence à configuração do host, não ao repositório.

### 3.5 Verificação executada neste ambiente (Linux, mesma família do CI)

| Execução | Comando | Resultado |
|---|---|---|
| Sonda de capacidade de symlink | `node -e "...symlinkSync..."` | `symlink OK -> true`, `tmpdir=/tmp`, `platform=linux` |
| Os três arquivos isolados | `node --test tests/qa-backup-coverage-inventory.test.mjs tests/qa-cli-v2-local-provider.test.mjs tests/qa-cli-v2-transfer.test.mjs` | **11 testes / 11 aprovados / 0 falhas / 0 pulados**, exit 0 — incluindo os três casos de symlink listados em §3.1 |
| Bateria completa | `npm test` | **933 testes / 933 aprovados / 0 falhas / 0 pulados / 0 cancelados**, exit 0, 15,7 s |

Ou seja: os mesmos 933 testes que no Windows do operador pararam em 930/933 passam integralmente aqui. A diferença é de plataforma/privilégio do host, não de código — o que confirma o diagnóstico de `EPERM` por privilégio de symlink e confirma que o check obrigatório (`QA baseline` / `static-and-smoke`, que roda `npm test` em `ubuntu-latest`) **não é afetado** por essa limitação local. A execução local no Windows **não substitui** esse check.

**Precedente já documentado no repositório** (mesma tríade, mesmos códigos): `docs/ATIVACAO-LOCAL-PONTO-2026-10-07.md` (865 testes, 3 bloqueados por `EPERM`), `docs/AUDITORIA-INTERFACE-ROTAS-2026-10-08.md`, `docs/PLANO-CONCLUSAO-ARENA.md` (item F02, "requer Windows do operador"), e os registros UX-PRO-03/UX-PRO-04 de 13/10 (`895/898`, `908+3`, `912+3`, `917+3`, `921+3`, `925+3`, `929+3`, `930+3`). A contagem `930/933` relatada nesta retomada é a mesma da `main` vigente.

---

## 4. Verificações executadas nesta base

Todas contra `main` (`0e21c82`), neste ambiente Linux, sem nenhuma edição de produto. **Elas validam a base, não a fatia** — a fatia não existe (§1 e §2).

| Verificação | Comando | Resultado |
|---|---|---|
| Teste focal UX-PRO-06 | — | **não executável: não existe.** Nenhum `tests/ux-pro-06-*.test.mjs` e nenhum script `test:ux-pro-06*` em `package.json`; os arquivos `ux-pro-*` existentes são `ux-pro-00-inventory` e onze `ux-pro-03-*-ui`. O gate focal seria criado pela própria fatia |
| Bateria de unidade | `npm test` | **933/933**, 0 pulados, exit 0 |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | exit 0, sem diagnósticos |
| Build | `NEXT_TELEMETRY_DISABLED=1 DATABASE_URL= MAIL_HOST= OLLAMA_ENABLED=false NEXT_PUBLIC_ALLOW_INDEX=false NEXT_PUBLIC_ENV=beta npm run build` | exit 0; lista de rotas emitida (inclui `/admin/clientes` e todo o portal `/cliente/*`) |
| Onda 0 estática | `node scripts/qa-wave0-static.mjs` | **5/5** OK (imports relativos, dependências no manifest/lockfile, migrações 001–180 contínuas e únicas, migrações registradas no migrador PG, CI sem bypass), exit 0 |
| Inventário | `node scripts/ux-pro-00-inventory.mjs --check` | `OK: docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv e docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv conferem com o código atual.`, exit 0 |
| Gate L08 | `npm run test:l08-delivery:pg` | **51 testes / 51 aprovados / 0 falhas / 0 pulados**; `L08_DELIVERY_TEST_EXIT: 0`; `QA_L08_PG_TEMP_CLEANED: true`; PostgreSQL 17 embutido descartável + HTTP real + smoke de entrada em Chromium real |
| Gate do painel ADM (vizinho de família) | `npm run test:ux-adm:pg` | **12/12**, 0 pulados; `UX_ADM_TEST_EXIT: 0` |
| Gate que alcança `/admin/clientes` em navegador | `npm run test:f03-client-ticket-acceptance:pg` | **1/1**, 0 pulados; `F03_CLIENT_TICKET_ACCEPTANCE_TEST_EXIT: 0`; ledger de migrações **001–180** verificado em PostgreSQL; `tests/f03-client-ticket-acceptance.integration.test.mjs:383` faz `staffPage.goto(.../admin/clientes)` em Chromium real |

Levantamento útil para a retomada: **não existe gate focal dedicado à tela `/admin/clientes`**. O que a alcança hoje é o gate F03 (jornada de chamado com aceite), mais as asserções estáticas de `tests/admin-page-gates.test.mjs:51` (papéis `marcelo|ti`) e `tests/client-offline-recovery.test.mjs` (texto de `RecoveriesSection`). `tests/ux-adm-panel.integration.test.mjs:377` cita `/admin/clientes` apenas como caminho canônico do registro `cli_ticket`, não como tela exercitada.

---

## 5. Hashes de `next-env.d.ts` e `tsconfig.json` (antes/depois, preservados)

Baseline lido do Git antes de qualquer execução:

```
18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2  next-env.d.ts
2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65  tsconfig.json
```

| Momento | `next-env.d.ts` | `tsconfig.json` | Ação |
|---|---|---|---|
| Baseline (Git) | `18b697c4…11a2` | `2128c956…8d65` | — |
| Após `typecheck`, `qa-wave0-static`, `inventory --check` | `18b697c4…11a2` (igual) | `2128c956…8d65` (igual) | nenhuma |
| Após `npm run build` | **`1862ac4b…db2b`** (reescrito pelo Next) | `2128c956…8d65` (igual) | `git checkout -- next-env.d.ts` → baseline restaurado |
| Após `npm run test:l08-delivery:pg` | **`e05da517…9c95`** (aponta para `.next/l08-browser-smoke/…`) | **`c9948e5c…caa`** (acrescenta `.next/l08-browser-smoke/types/**` e `dev/types/**` em `include`) | `git checkout -- next-env.d.ts tsconfig.json` → baseline restaurado |
| Após `npm run test:ux-adm:pg` | **`ed7c6ab7…87e7`** | `2128c956…8d65` (igual) | restaurado ao final |
| **Final (após todos os gates)** | **`18b697c4…11a2`** | **`2128c956…8d65`** | **idênticos ao baseline**, conferidos por `diff` dos digests; `git status --porcelain` vazio |

Comportamento confirmado e já conhecido das fatias anteriores: `next build` e os gates que sobem um workspace Next próprio reescrevem `next-env.d.ts` (e o gate L08 também `tsconfig.json`). Os dois foram restaurados do Git após cada execução e **não entram em diff algum**.

---

## 6. Limitações (declaradas, não escondidas)

1. **Não há validação manual nem aceite humano** registrados aqui. Nada nesta sessão foi revisado, aprovado ou aceito por Marcelo, Andreia, TI ou comercial.
2. Chromium automatizado com PostgreSQL descartável e massa sintética **não é** validação manual nem aceite; é verificação automatizada de contrato e de apresentação.
3. **O `EPERM` não foi reproduzido** nesta sessão: não há host Windows aqui. O diagnóstico vem do código dos três testes (§3.1), da semântica documentada de `fs.symlink` no Windows e do precedente registrado no próprio repositório (§3.5). As quatro formas suportadas de §3.3 **não foram executadas** em Windows — são instruções para o operador, não resultados medidos.
4. **Checks obrigatórios não puderam ser enumerados** pela API de proteção de branch (403). A lista de referência é a dos checks da PR #217.
5. As verificações do §4 atestam a **base** (`main` `0e21c82`), não a fatia pedida. Sem diff de fatia, não existe "antes/depois" de comportamento para medir — o "antes" registrado é o estado de defeito lido no código (§2).
6. **Nenhuma PR foi aberta.** Uma PR exigiria um diff de escopo que não existe neste ambiente; abrir uma PR vazia ou com conteúdo fabricado violaria a regra de não inventar trabalho nem aceite. Nenhum merge foi feito.
7. Nenhum outro branch foi criado, alterado ou enviado; o trabalho desta sessão ficou no branch da sessão.
8. A PR #215 (fechada, obsoleta desde a #216) não foi reaberta, mesclada ou alterada — a decisão sobre ela continua sendo do proprietário.

---

## 7. Prompt de retomada desta mesma fatia (pronto para colar)

> Retome a fatia **UX-PRO-06 — contas administrativas do cliente (`/admin/clientes`)** em `berger33/gruposegsystemseguranca`.
>
> **0. Base primeiro.** Rode `git fetch origin --prune` e confirme a ponta da `main` com `git rev-parse origin/main`, os check-runs desse commit e `gh pr list --state open`. Registre o SHA conferido. Na última conferência (14/10/2026) a ponta era `0e21c82df87860df786cadb995f687a4c9d8d213`, com `static-and-smoke` e `backup-restore-postgres` verdes e nenhuma PR aberta; a proteção de branch responde 403, então use os 9 checks da PR #217 como referência de obrigatórios.
>
> **1. Trabalho pré-existente.** O branch `arena/ux-pro-06-client-admin-accounts` **não existe no remoto** e não havia commit de escopo nem trabalho local no clone desta sessão (evidências em `docs/ARENA-RETOMADA-UX-PRO-06-CONTAS-ADMIN-2026-10-14.md` §1). Se o commit de escopo existe no seu host, publique-o (`git push origin <branch>`) e retome a partir dele, preservando-o. Se não existe, **comece pelo registro de escopo** commitado isoladamente antes de tocar em tela, teste ou inventário, no padrão de `docs/UX-PRO-06-CONTRATO-DETALHE-ESCOPO-2026-10-14.md`, e declare que é anterior à implementação.
>
> **2. Recorte.** Uma tela: `/admin/clientes` (`src/app/admin/clientes/page.tsx` + `AccountsSection.tsx` e as outras oito seções que consomem o mesmo `accounts`). Papéis `marcelo|ti` no `AdminGate`, inalterados; autorização real continua na API `/api/admin/client-*`. Defeito medido na `main`: `loadAccounts` engole a falha (`catch {}`), sem faixa de desatualização, sem hora da última leitura concluída, sem repetição e sem `role="status"` de releitura em curso; `AccountsSection` não tem `data-testid`. Fora do recorte: portal `/cliente/app/*`, `/admin/portal/*`, APIs, papéis, migrações, `UiWorkspace.module.css` compartilhado sem medição, e as fatias já entregues (#210–#214, #216, #217), que não são reabertas.
>
> **3. Regras.** Leia `AGENTS.md` e `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`. Mudança aditiva e pequena; nenhuma funcionalidade removida, desativada, oculta ou renomeada; negativa continua falhando fechada. Meça o "antes" na `main` limpa com o teste novo, antes de editar a tela.
>
> **4. Checks.** Execute e registre resultados reais (não estimados): teste focal novo da fatia; `npm test` (a `main` está em **933** testes); `npm run typecheck`; `npm run build`; `node scripts/qa-wave0-static.mjs` (5/5); `node scripts/ux-pro-00-inventory.mjs --check`; `npm run test:l08-delivery:pg`; e o gate que já alcança a tela, `npm run test:f03-client-ticket-acceptance:pg`. Registre também que **não existe gate focal dedicado a `/admin/clientes`** — o da fatia é novo.
>
> **5. `EPERM`/symlink no Windows.** Se a bateria local parar em 930/933 com `EPERM` em `qa-backup-coverage-inventory`, `qa-cli-v2-local-provider` e `qa-cli-v2-transfer`, **não altere, não pule e não enfraqueça esses três testes**: são guardas P0 que provam a recusa de caminho/symlink fora da raiz QA. A causa é privilégio de criação de symlink do processo Windows, não o diretório temporário (por isso `TEMP`/`TMP` em `F:` não resolve). Use uma forma suportada: Modo Desenvolvedor ativado, shell elevado, privilégio "Criar links simbólicos" concedido em `secpol.msc`, ou WSL2/contêiner Linux. Confirme com a sonda que imprime `SYMLINK_OK`. Em Linux/Node 22 os três arquivos passam 11/11 e a bateria passa 933/933. O check obrigatório roda em `ubuntu-latest` e precisa estar verde na PR; a execução local não o substitui.
>
> **6. Hashes.** Confira por SHA-256 `next-env.d.ts` (`18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`) e `tsconfig.json` (`2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`) antes e depois de cada execução. `next build` reescreve `next-env.d.ts`; o gate L08 reescreve os dois. Restaure do Git e mantenha-os fora do diff.
>
> **7. Evidências e entrega.** Registre antes/depois por SHA-256, capturas em pasta própria `docs/ux-pro-06-<recorte>-evidencias/` com `resumo.json`, e a conferência **por linha** dos CSVs de inventário (só a linha de `/admin/clientes` pode mudar). **Não declare validação manual nem aceite humano.** Abra uma PR pequena baseada na `main` somente com todos os checks obrigatórios verdes e faça merge apenas após revisão concluída e todos os checks verdes. Se algum check falhar ou ficar pendente, preserve o trabalho, não faça merge e relate a causa com um novo prompt de retomada desta mesma fatia.

---

## 8. POSTSCRIPTUM (mesma sessão, ~1h depois): a fatia foi entregue pela PR #218 enquanto esta sessão trabalhava

O proprietário decidiu, durante esta sessão, que a fatia seria implementada do zero (§1 acima). Ela foi implementada, medida e commitada neste branch. **Ao sincronizar a `main` antes de abrir a PR**, a conferência mostrou que o mesmo recorte já havia sido entregue por outra sessão:

| Item | Evidência |
|---|---|
| Ponta da `main` ao final desta sessão | `27a26f8b2acd523d4b86134fa0141e8e5623b375` — **não** é mais `0e21c82`; `git merge-base --is-ancestor origin/main HEAD` falha (divergiu) |
| O que entrou | `git log 0e21c82..origin/main`: **PR #218** "UX-PRO-06: estados da leitura dos cadastros centrais em /admin/clientes", head `arena/40f48ef1-gruposegsystemseguranca`, **MERGED** em 14/10/2026 03:43:54Z, com 6 commits (`a0833da` escopo → `b440121` gate escrito antes da correção → `1345aee` implementação → `c654e2a` estados/evidências/inventário → `465f962` correção de frase → `27a26f8` merge) |
| Mesmos arquivos, mesma finalidade | A PR #218 alterou `src/app/admin/clientes/{page.tsx,AccountsSection.tsx,admin-shared.ts,AdminClientes.module.css}`, `README.md`, `package.json`, os dois CSVs de inventário e acrescentou gate próprio (`tests/ux-client-admin-workspace.integration.test.mjs`, `scripts/qa-ux-client-admin-postgres.mjs`, script `test:ux-client-admin:pg`, workflow `.github/workflows/ux-client-admin-delivery.yml`), docs `UX-PRO-06-CLIENTES-ESCOPO/ESTADOS-2026-10-14.md` e evidências em `docs/ux-pro-06-clientes-evidencias/` (com subpasta `antes/`) |
| Mesmos cinco estados | `git show origin/main:src/app/admin/clientes/page.tsx` documenta e implementa: releitura em curso com `role="status"`, falha transitória com faixa `role="alert"` + hora + repetição, falha inicial sem "carregando" eterno, negativa descartando o dado sem oferecer repetição; marcadores `clientes-cadastros-{negado,indisponivel,falha,desatualizada,atualizando}` |
| Checks da PR #218 | todos `pass` (`static-and-smoke`, `backup-restore-postgres`, `admin-entry-postgres-browser`, `client-portal-postgres-browser`, `contracts-postgres-browser`, `crm-postgres-browser`, `finance-postgres-browser`, `operations-postgres-browser`, `compliance-postgres`, `biddings-postgres`, `dispatch-guard`, 5 jobs `focal`) |
| Reconciliação é impossível sem substituir trabalho entregue | `git merge-tree --write-tree origin/main HEAD` → **exit 1** com CONFLICT (content) em `README.md`, `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`, `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`, `src/app/admin/clientes/AccountsSection.tsx`, `src/app/admin/clientes/AdminClientes.module.css`, `src/app/admin/clientes/page.tsx` |

**Decisão tomada e por quê:** nenhuma PR foi aberta e nenhum merge foi feito. Resolver esses conflitos significaria escolher entre duas implementações do mesmo recorte — isto é, **substituir funcionalidade já entregue na `main`**, o que `AGENTS.md` proíbe sem decisão explícita do proprietário. O trabalho desta sessão permanece preservado no branch `arena/14fe7e70-gruposegsystemseguranca` (commits `0b732bd` registro, `e191ab2` escopo, `66fa00b` implementação + gate + evidências), baseado em `0e21c82`, e não foi reescrito.

**Diferenças residuais entre o gate desta sessão e o gate entregue (candidatas a uma fatia seguinte aditiva, sem tocar na implementação da #218):**

1. preservação **entre seções**: o gate desta sessão afirma que, depois da falha na releitura, as opções de cadastro permanecem nos seletores `#grant-account` (seção 2) e `#contracts-account` (seção 3); o gate entregue afirma a faixa, a hora e que o cadastro continua visível na seção 1;
2. prova de que a repetição **relê de verdade**: o gate desta sessão cria um cadastro por HTTP durante a falha, afirma que ele **não** aparece no dado preservado e que só aparece depois de a repetição concluir; o gate entregue afirma que o cadastro já lido continua visível após a repetição;
3. contraste medido da faixa (6,54:1 em 320 px e 1440 px) e contagem de `problems: []` no `resumo.json`.

Nenhuma das três foi implementada: são acréscimos de teste a um gate recém-entregue e dependem de autorização do proprietário.

---

## 9. POSTSCRIPTUM 2 (mesma sessão, encerramento): relido o inventário da `main` `27a26f8`, uma recomendação minha foi corrigida e a próxima fatia foi decidida

### 9.1 A recomendação errada que precisei retirar

Com a fatia de `/admin/clientes` já entregue pela PR #218 e esta sessão encerrada sem PR, reli o inventário versionado em `main` para indicar o próximo passo. A matriz `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` tem 100 linhas e **todas** carregam texto de lacuna; o inventário `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv` tem 100 rotas, 44 delas `/admin`. Destas:

| Rota | `estados_carregando` | `estados_erro` | `estados_vazio` | `marcadores_teclado` | gate focal | `capturas_primeiro_foco` |
|---|---|---|---|---|---|---|
| `/admin/clientes` | sim | sim | sim | **nao** | `ux-client-admin-delivery.yml` | **nao** |
| `/admin/contratos` | sim | **nao** | sim | **nao** | `ux-contract-delivery.yml` | sim |
| `/admin/contratos/[id]` | sim | sim | sim | sim | `ux-contract-delivery.yml` | sim |
| `/admin/comercial` | **nao** | **nao** | sim | **nao** | `ux-crm-delivery.yml` | sim |
| `/admin/fornecedores` | sim | **nao** | sim | sim | `ext04` + `ux-supplier` | sim |
| `/admin/leads` | sim | sim | sim | **nao** | `ux-crm-delivery.yml` (herdado) | **nao** |
| `/admin/portal/permissoes` | **nao** | sim | sim | **nao** | **nenhum** | **nao** |
| `/admin/patrimonio` | sim | **nao** | sim | **nao** | **nenhum** | **nao** |

Lendo `estados_erro = nao` em `/admin/contratos` como lacuna de comportamento, recomendei essa rota como próxima fatia. **Estava errado e a recomendação foi retirada.** A lista de contratos **já foi entregue**: `docs/UX-PRO-06-CONTRATOS-ESTADOS-2026-10-14.md` registra base `259ee43`, escopo commitado antes da implementação, "antes" com 2 dos 4 casos novos falhando na `main`, "depois" com `npm run test:ux-contract:pg` **12/12** (8 pré-existentes + 4 novos), faixa `role="alert"` com motivo real, hora da última leitura concluída, declaração de dados possivelmente desatualizados e "Tentar novamente", além de `role="status"` na releitura em curso. Não há ali lacuna funcional de estado de erro a corrigir.

**Lição registrada para a próxima sessão:** célula do inventário **não** é comportamento de tela. Antes de propor fatia a partir de uma célula `nao`, ler o doc de estados da rota e a fonte local; a célula pode estar `nao` por vocabulário.

### 9.2 Por que a célula diz `nao`: o detector é léxico (evidência com linha)

`scripts/ux-pro-00-inventory.mjs` em `main`:

- linha 280 — `const ERROR_MARKERS = /variant=["']error|ErrorVariant|phase[:=]\s*["']failed["']|\bFalhou\b|\bfalhou\b/;`
- linha 282 — `const KEYBOARD_MARKERS = /onKeyDown|addEventListener\(\s*["']keydown|tabIndex|\.focus\(|focus-visible/;`
- linha 225 — `if (entry.firstFocus) record.firstFocus = true;` (lido de `docs/<stage>-evidencias/resumo.json`)
- linhas 321/323/330 — as três células são preenchidas por esses testes.

Ocorrências na fonte local de cada rota (arquivos do próprio diretório da rota, que é o que o inventário concatena):

| Rota | fonte local | `ERROR_MARKERS` | `KEYBOARD_MARKERS` |
|---|---|---|---|
| `/admin/contratos` | `ContractWorkspace.tsx` (441 l.) + `Contratos.module.css` (37 l.) | **0** | **0** |
| `/admin/contratos/[id]` | `ContractWorkflowClient.tsx` (972 l.) + `DetalheContrato.module.css` (38 l.) | 1 (`falhou`) | 4 (`onKeyDown`, `tabIndex` ×2, `.focus(`) |

Na lista, o estado de erro existe e está literalmente em `src/app/admin/contratos/ContractWorkspace.tsx`:

- linha 119 — `<div role="alert" data-testid={testId} className={localStyles.stale}>`
- linhas 250 / 302 / 389 — `testId="propostas-desatualizada"` / `testId="empresas-desatualizada"` / `testId="contratos-desatualizada"`
- linha 227 — `<div data-testid="contracts-write-error" … role="alert">`
- linhas 256 / 308 — `<p role="status" data-testid="…-atualizando">`

Nenhuma dessas linhas contém `falhou`, `variant="error"`, `ErrorVariant` nem `phase: "failed"`. O `data-testid` da faixa é montado **por prop** (`data-testid={testId}`), então nem mesmo uma detecção por testid literal (`data-testid="…desatualizada"`) pegaria. A diferença entre lista e detalhe no inventário é de **vocabulário**, não de comportamento. O percurso de teclado da lista é por link nativo e **foi medido em navegador** (`docs/ux-pro-06-contratos-evidencias/contratos-390-teclado.png`), sem nenhum marcador léxico no código.

Varredura das 44 rotas `/admin` de `main` reproduzindo os dois regexes sobre a fonte local:

- **9 rotas** com `role="alert"` na fonte e `estados_erro = nao` no inventário: `/admin`, `/admin/comercial`, `/admin/contratos`, `/admin/emergencial`, `/admin/entrar`, `/admin/fornecedores`, `/admin/pendencias`, `/admin/publicacao`, `/admin/relatorios`. Em nenhuma delas há testid literal `…desatualizada`/`…falha` (todos montados por prop ou template).
- **3 rotas** com captura visual registrada e `marcadores_teclado = nao`: `/admin/clientes`, `/admin/comercial`, `/admin/contratos`. Para elas a matriz escreve `percurso de teclado nao verificado` (linha 375) **mesmo quando o percurso foi medido em navegador** — o doc entregue de `/admin/clientes` registra foco visível medido e diferença confinada a 4.705 px de 390×7.066 (caixa `x 0–77 × y 790–877`).
- **21 rotas** `/admin` têm captura; **1** tem `capturas_primeiro_foco = nao`: `/admin/clientes`. Motivo verificado: o `resumo.json` entregue pela PR #218 (`docs/ux-pro-06-clientes-evidencias/resumo.json`) tem 9 entradas com as chaves `stage, route, role, viewport, theme, screenshot, problems` e **nenhuma** `firstFocus`, enquanto **42 entradas** de estágios anteriores (`ux-03b`, `ux-04`, `ux-05`, …) têm o flag. O formato suporta; o gate novo não emite.
- A implementação paralela desta sessão (não entregue) emite `firstFocus: true` na entrada 6 de `docs/ux-pro-06-contas-admin-evidencias/resumo.json`. É exatamente isso — e não tela — que ela tem de aproveitável sobre o que já foi entregue, somado às três asserções de teste do §8.

### 9.3 Decisão do proprietário e impedimento físico deste branch

**Decisão (pergunta feita e respondida nesta sessão):** a próxima fatia é **precisão do inventário** — fazer o inventário e a matriz reconhecerem o que já foi entregue, em vez de abrir outra fatia de tela. Nenhuma tela é alterada e nenhum código entregue é substituído.

**Impedimento:** essa fatia **não pode ser feita neste branch**. `arena/14fe7e70-gruposegsystemseguranca` carrega a implementação paralela de `/admin/clientes` em `da82468`; qualquer PR a partir daqui conflita em 6 arquivos com a PR #218 (§8) e resolver significaria substituir funcionalidade entregue, o que `AGENTS.md` proíbe sem decisão explícita. A sessão também é fixa a este branch — não pode criar nem publicar outro. Portanto: **sessão nova, branch baseado em `main` `27a26f8`.**

**Nota de ambiente (sem efeito no conteúdo):** entre turnos, o `.git` local voltou ao estado de clone fresco (`HEAD = 0e21c82`, reflog só com clone e checkout) com todo o trabalho solto como alteração não commitada, enquanto os quatro commits seguiam no remoto. Verificado que a árvore era **byte-idêntica** a `da82468` (`git add -A && git diff --cached da82468` vazio), refeito o `git fetch` e restaurado o ponteiro com `git reset --hard da82468`. Local e remoto coincidindo, árvore limpa, tracking configurado, hashes de `next-env.d.ts`/`tsconfig.json` íntegros (§5). Nada perdido, nada reescrito.

### 9.4 Escopo sugerido e riscos da fatia decidida (nada disto foi executado)

1. **`ERROR_MARKERS` reconhecer o padrão canônico entregue.** Risco real: `role="alert"` também é usado para aviso de escrita (ex.: `contracts-write-error`), então alargar a regex pode virar células de rotas onde o alerta **não** é estado de leitura falha. Cada rota virada deve ser justificada individualmente com file:line, nunca por regex ampla.
2. **Creditar percurso de teclado medido em navegador** a partir do `resumo.json` (campo explícito emitido pelo gate), em vez de depender só de marcador léxico, e ajustar a frase da matriz (linhas 350–352 e 375) para não afirmar "nao verificado" quando há captura que o verificou.
3. **Gate de `/admin/clientes` emitir `firstFocus`** na captura de teclado (1 célula do inventário).
4. **Não enfraquecer** `tests/ux-pro-00-inventory.test.mjs` — é ele que exige CSV versionado fresco. Regenerar com `node scripts/ux-pro-00-inventory.mjs` e conferir que o diff se limita às células justificadas.
5. Preservar os SHA-256 de `next-env.d.ts` e `tsconfig.json` fora do diff (§5), medindo antes/depois.

### 9.5 Prompt de retomada da fatia decidida (pronto para colar, sessão nova)

> Em `berger33/gruposegsystemseguranca`, abra branch novo baseado em `main` e confirme a ponta antes de qualquer avanço (`git fetch origin && git log --oneline -1 origin/main`; na última leitura era `27a26f8`, PR #218, sem PR aberta). Fatia: **precisão do inventário UX-PRO-00** — nenhuma tela é alterada e nenhum código entregue é substituído. Contexto medido: em `scripts/ux-pro-00-inventory.mjs`, `ERROR_MARKERS` (linha 280) e `KEYBOARD_MARKERS` (linha 282) são léxicos; `capturas_primeiro_foco` (linha 330) depende de `entry.firstFocus` (linha 225) vindo de `docs/<stage>-evidencias/resumo.json`. Consequências verificadas: 9 rotas `/admin` têm `role="alert"` na fonte e `estados_erro = nao` (`/admin`, `/admin/comercial`, `/admin/contratos`, `/admin/emergencial`, `/admin/entrar`, `/admin/fornecedores`, `/admin/pendencias`, `/admin/publicacao`, `/admin/relatorios`); 3 rotas têm captura e `marcadores_teclado = nao` (`/admin/clientes`, `/admin/comercial`, `/admin/contratos`) e a matriz ainda escreve "percurso de teclado nao verificado" (linha 375); `/admin/clientes` é a única rota `/admin` com captura e `capturas_primeiro_foco = nao`, porque o `resumo.json` da PR #218 tem 9 entradas e nenhuma `firstFocus`, enquanto 42 entradas de estágios anteriores têm. Faça: (a) `ERROR_MARKERS` reconhecer o padrão canônico entregue — a faixa `role="alert"` com testid de dados desatualizados, que em `src/app/admin/contratos/ContractWorkspace.tsx` linha 119 é `<div role="alert" data-testid={testId}>` com `testId="contratos-desatualizada"` na linha 389, ou seja, testid montado **por prop**, invisível a regex literal — justificando **rota a rota com file:line** e sem virar célula onde `role="alert"` é aviso de escrita (ex.: `contracts-write-error`, linha 227); (b) creditar percurso de teclado medido em navegador por campo explícito no `resumo.json` emitido pelo gate, e ajustar as frases da matriz (linhas 350–352, 375) para não declarar "nao verificado" quando há captura que verificou; (c) fazer o gate de `/admin/clientes` emitir `firstFocus` na captura de teclado. Meça **antes** (células atuais das rotas afetadas, com o diff dos dois CSVs) e **depois**, e confira que o diff dos CSVs se limita às células justificadas. Não enfraqueça, pule nem altere `tests/ux-pro-00-inventory.test.mjs` — é ele que exige CSV versionado fresco; se algum teste falhar, registre a causa. Rode: `npm test`, `npm run typecheck`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `npm run test:l08-delivery:pg` e os gates focais das rotas cujas células mudarem (`test:ux-contract:pg`, `test:ux-client-admin:pg`, `test:ux-crm:pg`). Preserve os SHA-256 de `next-env.d.ts` (`18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`) e `tsconfig.json` (`2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`) fora do diff, restaurando com `git checkout --` após build e após cada gate Next. Registre antes/depois, limitações e evidências; **nunca** declare validação manual ou aceite humano. PR pequena baseada em `main` só com todos os checks obrigatórios verdes; merge só após revisão concluída e checks verdes. Em falha ou check pendente, preserve o trabalho, reporte a causa e gere novo prompt de retomada para a mesma fatia. Não rebase nem faça merge do branch `arena/14fe7e70-gruposegsystemseguranca` em `main`: ele contém uma implementação paralela de `/admin/clientes` que conflita em 6 arquivos com a PR #218 e substituiria código entregue.
