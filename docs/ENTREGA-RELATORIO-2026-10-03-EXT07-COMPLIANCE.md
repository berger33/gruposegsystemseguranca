# Relatório de entrega — EXT-07 compliance corporativo

Data local: **2026-10-03**  
Critério: **“Vencimento gera tarefa e documento privado”**

## 1. Base confirmada antes da edição

- `gh pr view 101`: estado `MERGED` em `2026-10-03T20:20:28Z`, base `main`.
- PR: `https://github.com/berger33/gruposegsystemseguranca/pull/101`.
- merge commit: `efc74bacb7a23314db1d267d91438519dc342a8c` (pais `5c0ebe799517ec112d2ed8ea353a001e9d360912` e `3d573f18293ed9bad810fa03e4654ddf1fbd4d30`).
- feature da PR (`headRefOid`): `3d573f18293ed9bad810fa03e4654ddf1fbd4d30`.
- `HEAD` da branch de trabalho: `efc74bacb7a23314db1d267d91438519dc342a8c`; árvore limpa.
- o clone raso foi aprofundado (`git fetch --deepen=5`) antes de concluir qualquer coisa sobre ancestralidade: em profundidade 1 o `git merge-base --is-ancestor` falha por ausência do objeto, não por divergência. Após o aprofundamento, o SHA da feature é ancestral de `HEAD`.
- migrações existentes: 152; primeira livre: **153**.

A base não era ambígua. Nenhum número foi herdado da entrega anterior: todas as contagens abaixo foram medidas nesta base.

## 2. Estado anterior e lacunas reproduzidas por execução

A inspeção foi feita com execução real: PostgreSQL 17 descartável, migrações 001→152, servidor HTTP real, probe temporário e fixtures exclusivamente sintéticas `.invalid`. O probe (`scripts/tmp-ext07-probe.mjs`) foi removido ao final e o cluster destruído. Nenhum banco real foi tocado.

Resultado do probe: **26/26 verificações**, todas confirmando lacuna. Estado vazio significa **ausência de seed naquele cluster**, não ausência de dados operacionais em outro ambiente.

### Superfície ausente

- `/api/ext/compliance/obligations` e `/api/ext/compliance/documents`: 404.
- `/admin/compliance`: 404.
- dos quatro caminhos legados, apenas `/api/ext/compliance-documents` alcançava o handler; os três aliases `hr` paravam antes, em 403 `employee_permission_required`, de modo que o handler era inalcançável por eles.

### Autorização e fronteira

- papel autorizado `rh` recebia **401** onde cabia 403: o handler confundia papel proibido com ausência de sessão.
- POST anônimo cross-origin era recusado por origem **antes** da autenticação, invertendo a ordem da fronteira.

### Dados, validade e privacidade

- documento podia ser criado **sem obrigação** vinculada: não havia obrigação aplicável, fundamento, escopo, periodicidade nem criticidade.
- `responsible_name` em texto livre era aceito como responsável; não havia identidade canônica.
- `file_url`, `storage_key` e o `document_number` completo vazavam no POST e na listagem.
- documento com `expiry_date` no passado era aceito como `vigente`: não havia regra temporal de servidor.
- PATCH arbitrário era aceito, inclusive reabrindo `cancelada → vigente`.
- não havia histórico imutável, versionamento, renovação ou substituição.

### Robustez e transação

- `issue_date: "data-invalida"` **derrubava o processo Node** do servidor.
- JSON inválido e corpo array viravam `{}` silenciosamente e retornavam `400 invalid_title`, mascarando o erro real.
- corpo de 2 MB era lido integralmente; não havia 413.
- a mesma `Idempotency-Key` criava 2 linhas; 4 requisições concorrentes criavam 4 linhas.
- falha forçada em `audit_log` retornava **201 com a escrita persistida**: a auditoria era tolerante a falha.
- não existia tabela, rota ou avaliação temporal de tarefa.

`handleComplianceDocuments` em `src/server/ext-advanced-api.mjs` era o único writer HTTP da família.

## 3. Decisões estruturais

### Fonte canônica

Direção adotada: **endurecer `ext_compliance_documents`**, não criar família paralela.

1. a tabela já era o writer único da família; uma segunda tabela criaria dois writers concorrentes sobre a mesma entidade;
2. as linhas anteriores a 153 permanecem classificadas como `origin='registro_legado'`, sem reescrita de fatos históricos;
3. nenhuma linha foi copiada, migrada ou reclassificada retroativamente; não há seed;
4. a jornada canônica grava `origin='jornada_canonica'` e só ela produz documento com obrigação, versão e estado derivado.

