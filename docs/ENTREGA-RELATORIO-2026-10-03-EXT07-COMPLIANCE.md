# Relatório de entrega — EXT-07 compliance corporativo (2026-10-03)

## 1. Base e merge da PR #101

Confirmado por execução antes de qualquer edição:

| Item | Valor |
|---|---|
| Estado da PR #101 | `MERGED` (`mergedAt` 2026-10-03T20:20:28Z) |
| Título | EXT-06: satisfação e carteira canônicas |
| SHA do merge commit na `main` | `efc74bacb7a23314db1d267d91438519dc342a8c` |
| SHA da feature da PR #101 | `3d573f18293ed9bad810fa03e4654ddf1fbd4d30` |
| `HEAD` inicial | `efc74bacb7a23314db1d267d91438519dc342a8c` |
| `origin/main` (após fetch) | `efc74bacb7a23314db1d267d91438519dc342a8c` |
| Merge-base | `efc74bacb7a23314db1d267d91438519dc342a8c` |
| Divergência inicial (`origin/main...HEAD`) | `0 0` |
| Árvore de trabalho inicial | limpa (0 entradas em `git status --porcelain`) |
| Branch de trabalho | `arena/01a10376-gruposegsystemseguranca` |
| Última migração na base | 152 |
| Próxima migração livre | 153 |

O merge commit foi **descoberto** por `gh pr view 101`, não presumido. A base não é ambígua e a implementação prosseguiu.

## 2. Lacunas reproduzidas por execução antes de implementar

Probe temporário em PostgreSQL 17 descartável (`seg_qa_probe_ext07`), migrações 001–152, servidor HTTP real, apenas dados sintéticos e domínios `.invalid`. O probe foi **removido** após o registro (`scripts/qa-ext07-probe-temp.mjs` não existe mais). Nenhum banco real foi tocado.

| # | Verificação | Resultado observado |
|---|---|---|
| 1 | Rota administrativa canônica `/api/ext/compliance/*` | **Ausente** — `GET /api/ext/compliance/obligations` → `404` |
| 2 | Tela `/admin/compliance` | **Ausente** — `404` |
| 3 | Rotas legadas exatas `compliance-documents` | Funcionais: `GET` → `200` com chaves `items,note` |
| 4 | Anônimo vs papel não autorizado | **Confunde 401/403**: anônimo `401 {"error":"unauthorized"}` e papel `rh` também `401 {"error":"unauthorized"}` |
| 5 | Same-origin em mutações | `sameOrigin` é chamado antes da autenticação para todos os métodos; `GET` com origem estranha retornou `200` — a guarda é ampla no código e inefetiva na leitura |
| 6 | Criar documento sem obrigação aplicável | **Possível** — `201`; não existe entidade de obrigação |
| 7 | Criar documento sem responsável canônico | **Possível** — `201` sem responsável |
| 8 | Forjar responsável/autoria/estado pelo corpo | `responsible_name` livre aceito e persistido (`"Nome Forjado Probe"`); `responsible_identity` preenchido com a sessão; `status` enviado é ignorado silenciosamente, sem recusa explícita |
| 9 | Datas inválidas | `expiry < issue` → `400`; **data lixo** (`"nao-e-data"`) **não** retorna `400`: a exceção do PostgreSQL é propagada por `throw e` e a requisição termina em falha de conexão. Na primeira execução do probe o processo HTTP ficou indisponível para todos os casos seguintes |
| 10 | "Vigente" apesar de vencido | **Possível** — documento com vencimento em 2020-02-01 nasceu `vigente` |
| 11 | Estado sem derivação da data-base | **Possível** — `PATCH` para `vigente` em documento vencido → `200` |
| 12 | PATCH arbitrário de estado | **Possível** — `200` para qualquer valor do enum |
| 13 | Reabrir estado terminal | **Possível** — após `cancelada`, `PATCH` de volta para `vigente` → `200`, silenciosamente |
| 14 | Sobrescrita destrutiva | Não há proteção: nenhuma trigger ou CHECK sobre número, emissor, validade, documento ou responsável |
| 15 | Duplicação em retry | **Ocorre** — duas `POST` idênticas → `201`/`201` com ids distintos; não há `Idempotency-Key` |
| 16 | Reuso divergente de chave | Não aplicável: o handler legado ignora o header |
| 17 | Concorrência | 4 criações concorrentes → `201` × 4, 4 linhas; sem lock nem idempotência |
| 18 | Tarefa por vencimento | **Inexistente** — única tabela `ext_compliance%` é `ext_compliance_documents` |
| 19 | Duplicar tarefas para o mesmo vencimento | Não aplicável: nenhuma tarefa é gerada |
| 20 | Concluir tarefa sem responsável/resultado | Não aplicável: inexistente |
| 21 | Falha de `audit_log` sem rollback | `auditLog` é desacoplado e tolerante a falha, aguardado **fora** de transação; o `INSERT` já está committado antes da auditoria |
| 22 | Exposição de dados privados | `SELECT *` sem allowlist: a leitura expõe `file_url`, `storage_key`, `document_number` e `is_private` |
| 23 | Versionamento/renovação/substituição | **Ausente** — 0 colunas de versão/renovação/substituição |
| 24 | Bytes reais para metadados de arquivo | `file_url`/`storage_key` são texto livre; nenhuma verificação, checksum ou byte recebido |
| 25 | Autoridade concorrente de escrita | Apenas `ext-advanced-api.mjs` escrevia na tabela |
| 26 | Estado vazio no cluster limpo | 0 linhas antes do probe; as 10 linhas finais foram criadas pelo próprio probe. **Isso prova ausência de seed, não ausência de dados operacionais reais** |
| 27 | `is_private` | `true` apenas por default de banco; o servidor não o impõe nem o projeta |
| 28 | Rotas EXT-08..12 | `GET /api/ext/knowledge-base` → `200` |

