# Estado da execução — entrega local integral

Documento de retomada entre sessões. Atualizado a cada lote concluído.
Referência: `docs/EXECUCAO-ENTREGA-LOCAL.md` (roteiro L00–L10) e
`docs/PLANO-MESTRE-IMPLEMENTACAO.md` (222 requisitos).

## Continuação mais recente — histórico de interações CRM-07 (Arena, 2026-09-29)

PR #13 (tarefas pessoais) já está mesclado em `main`/`ec450b6` e presente nesta branch Arena — nenhum trabalho daquele PR foi refeito. Nesta continuação, o recorte seguinte de CRM-07 recomendado pelo prompt de continuidade foi implementado: histórico de interações (ligação/reunião/nota) por oportunidade, com a mesma regra de propriedade das tarefas pessoais, autoria/empresa derivadas no servidor, auditoria atômica (`crm_interaction_create`) e migração 105. Também foi corrigido um vazamento pré-existente na rota legada de detalhe da oportunidade, que devolvia `crm_interactions` de qualquer oportunidade sem checar propriedade. Código validado `7c56a6f`. **PR #14 aberto, CI verde (L04 CRM delivery + QA baseline) e mesclado em `main` no commit `927cb8d`; a branch Arena foi sincronizada (fast-forward) para esse mesmo commit — não há divergência pendente entre `main` e a branch Arena.** L04 e CRM-07 permanecem parciais — ver evidência detalhada e o novo `docs/PROMPT-CONTINUACAO-CRM-INTERACOES.md`.

### Continuação anterior — tarefas CRM-07

PR #13: tarefas pessoais conectadas em /admin/crm, com auditoria atômica e proteção por responsável também na rota legada. Código validado `7bab313`: CI baseline e gate L04 (2/2, HTTP/Chromium/PostgreSQL) aprovados; migrações 104/104 e replay aprovados. Os resultados dos lotes anteriores abaixo são históricos, não novas execuções desta continuação.

## Situação atual