Evidência insuficiente permanece como legado. Nada foi inventado para “completar” linhas antigas.

### Fonte da tarefa

Direção adotada: **tabela dedicada `ext_compliance_tasks`**.

As duas candidatas existentes foram verificadas no esquema e recusadas com motivo concreto:

- `crm_tasks` é a fila pessoal de oportunidade do CRM-07, com FKs para `crm_opportunities`/`crm_companies`; não impõe vínculo de compliance, privacidade nem responsável fail-closed;
- `crm_document_obligations` exige `contract_id` **ou** `company_id`; uma obrigação de escopo entidade/unidade não satisfaz essa amarração.

Nenhuma das duas oferece unicidade por documento/período/regra nem ledger de idempotência. Vincular tarefa genérica por presunção, ou misturar fila de CRM/RH/operação/qualidade com compliance, foi explicitamente evitado.

### Fronteira documento/armazenamento

O documento é **referência declarada e rastreável**, nada mais. Não há upload, bytes, checksum, varredura de malware, armazenamento verificado, download, consulta a órgão público, monitoramento contínuo ou parecer jurídico. `reference_kind` admite apenas `referencia_declarada` (com valor e fonte obrigatórios) ou `sem_referencia`. As colunas legadas `file_url` e `storage_key` receberam `COMMENT ON COLUMN` declarando-as **não probatórias** e estão fora de toda projeção.

## 4. Implementação

### Superfícies

- staff UI: `/admin/compliance`;
- staff API: `GET /api/ext/compliance/references|documents|tasks`, `GET|POST /obligations`, `GET /obligations/:id`, `POST /obligations/:id/close`, `POST /obligations/:id/documents`, `POST /documents/:id/renewal-start|renew|cancel`, `POST /evaluate`, `POST /tasks/:id/start|complete|cancel`;
- os quatro caminhos legados exatos foram preservados: leitura autorizada mantendo o alias `items`; mutação retorna **410 `legacy_mutation_retired`** somente **após** autenticação, papel e same-origin — nunca antes, para não transformar 410 em canal de sondagem.

A autoridade de escrita de compliance foi retirada de `src/server/ext-advanced-api.mjs` e transferida para o módulo canônico `src/server/ext-compliance-api.mjs`. Os handlers EXT-08..12 do arquivo foram preservados. Não há writers concorrentes sobre as mesmas entidades.

### Obrigação aplicável

Declara tipo, título/descrição, fundamento e **fonte do fundamento**, escopo (`escopo_kind` + referência), justificativa de aplicabilidade, periodicidade, `validity_rule_source`, janela de renovação, criticidade, responsável canônico, estado e autoria derivada da sessão. Encerramento exige justificativa. `periodicidade = sem_vencimento` força `renewal_window_days = 0`.

### Responsável canônico

O responsável é sempre uma **identidade staff ativa** verificada em `auth_identities` + `auth_staff_profiles` dentro da transação (`FOR SHARE`). Nome isolado é recusado com `invalid_responsible_identity`. `responsible_name` passa a ser apenas projeção derivada da identidade, nunca fonte.

### Validade e regra temporal de servidor

A data-base é do **servidor** (`CURRENT_DATE` lido na transação), nunca do corpo. `deriveDocumentState` produz `vigente`, `a_vencer` ou `vencida` a partir da data-base, do vencimento e da janela registrada; `no_expiry` zera o cálculo e devolve `days_remaining: null`. Janela `0` nunca antecipa tarefa. O trigger de banco recusa `vigente` com `expiry_date <= CURRENT_DATE`, de modo que a regra vale mesmo para escrita direta em SQL.

### Tarefa gerada por vencimento

Quando a regra derivada exige (`janela_renovacao` ou `vencimento`), a **mesma transação** cria exatamente uma tarefa, com regra, detalhe da regra, fatos observados (`trigger_facts`) e data-base. A unicidade é imposta no banco por `UNIQUE (document_id, period_end, trigger_rule)` — não por verificação de aplicação. Sem responsável real, a tarefa é criada **fail-closed** com `pending_reason` e sem responsável fabricado (XOR imposto por CHECK). Conclusão exige responsável e resultado de 10 a 2000 caracteres.

`POST /evaluate` é operação administrativa explícita, com idempotência, que devolve `{source, base_date, denominator, tasks_created, absence_note}`. Ausência não vira zero e não há monitoramento contínuo implícito.

### Histórico, renovação e substituição