Leitura isolada de código não foi aceita como prova: todos os itens acima vieram de execução HTTP/SQL real.

## 3. Estado anterior real

**Migração 086** criava `ext_compliance_documents` com `protocol`, `title`, `description`, `compliance_type` (enum `licenca|certidao|seguro|alvara|outro`), `status` (enum `vigente|a_vencer|vencida|em_renovacao|cancelada`, default `vigente`), `document_number`, `issuer`, `responsible_name`, `responsible_identity`, `issue_date`, `expiry_date`, `file_name`, `file_url`, `storage_key`, `is_private` (default `true`), `created_by_identity` e timestamps — sem obrigação, sem versionamento, sem tarefa, sem evento e sem ledger.

**Handler legado** (`src/server/ext-advanced-api.mjs`): exigia staff `admin|ti` mas devolvia `401` para papel autorizado inválido; aplicava same-origin de forma ampla; permitia criação direta; aceitava responsável nominal e metadados documentais pelo corpo; aceitava `PATCH` direto de estado; usava auditoria desacoplada e tolerante a falha; não provava transação, rollback, idempotência nem concorrência.

**UI órfã**: `src/app/admin/ti/ExtAdvancedClient.tsx`, sem rota que a renderizasse. A auditoria registrava "UI órfã; sem gate de validade/tarefa/privacidade". **O arquivo foi preservado**, sem alteração nem remoção, por não haver decisão expressa do proprietário.

## 4. Decisões canônicas

### 4.1 Fonte canônica do documento

**Decisão: preservar e endurecer `ext_compliance_documents` (086).** Nenhuma tabela paralela equivalente de documento foi criada. A migração 153 adiciona colunas, CHECKs `NOT VALID`, índices únicos parciais e triggers sobre a tabela existente, e introduz `origin` para separar `registro_legado` de `ext07_canonica`.

### 4.2 Fonte da tarefa de vencimento

**Decisão: tabela dedicada `ext_compliance_tasks`.** Justificativa concreta, por inspeção:

