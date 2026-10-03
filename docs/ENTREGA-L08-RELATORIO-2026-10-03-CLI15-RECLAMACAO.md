# L08 / CLI-15 — reclamação sobre colaborador em canal restrito

Data: 2026-10-03. Base confirmada: `main` e PR #94 (`1d41160366266ab57a07b82f2b1a3e346e8bd528`), estado `MERGED`, divergência inicial 0/0. Branch desta sessão: `arena/01a101d4-gruposegsystemseguranca`.

## Lacunas reproduzidas antes de implementar

A migração 093 criou as tabelas (`cli_employee_complaints`, mensagens, evidências, histórico imutável e `cli_employee_complaint_hr_shares`) e a API `src/server/employee-complaint-api.mjs`, mas não havia jornada cliente funcional:

- a API era exclusivamente de sessão staff (`readSession`); cookie de cliente não produz sessão staff, logo nenhum cliente conseguia abrir ou listar nada — o componente `EmployeeComplaintClient.tsx` em `/admin/ti` é órfão administrativo, não jornada cliente;
- a listagem staff devolvia **todas** as reclamações (título incluído) para qualquer papel autenticado, sem canal restrito;
- o RH recebia `SELECT *` — descrição, conta e identidade do cliente — contrariando o compartilhamento mínimo;
- o POST confiava em `client_account_id`, `employee_id`, `contact_id` e `contract_id` vindos do corpo;
- não havia transação (reclamação, histórico e auditoria em escritas separadas), não havia `auth_access_audit`, não havia idempotência e o hash de referência nunca era calculado (`require` em módulo ESM, engolido por `catch`).

## Implementação

- **Migração aditiva `146-l08-cli15-employee-complaint-portal.sql`** (001–145 imutáveis; próxima livre 147): `origin` (`registro_interno`/`portal_cliente`), `idempotency_key` + `request_fingerprint` com unicidade parcial por identidade, constraints `NOT VALID`, índice da jornada do portal e ações `employee_complaint_list/view/open` acrescentadas ao CHECK de `auth_access_audit` preservando a expressão anterior. Nenhuma autoria retroativa: linhas legadas permanecem `registro_interno` e fora da jornada do portal.
- **API cliente nova `src/server/client-employee-complaint-api.mjs`**, rotas `/api/client/employee-complaints` (GET/POST) e `/api/client/employee-complaints/<uuid>` (GET), autorizada exclusivamente por `readClientSession` (sessão `auth_sessions`) com same-origin: autoria, conta (validada contra `client_access_grants` ativo e conta ativa), UUID e protocolo derivados no servidor; campos forjados do corpo ignorados; A≠B e inexistente respondem o mesmo `403 {error:"forbidden"}` com `authorization_denied` auditado.
- **Compartilhamento mínimo com RH**: na mesma transação da abertura, somente `protocol`, `category`, `severity` e `status` são registrados campo a campo em `cli_employee_complaint_hr_shares`, cada um com justificativa; descrição, identidade e conta do cliente não são repassadas e isso é declarado na UI.
- **Atomicidade**: abertura, histórico imutável (abertura + registro do envelope RH) e `auth_access_audit` na mesma transação; falha da auditoria devolve `503` com rollback. Replay idêntico devolve a mesma reclamação (`replayed: true`); reuso da chave com conteúdo divergente devolve `409 idempotency_key_reused`.
- **Hardening da rota administrativa legada** (não é atalho para cliente): papéis staff fora de admin/ti/rh recebem `403 forbidden_restricted_channel` em listagem, detalhe, mensagens e evidências; RH vê somente reclamações com `is_shared_with_hr=true`, na projeção mínima, e apenas mensagens/evidências `is_hr_visible`; detalhe não compartilhado responde 404; POST staff restrito a admin/ti.
- **UI real `/cliente/app/reclamacoes-colaborador`**: carregamento, vazio, erro com retry, confirmação somente após resposta real do servidor (protocolo devolvido), chave de idempotência preservada em falha de transporte e seção de transparência "o que o RH recebe — e por quê". Navegação do portal atualizada ("Canal restrito").

## Validação automática executada

- `npm ci`: OK.
- `node scripts/qa-wave0-static.mjs`: 5/5 (001–146).
- `npm run typecheck`: OK.
- `node --test tests/cli15-employee-complaint.test.mjs`: **15/15** (registrado em `test:unit`).
- `npm test`: **245/245**.
- `npm run build`: exit 0, **85 páginas**, rota `/cliente/app/reclamacoes-colaborador` listada.
- `npm run test:l08-delivery:pg`: **51/51** em PostgreSQL descartável — aplica as migrações 001–146 (prova que a 146 aplica limpa) e preserva CLI-01..05; **este gate não cobre a jornada CLI-15 e não é apresentado como prova dela**.
- `npm run test:migrations:pg`: **146/146** em PostgreSQL descartável, dois passes (replay integral "Already applied"), checksum negativo deliberado rejeitado e clone TEMPLATE preservado (532 tabelas).
- `npm run test:demo-local:pg` (QA-HOM-008/009): passou com reinício persistente sintético, escopo A/B e cópia fria/restore isolados.

### Correção pós-abertura da PR (mesma fatia)

A primeira rodada de CI da PR #95 falhou nos workflows L04..L07 (passo "Migrations, replay and checksum") e no `static-and-smoke` (passo QA-HOM-008): a guarda de manifesto de `scripts/migrate-site-visual.mjs` ainda exigia exatamente 145 arquivos (e o log final dizia "001–145"), defasada após a adição da 146 — o mesmo tipo de defasagem já corrigido na fatia CLI-12 ("001–140"). A correção atualizou somente a guarda/log para 146; nenhuma migração foi alterada. Reprodução local antes da correção (`migration_manifest_mismatch`) e prova local depois: `test:migrations:pg` 146/146 e `test:demo-local:pg` OK, conforme acima. O gate L08 (`client-portal-postgres-browser`) já passava porque aplica as migrações lendo o diretório diretamente.

O teste dedicado prova, no contrato implementado: sessão cliente obrigatória, same-origin, isolamento A≠B auditado em lista e detalhe, escopo por identidade+conta+origem, projeção sem campos internos, corpo forjado ignorado, transação única (negócio+histórico+envelope RH+auditoria), 400 sem `Idempotency-Key`, replay sem duplicação, 409 divergente, 503+rollback em falha da auditoria, e o fechamento do canal restrito na rota legada (401/403/projeção mínima RH/404). Sem skip, sem assert enfraquecido, sem timeout aumentado, sem dados reais e sem SMTP real.

## Fronteiras e aceite

Classificação: **implementação local + validação automática rápida** (estática, unitária, build e gate legado em PostgreSQL descartável). Não é a bateria pesada HTTP/DB dedicada de CLI-15, não é aplicação em destino, não é aceite humano e não é homologação Windows — todos permanecem pendentes por decisão do proprietário. O aceite humano anterior de Marcelo e Andreia refere-se somente ao L07 e não é renovado aqui. CLI-01..14 foram preservadas (CLI-14 não foi reaberta; `auth_*` continuam as únicas fontes de autenticação e as tabelas v2 não autenticam). EXT-01..17 e órfãos continuam não promovidos. Após CLI-15 permanecem pendentes a bateria pesada integral, a aplicação final em destino e a homologação Windows.
