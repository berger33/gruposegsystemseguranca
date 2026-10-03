# Relatório de entrega — EXT-05 Qualidade

**Data local:** 03/10/2026

**Classificação:** implementação local + validação automática + gate dedicado HTTP/PostgreSQL. Não é aplicação em destino, aceite humano, homologação Windows nem bateria pesada integral.

## 1. Base confirmada antes da edição

A PR #99 foi consultada por `gh pr view`: estado **MERGED**, head da feature `0c3a560d9ff1d4622a58e3fd306fb35bd4b26e6a`, merge em `2026-10-03T19:15:46Z` e merge commit **`ba2202ff6655f425edf405afc42de7ce3786a2a0`**. Todos os checks retornados estavam `SUCCESS`. Após `git fetch origin main`, `HEAD` e `origin/main` eram exatamente esse SHA, `git rev-list --left-right --count HEAD...origin/main` retornou **0 0**, e `git status --porcelain` estava vazio. A branch fixa da sessão é `arena/01a10335-gruposegsystemseguranca`.

## 2. Estado anterior e lacunas reproduzidas por execução

A base mesclada tinha as tabelas `ext_quality_nonconformities` e `ext_quality_actions` da migração 085, handlers legados em `src/server/ext-api.mjs` e UI em `src/app/admin/ti/ExtClient.tsx` sem rota funcional comprovada. API, tabela ou componente órfão não foram contados como jornada.

Um probe temporário, depois apagado, executou **9/9** observações contra um arquivo da base `ba2202f`, em PostgreSQL 17 descartável com migrações 001–150 e servidor HTTP real. Usou somente fixtures sintéticas e `.invalid`:

1. `/api/ext/quality/nonconformities`: **404**;
2. `/admin/qualidade`: **404**;
3. legado: anônimo **401** e papel `rh` também **401**, sem distinção 403;
4. mesmo retry: **201/201**, duas linhas persistidas;
5. salto direto até `encerrada`: **200**;
6. encerramento aceito com `verification` em texto livre e sem evidência estruturada; `responsible_identity` apenas coincidia com o criador, sem regra canônica vigente de encerramento;
7. `recurrence_count=77` vindo do corpo foi persistido; campos críticos eram atualizados diretamente;
8. trigger que derrubava `audit_log`: resposta **201** e escrita de negócio persistida (sem rollback);
9. tabelas históricas canônicas de causa/verificação não existiam; cluster inicialmente tinha zero ações. Esse zero prova **ausência de seed no cluster descartável**, não ausência de dados operacionais em qualquer ambiente real.

Também se confirmou por código executado que o legado sobrescrevia causa/ação/verificação no registro principal, aceitava IDs/vínculos do corpo e não tinha ledger concorrente. Nenhum banco real foi acessado.

## 3. Implementação

- UI real: `/admin/qualidade`, com loading, vazio, erro/retry, sucesso somente após resposta, chave de idempotência preservada após falha e operações de NC, causa, ação, conclusão/cancelamento, verificação, encerramento, reabertura e reincidência.
- API canônica: `/api/ext/quality/*`, módulo `src/server/ext-quality-api.mjs`.
- Papéis: `admin`, `marcelo`, `ti`, derivados da sessão staff canônica. Anônimo 401; papel autenticado sem direito 403; mutações same-origin.
- Autoria sempre da sessão; UUID e corpo JSON limitado validados; vínculos derivados da URL/registro. Campos de autoria, contador e vínculo do corpo não governam a escrita.
- Migração única e aditiva `151-ext05-quality-journey.sql`; 001–150 não foram alteradas. Linhas anteriores ficam `origin='registro_legado'`, sem autoria retroativa e sem seed.
- O componente órfão `src/app/admin/ti/ExtClient.tsx` foi preservado sem alteração.

## 4. Máquinas de estado e histórico

### Não conformidade

`aberta → em_analise → em_acao_corretiva → verificacao → encerrada`. `encerrada` não sai por transição genérica. Reabertura é operação formal que produz registro imutável com fechamento anterior, autor, data e justificativa; depois: `reaberta → em_analise`. API e trigger PostgreSQL recusam saltos.

### Causa

`ext_quality_causes` registra NC da URL, descrição, fonte/fundamento declarado, autor e data do servidor. Registros são imutáveis; o modelo admite substituição explícita por novo registro (`replaces_cause_id` + motivo), sem edição destrutiva. Não existe causa automática.

### Ação corretiva