- `crm_tasks` (migração 014): escopo e autorização de CRM (`opportunity_id`/`company_id`), sem vínculo a documento ou período de validade, sem ledger de idempotência, sem imposição de privacidade, sem imutabilidade de fatos/regra, sem unicidade por vencimento e sem modo fail-closed de responsável. Misturar tarefa de CRM com compliance alteraria a semântica e a autorização de ambos.
- `crm_document_obligations` (migração 037): modela **documento contratual do cliente** (CON-06), com categoria/periodicidade próprias, aprovação e comprovante — não é compliance corporativo da entidade, e suas constraints são permissivas (`responsible_name` livre, status sem máquina imposta).

Nenhuma outra jornada canônica de tarefa impõe simultaneamente vínculo, privacidade, estado, responsável e idempotência compatíveis. A tabela dedicada não duplica entidade existente: ela referencia a obrigação e o documento canônicos por FK.

### 4.3 Classificação de registros antigos

Linhas pré-existentes da 086 permanecem `origin='registro_legado'`. Nenhuma obrigação, responsável, autoria, privacidade, origem, regra de validade, tarefa ou armazenamento foi atribuído retroativamente. As CHECKs canônicas são `NOT VALID` e condicionadas a `origin='ext07_canonica'`, de modo que não revalidam nem reinterpretam o histórico.

## 5. Fronteira de ator

Jornada **interna de staff** (`admin|marcelo|ti`), derivada da fonte canônica de staff (`auth_identities` + `auth_staff_profiles`), coerente com EXT-01..06. Não foi inventado portal de órgão emissor, login de seguradora, corretora, contador ou fornecedor, respondente externo, link público ou token documental. Tabelas security-v2 não são fonte de login. Anônimo `401`; papel autenticado não autorizado `403`; autoria derivada da sessão; mutações same-origin; UUIDs validados; corpo limitado a 32 KiB e exigido como objeto JSON; request e response body nunca são consumidos duas vezes.

## 6. Implementação

- **Migração** `db/migrations/153-ext07-compliance-journey.sql` (aditiva; 001–152 intocadas).
- **API** `src/server/ext-compliance-api.mjs`, montada em `server.mjs`.
- **UI** `src/app/admin/compliance/page.tsx` + `ComplianceWorkspace.tsx`.
- **Autoridade de escrita de compliance removida** de `src/server/ext-advanced-api.mjs`; EXT-08..12 preservados integralmente.

Rotas canônicas: `GET /api/ext/compliance/references`, `GET|POST /api/ext/compliance/obligations`, `GET /api/ext/compliance/obligations/:id`, `POST /api/ext/compliance/obligations/:id/documents`, `POST /api/ext/compliance/obligations/:id/close`, `POST /api/ext/compliance/evaluate`, `POST /api/ext/compliance/tasks/:id/{start|complete|cancel}`.

### 6.1 Obrigações e aplicabilidade

`ext_compliance_obligations` exige tipo, título, descrição, fundamento/fonte declarada, natureza do fundamento (`declarada_interna|norma_citada|contrato|outro`), escopo (`entidade|unidade|contrato|operacao`) com rótulo, justificativa de aplicabilidade, periodicidade, janela de renovação (0–365 dias), criticidade opcional, responsável canônico, estado e autoria com data do servidor. A API recusa valores fora das listas declaradas e exige que o responsável seja identidade staff **ativa e autorizada**.

Não há integração regulatória real: a documentação e a UI declaram que fundamento e aplicabilidade são **declaração interna rastreável**, não confirmação por órgão público, consulta automática, benchmark regulatório ou parecer jurídico verificado.

Estados distinguíveis: obrigação sem documento (`sem_documento`), documento vigente, a vencer, vencido, em renovação, substituído e obrigação encerrada ou não aplicável com justificativa formal.

### 6.2 Validade e regra temporal

Modelados: `issue_date`, `valid_from`, `expiry_date`, `has_expiry` (ausência de vencimento é **declarada explicitamente**, distinta de "sem risco"), `state_base_date`, `state_rule` e `renewal_window_days` como antecedência configurada.

