# Relatório de entrega — EXT-07 Compliance Corporativo (Hardening)

Data local: **2026-10-03**  
Critério: **“Licenças/certidões/seguros e obrigações aplicáveis com responsável, validade, versionamento e tarefa de conformidade”**

---

## 1. Base confirmada antes da edição

- `gh pr view 103`: estado `MERGED`.
- PR: `https://github.com/berger33/gruposegsystemseguranca/pull/103`.
- Merge commit descoberto por execução: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- Feature da PR informada pela API GitHub: `3cf218d949e3ce04fe49e82ce2dcd1ca6b874584`.
- `HEAD`: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- `origin/main`, após fetch: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- Branch fixa de trabalho: `arena/01a1041e-gruposegsystemseguranca`.
- Divergência `HEAD...origin/main`: `0 0`.
- Árvore: limpa.

---

## 2. Estado anterior e lacunas tratadas

A etapa inicial da EXT-07 (migração 153) introduziu os modelos de dados básicos para obrigações (`ext_compliance_obligations`), documentos (`ext_compliance_documents`), tarefas (`ext_compliance_tasks`) e eventos (`ext_compliance_events`). No entanto, a auditoria de robustez e segurança identificou as seguintes lacunas de integridade e disciplina de produção:

1. **Versionamento e substituição concorrente:** Era possível criar documentos paralelos com status `vigente` na mesma obrigação sem substituição explícita, gerando ambiguidade de vigência.
2. **Substituição e renovação desvinculadas:** A renovação documental não exigia vínculo com o documento anterior (`replacement_of_document_id`) nem transição atômica do documento anterior para `substituida`.
3. **Cancelamento não justificado e tarefas órfãs:** O cancelamento de documentos não exigia justificativa formal e deixava tarefas abertas de conformidade em aberto.
4. **Falta de triggers de guarda no banco:** Atualizações diretas ou indevidas no banco poderiam alterar hashes, protocolos ou reabrir documentos e tarefas em estados terminais (`cancelada`, `concluida`, `substituida`).
5. **Imutabilidade da tabela de eventos:** `ext_compliance_events` não possuía trigger impedindo `UPDATE` e `DELETE`.
6. **Gate dedicado autoauditado:** Ausência de um gate com cluster PostgreSQL 17 descartável e servidor HTTP real auditando o TAP summary com contagem mínima e tolerância zero a falhas/skips.

---

## 3. Decisão canônica e implementação

### 3.1. Migração `db/migrations/154-ext07-compliance-hardening.sql`
- Criação de campos de versionamento incremental e vínculo de substituição (`replacement_of_document_id`).
- Criação de trigger `ext_compliance_document_guard` impedindo reabertura de documentos cancelados/substituídos e alteração de metadados fundamentais (número de protocolo, hash).
- Criação de trigger `ext_compliance_task_guard` impedindo alteração de tipo de obrigação, documento vinculado e impedindo reabertura de tarefas concluídas ou canceladas.
- Criação de trigger `ext_compliance_events_guard` garantindo imutabilidade total (rejeição estrita de `UPDATE` e `DELETE`).
- Partial index no PostgreSQL garantindo unicidade de documentos ativos (`vigente`, `a_vencer`) por obrigação, forçando fluxo de renovação versionada.
- Registro contínuo no ledger de migrações (001–154) sem alteração de migrações anteriores (001–153 preservadas imutáveis).

