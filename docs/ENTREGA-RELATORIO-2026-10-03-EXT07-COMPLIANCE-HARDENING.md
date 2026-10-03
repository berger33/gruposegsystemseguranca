# Relatório de entrega — EXT-07 Compliance hardening — 2026-10-03

## 1. Base confirmada antes de editar

Confirmações executadas no checkout, sem inferir SHAs:

| Item | Resultado |
|---|---|
| PR anterior | #103 `MERGED` em `2026-10-03T20:48:13Z` |
| URL | https://github.com/berger33/gruposegsystemseguranca/pull/103 |
| Merge commit real | `eff0bbddb5d5681d2612010e4349cfb9ff61234b` |
| Feature commit | `3cf218d949e3ce04fe49e82ce2dcd1ca6b874584` |
| Feature subject | `feat(ext07): entregar jornada canonica de compliance` |
| Branch | `arena/01a103a9-gruposegsystemseguranca` |
| `HEAD` inicial | `eff0bbddb5d5681d2612010e4349cfb9ff61234b` |
| `origin/main` após fetch | `eff0bbddb5d5681d2612010e4349cfb9ff61234b` |
| Merge-base | `eff0bbddb5d5681d2612010e4349cfb9ff61234b` |
| Divergência inicial | `0 0` |
| Árvore inicial | limpa |
| Última migração inicial | `153-ext07-compliance-journey.sql` |

O clone é raso, por isso o objeto da feature foi buscado explicitamente pelo SHA informado pela API da PR. A PR estava mesclada e a branch partia exatamente da `main`; não houve base ambígua.

## 2. Probe obrigatório anterior à implementação

O probe recusou `DATABASE_URL` e `DATABASE_MIGRATION_URL` herdadas, criou PostgreSQL 17 descartável, aplicou 001–153, iniciou o servidor HTTP real, criou identidades `.invalid`, fez login staff real e removeu arquivos/cluster temporários. Não houve acesso a banco de operador.

### Lacunas reproduzidas

1. `/admin/compliance` respondia 200, mas a rota canônica `/api/ext/compliance/*` respondia **404**: ela existia no roteador interno, porém não estava no `API_PATH_MATCH`, então era enviada ao Next.
2. Como consequência, anônimo, RH e TI recebiam o mesmo 404 nas rotas canônicas; 401/403, same-origin, criação, retry, concorrência, avaliação e rollback não eram exercitáveis por HTTP.
3. Dos aliases exatos, `/api/ext/compliance-documents` respondia GET 200 e POST 410. Os três aliases sob `/api/*/hr/` eram interceptados antes pelo guard genérico de RH e respondiam 403 ao TI sem `employees.read`.
4. A leitura legada fazia `SELECT *` e expunha todas as colunas, inclusive `document_number`, `file_url`, `storage_key`, `declared_reference` e `reference_source`.
5. O PostgreSQL aceitava documento canônico já vencido com estado `vigente`.
6. A trigger da 153 impedia sobrescrever `expiry_date`, mas aceitava sobrescrever destrutivamente `effective_start_date`.
7. Não havia rota de renovação; `POST /api/ext/compliance/documents/:id/renew` respondia 404.
8. A API continha regex de data com barra invertida duplicada; mesmo depois de tornar a rota alcançável, datas civis válidas seriam recusadas.
9. Já estavam presentes e foram observadas as travas de evento imutável, terminal de tarefa, requisito de responsável/resultado no banco e unicidade da tarefa. Elas não foram apresentadas como prova HTTP.
10. O cluster limpo tinha zero obrigação e zero documento canônico: não havia seed.
11. A fronteira de referência sem bytes era verdadeira no registro probe (`file_name`, `file_url` e `storage_key` nulos), mas a listagem legada não a protegia por projeção.

## 3. Estado real da 153