Cada ação tem NC canônica, descrição, responsável staff ativo, criador, e prazo somente quando acompanhado por fonte e data-base. Estado inicial `pendente`; terminais `concluida` (autor e timestamp do servidor) ou `cancelada` (autor, timestamp e justificativa). Terminal não reabre; campos canônicos não são editáveis.

## 5. Encerramento: evidência e responsável

O critério **“Encerrar apenas com evidência e responsável”** é imposto antes da escrita na API e novamente no trigger do PostgreSQL. Exige simultaneamente:

- responsável canônico vigente na NC;
- pelo menos uma causa histórica;
- pelo menos uma ação canônica concluída;
- nenhuma ação canônica obrigatória pendente;
- verificação estruturada da mesma NC com resultado `eficaz`, autor/data do servidor, tipo, referência e fonte da evidência;
- fechamento explícito com autor/data e nota.

`ext_quality_verifications` e `ext_quality_closures` são imutáveis. A referência de evidência é **declarada e rastreável**: não é chamada de upload, arquivo recebido, conteúdo verificado ou armazenamento confirmado.

## 6. Reincidência

`ext_quality_recurrences` liga explicitamente predecessor e nova NC, com justificativa, critério/fonte declarados e autor/data. A nova NC é criada na mesma transação. O navegador não incrementa contador: `recurrence_count_derived` é calculado dos fatos canônicos; o campo legado da 085 não governa a API.

## 7. Transação, auditoria, idempotência e legado

Toda mutação executa autenticação/papel/same-origin, validação, `BEGIN`, replay sob lock, lock/revalidação canônica, negócio, evento imutável, `audit_log` e `COMMIT`. Ledger único `(created_by_identity,idempotency_key)` protege concorrência; replay idêntico não duplica e fingerprint divergente retorna 409. Falha de `audit_log` retorna **503** e reverte negócio e evento.

As rotas legadas exatas preservam leitura autorizada e alias `items`; mutações retornam 410 somente após autenticação, papel e same-origin. A autoridade de escrita legada foi removida de `ext-api.mjs`. Não há dois writers.

## 8. Resultados exatos

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0; 82 pacotes; 0 vulnerabilidades |
| sintaxe dos novos `.mjs` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | **5/5**, 001–151 |
| `npm run typecheck` | exit 0 |
| `node --test tests/ext05-quality.test.mjs` | **6/6**, 0 fail/skip/todo |
| `npm test` | **430/430**, 0 fail/skip/todo |
| `npm run build` | exit 0; **90 páginas**, incluindo `/admin/qualidade` |
| `npm run test:migrations:pg` | primeira aplicação e replay; **151/151** checksums; checksum negativo 006 rejeitado; clone/restauração **151/151**, 556 tabelas |
| `npm run test:ext05-quality:pg` | **33/33**, 0 fail/skip/todo; mínimo autoauditado 30; PostgreSQL 17 + HTTP real |
| `git diff --check` | exit 0 (registrado na revisão final) |

O gate EXT-05 cobre 401/403, same-origin, corpo forjado, idempotência e conflito, estados/terminais, causa histórica, ações e responsável, conclusão/cancelamento, verificação/evidência, pré-condições individuais do fechamento, fechamento válido, trava API/banco, reabertura formal, reincidência/contador derivado, evento imutável, legado e 503/rollback. A primeira execução do gate, antes da inclusão do namespace na allowlist central de APIs, reprovou 27/33 com 404; a causa de produto foi corrigida em `server.mjs` e a repetição integral passou 33/33. Asserções e timeout não foram enfraquecidos.

## 9. O que não cobre EXT-05

Estático, typecheck, teste unitário, build e teste de migrações **não substituem** o gate dedicado. Também não cobrem EXT-05 os gates EXT-02/03/04, L02–L08, tenant, staff-auth, client-access, CLI v2, backup/restore, RAG e demo-local. A bateria pesada integral não foi executada nem apresentada como necessária para provar esta fatia. Os seis gates sem workflow (`cli-v2:pg`, `staff-auth:pg`, `client-access:pg`, `backup-restore:pg`, `l02-delivery:pg`, `l03-delivery:pg`) permanecem fora do escopo.

## 10. Fronteiras e pendências

A jornada é exclusivamente interna de staff. EXT-05 não exige ator externo e nenhum login, grant, canal, upload ou aceite externo foi inventado. Dados reais, SMTP e integrações externas não foram usados. Permanecem distintos e pendentes: aplicação em destino, bateria pesada integral, revisão/aceite humano e homologação Windows. Não houve aceite humano novo; Marcelo/Andreia continuam valendo somente para L07. As condições comerciais pendentes de EXT-03 e EXT-04 não foram resolvidas.