### 3.2. API canônica `src/server/ext-compliance-api.mjs` e `server.mjs`
- Rotas canônicas:
  - `GET /api/ext/compliance/obligations`: listagem de obrigações com filtros e contadores.
  - `POST /api/ext/compliance/obligations`: cadastro de obrigação com autor derivado da sessão e responsável staff ativo.
  - `GET /api/ext/compliance/documents`: listagem com minimização de metadados confidenciais (sem storage_key nem URLs internas).
  - `POST /api/ext/compliance/documents`: cadastro de documento inicial (versão 1, protocolo canônico).
  - `GET /api/ext/compliance/documents/:id`: detalhe autorizado com histórico de eventos e tarefas vinculadas.
  - `POST /api/ext/compliance/documents/:id/renew`: renovação versionada (gera versão N+1, marca versão anterior como `substituida`).
  - `POST /api/ext/compliance/documents/:id/cancel`: cancelamento com justificativa e cancelamento em cascata de tarefas abertas.
  - `POST /api/ext/compliance/evaluate`: reavaliação temporal de validade na data do servidor, gerando tarefas de conformidade sem duplicação.
  - `GET /api/ext/compliance/tasks`: listagem de tarefas com filtros de status e severidade.
  - `POST /api/ext/compliance/tasks/:id/start`: transição `aberta -> em_andamento`.
  - `POST /api/ext/compliance/tasks/:id/complete`: conclusão exigindo responsável staff e resultado detalhado (mínimo 10 caracteres).
- Controles de segurança:
  - RBAC estrito (somente papéis `admin`, `marcelo` e `ti`).
  - Negação explícita com 401 (anônimo) e 403 (papel não autorizado).
  - Same-origin forçado para todos os verbos de mutação (POST, PUT, PATCH, DELETE).
  - Chave de idempotência obrigatória (`Idempotency-Key` / `x-idempotency-key`), com replay 200 idêntico e 409 em payload divergente.
  - Atomicidade total com `audit_log`: falha no registro de auditoria causa `ROLLBACK` e HTTP 503.
- Legado:
  - Rotas legadas (`/api/admin/hr/ext-compliance-documents`, etc.) preservadas para leitura sob envelope `items` e anotação de escopo; mutações aposentadas com HTTP `410 Gone`.

### 3.3. Interface `src/app/admin/compliance/ComplianceWorkspace.tsx`
- Interface administrativa staff `/admin/compliance` com abas para Visão Geral, Obrigações, Documentos e Tarefas.
- Formulários completos com validação em tempo de digitação, indicação de metadados privados, fluxo de renovação versionada, cancelamento com modal de justificativa e execução de tarefas de conformidade com feedback de retry.

---

## 4. Evidências de testes e validação