`ext_compliance_events` é imutável por trigger. A renovação versiona: o documento anterior vai a `substituida`, `is_current=false`, com `superseded_by_document_id`, `superseded_at` e motivo; o novo documento recebe `supersedes_document_id`. A ordem é obrigatória — UUID gerado na aplicação, `UPDATE` do anterior, `INSERT` do novo — e a FK própria é `DEFERRABLE INITIALLY DEFERRED` para validar no `COMMIT`. A versão usa `COALESCE(MAX(version),0)+1`, não `anterior+1`, porque cancelamento seguido de novo registro colidiria. Índices parciais garantem um único documento corrente por obrigação e `(obligation_id, version)` único.

### Privacidade documental

`is_private` é forçado `true` por CHECK no banco e pela aplicação; não existe rota pública, link ou token de documento. As projeções de listagem são allowlists explícitas: não incluem `file_url`, `storage_key`, `legal_basis` nem auditoria, e o número do documento aparece mascarado como `***<últimos 4>`. Nenhum ator externo foi criado: sem portal de emissor, login de seguradora/corretor/contador/fornecedor e sem respondente externo. security-v2 não é fonte de login.

### Transação, auditoria e idempotência

Toda mutação é: `BEGIN` → **advisory lock de transação por ator+chave** → replay do ledger → lock/revalidação → escrita de negócio → geração de tarefa → evento imutável → `audit_log` → `COMMIT`. Falha de auditoria devolve **503 `audit_unavailable`** e reverte tudo. Corpo lido uma única vez, 413 acima de 32 KiB, 400 para JSON inválido ou corpo não-objeto, `Idempotency-Key` obrigatória, fingerprint divergente devolve 409.

## 5. Migração

Somente `db/migrations/153-ext07-compliance-journey.sql` foi adicionada; 001–152 não foram alteradas. É aditiva, sem seed, usa `NOT VALID` nas constraints sobre a tabela histórica, `::text` nas comparações de enum com `TEXT[]`, triggers de imutabilidade/estado e índices parciais. Cria três tabelas (`ext_compliance_obligations`, `ext_compliance_tasks`, `ext_compliance_events`), o enum `ext_compliance_obligation_status` e o valor aditivo `'substituida'` em `ext_compliance_status`. Migrador e QA estático foram atualizados pontualmente para 153, diff a diff, sem substituição numérica ampla.

## 6. Defeitos corrigidos no produto durante a execução

Nenhuma asserção foi enfraquecida, nenhum caso foi pulado e nenhum timeout foi afrouxado para esconder defeito. O gate foi executado integralmente a cada correção.

1. **413 derrubava a conexão.** A leitura de corpo abortava o stream ao estourar o limite; abortar o `Readable` destrói a conexão keep-alive e o cliente recebia erro de transporte em vez de 413. Agora a leitura para de bufferizar, **drena** o restante e só destrói acima de um teto absoluto.
2. **`GET /api/ext/continuity-plans` (EXT-10) nunca respondia.** O handler consulta `ca.name`, mas `client_accounts` tem `display_name`; todos os outros módulos usam `display_name`. Defeito **preexistente**, byte a byte idêntico ao `HEAD`, descoberto pelo caso de não-regressão EXT-08..12. Corrigido.
3. **Falha de handler deixava a requisição sem resposta.** `routeApi` despacha com `return handler(req, res)`; em função `async` a rejeição é resolvida **fora** do `try/catch` interno, virando `unhandledRejection` sem resposta — o cliente ficava preso até desistir (300 s, `headersTimeout` do undici). Defeito **preexistente** e global. O despacho em `server.mjs` passou a ter rede de segurança que converte qualquer falha não tratada em 500 imediato.
4. **Idempotência não serializada sob concorrência.** Quatro requisições idênticas simultâneas produziam `[409,200,201,200]`: entre “não há evento” e a gravação do evento não havia serialização, então uma perdedora alcançava a regra de negócio e devolvia conflito de negócio em vez de replay. Corrigido com `pg_advisory_xact_lock` por ator+chave antes da consulta ao ledger. O caso passou a exigir **exatamente** um 201, três 200 com `replayed: true` e o mesmo `document.id`.

Dois erros eram do **teste**, não do produto, e foram corrigidos sem reduzir cobertura: a verificação de vazamento serializava o corpo inteiro e casava com a palavra `storage_key` presente na prosa do campo `projection` (passou a inspecionar apenas a coleção projetada, agora também para `file_url`); e `data(...)` recebia uma Promise em vez da resposta.

## 7. Validação automática

Resultados medidos nesta base:

