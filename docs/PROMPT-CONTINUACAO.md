# Prompt de continuação — entrega local do SEG System

> Cole o bloco abaixo em uma sessão nova. Ele é autossuficiente: descreve a
> tarefa, o que já foi feito e provado, as armadilhas do ambiente e o próximo
> passo. Atualize-o ao fim de cada lote.

---

## Tarefa

Continuar a **entrega local integral do SEG System** no repositório
`berger33/gruposegsystemseguranca`, executando os lotes **L03 → L10**, um de
cada vez, **implementando e testando cada jornada antes de considerá-la
concluída**.

Leia antes de agir:
`docs/ESTADO-EXECUCAO-LOCAL.md` (estado atual),
`docs/EVIDENCIAS-ENTREGA-LOCAL.md` (provas executadas),
`docs/CHECKLIST-ENTREGA-LOCAL.md` (222 IDs, atualizar no próprio arquivo),
`docs/PLANO-MESTRE-IMPLEMENTACAO.md`, `docs/PROMPT-EXECUCAO-LOCAL.md`,
`docs/EXECUCAO-ENTREGA-LOCAL.md`.

**Atenção:** as constatações da §3 do `PLANO-MESTRE-IMPLEMENTACAO.md` são um
retrato de 28/09 e boa parte já está desatualizada. Verifique no código antes
de agir sobre qualquer item de lá.

## Regras permanentes do cliente

- **Não pare em planejamento.** Implemente, teste, e só então declare pronto.
- Um lote por vez, na ordem. Não avance com o anterior aberto.
- Os **222 requisitos** estão em escopo, incluindo AI-02/03/04/05/07/08.
  Exclusões: **SMTP** e **hospedagem externa**.
- Alvo: **Windows, 16 GB de RAM, sem GPU** (a documentação diz 8 GB; o número
  do cliente prevalece).
- **Nunca declare funcionalidade completa** com base em tela de demonstração,
  componente desconectado ou teste pendente.
- **Não conserte teste apagando a expectativa, pulando a suíte ou afrouxando
  autorização.** Se um teste falha, ou o código está errado, ou a expectativa
  estava errada — e nesse caso explique por quê.
- Sem e-mail real, cobrança real, implantação em produção ou dado pessoal real.
  Integração externa exige **simulador rotulado** e adaptador trocável.
- Preserve o código mais recente. Sem `reset` destrutivo, sem `force-push`.
- Pergunte só o que for realmente indispensável; registre bloqueios e siga com
  o que for independente.

## Estado — o que já está pronto e provado

Mesclado em `main` pelo PR #8, commit de merge **`db9b01d`**.
Commits: `6b117f0` (L01), `336714a` (docs L01), `4b95616` (L02), `b147579`
(docs L02). Base original: `931e028`.

### L00 — base íntegra
`npm ci` limpo · `tsc --noEmit` 0 · `next build` ok · migrações reprodutíveis,
idempotentes e recusando adulteração · **222 IDs únicos** conferidos.

### L01 — identidade e autorização (`npm run test:staff-auth:pg`, 21 aprovados)
Corrigidos e provados por HTTP: elevação silenciosa a `admin` quando faltava
perfil; sessão para identidade `pending_email`; tokens compartilhados sem ator
auditável (agora desligados por padrão e auto-desabilitados quando há staff
provisionado); ausência de MFA antes de sessão privilegiada; cookie sem estado
que sobrevivia a suspensão/despromoção (agora `auth_staff_sessions`).

### L02 — entrega local (`npm run test:l02-delivery:pg`, 14 aprovados)
Arquivos privados com chave gerada pelo servidor e `content_sha256` conferido
em todo download (adulteração ⇒ 409). Fila durável com deduplicação, backoff e
**reivindicação atômica**. **Caixa de saída local no lugar de SMTP**: estado
`local_outbox`, nunca `sent`; `sent_at` nulo; listagem sem corpo; leitura
contada e auditada; vencida ⇒ 410.

Dois defeitos do L02 foram **provados por controle negativo** (código antigo
restaurado ⇒ exatamente o teste correspondente falha). Mantenha essa prática.

