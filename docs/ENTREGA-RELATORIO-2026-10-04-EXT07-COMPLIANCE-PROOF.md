# Relatório de entrega — EXT-07 compliance corporativo

Data local: **2026-10-04**  
Critério canônico: **“Vencimento gera tarefa e documento privado”**

---

## 1. Base confirmada antes da edição

- PR anterior da trilha: PR #113 (`https://github.com/berger33/gruposegsystemseguranca/pull/113`) com estado **MERGED**.
- Merge commit verificado na árvore: `cda0c184afe5c39a0742df5518bd14a14aaa64a2`.
- `HEAD`: `cda0c184afe5c39a0742df5518bd14a14aaa64a2`.
- `origin/main` (após `git fetch origin main`): `cda0c184afe5c39a0742df5518bd14a14aaa64a2`.
- Branch de trabalho mandatória: `arena/01a10475-gruposegsystemseguranca`.
- Divergência inicial `HEAD...origin/main`: `0 0`.
- Árvore de trabalho inicial: limpa.
- Ledger de migrações inicial: **154 migrações (001–154)**.
- Regra de ouro respeitada: **nenhuma migração 001–154 foi alterada e nenhuma migração 155 desnecessária foi criada**.

---

## 2. Diagnóstico, lacunas identificadas e correções executadas

A avaliação foi conduzida contra cluster descartável PostgreSQL 17.9 gerado sob demanda, servidor HTTP real (`server.mjs`) e fixtures sintéticas com domínios `.invalid`.

### 2.1 Lacunas da camada HTTP e API em EXT-07

1. **Roteamento de API (`server.mjs`)**:
   - `API_PATH_MATCH` não interceptava `pathname.startsWith("/api/ext/compliance/")`, fazendo com que requisições caíssem no fallback SSR do Next.js e retornassem 404 HTML.
   - **Correção**: Adicionada regra explícita `|| pathname.startsWith("/api/ext/compliance/")` no predicado `API_PATH_MATCH`.

2. **Guarda de Autenticação / Autorização (`src/server/ext-compliance-api.mjs`)**:
   - Falta de emissão de status HTTP 401 para requisições anônimas quando `readSession` retornava `null`.
   - **Correção**: Implementada diferenciação rigorosa entre 401 (não autenticado) e 403 (papel staff não autorizado, e.g. `rh`, ou violação de same-origin). Apenas `admin` e `ti` têm acesso a leitura e escrita.

3. **Protocolo e Validação de Entrada**:
   - Rejeição estrita de JSON malformado (400), corpos que excedem 32 KiB (413), UUIDs inválidos (400) e cabeçalhos `Idempotency-Key` ausentes ou com menos de 8 caracteres (400).
   - Derivação estrita de autoria a partir da sessão ativa (`s.identityId`); qualquer campo `created_by_identity` enviado no payload é sumariamente ignorado.

4. **Validação Temporal e Coerência de Vigência**:
   - Vencimento anterior à emissão (`expiry_date < issue_date`), vigência anterior à emissão (`effective_start_date < issue_date`) ou vencimento anterior à vigência (`expiry_date < effective_start_date`) são rejeitados com 400 (`invalid_validity`).

5. **Avaliação Temporal e Criação Idempotente de Tarefas**:
   - Avaliação na data do servidor (`/api/ext/compliance/evaluate`): detecta documentos com vencimento ultrapassado ou dentro da janela de renovação e gera tarefas em `ext_compliance_tasks`.
   - Unicidade estrita: índice único e lock garantem que avaliações repetidas não duplicam tarefas para a mesma tupla `(document_id, validity_period, rule)`.
   - Datas da tarefa: `due_date >= evaluation_date`, respeitando a check constraint `ext_compliance_task_dates`.

6. **Ciclo de Vida e Transições de Tarefas**:
   - Estados: `aberta` → `em_andamento` → `concluida` (exige `result` com mínimo de 10 caracteres) ou `cancelada` (exige `justification` com mínimo de 10 caracteres).
   - Estados terminais (`concluida`, `cancelada`) são imutáveis e recusam reabertura (409).

7. **Renovação e Versionamento Documental**:
   - Criação de nova versão com `replacement_of` apontando para o documento anterior da mesma obrigação.
   - Incremento automático de `version_no`.
   - O documento substituído não é sobrescrito e permanece íntegro no banco.
   - Banco impõe no máximo uma versão atual ativa com `replacement_of IS NULL` por obrigação (`ext_compliance_one_current_version`).