Imposições: vencimento anterior à emissão/início é recusado na API e pela CHECK canônica; a CHECK `ext_compliance_documents_temporal_state` impede `vigente` com vencimento anterior à data-base e `vencida` antes do vencimento; a data-base vem sempre de `CURRENT_DATE` do servidor — o relógio do cliente nunca é autoridade; a validade anterior não é alterada destrutivamente.

Agregados informam fonte, data-base/período, denominador e distinguem ausência de zero (`absence: "sem_obrigacoes_registradas"`, `"sem_tarefas_registradas"`, `"sem_documentos_avaliaveis"`).

### 6.3 Documento privado e fronteira de armazenamento

`is_private = true` é imposto pelo servidor e pela CHECK canônica, e é imutável por trigger. A listagem staff mais ampla usa allowlist (`COMPLIANCE_LIST_FIELDS`) e não expõe `file_url`, `storage_key`, `file_name`, número documental, referência declarada, notas, fatos de tarefa nem auditoria. O detalhe autorizado mostra os metadados necessários à gestão.

A infraestrutura atual **não** comporta arquivo real nesta fatia. Modelou-se portanto referência documental privada explícita: `reference_kind`, `reference_declared`, `reference_source`, `reference_note`. API, UI e documentação declaram que é metadado/referência, **não** arquivo verificado. `file_name`/`file_url`/`storage_key` da 086 permanecem como metadados legados que não provam upload, recebimento, checksum, existência, armazenamento ou conteúdo. Não foi inventado upload, bytes, checksum, varredura de malware, armazenamento verificado nem download.

### 6.4 Histórico, versionamento e renovação

A renovação cria nova versão (`version + 1`), vincula o documento anterior (`supersedes_document_id`/`superseded_by_document_id`), preserva número, emissor, validade, referência e responsável anteriores, exige justificativa, e encerra formalmente a versão anterior como `substituida`. Índices únicos garantem uma única versão atual por obrigação, versão única por obrigação e substituição não reutilizável. CHECKs impedem autossubstituição e ciclo direto. Triggers impedem reativação de versão substituída, alteração do vínculo de substituição e sobrescrita destrutiva de campos canônicos. Eventos são imutáveis (`UPDATE`/`DELETE` bloqueados).

Ordem transacional da renovação (defeito encontrado e corrigido durante o gate): a corrente é liberada (`is_current=false`) **antes** da inserção da nova versão, porque o índice único parcial não admite duas correntes nem por instante; o estado terminal e o vínculo de substituição são gravados em seguida, juntos, porque a CHECK exige `superseded_by_document_id` preenchido.

### 6.5 Máquina de estados

- **Documento** (enum `ext_compliance_status`, acrescido aditivamente de `substituida`): `vigente`, `a_vencer`, `vencida`, `em_renovacao` → `substituida`/`cancelada`; `substituida` e `cancelada` são terminais e não reabrem. Cancelamento exige justificativa, autor e timestamp.
- **Tarefa**: `aberta` → `em_andamento` → `concluida`/`cancelada`. Conclusão exige responsável canônico ativo, resultado (10–2000), autor e timestamp do servidor, e é bloqueada se houver pendência fail-closed. Cancelamento exige justificativa. Terminais não reabrem, nem pela API (`409`) nem pelo banco (trigger).
- **Obrigação**: `ativa` → `encerrada`/`nao_aplicavel`, ambas terminais e exigindo justificativa.

Comparações de enum PostgreSQL com literais/listas usam `::text`.

### 6.6 Regra exata que gera a tarefa

Regra explícita e **armazenada por obrigação**: `renewal_window_days`. Não há limiar global oculto. Dada a data-base `B` do servidor, o vencimento `V` e a janela `W`:

- `B > V` → estado `vencida`, tarefa exigida;
- `V - W ≤ B ≤ V` → estado `a_vencer`, tarefa exigida;
- `B < V - W` → estado `vigente`, nenhuma tarefa;
- `has_expiry = false` → estado `vigente`, nenhuma tarefa, ausência declarada `sem_vencimento_declarado`.

