# L07 — FIN-11 · integração contábil/fiscal mediante provedor

**Sessão:** `arena/01a0f82e-gruposegsystemseguranca`

**Base confirmada:** `origin/main` e HEAD inicial em `f75d3ecb8812ad62292f3db20ceefa8e6311b943`, merge da PR #54 (FIN-10). A confirmação foi feita com `git fetch origin` e `git merge-base --is-ancestor origin/main HEAD` antes de qualquer edição. Nenhum merge foi realizado nesta sessão.

**Escopo:** somente FIN-11. FIN-01..10 foram preservados e revalidados. FIN-12..16 e ADM-01..12 **não** foram iniciados.

## Diagnóstico da implementação preexistente

O rascunho `079-fin09-10-11-12-resultado-despesa-fiscal-gateway.sql` já criava `fin_fiscal_providers`, `fin_fiscal_obligations` e `fin_fiscal_documents`, e `src/server/fin-management-api.mjs` já expunha três rotas. A auditoria encontrou as seguintes lacunas:

| Área | Situação encontrada |
|---|---|
| `fin_fiscal_providers` | `provider_type` com `DEFAULT 'nfse'`; sem código canônico, sem ambiente declarado, sem idempotência; `config` aceitava qualquer chave, inclusive credenciais; `status` mudava por `COALESCE($1,status)`, sem máquina de estados. |
| `fin_fiscal_obligations` | `obligation_type` com `DEFAULT 'nfse'` — a nota única era literalmente o padrão; `rule` era texto livre digitado pelo cliente HTTP; `contract_id`/`client_account_id` opcionais; `is_determined` podia ser ligado sem regra correspondente; `PATCH` aceitava qualquer `status`; sem idempotência e sem histórico. |
| `fin_fiscal_documents` | Só existia `POST`, sem transições; `document_type` com `DEFAULT 'nfse'` e independente da obrigação; `file_url` aceitava URL externa; sem idempotência; não exigia obrigação determinada nem provedor configurado. |
| Handlers fiscais | Escrita fora de transação; `auditLog` em `try{}catch{}` (falha silenciosa, não fail-closed); respostas com `details: e.message`, expondo mensagem SQL; validação de UUID/valores ausente. |
| `server.mjs` | Rotas registradas e presentes em `API_PATH_MATCH`, porém sem rota de catálogo de regras nem de histórico. |
| Workspace financeiro | Nenhuma aba fiscal em `/admin/financeiro`; apenas um formulário de diagnóstico em `/admin/ti` que gravava obrigação com tipo escolhido à mão. |
| Migrations 079/128/129 | 079 é o rascunho acima; 128 (FIN-09) e 129 (FIN-10) são hardenings aditivos e serviram de modelo (constraints `NOT VALID`, triggers de guarda, histórico imutável). Nenhuma delas foi alterada. |
| Testes e gate L07 | 18 subtestes, nenhum cobrindo FIN-11. |

## Entrega

