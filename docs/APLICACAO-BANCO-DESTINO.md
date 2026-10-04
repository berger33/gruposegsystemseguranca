# Aplicação em banco de destino — procedimento do operador (pós PR #119)

Procedimento para aplicar as migrações **001–156** no banco PostgreSQL de destino e ativar a execução agendada da avaliação temporal do EXT-07, incluindo o acompanhamento inicial do ledger `ext_compliance_evaluation_runs`.

| Item | Valor |
|---|---|
| Base de referência | `main` com o merge da PR #119 (`70ee202cb5a2a5aa9849584005a7e9c90261f7e0`) ou posterior |
| Migrações | 001–156; **nenhuma nova** neste procedimento; próxima livre: 157 |
| Decisões do proprietário (2026-10-04) | Intervalo **3600 s** (1 h) e identidade declarada = conta staff **TI** ativa |
| Estado | Fluxo completo **ensaiado ponta a ponta** em cluster PostgreSQL 17.9 descartável (32 verificações verdes; relatório em `ENTREGA-RELATORIO-2026-10-04-APLICACAO-BANCO-DESTINO.md`). A execução no banco real é ação do operador, nesta máquina, com estes passos |
| Pendências que permanecem | Aceite humano e validação formal em Windows |

## Pré-requisitos

- **Node.js 22 LTS** e npm (`node --version`).
- **Docker** (no Windows: Docker Desktop com WSL2) para o PostgreSQL 17 do `infra/postgres/compose.yaml`.
- Código na versão correta: `git fetch origin && git switch main && git pull`, conferindo `git log --oneline -1` ≥ `70ee202`.
- Dependências instaladas: `npm ci`.

## Etapa 1 — Banco de destino no ar

1. Copie o exemplo de ambiente:
   ```bash
   cp .env.example .env.local          # bash (Linux/macOS/Git Bash)
   Copy-Item .env.example .env.local   # PowerShell (Windows)
   ```
2. Gere uma senha hexadecimal forte e cole **nos dois lugares** (`POSTGRES_PASSWORD` e dentro de `DATABASE_URL`; hex não precisa de URL-encoding):
   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
3. Gere os segredos de sessão/MFA e preencha (fora do repositório, nunca pelo chat):
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # SITE_ADMIN_SESSION_SECRET
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # CLIENT_MFA_ENCRYPTION_KEY
   ```
4. Suba o banco (a porta fica vinculada apenas a `127.0.0.1`):
   ```bash
   npm run db:up
   ```
   Aguarde o healthcheck ficar `healthy` (`docker compose --env-file .env.local -f infra/postgres/compose.yaml ps`).

## Etapa 2 — Aplicar as migrações 001–156

```bash
npm run db:migrate
```

Esperado (primeira aplicação em banco vazio):

- 156 linhas `Applied: 001-...` até `Applied: 156-ext07-scheduled-evaluation.sql`;
- linha final `Migration ledger verified: 001–156 (PostgreSQL only)`.

Propriedades do migrador que importam aqui:

- **Idempotente com integridade**: cada arquivo é aplicado em transação própria com lock advisory e registrado em `__migrations` com checksum sha256. Re-executar imprime 156× `Already applied: ...` e não reaplica nada; checksum divergente aborta.
- **Recusa banco remoto**: o migrador conecta somente em `localhost`/`127.0.0.1`/`[::1]` a menos que `ALLOW_REMOTE_MIGRATIONS=true` seja definido separadamente. **Mantenha isso como está** — aplicação remota é decisão explícita, não conveniência.

## Etapa 3 — Verificações pós-aplicação

Com o psql do contêiner (ajuste o usuário/banco conforme o `.env.local`):

```bash
docker compose --env-file .env.local -f infra/postgres/compose.yaml exec postgres \
  psql -U seg_app -d grupo_seg_system -c "<SQL>"
```

| Verificação | SQL | Esperado |
|---|---|---|
| Ledger de migrações | `SELECT count(*), count(checksum) FROM __migrations;` | `156 | 156` |
| Tabela do agendador (mig. 156) | `SELECT to_regclass('public.ext_compliance_evaluation_runs');` | `ext_compliance_evaluation_runs` |
| Ausência de seed EXT-07 | `SELECT (SELECT count(*) FROM ext_compliance_obligations) AS obrigacoes, (SELECT count(*) FROM ext_compliance_documents) AS documentos, (SELECT count(*) FROM ext_compliance_tasks) AS tarefas;` | `0 | 0 | 0` — **sem seed é o esperado**: as obrigações passam a existir quando a equipe cadastrar via `/admin/compliance` |

## Etapa 4 — Identidade declarada do agendador

O agendador age em nome de uma **identidade staff real** (decisão do proprietário: conta **TI**). Obtenha o UUID no banco de destino:

```sql
SELECT i.id, i.email, i.display_name, p.role, i.status
  FROM auth_identities i
  JOIN auth_staff_profiles p ON p.identity_id = i.id
 WHERE p.role IN ('admin','ti') AND i.status = 'active'
 ORDER BY p.role, i.email;