### Varredura verde no merge
unit 177 · staff-auth 21 · l02 14 · tenant 9 · client-access 15 · cli-v2 9+1 ·
migrations `101/101` (`TABLES=500`) · demo-local com backup frio e restauração
isolada verificada por HTTP · `tsc` · `next build`.

## Estado — o que NÃO está pronto (não minimize isto)

- **O sistema não funciona integralmente.** Existe uma base ampla de banco e
  API, mas **não há navegação ligando o usuário às funções**.
  **82 de 82** componentes `src/app/admin/ti/*Client.tsx` estão **órfãos** e
  `src/app/admin/ti/page.tsx` se declara protótipo. O roteiro pede religá-los
  **por domínio**, não empilhá-los na página de TI.
- Nenhuma das jornadas A–E do L10 foi executada.
- **Itens do L01 em aberto:** `bumpEpoch`/`revokeAllForIdentity` **não** estão
  ligados a suspensão, desligamento, troca de papel ou troca de senha; RBAC por
  escopo `own`/unidade/contrato; máscara de remuneração; limitação de taxa
  **durável** (hoje só em memória, por IP); limites de corpo/método/CSRF fora
  dos fluxos de autenticação; `evaluateStaffLogin` não aplicado ao convite e
  provisionamento de staff.
- **Defeito conhecido não corrigido:** `src/server/ops-api.mjs`, função
  `ipHash()`, chama `require('node:crypto')` dentro de módulo ESM — lança se
  alcançado.
- `npm run test:backup-restore:pg` **nunca foi executada**: exige
  `pg_dump`/`pg_restore` 17, que não existem no sandbox Linux (`embedded-postgres`
  traz apenas `initdb`, `pg_ctl`, `postgres`) e não há pacote instalável. A
  suíte recusa explicitamente e não cria banco — não é falso verde. Rode no
  Windows.
- Nenhum teste em Windows; nenhuma verificação em navegador real.

## Próximo passo — L03

**EMP-01..19 e HR-01..24:** portal do funcionário em telefone, identidade
própria, autosserviço **sem exigir administrador**.

Gate: o funcionário entra com a identidade dele, vê e faz o que lhe compete, e
**não** alcança dado de terceiro. Prove por HTTP real com dois funcionários
distintos e PostgreSQL descartável.

**Decisão pendente para o começo do L03:** vale considerar fechar antes os
itens abertos do L01 (revogação ligada a suspensão/troca de papel, RBAC por
escopo, máscara de remuneração), porque o autosserviço do L03 depende
diretamente desse modelo de escopo. Consulte o cliente ou registre a escolha.

## Armadilhas do ambiente — leia antes de executar

1. **`node_modules` é apagado entre sessões.** Rode `npm ci` antes de qualquer
   suíte, senão você verá `ERR_MODULE_NOT_FOUND: embedded-postgres`.
2. **O sandbox pode voltar re-clonado no commit base, com o trabalho presente
   mas descommitado.** Já aconteceu duas vezes. Confira `git log --oneline -3`;
   se o `HEAD` não bater com o remoto, faça:
   `git fetch origin <branch> && git reset --mixed <sha-do-remoto>`.
   **Nunca** use `checkout`/`reset --hard`: isso apagaria o trabalho na árvore.
3. **Ao adicionar migração**, atualize o manifesto em
   `scripts/migrate-site-visual.mjs` — o vetor, o `files.length !== N`, o texto
   do erro e o log `001–N`. Falhar fechado com `migration_manifest_mismatch` é
   o comportamento correto.
4. **Contagem de migração fixa em literal é armadilha recorrente.** Já apareceu
   em cinco arquivos. Ao adicionar migração, faça
   `grep -rn "\b<contagem-atual>\b" scripts/ tests/` e converta para leitura do
   disco (`readdirSync` filtrando `/^\d{3}-.*\.sql$/`).
5. **As suítes de integração aplicam um subconjunto escolhido a dedo de
   migrações**, não o ledger inteiro. `client-access`, `client-security` e
   `client-space` carregam um vetor literal de nomes. Uma dependência nova
   precisa ser acrescentada em cada um, senão todos os subtestes falham com um
   enganoso `401 admin_session_required`.