A 153 criou `ext_compliance_obligations`, adicionou metadados canônicos a `ext_compliance_documents`, criou `ext_compliance_tasks` e `ext_compliance_events`, mais triggers parciais. Ela preservou linhas antigas como `registro_legado` e não criou tabela documental paralela. As lacunas eram principalmente de roteamento HTTP, validação temporal completa, projeção legada e renovação/versionamento.

A migração 153 não foi alterada. A única migração desta entrega é `154-ext07-compliance-hardening.sql`.

## 4. Decisões canônicas e fronteira de ator

- **Fonte documental:** `ext_compliance_documents`.
- **Fonte de obrigação:** `ext_compliance_obligations`.
- **Fonte da tarefa:** `ext_compliance_tasks`. Não foi reutilizada tarefa CRM/RH/operação porque ela não possui o vínculo documental, período, regra, fatos e unicidade exigidos para esta jornada.
- **Evento/idempotência:** `ext_compliance_events`.
- **Ator:** exclusivamente staff interno com sessão canônica e papel `admin|ti`. Não há ator externo, portal regulatório ou confirmação de órgão público.
- **Responsável:** identidade `staff`, ativa e com papel autorizado, revalidada na transação.
- **Aplicabilidade:** declaração interna rastreável; não é parecer ou validação jurídica.

## 5. Migração 154

A 154 é aditiva, sem seed, e reforça:

- `is_current`, `replacement_of`, `superseded_by`, justificativa, autor e timestamp da renovação;
- uma única versão atual por obrigação e uma única sucessora por versão;
- proibição de ciclo na cadeia;
- privacidade canônica e proibição estrutural de `file_name`, `file_url` e `storage_key` em referência canônica;
- emissão, início e vencimento obrigatórios e ordenados;
- estado temporal derivado de `CURRENT_DATE` e antecedência da obrigação;
- imutabilidade dos fatos/validade da versão anterior;
- responsável obrigatório, fatos JSON, data-base e autoria nas tarefas;
- transições `aberta -> em_andamento -> concluida` e cancelamento motivado a partir de aberta/em andamento;
- terminais imutáveis;
- payload e formato da chave de idempotência;
- FKs de autoria adicionadas como `NOT VALID` para preservar legado.

Comparações de estado usam `::text` quando atravessam enum/TEXT. O índice incompleto da 153 foi corrigido para representar efetivamente `is_current=true`.

## 6. Validade e máquina de estados

A API valida data civil ISO, exige `issue_date <= effective_start_date <= expiry_date`, toma a regra da obrigação e ignora estado/data-base vindos do cliente. Na criação, o estado é calculado no SQL pelo relógio do PostgreSQL: `vencida`, `a_vencer` ou `vigente`. A trigger repete a invariante.

A avaliação aceita somente corpo vazio e obtém `CURRENT_DATE` no PostgreSQL. Ela informa fonte, data-base, regra, fatos, denominador e ausência distinta de zero. Para cada documento atual vencido, cria no mesmo commit uma tarefa única por documento/período/regra. A operação é administrativa explícita; monitoramento contínuo ainda requer agendamento futuro.

Tarefas concluídas ou canceladas não reabrem. Conclusão exige início prévio, responsável ativo e resultado. Cancelamento exige justificativa.

## 7. Privacidade e fronteira documental

`is_private=true` é imposto pelo banco. A listagem canônica e todas as leituras legadas usam allowlist sem `storage_key`, URL privada, número documental completo, referência ou fonte privada. O detalhe staff autorizado usa outra allowlist e pode mostrar a referência declarada, mas nunca retorna campos de armazenamento.

A entrega não implementa nem declara upload, bytes, checksum, malware scan, armazenamento verificado ou download. `declared_reference` é somente referência documental declarada.

## 8. Renovação e histórico

Renovação não sobrescreve a linha existente. A API:

1. bloqueia a versão atual e a obrigação;
2. gera ID/protocolo no servidor;
3. marca a anterior como `substituida`, não atual, e registra a sucessora;
4. insere a nova versão com `replacement_of`, número incremental, justificativa, autor e horário;
5. grava evento e `audit_log` antes do commit.