```

Escolha a linha `ti` desejada e copie o `id` (UUID). Semântica importante:

- A identidade é **revalidada a cada tick**: suspensa/desativada, a execução falha fechado (run `falha` com a causa, **zero mutação** de compliance) e retoma sozinha quando reativada.
- Toda tarefa e todo evento gerado pela automação fica registrado com `created_by_identity` = esta identidade — o histórico é auditável.
- Se ainda não houver conta staff ativa, crie-a primeiro pelo fluxo normal de identidades (`/admin`) e só então declare-a aqui.

## Etapa 5 — Ativar o agendador (opt-in por ambiente)

No `.env.local`, adicione as duas variáveis (ambas obrigatórias; qualquer uma ausente/inválida mantém o agendador **desligado**, comportamento idêntico ao anterior à PR #119):

```bash
EXT07_EVALUATE_INTERVAL_SECONDS=3600
EXT07_EVALUATE_IDENTITY=<UUID da etapa 4>
```

Reinicie o servidor (`npm run start` — o `server.mjs` carrega o `.env.local`). O log de boot deve conter:

```
[ext07-scheduler] ativado: avaliação temporal a cada 3600s; execuções registradas em ext_compliance_evaluation_runs
```

Notas:

- Exige `DATABASE_URL` real (PostgreSQL): sem ela o agendador recusa ligar (o modo PGlite beta não possui o schema EXT-07) e loga a recusa.
- O **primeiro tick é imediato**: a primeira avaliação acontece no boot, não após 1 h.
- Sem as variáveis, nenhuma avaliação automática ocorre — a rota explícita `POST /api/ext/compliance/evaluate` continua existindo em qualquer cenário.

## Etapa 6 — Acompanhamento inicial do ledger (primeiras horas/dias)

**Pela rota de observação** (sessão staff admin/ti no navegador autenticado, ou cookie de sessão): `GET /api/ext/compliance/schedule` devolve `enabled`, `interval_seconds`, `actor` (identidade declarada resolvida para nome) e as últimas 200 execuções do ledger. Anônimo recebe 401; papel não autorizado, 403.

**Pelas queries** (mesmo acesso psql da Etapa 3):

```sql
-- Resumo por status (falhas devem ser investigadas; a causa está na coluna error)
SELECT status, count(*) FROM ext_compliance_evaluation_runs GROUP BY status;

-- Última execução
SELECT status, to_char(started_at,'YYYY-MM-DD HH24:MI:SS') AS inicio,
       interval_seconds, idempotency_key, error
  FROM ext_compliance_evaluation_runs ORDER BY started_at DESC LIMIT 1;

-- Execuções por dia (com intervalo 3600: ~24/dia; lacunas > 1 dia merecem investigação)
SELECT to_char(evaluation_date,'YYYY-MM-DD') AS dia, count(*)
  FROM ext_compliance_evaluation_runs GROUP BY 1 ORDER BY 1;

-- Evento do dia (deve ser exatamente 1 por dia/ator — dedup por chave agendada:YYYY-MM-DD)
SELECT count(*) FROM ext_compliance_events
 WHERE idempotency_key = 'agendada:' || to_char(CURRENT_DATE,'YYYY-MM-DD');
```

**O que esperar no primeiro dia com intervalo 3600:**

- ~24 runs `concluida` (uma por tick; `concluida` **inclusive sem efeito** — ausência de efeito não é ausência de execução);
- 1 evento `expiry_evaluated` por dia (chave `agendada:YYYY-MM-DD`);
- tarefas criadas somente para documentos vencidos ou dentro da janela de antecedência, sempre em nome da identidade declarada;
- runs `falha` = sinal de ação: a coluna `error` traz a causa (ex.: identidade suspensa).

## Notas Windows

- Docker Desktop + WSL2; o compose funciona igual (`npm run db:up`).
- Os comandos `node -e "..."` funcionam no PowerShell e no CMD sem alteração.
- Para copiar o arquivo de ambiente: `Copy-Item .env.example .env.local`.
- O banco e o servidor ficam vinculados a `127.0.0.1` (padrão seguro — não abra a porta 5432/3000 na LAN; para acesso externo use Funnel/proxy conforme `BIND_HOST`/`TRUST_PROXY` no `.env.example`).
- A **validação formal em Windows permanece pendência** documentada: este procedimento foi ensaiado em Linux; espera-se o mesmo comportamento, mas o aceite humano e a verificação formal na máquina Windows do operador são o fechamento dessa pendência.

## Fronteiras (o que não fazer)

- **Nunca** aponte `DATABASE_URL`/`DATABASE_MIGRATION_URL` de aplicação para banco de produção a partir de ambiente de teste; gates e ensaios usam clusters descartáveis e **recusam** URLs herdadas.
- Não defina `ALLOW_REMOTE_MIGRATIONS=true` por conveniência — migração remota é decisão separada e explícita.
- Migrações 001–156 são intocáveis; correções futuras entram como migração nova aditiva (a partir de 157).
- Segredos (senhas, chaves) ficam **fora do repositório** e **nunca pelo chat**.
- O agendador não é ator externo nem integração regulatória: é um timer local que age em nome da identidade staff declarada. A referência documental do EXT-07 permanece declarada e privada (sem upload/bytes/checksum/aceite humano inventado).