- **Schema:** migration **exclusivamente aditiva** `130-fin11-fiscal-hardening.sql`. Nenhuma migração histórica foi tocada e nenhum tipo existente foi alterado (o migrador roda cada arquivo em transação, então `ALTER TYPE ... ADD VALUE` foi deliberadamente evitado).
  - **`fin_fiscal_activity_rules`** (nova): catálogo canônico que liga **atividade → obrigação** com regra explícita (`rule_reference` + `rule_description` + `jurisdiction`). Conteúdo imutável por trigger; só a vigência (`is_active`) muda. Sementes cobrem obrigações **diferentes**: vigilância/portaria/monitoramento → `nfse`; venda a contribuinte → `nfe`; venda presencial a consumidor final → `nfce`; transporte de valores interestadual → `cte`; locação de equipamento sem operador → `outro`.
  - **`fin_fiscal_history`** (nova): histórico imutável de provedor, obrigação e documento (`UPDATE`/`DELETE` bloqueados por trigger).
  - **Provedor:** colunas `provider_code`, `environment`, `supported_obligations`, `idempotency_key`; `environment = 'sandbox'` obrigatório; trigger com máquina de estados `nao_configurado ⇄ configurado ⇄ falha`, campos de identidade imutáveis, `error_sanitized` exigido somente em `falha` e **recusa de credenciais** (`token`, `secret`, `password`, `senha`, `certificate`, `certificado`, `private_key`).
  - **Obrigação:** colunas `activity_rule_id`, `determination_rule_reference`, `cancel_reason`, `cancelled_at`, `idempotency_key`; contrato, conta e regra obrigatórios; transições `pendente → determinada → cancelada` (e `pendente → cancelada`); o banco recusa `obligation_type` que não seja o da regra da atividade e `activity_type` que não seja o `activity_code` da regra; a determinação precisa gravar exatamente a `rule_reference` da regra vigente.
  - **Documento:** colunas `idempotency_key`, `simulated`, `cancel_reason`; obrigação e provedor obrigatórios; `is_sandbox` e `simulated` sempre verdadeiros; `file_url`/`storage_key` restritos a `synthetic://` e `synthetic/`; transições `rascunho → emitido|erro|cancelado`, `erro → emitido|cancelado`, `emitido → cancelado`; o tipo do documento tem de ser o da obrigação determinada **e** estar entre as obrigações suportadas pelo provedor; `emitido` exige resposta com `mode = 'synthetic'`.
- **Provedor e obrigação separados:** o provedor declara quais obrigações consegue tratar; a obrigação é decidida pela atividade. Um documento só existe quando as duas decisões coincidem — se o provedor não suporta a obrigação determinada, a resposta é `provider_does_not_support_obligation`.
- **Nenhuma nota única assumida:** a API **recusa** `obligation_type` enviado pelo cliente quando diverge da regra (`409 obligation_type_determined_by_activity_rule`) e **recusa** `document_type` divergente da obrigação (`409 document_type_determined_by_obligation`). O tipo nunca é adivinhado: ele é derivado da regra canônica.
- **Nenhuma emissão fiscal real:** não há cliente HTTP para provedor externo, nem credencial, nem certificado. O estado `emitido` significa “registro sintético concluído pelo simulador local”; a `provider_response` é gerada em memória com `mode: "synthetic"`, `simulated: true`, `emission: "none"`. As respostas da API retornam `emitted: false`.
- **API:** `GET /api/fin/fiscal-activity-rules`, `GET/POST/PATCH /api/fin/fiscal-providers`, `GET/POST/PATCH /api/fin/fiscal-obligations`, `GET/POST/PATCH /api/fin/fiscal-documents` e `GET /api/fin/fiscal-history` (com os aliases históricos `/api/hr/fin-fiscal-*`, registrados também em `API_PATH_MATCH`). Toda escrita exige sessão de papel financeiro, same-origin, UUIDs válidos, motivo de 10 a 1000 caracteres e chave de idempotência de 8 a 200 caracteres.
- **Transacional e fail-closed:** criações e transições usam `pool.connect()`, `BEGIN`, `FOR UPDATE`, gravam o histórico e chamam `auditLog({ client })` no mesmo cliente; o `COMMIT` só acontece depois da auditoria. Auditoria indisponível devolve `503 {"error":"audit_unavailable"}` e reverte tudo.
- **Respostas sem detalhes SQL:** erros `23514` são traduzidos por uma **allowlist** de códigos de domínio conhecidos; qualquer outra coisa vira `invalid_fiscal_transition` ou `internal`. Nenhuma mensagem, `constraint`, `detail` ou posição vinda do PostgreSQL chega ao cliente.
- **UI real:** nova aba **Fiscal / Obrigações** em `/admin/financeiro` (`FiscalWorkspace.tsx`): mostra o catálogo de regras, cadastra provedor sandbox com as obrigações suportadas, exibe a obrigação determinada antes de criar, e percorre determinação e registro sintético. A tela de diagnóstico `/admin/ti` deixou de gravar fiscal e passou a ser somente leitura, apontando para o caminho canônico.
- **Gate L07:** dois subtestes novos (HTTP e Chromium) elevam o gate de 18 para **20** casos.