| Comando | Resultado |
|---|---|
| `npm ci` | sucesso; 82 pacotes; 0 vulnerabilidades |
| sintaxe dos novos `.mjs` (`node -c`) | sucesso |
| `node scripts/qa-wave0-static.mjs` | **5/5**, migrações 001–153 |
| `npm run typecheck` | sucesso |
| `node --test tests/ext07-compliance.test.mjs` | **12/12** |
| `npm test` | **450/450**, 0 fail/skip/todo |
| `npm run build` | sucesso; **92 páginas**; `/admin/compliance` presente |
| `npm run test:migrations:pg` | primeira aplicação e replay; checksums **153/153** nas duas passagens; negativo 006 rejeitado sem rebaseline; clone/restauração 153/153; **561 tabelas** |
| `npm run test:ext07-compliance:pg` | **45/45**, mínimo exigido 40, 0 fail/skip/todo; PostgreSQL 17 + HTTP real |
| `npm run test:ext06-satisfaction:pg` | **36/36** (não-regressão) |
| `npm run test:ext05-quality:pg` | **33/33** (não-regressão) |
| `git diff --check` | sucesso |

O gate EXT-07 foi executado **cinco vezes**. As três primeiras falharam e cada falha foi tratada como defeito, não como instabilidade: `pass=40 fail=5`, depois `pass=44 fail=1`, depois `pass=43 fail=2`. As duas últimas execuções, após as correções da seção 6, passaram **45/45 de forma idêntica**, com limpeza de cluster confirmada (`QA_EXT07_PG_TEMP_CLEANED: true`). O caso de concorrência, que havia alternado entre passar e falhar, foi diagnosticado como defeito real de serialização e **não** classificado como flake; sua asserção foi endurecida.

Os gates EXT-05 e EXT-06 foram executados especificamente porque a correção nº 3 altera o despacho global de API e o risco não poderia ficar sem prova.

`next-env.d.ts` e `tsconfig.json`, regravados pelo Next durante build e suíte de integração, foram restaurados antes do commit.

### O que **não** cobre EXT-07

- `node scripts/qa-wave0-static.mjs`, `npm run typecheck`, `npm test` e `npm run build` são estáticos/unitários: **não** exercitam PostgreSQL, HTTP real, transação, concorrência ou privacidade efetiva.
- `npm run test:migrations:pg` prova o ledger e os checksums 153/153, **não** a jornada.
- `npm run test:ext05-quality:pg` e `npm run test:ext06-satisfaction:pg` provam não-regressão de outras fatias, **não** EXT-07.
- não existe gate dedicado a EXT-08..12; a correção nº 2 está coberta apenas pelo caso de não-regressão dentro do gate EXT-07.
- os seis gates sem workflow (`cli-v2:pg`, `staff-auth:pg`, `client-access:pg`, `backup-restore:pg`, `l02-delivery:pg`, `l03-delivery:pg`) continuam sem cobertura automática e **não** cobrem EXT-07.
- não foram executados como prova desta fatia: bateria pesada integral, implantação em destino, aceite humano e homologação Windows.

Problemas preexistentes conhecidos e fora do escopo: falha determinística 401-vs-403 em `test:cli-v2:pg`; possível instabilidade de Chromium em `test:l06-delivery:pg`; janela fixa de 45 s em `test:l05-delivery:pg` sob carga; restauração de backup exige ferramentas PostgreSQL 17 indisponíveis em alguns ambientes. Nenhum deles foi usado para enfraquecer a prova.

## 8. Fronteiras e pendências

- nenhum dado real foi usado; apenas fixtures sintéticas `.invalid`;
- nenhum ator externo foi criado: sem portal de emissor, sem login de seguradora/corretor/contador/fornecedor, sem respondente externo, sem link público ou token de documento;
- security-v2 não foi usada como fonte de login;
- nenhum upload, byte, checksum, varredura, armazenamento verificado, download, consulta a órgão público, monitoramento contínuo ou parecer jurídico foi inventado;
- não há aceite humano inventado; o aceite de Marcelo/Andreia continua restrito ao L07;
- **pendência declarada:** `src/app/admin/ti/ExtAdvancedClient.tsx` foi preservado por restrição explícita do dono; o POST de compliance que ele emite agora recebe 410. O componente é órfão e a decisão sobre ele cabe ao dono;
- EXT-03 relevância de mercado, EXT-04 volume/ator externo e os seis workflows ausentes permanecem fora do escopo;
- destino operacional, bateria pesada e homologação Windows permanecem pendentes.