8. **Atomicidade e Rollback em Falha de Auditoria**:
   - Transação única engloba alteração de negócio, gravação em `ext_compliance_events` e inserção em `audit_log`.
   - Se a gravação de auditoria falhar, a transação inteira sofre `ROLLBACK` e a API retorna HTTP 503 (`audit_unavailable`), sem deixar registros órfãos ou inconsistentes.

9. **Compatibilidade e Endurecimento Legado**:
   - `/api/ext/compliance-documents`: leituras autorizadas retornam `items` em array; requisições anônimas retornam 401; papéis não autorizados recebem 403; mutações autorizadas retornam 410 (`legacy_writer_retired`) apontando para `canonical: "/api/ext/compliance/*"`.
   - `src/app/admin/ti/ExtAdvancedClient.tsx`: preservado intacto.
   - Correção no handler legado EXT-10 `handleContinuityPlans` em `src/server/ext-advanced-api.mjs`: corrigida referência `ca.name` para `ca.display_name` e adicionado tratamento seguro de exceção (`503`), mantendo compatibilidade plena com os módulos EXT-08..12.

10. **Interface Visual (`/admin/compliance`)**:
    - Página `/admin/compliance` servida via HTTP real, renderizando `ComplianceWorkspace.tsx` com dados reais do backend e preservação de chave de idempotência para retries seguros.

---

## 3. Decisão canônica e modelo de dados

A jornada canônica do EXT-07 é sustentada pelas seguintes tabelas do PostgreSQL:

1. `ext_compliance_obligations`:
   - Cadastro canônico da obrigação regulatória, licença, certidão, alvará ou seguro.
   - Exige responsável staff ativo (`auth_identities.kind = 'staff' AND status = 'active'`).
   - Registra tipo, título, descrição, fonte declarada, escopo de aplicabilidade, justificativa e criticidade.

2. `ext_compliance_documents`:
   - Representa a referência declarada de conformidade privada (`is_private = true`).
   - **Fronteira declarada**: `file_boundary = 'referencia_declarada_nao_arquivo_verificado'`. Não alega upload de arquivos, bytes, verificação de antivírus, storage em bucket ou download.
   - Rastreia protocolo gerado pelo servidor (`COMP-EXT-YYYYMMDD-XXXX`), datas de emissão/vigência/vencimento e versionamento via `replacement_of` e `version_no`.

3. `ext_compliance_tasks`:
   - Tarefas de regularização geradas pela avaliação temporal do servidor.
   - Vinculadas a obrigação, documento, período de validade e regra.
   - Responsável e autoria estritamente derivados da sessão e perfis válidos.

4. `ext_compliance_events`:
   - Ledger histórico imutável de eventos de conformidade protegidos contra alteração ou exclusão destrutiva por triggers de banco.

---

## 4. Resultados da validação automatizada

Todos os testes foram executados com sucesso nesta sessão:

| Verificação | Comando | Resultado |
|---|---|---|
| Instalação limpa de dependências | `npm ci` | Sucesso (82 pacotes, 0 vulnerabilidades) |
| Verificação estática de tipos TypeScript | `npm run typecheck` | Sucesso (0 erros de tipagem) |
| Teste unitário / focal EXT-07 | `node --test tests/ext07-compliance.test.mjs` | **4/4 aprovados** (0 falhas, 0 skips, 0 todo) |
| Suíte unitária global de regressão | `npm run test:unit` | **442/442 aprovados** (0 falhas, 0 skips, 0 todo) |
| Ledger de migrações PostgreSQL | `npm run test:migrations:pg` | **154/154 migrações verificadas** (561 tabelas, integridade de checksums confirmada) |
| Build de produção Next.js | `npm run build` | **92/92 páginas compiladas** com sucesso (incluindo `/admin/compliance`) |
| **Gate E2E PostgreSQL 17 + HTTP real** | `npm run test:ext07-compliance:pg` | **52/52 subtestes aprovados** (Mínimo exigido: 35; 0 falhas, 0 skips, 0 todo; duração: ~17s) |

### Resumo detalhado dos 52 subtestes do gate EXT-07:

1. Exigência de PostgreSQL real descartável e recusa de skip silencioso.
2. 401 para anônimo em `/api/ext/compliance/obligations`.
3. 401 para anônimo em `/api/ext/compliance/documents`.
4. 403 para papel não autorizado (`rh`) em leitura de obrigações.
5. 403 para papel não autorizado (`rh`) em mutações.
6. 200/201 autorizando staff `admin` e `ti` para leitura e escrita.
7. Rejeição de identidade inexistente ou não-staff como responsável.
8. Autoria estritamente derivada da sessão (ignora `created_by_identity` forjado).
9. Controle exclusivo de protocolo, versão e status inicial pelo servidor.
10. Exigência de same-origin em mutações (cross-origin recebe 403).
11. Ausência de rota pública aberta para documentos privados de compliance.
12. 400 para JSON malformado.
13. 413 para corpo com tamanho superior ao limite.
14. 400 para UUIDs malformados na URL.
15. 400 para requisição sem cabeçalho `Idempotency-Key`.
16. 400 para `Idempotency-Key` com menos de 8 caracteres.
17. Validação de campos obrigatórios no cadastro de obrigações.
18. Preservação de tipo, fonte, escopo, justificativa, regra e criticidade no banco.
19. Listagem de obrigações informando fonte canônica, denominador e declaração de ausência.
20. 404 para obrigação inexistente.
21. 404 para documento associado a obrigação inexistente.
22. Gravação de documentos como referências estritamente privadas no PostgreSQL.
23. Minimização de projeção e declaração de fronteira documental sem upload.
24. Projeção detalhada de documento com allowlist estrita.
25. Ausência de seed legado no cluster PostgreSQL limpo.
26. Recusa de sobrescrita destrutiva de documento canônico.
27. Rejeição de vencimento anterior à data de emissão.
28. Rejeição de vigência anterior à data de emissão.
29. Rejeição de vencimento anterior à data de início de vigência.
30. Avaliação temporal na data do servidor detectando vencimentos e gerando tarefas.
31. Idempotência em retry idêntico de criação de obrigação (não duplica linhas).
32. 409 em reuso de chave com payload divergente.
33. Concorrência real sem duplicação de registros.
34. Imutabilidade dos eventos históricos em `ext_compliance_events`.
35. Geração de tarefa vinculada a obrigação, documento, período e regra.
36. Avaliação repetida não duplica tarefas (unicidade por documento, período e regra).
37. Transição de tarefa para `em_andamento`.
38. 409 ao tentar iniciar tarefa já em andamento.
39. Conclusão de tarefa exigindo resultado válido com no mínimo 10 caracteres.
40. Imutabilidade de estado terminal: recusa de reabertura de tarefa concluída.
41. Cancelamento de tarefa exigindo justificativa e tornando-se terminal.
42. Renovação criando novo documento com `replacement_of` e versão incrementada.
43. Rejeição de `replacement_of` apontando para obrigação divergente ou inexistente.
44. Banco impondo unicidade da versão atual ativa não cancelada.
45. Falha no `audit_log` retornando 503 com rollback atômico integral.
46. Leitura legada `/api/ext/compliance-documents` retornando 200 com array `items`.
47. Rota legada retornando 401 para anônimos e 403 para papéis não autorizados antes do 410.
48. Mutação legada cross-origin recebendo 403 antes do 410.
49. Mutação legada autorizada recebendo 410 com indicação da rota canônica.
50. Preservação do componente `ExtAdvancedClient.tsx`.
51. Handlers legados EXT-08..12 operacionais e sem regressão.
52. Rota visual `/admin/compliance` servida via HTTP real.

---

## 5. Fronteiras, limites e não-reivindicações

- **Sem dados reais**: Foram utilizadas exclusivamente fixtures sintéticas e e-mails no domínio reservado `.invalid`.
- **Sem upload ou bytes de arquivos**: Referências documentais de compliance são metadados privados declarados. Não há alegação de armazenamento binário em disco, bucket S3, hash criptográfico de arquivos ou análise de antivírus.
- **Sem integrações externas regulatórias ou órgãos públicos**: O sistema não acessa nem alega consultar APIs da Receita Federal, cartórios, seguradoras ou órgãos emissores.
- **Sem aceite humano fictício**: Não há simulação de aprovações externas; regras de transição obedecem a lógica do backend.
- **Limpeza do ambiente**: O cluster PostgreSQL temporário e diretórios temporários criados pelos testes são completamente destruídos no bloco `finally`.
- **Isolamento de configuração**: `next-env.d.ts` e `tsconfig.json` permanecem intactos e fiéis ao repositório original.