6. **Teste de integração não pode supor `.next` já construído.** Suba o
   servidor com `--dev` e um `NEXT_DIST_DIR` próprio (ex.:
   `.next/integration-<nome>`). As rotas `/api` são atendidas antes do Next.
7. **Não rode `npx next build` em paralelo com suíte `*:pg`** — a limpeza do
   build morre com `ENOTEMPTY`. Execute em série ou `rm -rf .next` antes.
8. **`next build` reescreve a formatação de `tsconfig.json`** (e gera
   `next-env.d.ts`). Reverta os dois antes de commitar.
9. **Suítes que fazem muitos logins se auto-estrangulam** (limite por IP, tudo
   de 127.0.0.1). Use `ADMIN_LOGIN_MAX_ATTEMPTS` só no arnês e deixe o teste de
   limite por último. **Nunca** enfraqueça o padrão de produção.
10. **Teste de MFA exige a mesma chave de 32 bytes** no processo de teste e no
    servidor gerado; `randomUUID()` dá 16 bytes e resulta em
    `MFA_KEY_NOT_CONFIGURED`.
11. **Validação de sessão é assíncrona.** Qualquer chamada sem `await` vira
    desvio de autenticação, porque uma Promise é sempre verdadeira.
    `tests/staff-session-await-guard.test.mjs` é a trava permanente — não a
    remova nem a enfraqueça.
12. **Não "conserte" 401/403 religando `SITE_ADMIN_LEGACY_TOKENS` no ambiente
    de teste.** Isso foi considerado e rejeitado: esconderia a correção do
    SEC-05. Provisione staff de verdade e faça login por HTTP com
    `tests/helpers/staff-login.mjs`.
13. **Não marque requisito como `pronto_local` quando o aceite exige tela
    alcançável.** O SEC-04 foi deliberadamente deixado em `em_execucao` por
    isso, mesmo com os testes de autenticação passando.

## Contrato de autenticação para novas suítes

`tests/helpers/staff-login.mjs`:
`provisionStaff(pool, { role, status, email })`,
`loginStaff(api, { email, password })` (HTTP real, devolve `Cookie` pronto),
`provisionAndLoginStaff`. Senha: `Integracao-Sintetica-7!`.
Papéis de staff: `admin`, `ti`, `rh`, `marcelo`.
Ações sensíveis gravam `audit_log.actor = <UUID da identidade>`, nunca o papel.

## Comandos

```bash
npm ci                               # obrigatório: node_modules não persiste
npm run test:unit                    # 177, sem banco
npm run test:staff-auth:pg           # L01, 21, HTTP real
npm run test:l02-delivery:pg         # L02, 14, HTTP real
npm run test:migrations:pg           # 101/101, replay e adulteração
npm run test:tenant:pg
npm run test:client-access:pg
npm run test:cli-v2:pg
npm run test:cli-v2:pg:objects
npm run test:demo-local:pg           # demo + backup frio + restauração isolada
npx tsc --noEmit && npx next build   # não rodar junto com suíte *:pg
```

Os clusters PostgreSQL são temporários (`embedded-postgres`), criados e
removidos pelos próprios scripts. Nenhum comando exige segredo e nenhum toca
banco do operador — eles recusam se `DATABASE_URL` estiver definida.

## Ao terminar o lote

1. Atualize `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/EVIDENCIAS-ENTREGA-LOCAL.md`
   e os IDs em `docs/CHECKLIST-ENTREGA-LOCAL.md` **no próprio arquivo**, sem
   cópias por sessão. Estados: `a_revalidar`, `em_execucao`, `pronto_local`.
2. Registre a **limitação honesta** de cada item que não pôde ser provado.
3. Rode a varredura completa, commite e envie para o branch da sessão.
4. Reescreva este arquivo para o lote seguinte.
5. Ainda faltam criar: `docs/MANUAL-LOCAL-WINDOWS.md` e `docs/ACEITE-LOCAL.md`.
