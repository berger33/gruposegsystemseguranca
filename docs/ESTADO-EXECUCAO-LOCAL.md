# Estado da execução — entrega local integral

Documento de retomada entre sessões. Atualizado a cada lote concluído.
Referência: `docs/EXECUCAO-ENTREGA-LOCAL.md` (roteiro L00–L10) e
`docs/PLANO-MESTRE-IMPLEMENTACAO.md` (222 requisitos).

## Situação atual

| Campo | Valor |
|---|---|
| Branch de trabalho | `arena/01a0eb6f-gruposegsystemseguranca` |
| Base escolhida (L00) | `931e028` (merge do PR #6 em `main`) |
| Último commit | `6b117f0` — L01/SEC-04,05,06 |
| Lote ativo | **L02** (armazenamento, notificações locais, continuidade) — não iniciado |
| Último gate aprovado | **L01** (identidade, autorização e integridade básica) |
| Migrações | 001–099 (499 tabelas) |
| Data | 2026-09-29 |

## Lotes

| Lote | Escopo | Estado | Gate |
|---|---|---|---|
| L00 | Base íntegra e controle confiável | **concluído** | aprovado |
| L01 | Identidade, autorização e integridade básica | **parcial** | aprovado para SEC-02/04/05/06; resta o restante do escopo (abaixo) |
| L02 | Armazenamento, notificações locais, continuidade | pendente | — |
| L03 | Funcionário e RH | pendente | — |
| L04 | Site/captação e comercial | pendente | — |
| L05 | Contratos e implantação | pendente | — |
| L06 | Operação, patrimônio e manutenção | pendente | — |
| L07 | Financeiro e Marcelo | pendente | — |
| L08 | Cliente e expansões | pendente | — |
| L09 | IA local e RAG | pendente | — |
| L10 | Integração final e pacote local | pendente | — |

## L00 — resultado (concluído)

Base revalidada em `931e028`. O estado real diverge bastante da fotografia da
auditoria de 28/09 citada no plano mestre: quase todos os achados de
infraestrutura já estavam corrigidos.

Verificado com execução, não com leitura:

| Verificação | Resultado |
|---|---|
| `npm ci` pelo lockfile | 62 pacotes, 0 vulnerabilidades, reproduzível |
| `tsc --noEmit` | 0 erros |
| `npx next build` | sucesso |
| Suíte unitária | 157/157 (antes do L01) |
| Migrações em banco vazio | 001–098 aplicadas, 498 tabelas |
| Repetição do runner | idempotente, checksum por arquivo, lock consultivo |
| Falha intermediária | `migration_checksum_mismatch` recusa e não faz rebaseline |
| IDs do checklist | 222 únicos confirmados |

Achados do plano mestre **já resolvidos** na base atual (não reabrir):
`scripts/migrate-site-visual.mjs` já listava 001–098 (não 001–004);
`client-security-api.mjs` não usa mais `req.json`/`res.status`;
`client-access-api.mjs` já tinha desafio MFA real para cliente;
`006-admin-identities.sql` já usa `DROP CONSTRAINT IF EXISTS` antes de recriar.

### Achado principal e ainda aberto do L00

**82 de 82 componentes administrativos estão órfãos.** Nenhum arquivo em
`src/app/admin/ti/*Client.tsx` é importado por qualquer página. A página
`src/app/admin/ti/page.tsx` é um protótipo descritivo de 28 linhas que declara
isso abertamente ("os componentes administrativos ainda não estão conectados a
esta página").

Ou seja: existem ~1.400 rotas de API, 499 tabelas e 82 telas ricas — e **nenhum
caminho de navegação até elas**. Esse é o maior obstáculo ao critério nº 1 de
"pronto local" ("ação acessível por navegação normal para o usuário correto"),
e é pré-requisito prático dos lotes L03–L08.

O roteiro pede reaproveitar esses componentes **por domínio**, sem despejá-los
na página de TI. Ver "Próximos passos".

## L01 — resultado (gate aprovado no escopo atacado)

Corrigido em `6b117f0`. Cada item foi reproduzido como falha antes da correção.

| ID | Correção | Prova |
|---|---|---|
| SEC-04 | Removido `rec.role \|\| "admin"`: identidade sem perfil não vira admin | integração 1 |
| SEC-04 | Só `status='active'` autentica (`pending_email` emitia sessão) | integração 2, 3 |
| SEC-04 | Sessão com estado no servidor: suspensão/rebaixamento/epoch derrubam na hora | integração 6, 7, 8, 9 |
| SEC-04 | Auditoria identifica a pessoa (identityId), não o papel | integração 5 |
| SEC-05 | Token compartilhado recusado por padrão e auto-desligado | integração 11 |
| SEC-06 | Desafio MFA anterior à sessão privilegiada de staff | integração 15, 18 |
| SEC-06 | Uso único, expiração, limite de 5 tentativas, replay TOTP e recuperação | integração 18, 19, 20 |
| SEC-02 | Cookie forjado/legado negado; erro de banco nega (fail-closed) | integração 12, 13 |
| SEC-02 | 15 endpoints administrativos negam sem sessão | integração 14 |
| — | Logout revoga no servidor | integração 10 |
| — | Rate limiting com `Retry-After` | integração 21 |

Detalhe e comandos em `docs/EVIDENCIAS-ENTREGA-LOCAL.md`.

### Risco introduzido e contido

`readAdminSession`/`requireSession` passaram a ser assíncronas em 42 módulos
(291 pontos de chamada). Uma chamada sem `await` devolve uma `Promise`, que é
sempre truthy: `if (!session) return 401` deixaria de barrar qualquer
requisição — desligando a autenticação de módulos inteiros em silêncio.

Contenção: `tests/staff-session-await-guard.test.mjs` quebra o build se o padrão
voltar. A guarda foi validada injetando uma violação real (ela acusou) e
revertendo.

### O que do L01 continua pendente

O gate aprovado cobre SEC-02/04/05/06 e a base de sessão. Ainda **não** foram
atacados, e permanecem `a_revalidar`/`pendente`:

- Unificação de papéis funcionário/supervisor/comercial/financeiro (hoje o
  catálogo de staff é `admin|ti|rh|marcelo`); preferir permissões a condicionais
  de nome espalhadas.
- RBAC: propriedade real em `own`, escopo de unidade/conta/contrato, retirada de
  bypass provisório. Existe `010-rbac-permissions.sql` e `admin-rbac-api.mjs`,
  mas o uso efetivo por rota não foi revalidado.
- Máscara de remuneração em registro, histórico, alteração, exportação e perfil;
  separar saúde de cadastro geral.
- Auditoria sensível durável com transação/outbox por operação.
- Revisão dos limites de corpo, método, origem/CSRF e erros sanitizados em
  **todos** os fluxos (o L01 verificou os de autenticação).
- `evaluateStaffLogin` ainda não é aplicado aos fluxos de convite/provisionamento
  de staff (só ao login).

## Bloqueios reais

1. **Sem GPU e com 16 GB (informado pelo proprietário; o plano citava 8 GB).**
   Afeta o dimensionamento do L09. Ainda não medido — Ollama não foi executado
   nesta sessão.
2. **SMTP e hospedagem externa fora de escopo** (decisão do proprietário).
   Implica caixa de saída local no L02; nenhum estado pode dizer "e-mail
   entregue".
3. **Ambiente de desenvolvimento é Linux; o alvo é Windows.** Os scripts
   PowerShell do L10 poderão ser escritos, mas não executados aqui. Isso precisa
   constar do aceite como verificação pendente no equipamento do proprietário.

## Próximos três passos

1. **L02 — provider local de arquivos privados.** Bytes reais, chave gerada pelo
   servidor, escopo por conta/contrato, hash, versão, proteção contra traversal,
   download autenticado. Gate: upload/download, negação de outro usuário,
   persistência após reinício.
2. **L02 — caixa de saída local + fila durável de notificações** com
   deduplicação, retries, backoff e histórico. Nenhum estado "entregue".
3. **L00/L03 — navegação por domínio.** Conectar os 82 componentes órfãos a
   rotas reais com autorização por papel, começando pelos domínios do L03
   (funcionário/RH), em vez de reconstruir telas.

## Retomada executável

```bash
npm ci
npm run test:unit                    # 177 testes, sem banco

# Gates em PostgreSQL real e descartável (nenhum toca banco do operador).
# Exigem DATABASE_URL e DATABASE_MIGRATION_URL vazias.
npm run test:staff-auth:pg           # L01 — 21 testes HTTP
npm run test:migrations:pg           # migrações 001–101
npm run test:l02-delivery:pg         # L02 — 14 testes HTTP (arquivos, fila, caixa local)
npm run test:tenant:pg               # escopo do espaço do cliente
npm run test:client-access:pg        # acesso/convite/MFA de cliente
npm run test:cli-v2:pg               # documentos v2 e auditoria
npm run test:demo-local:pg           # demo persistente + backup frio + restauração isolada
npm run test:backup-restore:pg       # dump lógico (exige pg_dump/pg_restore 17)

npx tsc --noEmit && npx next build
```

Nenhum comando acima precisa de segredo. Os clusters PostgreSQL são temporários
(`embedded-postgres`), criados e removidos pelo próprio script.

## L02 — entrega local de arquivos, fila e comunicação (commit `4b95616`)

Concluído e provado por HTTP real contra PostgreSQL descartável
(`npm run test:l02-delivery:pg`, 14 testes):

| Frente | O que mudou | Prova |
| --- | --- | --- |
| Arquivos privados | Chave de 24 bytes gerada pelo servidor, `content_sha256` gravado e **conferido em todo download** | testes 1–5; adulteração em disco devolve 409 |
| Travessia de caminho | Nome enviado pelo cliente nunca vira caminho | teste 2: `../../../../etc/passwd` não escapa do diretório |
| Fila de notificações | Reivindicação atômica (`UPDATE ... RETURNING`) no lugar de `SELECT ... FOR UPDATE SKIP LOCKED` fora de transação | teste 8 + controle negativo: com o código antigo, "entregue 2 vezes" |
| Regex de UUID | `isValidUuid` tinha 4 grupos e recusava todo UUID canônico | teste 6 + controle negativo |
| Caixa de saída local | Estado `local_outbox`, `sent_at` nulo, corpo oculto na listagem, leitura auditada, vencida 410 | testes 9–14 |

Dois defeitos foram **provados por controle negativo**: o código antigo foi
restaurado, a suíte foi executada e exatamente o teste correspondente falhou.
Sem isso, um teste verde não distingue "corrigido" de "nunca quebrado".

### Correções colaterais encontradas durante o L02

- `client_documents.uploaded_by` tinha `CHECK IN ('marcelo','ti')` e passou a
  rejeitar os papéis `admin`/`rh` criados no L01 — regressão latente que
  derrubaria qualquer upload desses perfis. Corrigida na migração 101.
- Três contagens de migração fixas em literal (`98`) em `local-demo.mjs`,
  `qa-local-demo-persistent.mjs` e `demo-offline-snapshot.mjs` estavam
  defasadas desde a 099 e reprovavam instalação íntegra. Agora derivam do disco.

### Limitação declarada do L02

A trilha de **dump lógico** (`npm run test:backup-restore:pg`) não foi
exercitada: exige `pg_dump`/`pg_restore` 17, ausentes neste sandbox Linux
(`embedded-postgres` traz apenas `initdb`, `pg_ctl` e `postgres`) e sem pacote
disponível. A suíte recusa de forma explícita e não cria banco — não é um falso
verde. A trilha de **cópia fria com manifesto e sha256 por arquivo**, essa sim,
foi exercitada e passa, incluindo restauração em cluster isolado verificada por
HTTP (`npm run test:demo-local:pg`, QA-HOM-009).

## O que NÃO está pronto

O sistema **não** está funcionando integralmente. O que existe hoje é uma base
de dados e de API extensa, com a camada de autenticação administrativa agora
endurecida e provada, mas sem navegação que ligue o usuário às funções. Nenhuma
das cinco jornadas finais (A–E do L10) foi executada. Os 222 IDs seguem em
`a_revalidar`, exceto os do L01 registrados acima.