Índices e trigger impedem duas versões atuais, múltiplas sucessoras e ciclos. Eventos permanecem imutáveis.

## 9. Transação, auditoria, idempotência e concorrência

Toda mutação aceita segue `BEGIN`, revalidação/lock do ator e entidades, advisory lock da chave, replay, escrita, tarefa quando aplicável, evento, `audit_log` e `COMMIT`. O corpo é lido uma única vez. A impressão digital inclui operação e corpo com chaves normalizadas recursivamente.

- retry idêntico retorna o mesmo resultado sem duplicar;
- reuso divergente retorna 409;
- concorrência real com a mesma chave produz uma linha;
- falha injetada em `audit_log` retorna 503 e deixa entidade/evento/tarefa inalterados;
- nenhuma mutação canônica usa o helper legado tolerante a falha.

## 10. Legado e EXT-08..12

Os quatro aliases exatos de `compliance-documents` preservam GET com `items`. Autenticação e papel são avaliados antes do 410; same-origin é avaliado antes do 410 em mutações. Não há segundo writer.

`ExtAdvancedClient.tsx` foi preservado e a seção EXT-07 passou a ser somente leitura com link para `/admin/compliance`. Handlers EXT-08..12 foram preservados. O gate exerce leituras autorizadas de EXT-08/09/11/12 e o guard de EXT-10 com sessão staff real, sem alterar a projeção legada de continuidade fora do escopo.

## 11. Resultados exatos observados

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0; 82 pacotes; 0 vulnerabilidades |
| `node --check` nos `.mjs` alterados/novos | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5; 001–154; 0 imports/migrações ausentes |
| `npm run typecheck` | exit 0; 0 erros |
| `node --test tests/ext07-compliance.test.mjs` | 14/14; 0 fail/skip/todo |
| `npm test` | 452 testes, 452 pass, 0 fail/cancelled/skipped/todo |
| `npm run build` | exit 0; 92 páginas estáticas geradas; `/admin/compliance` listada |
| `npm run test:migrations:pg` | pass 1 e replay 154/154; checksum negativo da 006 rejeitado; clone 154/154; 561 tabelas; cleanup true |
| `npm run test:ext07-compliance:pg` | 54/54; 0 fail/cancelled/skipped/todo; mínimo 50; migrações 154; PostgreSQL/HTTP/login reais; concorrência de tarefa e rollback integral de avaliação; cleanup true |
| gate com `DATABASE_URL` herdada `.invalid` | recusado antes de qualquer cluster/conexão; exit 2 |
| `npm run test:staff-auth:pg` | 21/21; 0 fail/skip/todo; cleanup true |
| `npm run test:ext06-satisfaction:pg` | 36/36; 0 fail/skip/todo; mínimo 35; cleanup true |
| `git diff --check` | exit 0 |

`next-env.d.ts` e `tsconfig.json` foram restaurados após Next dev/build e não integram o diff.

## 12. Gates que não cobrem EXT-07

Estático, typecheck, unitários, build e o gate de migrações verificam propriedades gerais, mas não provam a jornada HTTP EXT-07. O gate de staff prova sessão, não obrigação/documento/tarefa. O gate EXT-06 prova satisfação, não compliance. Gates EXT-01..06, L03..L08, CLI e backup não são evidência da EXT-07. A prova dedicada é exclusivamente `test:ext07-compliance:pg`.

Não foi executada uma bateria pesada integral adicional em cascata; ela não é necessária para substituir o gate focal solicitado.

## 13. Pendências e limites

- execução agendada futura para monitoramento contínuo;
- aplicação da 154 em ambiente de destino;
- revisão/aceite humano;
- homologação Windows;
- qualquer infraestrutura documental real, se vier a ser aprovada, exige entrega e prova próprias;
- não houve SMTP, armazenamento externo, dados reais ou integração regulatória.

Nenhum aceite humano foi inventado. Nenhum merge foi realizado por esta entrega.
