# Estado da execução — entrega local integral

Documento de retomada entre sessões. Atualizado a cada lote concluído.
Referência: `docs/EXECUCAO-ENTREGA-LOCAL.md` (roteiro L00–L10) e
`docs/PLANO-MESTRE-IMPLEMENTACAO.md` (222 requisitos).

## Situação atual

| Campo | Valor |
|---|---|
| Branch de trabalho | `arena/01a0eba8-gruposegsystemseguranca` |
| Base escolhida (L00–L02) | `c4cfc58` (merge do PR #7 em `main`) |
| Referência entregue | PR #10 incorporado a `main` em `17165b5`; branch da sessão preservada em `31ade86` |
| Lote ativo | **L04** somente como próximo lote; L03 encerrado e não houve implementação de L04 |
| Último gate aprovado | **L03** (funcionário e RH, HTTP + navegador real + PostgreSQL descartável) |
| Migrações | 001–102 (504 tabelas) |
| Data | 2026-09-29 |

## Lotes

| Lote | Escopo | Estado | Gate |
|---|---|---|---|
| L00 | Base íntegra e controle confiável | **concluído** | aprovado |
| L01 | Identidade, autorização e integridade básica | **parcial ampliado** | SEC-02/04/05/06 + controles dependentes do L03: RBAC sem bypass, escopo, remuneração/saúde e revogação |
| L02 | Armazenamento, notificações locais, continuidade | **concluído** | 14/14 HTTP em PostgreSQL descartável |
| L03 | Funcionário e RH | **concluído** | EMP-01..19 e HR-01..24 navegáveis; gate integral aprovado |
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

### O que do L01 continua pendente após o L03

O L03 ampliou o catálogo de staff, retirou o bypass de admin/TI, implementou
escopos `own`/unidade/conta/contrato e separou remuneração e saúde. Esses pontos
não devem ser reabertos sem uma regressão concreta. O restante de L01 que ainda
permanece `a_revalidar`/`pendente` inclui:

- auditoria sensível durável com transação/outbox em todas as operações;
- revisão sistemática de limites de corpo, método, origem/CSRF e erros
  sanitizados nos fluxos que ainda não passaram por um lote;
- aplicação e prova das mesmas regras de identidade nos fluxos de
  convite/provisionamento de staff, não apenas no login;
- os demais IDs SEC cujo checklist ainda não contém evidência executada,
  especialmente troca de e-mail, privacidade, abuso e identidade.

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

1. **Iniciar L04, sem reabrir L03:** site/captação e comercial, seguindo o gate
   definido em `docs/EXECUCAO-ENTREGA-LOCAL.md`.
2. **Preservar o gate L03 em toda regressão:** duas identidades de funcionário,
   navegador móvel/desktop, PostgreSQL descartável e negação cruzada.
3. **Reservar o aceite no Windows para L10:** Linux validou a entrega local; o
   equipamento-alvo ainda deverá provar instalação, persistência e reinício.

## Retomada executável

```bash
npm ci
npm run test:unit                    # 180 testes, sem banco

# Gates em PostgreSQL real e descartável (nenhum toca banco do operador).
# Exigem DATABASE_URL e DATABASE_MIGRATION_URL vazias.
npm run test:migrations:pg           # migrações 001–102 + replay + checksum negativo
npm run test:l02-delivery:pg         # L02 — 14 testes HTTP
npm run test:l03-delivery:pg         # L03 — HTTP, duas identidades e Chromium headless
npm run test:staff-auth:pg           # L01 — autenticação de staff

npm run typecheck && npm run build
```

O gate L03 usa `embedded-postgres`, Playwright e o Chromium empacotado em
`@sparticuz/chromium`; não baixa navegador durante a execução. Nenhum comando
acima precisa de segredo.

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

## L03 — funcionário e RH (concluído localmente)

`/funcionario` é um portal móvel próprio, com identidade de empregado separada
da sessão de staff. `/admin/funcionarios` contém a jornada operacional principal
e conecta, no grupo “Processos HR-01..24”, os sete módulos históricos de RH.
Assim, EMP-01..19 e HR-01..24 deixaram de ser componentes órfãos.

O gate `npm run test:l03-delivery:pg` aplica as migrações 001–102 num PostgreSQL
descartável, inicia o servidor real, usa duas identidades de empregados e abre
as duas interfaces em Chromium headless. Ele prova:

- titular derivado exclusivamente da sessão e negação cruzada de perfil,
  documentos, escala, ponto, curso, uniforme/EPI e holerite;
- admissão, credencial temporária, troca obrigatória de senha e revogação por
  senha, papel, suspensão ou desligamento;
- upload privado com bytes/hash, revisão, publicação salarial por fonte
  autorizada e concessão salarial separada;
- escala versionada, correção, ausência, troca, passagem, ocorrência, curso,
  fechamento demonstrativo e acesso ao holerite próprio;
- recibo operacional de uniforme sem alegação de assinatura qualificada;
- fila offline no navegador limitada à ciência de procedimento, chave por
  empregado, idempotência/conflito no servidor e nenhuma cache de documentos
  médicos ou salariais;
- navegação móvel em 390×844 e RH em 1440×1000, sem rolagem horizontal nem
  respostas de API com erro durante o percurso.

Controles de L01 concluídos como dependência do lote: RBAC granular sem bypass
de admin/TI, aliases legados cobertos pela mesma borda, escopos
organização/unidade/contrato/próprio, remuneração e saúde separadas, e invalidação
material de sessões após alterações de papel, permissão, senha ou status.

## O que NÃO está pronto

O sistema ainda não está integralmente entregue: L04–L10 e as cinco jornadas
finais do L10 não foram executados. SMTP e hospedagem externa permanecem fora do
escopo; Windows ainda exige aceite no equipamento do proprietário. Apenas os
43 IDs do L03 foram promovidos no checklist com a evidência local atual; os
demais continuam com seus estados anteriores.