A tarefa é criada na **mesma transação** que registra ou avalia o vencimento, vinculada a obrigação, documento e período de validade, com `trigger_rule` (regra e sua fonte), `trigger_facts` (data-base, vencimento, início do alerta, estado observado, janela, versão e protocolo do documento), `base_date`, autor e data do servidor. Responsável, vínculo, estado e conclusão **nunca** são aceitos pelo corpo. A unicidade é garantida pelo índice `ext_compliance_tasks_unique_per_expiry(document_id, validity_period_end, trigger_rule_key)` combinado com `ON CONFLICT ... DO NOTHING` e `FOR UPDATE`: retry não duplica e concorrência real não produz duas tarefas.

**Modo fail-closed**: sem responsável staff ativo, a tarefa nasce com `responsible_identity_id = NULL` e `pending_reason` explícita (CHECK garante que uma coisa implica a outra), a conclusão é recusada com `409 responsible_required_fail_closed`, nenhum nome é inventado, nenhuma tarefa é declarada atribuída e a obrigação não é marcada como tratada.

**Scheduler**: não existe scheduler canônico nesta base. Foi implementada operação administrativa explícita `POST /api/ext/compliance/evaluate`, que registra a data-base do servidor e é provada por HTTP e PostgreSQL. A documentação e a resposta da própria API declaram que a geração automática contínua depende de execução agendada futura. Não se declara monitoramento contínuo inexistente.

### 6.7 Transação, auditoria, concorrência e idempotência

Toda mutação canônica executa: `BEGIN` → `pg_advisory_xact_lock` por identidade+chave → replay do ledger de idempotência → revalidação com `FOR UPDATE` de sessão, identidade, escopo, obrigação e documento → escrita de negócio → geração de tarefa quando a regra exigir → evento imutável → `audit_log` → `COMMIT`. Falha de auditoria causa `ROLLBACK`, HTTP `503 audit_unavailable` e **nenhuma** persistência de obrigação, documento, versão, tarefa, evento ou mudança de estado — provado por gate com trigger de falha em `audit_log`. O helper legado tolerante a falha não é usado. `Idempotency-Key` é obrigatória em mutações: replay idêntico devolve `200 replayed:true` sem duplicar; mesma chave com fingerprint diferente devolve `409`; o ledger é único por identidade staff.

## 7. Resultados exatos

| # | Validação | Resultado |
|---|---|---|
| 1 | `npm ci` | OK |
| 2 | Sintaxe dos novos `.mjs` (`node --check`) | OK em `ext-compliance-api.mjs`, `qa-ext07-compliance-postgres.mjs`, ambos os testes, `server.mjs`, `ext-advanced-api.mjs`, `migrate-site-visual.mjs`, `qa-wave0-static.mjs` |
| 3 | `node scripts/qa-wave0-static.mjs` | **5/5**, migrações **001–153** contínuas e registradas, 0 imports ausentes |
| 4 | `npm run typecheck` | OK, sem saída de erro |
| 5 | Focal EXT-07 (`tests/ext07-compliance.test.mjs`) | **13/13**, 0 fail |
| 6 | `npm test` | **451/451**, 0 fail/skip/todo (antes: 438/438) |
| 7 | `npm run build` | OK, **92 páginas** (antes: 91), com `○ /admin/compliance` |
| 8 | `npm run test:migrations:pg` | 1ª aplicação `EXIT=0 CHECKSUMMED=153/153`; replay `EXIT=0 CHECKSUMMED=153/153 TABLES=561->561`; checksum negativo rejeitado (006, exit 1, sem rebaseline); clone/restauração `153/153` preservados |
| 9 | `npm run test:ext07-compliance:pg` | **54/54**, `fail=0 skipped=0 todo=0`, mínimo exigido 40, `EXT07_COMPLIANCE_TEST_EXIT: 0`, cluster e temporários limpos |
| 10 | Gates focais de jornadas de tarefa/documento reutilizadas | **Não aplicável**: nenhuma jornada existente foi reutilizada (decisão 4.2) |
| 11 | Regressão da entrega anterior: `npm run test:ext06-satisfaction:pg` | **36/36**, 0 fail; focal EXT-06 **8/8** |
| 12 | `git diff --check` | limpo |