### 4.1. Gate dedicado PostgreSQL 17 + HTTP real
Executado via `scripts/qa-ext07-compliance-postgres.mjs` (`npm run test:ext07-compliance:pg`):
- **39 casos executados e aprovados** (zero fail, zero skipped, zero todo; mínimo exigido: 35).
- Resumo TAP auditado:
  ```
  TAP version 13
  ok 1 - EXT-07 gate exige PostgreSQL real
  ok 2 - EXT-07 HTTP staff anônimo 401
  ok 3 - EXT-07 HTTP staff papel não autorizado (rh) 403
  ok 4 - EXT-07 HTTP same-origin recusado em mutação 403
  ok 5 - EXT-07 HTTP chave de idempotência obrigatória
  ok 6 - EXT-07 HTTP JSON inválido retorna 400
  ok 7 - EXT-07 HTTP corpo grande retorna 413
  ok 8 - EXT-07 HTTP UUID inválido no corpo retorna 400
  ok 9 - EXT-07 HTTP campos obrigatórios da obrigação ausentes
  ok 10 - EXT-07 HTTP responsável não pertencente ao staff ativo
  ok 11 - EXT-07 criação de obrigação deriva autor da sessão e status pendente
  ok 12 - EXT-07 retry de criação de obrigação com mesma chave retorna 200 replayed
  ok 13 - EXT-07 chave de idempotência reutilizada com payload divergente retorna 409
  ok 14 - EXT-07 concorrência de criação produz uma única obrigação
  ok 15 - EXT-07 criação de documento recusa validade anterior à emissão
  ok 16 - EXT-07 criação de documento para obrigação inexistente retorna 404
  ok 17 - EXT-07 criação de documento canônico impõe privacidade, protocolo e versão 1
  ok 18 - EXT-07 criação de segundo documento ativo na mesma obrigação é negada 409 (exige renovação)
  ok 19 - EXT-07 listagem de documentos minimiza metadados privados (sem storage_key nem URL privada)
  ok 20 - EXT-07 detalhe autorizado de documento retorna tarefas, eventos e dados vinculados
  ok 21 - EXT-07 detalhe de documento com UUID inexistente retorna 404
  ok 22 - EXT-07 detalhe de documento com UUID inválido retorna 400
  ok 23 - EXT-07 renovação cria versão 2, vincula replacement_of e marca anterior substituida
  ok 24 - EXT-07 documento substituído não pode ser renovado novamente (409)
  ok 25 - EXT-07 cancelamento de documento exige justificativa e cancela tarefas abertas
  ok 26 - EXT-07 trigger ext_compliance_document_guard impede alteração destrutiva no banco
  ok 27 - EXT-07 trigger impede reabertura de documento cancelado
  ok 28 - EXT-07 avaliação temporal gera tarefa de conformidade vinculada e atualiza documento para vencida
  ok 29 - EXT-07 reavaliação idempotente não duplica tarefas de compliance
  ok 30 - EXT-07 tarefa de compliance transita: aberta -> em_andamento
  ok 31 - EXT-07 tarefa de compliance conclusão exige responsável e resultado (mínimo 10 caracteres)
  ok 32 - EXT-07 tarefa em estado terminal não pode ser reiniciada ou reaberta
  ok 33 - EXT-07 trigger ext_compliance_task_guard impede alteração de atributos estruturais da tarefa
  ok 34 - EXT-07 eventos de compliance são imutáveis contra UPDATE e DELETE
  ok 35 - EXT-07 falha de audit_log causa rollback e retorna 503
  ok 36 - EXT-07 agregados distinguem ausência de zero e declaram fonte
  ok 37 - EXT-07 UI /admin/compliance renderiza com sucesso para staff
  ok 38 - EXT-07 rotas legadas preservam leitura items e retornam 410 para escrita
  ok 39 - EXT-07 não-regressão de rotas EXT-08..12
  1..39
  # tests 39
  # pass 39
  # fail 0
  # skipped 0
  # todo 0
  EXT07_TAP_SUMMARY: pass=39 fail=0 skipped=0 todo=0 minimo_exigido=35
  EXT07_COMPLIANCE_TEST_EXIT: 0
  QA_EXT07_PG_TEMP_CLEANED: true
  ```

### 4.2. Suíte de testes unitários e estáticos
- `npm test`: **443/443 testes aprovados**.
- `node scripts/qa-wave0-static.mjs`: **5/5 verificações aprovadas** (001–154 contínuas).
- `npm run typecheck`: **0 erros** (`tsc --noEmit`).
- `npm run build`: **92 páginas estáticas compiladas** com Turbopack (Next.js 16.3.6).
- `npm run test:migrations:pg`: **154/154 migrações**, 2 passes, replay completo, detecção de mismatch e clone template.

---

## 5. Fronteiras e não-reivindicações

1. **Armazenamento de arquivos / bytes:** Os documentos de compliance são referências administrativas privadas e declarativas. Não há upload de binários, escaneamento de malware, download público ou comprovação criptográfica de bytes em storage externo.
2. **Atores externos:** A jornada é estritamente de uso interno para o corpo funcional autorizado da empresa (`staff: admin, marcelo, ti`). Não há portal para órgãos reguladores nem logins de terceiros inventados.
3. **Aceite humano:** O aceite humano formal de Marcelo e Andreia permanece restrito à L07 e não foi simulado nem estendido presuntivamente a esta entrega. Homologação em ambiente Windows e implantação em infraestrutura de destino continuam pendentes.