| Campo | Valor |
|---|---|
| Branch de trabalho | `arena/01a0ee3c-gruposegsystemseguranca` (já contém o PR #13 mesclado em `ec450b6`) |
| Base desta sessão | `ec450b6` (main, PR #13 mesclado) |
| Lote ativo | **L04** — jornada comercial central e tarefas pessoais entregues e provadas; histórico de interações entregue nesta continuação; CMS/tema/SEO/comparador (PUB-06..09) e CRM-08/09/10 ficam para as próximas sessões |
| Último gate aprovado | **L04 ampliado**: 3/3 (jornada central + tarefas pessoais + histórico de interações), executado localmente no sandbox Arena em `7c56a6f`. L02/L03 integrais não reexecutados nesta continuação (sem evidência de regressão que o exigisse). |
| Migrações | 001–105 (504 tabelas; 104 amplia auditoria de tarefas, 105 amplia auditoria de interações) |
| Data | 2026-09-29 |

## Lotes

| Lote | Escopo | Estado | Gate |
|---|---|---|---|
| L00 | Base íntegra e controle confiável | **concluído** | aprovado |
| L01 | Identidade, autorização e integridade básica | **parcial ampliado** | SEC-02/04/05/06 + controles dependentes do L03: RBAC sem bypass, escopo, remuneração/saúde e revogação |
| L02 | Armazenamento, notificações locais, continuidade | **concluído** | 14/14 HTTP em PostgreSQL descartável (revalidado nesta sessão) |
| L03 | Funcionário e RH | **concluído** | EMP-01..19 e HR-01..24 navegáveis; gate integral aprovado (revalidado nesta sessão) |
| L04 | Site/captação e comercial | **parcial — jornada central concluída, CRM-07 em execução** | CRM-11..27 conectados em `/admin/comercial` e provados ponta a ponta; CRM-01..06 herdados de `/admin/crm` (não revalidados a fundo); PUB-01/03/04 provados; CRM-07 tem tarefas pessoais e histórico de interações provados, faltam anexos/edição/equipe; PUB-06..09/CRM-08..10/PUB-10 ainda órfãos |
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

1. Ampliar o histórico de interações (anexos/notas com upload, edição/exclusão, vínculo com contato, tipos email/whatsapp/visita/outro) ou avançar para CRM-08 (agenda de visitas/reuniões) — ver `docs/PROMPT-CONTINUACAO-CRM-INTERACOES.md` para o detalhamento e a ordem recomendada.
2. Depois CRM-09 (cadências manuais) e CRM-10 (carteira), sempre com evidência HTTP + Chromium + PostgreSQL por recorte.
3. Fechar as lacunas PUB (02/05/06/07/08/09/10) e revalidar CRM-01..06 antes de declarar L04 concluído. Windows fica em L10.

## Retomada executável

```bash
npm ci
npm run test:unit                    # 186 testes, sem banco

# Gates em PostgreSQL real e descartável (nenhum toca banco do operador).
# Exigem DATABASE_URL e DATABASE_MIGRATION_URL vazias.
npm run test:migrations:pg           # migrações 001–103 + replay + checksum negativo
npm run test:l02-delivery:pg         # L02 — 14 testes HTTP
npm run test:l03-delivery:pg         # L03 — HTTP, duas identidades e Chromium headless
npm run test:l04-delivery:pg         # L04 — HTTP, Chromium real, jornada comercial completa
npm run test:staff-auth:pg           # L01 — autenticação de staff

npm run typecheck && npm run build
```

Os gates L03 e L04 usam `embedded-postgres`, Playwright e o Chromium
empacotado em `@sparticuz/chromium`; não baixam navegador durante a execução.
Nenhum comando acima precisa de segredo. **Atenção:** `node_modules/` não é
persistido entre sessões neste ambiente — rode `npm ci` no início de toda
sessão nova antes de qualquer gate.

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

## L04 — site, captação e comercial (jornada central concluída)

Gate `npm run test:l04-delivery:pg` (`scripts/qa-l04-delivery-postgres.mjs` →
`tests/l04-delivery.integration.test.mjs`) sobe PostgreSQL 17 descartável,
aplica 001–103, inicia `server.mjs` real e percorre em Chromium real e HTTP
direto: visitante anônimo em `/servicos`→`/contato` (captura de lead com
protocolo/consentimento/origem/campanha real, dedup/antispam por controle
negativo) → duas identidades de staff `comercial` distintas com RBAC
genuinamente diferente (só uma tem `proposals.approve_discount`) → conversão
de lead em oportunidade (idempotente) → vistoria → orçamento de mão de obra e
técnico → cenário de preço (incl. controle negativo de denominador inválido)
→ pedido de desconto com negação por autoaprovação, negação por falta de
permissão e aprovação real cruzada → edição de item pós-aprovação reabrindo a
aprovação (CRM-18) → proposta versionada com trava de item pós-envio (409) e
PDF real (bytes/cabeçalho conferidos) → entrega honesta (só caixa local,
nunca finge "entregue") → aceite seguro por link (`/proposta/aceite/[token]`,
tela pública nova) com token forjado 404, versão divergente 409, link
expirado 410, aceite real e reuso 410 → contrato mínimo idempotente (CRM-23)
→ varredura final autenticada de `/admin/leads` e `/admin/comercial` sem
rolagem horizontal, sem erro de console/5xx. Passou duas vezes consecutivas;
revalidado novamente ao final desta sessão junto com `npm test` (186/186),
`test:l02-delivery:pg` (14/14), `test:l03-delivery:pg` (1/1),
`test:migrations:pg` (103/103, 504 tabelas), `test:rag`, `tsc --noEmit` e
`next build` (72 rotas, incluindo `/admin/comercial` e
`/proposta/aceite/[token]`) — todos verdes, sem regressão.

### Achado principal do L04: trilha de auditoria quebrada desde a origem

`auth_access_audit.action` e `auth_access_audit.actor_kind` tinham um `CHECK`
desatualizado desde muito antes desta sessão: cerca de **175 valores de
`action`** já usados em `src/server/*.mjs` nos domínios `crm_*`, `cli_*`,
`ops_*`, `hr_*` e `emp_*` eram silenciosamente rejeitados pelo banco. Como os
inserts de auditoria estavam em `try/catch` mudo, nada quebrava na hora — mas
nenhuma dessas ações jamais gravou uma linha de auditoria. Corrigido de forma
aditiva na migração `103-l04-comercial-role-widening.sql` (mesma migração
também amplia `crm_companies.created_by` e `public_lead_status_audit.changed_by`
para aceitar os papéis `comercial`/`financeiro`, que já eram válidos em
`auth_staff_profiles` desde a migração 102, mas não nessas duas tabelas).

### Outros defeitos reais encontrados e corrigidos no L04

1. `src/server/discount-api.mjs`: a verificação de alçada (CRM-18) era um
   bloco que nunca bloqueava nada (comentário "para simplicidade, apenas
   auditar") — qualquer papel, incluindo o próprio solicitante, podia aprovar
   qualquer desconto. Corrigido: bloqueio de autoaprovação verificado primeiro,
   depois `hasPermission()` real contra `auth_permissions`, sem bypass por
   papel/admin.
2. `src/server/proposal-acceptance-api.mjs`: `require('node:crypto')` dentro de
   um módulo ESM — `ReferenceError` mudo (dentro de `try/catch`) que degradava
   o hash de IP do aceite. Corrigido para usar o `createHash` já importado.
3. `src/lib/public-lead-validation.mjs` descartava silenciosamente
   `origin`/`campaign`/`channel`/`email` enviados pelo formulário real de
   `/contato` — o PUB-03 (rastreio de origem/campanha) nunca teria funcionado
   mesmo com a tela certa. Corrigido com validação explícita desses campos.
4. `handleCreateLead` confiava em um `dedupKey` vindo do navegador — forjável
   por um cliente malicioso para colidir ou "roubar" o protocolo de outra
   pessoa. Corrigido: a chave passou a ser derivada só no servidor.
5. `AiBotWidget.tsx` disparava, em toda página pública, uma requisição não
   autenticada a um endpoint só-admin (`/api/ai-bot-config`), gerando 401 em
   série no console. Corrigido: só busca quando `showDevConfig` está ativo.
6. `/admin/leads/page.tsx` tinha um formulário de login do modelo antigo
   (token compartilhado), incompatível com a sessão real de e-mail/senha — a
   tela principal de caixa de entrada de leads estava, na prática,
   inacessível para um funcionário real. Substituída por login real.

### O que o L04 entrega e o que fica para a próxima sessão

**Entregue e provado:** captação pública real (PUB-01/03/04); conversão de
lead; todo o núcleo comercial CRM-11..27 (catálogo/equipamento, vistoria,
orçamento MO/técnico, parâmetros de custo, cenário de preço, alçada de
desconto real, proposta versionada com PDF real, entrega honesta, aceite
seguro com UI nova, contrato mínimo idempotente, relatórios/comissões/
biblioteca/parcerias conectados) — tudo em `/admin/comercial`
(`ComercialWorkspace.tsx`, novo).

**Não entregue nesta sessão (órfão ou não revalidado), documentado
honestamente no checklist item a item:**

- PUB-02/05 (páginas por segmento e FAQ assistida com handoff humano);
- PUB-06 (CMS), PUB-07 (temas), PUB-08 (SEO técnico) — componentes existem em
  `src/app/admin/ti/*Client.tsx`, nenhum conectado a uma página;
- PUB-09 (montador de pacote/comparador) — `/orcamento` deixou de simular
  preço, mas o montador/comparador administrativo (`PackageClient.tsx`)
  continua desconectado;
- PUB-10 (painel de métricas de origem/conversão/A-B) —
  `OriginMetricsClient.tsx` desconectado; os dados brutos (origem/campanha)
  já são persistidos e aparecem em `/admin/leads`, mas sem análise;
- CRM-01..06: herdados de `/admin/crm` (página anterior a esta sessão), não
  revalidados a fundo — usados apenas indiretamente pelo gate L04 (a
  conversão de lead cria empresa/oportunidade real);
- CRM-07..10 (kanban, filtros, tarefas, histórico de interações, agenda de
  visitas, cadências, carteira): a própria página `/admin/crm` se
  autodocumenta como "estrutura pronta" — schema existe (tabelas `tasks`,
  `interactions`, `visits` da migração 014), tela não existe.

**Risco residual anotado, não corrigido:** `handleAdminLeadStatus` em
`server.mjs` faz um insert de auditoria "solto" dentro de uma transação
multi-instrução sem `SAVEPOINT` — se esse insert falhar (por exemplo por um
futuro `CHECK` que volte a ficar desatualizado), toda a transação de mudança
de status pode ser revertida silenciosamente por causa só do log. O
comportamento correto hoje foi confirmado (a migração 103 fechou o `CHECK`
que causaria isso agora), mas o padrão em si não foi estruturalmente
hardenizado (faltaria isolar a auditoria em sua própria sub-transação ou
`SAVEPOINT`).

## O que NÃO está pronto

O sistema ainda não está integralmente entregue: PUB-02/05/06/07/08/09/10 e
CRM-01..10 do L04 (ver acima), L05–L10 e as cinco jornadas finais do L10 não
foram executados. SMTP e hospedagem externa permanecem fora do escopo; Windows
ainda exige aceite no equipamento do proprietário. Os 43 IDs do L03 e os 37
IDs de PUB/CRM do L04 foram atualizados no checklist com a evidência local
desta e da sessão anterior; os demais continuam com seus estados anteriores.

CRM-07 recebeu, nesta continuação, o histórico de interações (ligação/reunião/
nota) além das tarefas pessoais do PR #13 — ambos providos e provados, mas
CRM-07 continua parcial: faltam anexos, edição/exclusão de registros,
delegação/equipe, paginação e os demais tipos de interação já previstos no
schema. CRM-08/09/10 continuam apenas como schema, sem tela.