## Evidência reproduzível

Todos os gates PostgreSQL usam cluster embutido descartável e somente dados sintéticos; o runner recusa banco fornecido pelo ambiente. O L07 usa HTTP real, sessão/cookie real, Next local e Chromium empacotado pelo Playwright.

### Baseline antes de editar

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 196/196 |
| `npm run test:l07-delivery:pg` | 18/18, exit 0 |

### Validação final

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrations 001–130 |
| `npm test` | 196/196 |
| `npm run test:l07-delivery:pg` — rodada 1 | 20/20, exit 0 |
| `npm run test:l07-delivery:pg` — rodada 2 consecutiva | 20/20, exit 0 |
| `npm run test:migrations:pg` | verde, 130/130 checksums em dois passes; cenário negativo de checksum rejeitado e restaurado |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run build` | exit 0 |
| `git diff --check` | limpo |

Durante o desenvolvimento, uma execução intermediária do L07 terminou 18/20: `node-pg` devolve array de enum como texto (`'{nfse,nfe}'`), o que quebrava a asserção de obrigações suportadas e a renderização da tabela de provedores. A API passou a normalizar o array e a UI ficou defensiva; as duas rodadas finais foram feitas depois dessa correção. O gate L03 falhou uma vez por tempo de inicialização e passou nas execuções seguintes, sem relação com esta fatia.

### O que o gate FIN-11 prova

Subteste HTTP:
- 401 sem sessão, 403 para papel não financeiro, 403 para origem externa;
- o catálogo determina `nfse`, `nfe`, `nfce`, `cte` e `outro` — nenhuma nota única;
- provedor recusa código inválido, lista vazia de obrigações e credenciais na configuração; idempotência devolve 409; transição inexistente e repetição do mesmo estado são recusadas;
- a obrigação recusa `rule` enviada pelo cliente, atividade inexistente e `obligation_type` forçado; o mesmo contrato gera `nfse`, `nfe`, `cte` e `outro` conforme a atividade; idempotência e duplicidade por contrato/atividade devolvem 409;
- documento exige obrigação determinada, provedor configurado que suporte o tipo, e metadados sintéticos; URL externa é recusada; transições inválidas devolvem 409;
- o banco repete as garantias para escrita direta (tipo imutável, referência de regra conferida, ambiente imutável, `simulated` travado, regra de atividade imutável);
- histórico imutável a `UPDATE` e `DELETE`;
- auditoria indisponível devolve 503 sem `details` e reverte provedor, obrigação e transição por completo;
- nenhum documento com `simulated = false` existe ao final.

Subteste Chromium: o papel financeiro vê o catálogo (`venda_equipamento_seguranca → nfe`, `vigilancia_patrimonial → nfse`), cadastra o provedor sandbox, configura-o, cria a obrigação de venda — que a interface determina como **NF-e, não NFS-e** —, determina, prepara o documento sintético e conclui o registro simulado. O banco confirma `simulated = true`, `is_sandbox = true` e `provider_response.emission = "none"`.

## Limitações e fronteiras explícitas

- Não existe integração com prefeitura, SEFAZ, provedor de NFS-e/NF-e, certificado digital A1/A3, ERP contábil ou SPED. Nada é transmitido para fora do processo.
- O estado `emitido` reaproveita o enum histórico `fin_fiscal_doc_status` e significa **registro sintético concluído**, nunca documento fiscal válido. A migração é aditiva e o enum não foi alterado.
- O catálogo de atividades é um ponto de partida sintético com referência legal citada para rastreabilidade; a vigência real por município/estado e a parametrização tributária (alíquota, retenção, CFOP, código de serviço) não fazem parte desta fatia.
- Linhas criadas pelo rascunho 079 continuam legíveis: as constraints novas são `NOT VALID`, de modo que valem integralmente para toda escrita nova e toda alteração, sem reescrever histórico.
- FIN-12 (boletos/Pix/gateway) permanece no rascunho 079, sem hardening e fora do gate.