`next-env.d.ts` e `tsconfig.json` foram revertidos antes do commit e não contêm mudanças geradas.

## 8. Gates que NÃO cobrem a EXT-07

Estático, typecheck, unitário, build, migrações e gates antigos **não** substituem o gate dedicado:

- `qa-wave0-static.mjs`: só continuidade/registro de migrações, imports e CI. Não executa a jornada.
- `npm run typecheck` / `npm test`: sem banco e sem HTTP; não provam transação, concorrência, privacidade real nem tarefa.
- `npm run build`: prova que a rota existe e compila, não que a jornada funciona.
- `npm run test:migrations:pg`: prova o ledger e os checksums, não o comportamento da API.
- `test:ext02..06:pg`, `test:l02..l08-delivery:pg`, `test:cli-v2:pg`, `test:staff-auth:pg`, `test:client-access:pg`, `test:backup-restore:pg`, `test:tenant:pg`, `test:demo-local:pg`: cobrem outras fatias; nenhum exercita `/api/ext/compliance/*`.

A única prova da jornada EXT-07 é `npm run test:ext07-compliance:pg`, com `.github/workflows/ext07-delivery.yml` (job `compliance-postgres`) executando migrações 001–153 e o gate em PostgreSQL 17 descartável.

A bateria pesada integral não foi executada nem apresentada como necessária para provar a EXT-07. Permanecem separadas: implementação, validação automática, gate dedicado, bateria pesada, aplicação em destino, aceite humano e homologação Windows.

## 9. Fronteiras e pendências explícitas

- **Sem arquivo real**: nenhum upload, byte recebido, checksum, varredura de malware, armazenamento verificado ou download. O que existe é referência documental privada declarada.
- **Sem integração regulatória**: nenhuma consulta a órgão público, benchmark regulatório ou parecer jurídico verificado. Fundamento e aplicabilidade são declaração interna rastreável.
- **Sem ator externo**: nenhum portal de órgão emissor, login de seguradora/corretora/contador/fornecedor, respondente externo, link público ou token documental.
- **Sem scheduler**: a avaliação temporal é operação administrativa explícita; a geração contínua depende de execução agendada futura.
- **Sem migração de dados**: linhas antigas da 086 continuam `registro_legado`; nada foi atribuído retroativamente.
- **UI órfã preservada**: `src/app/admin/ti/ExtAdvancedClient.tsx` não foi alterado nem removido, por falta de decisão expressa do proprietário.
- **Defeito pré-existente fora de escopo, não corrigido**: `/api/ext/continuity-plans` (EXT-10) consulta `ca.name`, coluna inexistente em `client_accounts`; a rejeição não tratada derruba o processo HTTP. O handler é byte-idêntico ao da base mesclada — não é regressão desta entrega. O gate prova isso estaticamente e valida por HTTP as demais rotas EXT-08..12 saudáveis.
- **Problemas preexistentes mantidos fora desta fatia**: `test:cli-v2:pg` com falha determinística 401 vs 403; possível flake Chromium em `test:l06-delivery:pg`; `test:l05-delivery:pg` pode atingir a janela fixa de 45 s sob carga; backup restore exige ferramentas PostgreSQL 17 indisponíveis em alguns ambientes; os seis gates sem workflow (`cli-v2:pg`, `staff-auth:pg`, `client-access:pg`, `backup-restore:pg`, `l02-delivery:pg`, `l03-delivery:pg`); confirmação de relevância de mercado da EXT-03; confirmação de volume/ator externo da EXT-04.
- **Pendentes**: aplicação em destino, aceite humano, bateria pesada integral e homologação Windows.

## 10. Aceite humano

**Nenhum aceite humano novo foi produzido ou inventado nesta fatia.** O aceite de Marcelo e Andreia permanece válido somente para o L07.
