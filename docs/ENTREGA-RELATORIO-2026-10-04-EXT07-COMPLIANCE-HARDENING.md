# Entrega EXT-07 — Compliance corporativo, endurecimento (2026-10-04)

Sessão dedicada ao fechamento da EXT-07 iniciada na PR #103. Toda afirmação
abaixo foi produzida por execução nesta sessão. Nada aqui declara upload,
bytes, checksum, malware scan, armazenamento verificado, download, ator
externo, integração regulatória, execução agendada contínua, aceite humano ou
homologação Windows.

## 1. Base e merge da PR #103

Confirmado por execução, antes de qualquer edição:

| Item | Valor |
| --- | --- |
| Estado da PR #103 | `MERGED` (`mergedAt` 2026-10-03T20:48:13Z) |
| SHA do merge commit | `eff0bbddb5d5681d2612010e4349cfb9ff61234b` |
| SHA da feature | `3cf218d949e3ce04fe49e82ce2dcd1ca6b874584` |
| `HEAD` (branch Arena) | `eff0bbddb5d5681d2612010e4349cfb9ff61234b` |
| `origin/main` (após `git fetch`) | `eff0bbddb5d5681d2612010e4349cfb9ff61234b` |
| merge-base | `eff0bbddb5d5681d2612010e4349cfb9ff61234b` |
| Divergência inicial | 0 atrás / 0 à frente |
| Árvore limpa | sim (`git status --porcelain` vazio) |
| Última migração real na base | 153 (`153-ext07-compliance-journey.sql`), 153 arquivos |

O merge commit não foi presumido: foi descoberto por `gh pr view 103` e
conferido com `git log`/`git rev-parse`. A migração 153 é considerada aplicada
na `main`. A próxima migração livre era, de fato, a 154.

## 2. Lacunas reproduzidas antes da implementação

Probe obrigatório em PostgreSQL 17 descartável (migrações 001–153), servidor
HTTP real, sessão staff real criada por login, fixtures sintéticas e domínios
`.invalid`, com `DATABASE_URL` e `DATABASE_MIGRATION_URL` herdadas recusadas.
O probe foi apagado após a execução; nenhum banco real foi tocado.

Lacuna decisiva, que invalidava a entrega anterior em execução:

> **Toda rota `/api/ext/compliance/*` respondia 404 com HTML do Next.**
> `server.mjs` tinha o despacho (`extComplianceApi.handle`), mas o prefixo não
> constava do allowlist `API_PATH_MATCH`. O servidor nunca entregava a
> requisição ao handler Node. A API canônica da 153 era código morto: nenhuma
> obrigação, documento, avaliação, tarefa, retry, concorrência ou auditoria
> podia ocorrer.

Demais lacunas reproduzidas:

1. `/admin/compliance` respondia 200, mas consumia uma API inexistente.
2. Validação de datas da 153/API usava `\\d` escapado em excesso no literal de
   regex (`/^\\d{4}-...`), de modo que nenhuma emissão/validade seria aceita
   mesmo se a rota existisse.
3. `authorize` retornava `null` sem escrever resposta para anônimo: a
   requisição ficaria pendente em vez de receber 401.
4. Não havia rota de renovação/versionamento, de detalhe de documento nem de
   listagem de tarefas.
5. O índice `ext_compliance_current_version_unique` da 153 filtrava
   `replacement_of IS NULL`; a "versão atual" era sempre a primeira e qualquer
   renovação ficava impossível.
6. Documento canônico nascia `vigente` por construção, mesmo com validade já
   vencida.
7. A impressão digital de idempotência não incluía método nem rota: a mesma
   chave reaproveitada em outra rota devolveria o replay da anterior.
8. O leitor legado usava `SELECT *` e expunha `storage_key`, `file_url` e
   número documental completo a qualquer staff autorizado.
9. O gate anterior validava apenas migração e TAP focal, sem HTTP real; o
   workflow `ext07-delivery.yml` tinha `ton:` no lugar de `on:` e nunca
   disparou.
10. Cluster limpo vazio nas quatro tabelas — ausência real, distinta de zero.

Comportamentos pré-existentes confirmados e preservados: o legado exato
devolve 401 anônimo, 403 para papel não autorizado, 410 para escritor após os
guardas, e `/api/admin/hr/*` continua sujeito à permissão de RH (403
`employee_permission_required`), o que é a autorização herdada da plataforma,
não um efeito desta entrega.

## 3. Estado real da 153 e decisões

- **Fonte canônica:** mantida em `ext_compliance_documents`. Nenhuma tabela
  paralela foi criada. Linhas anteriores à 153 permanecem `registro_legado`,
  sem obrigação, identidade, privacidade ou arquivo atribuídos
  retroativamente, e não aparecem na projeção canônica.
- **Fonte da tarefa:** mantida em `ext_compliance_tasks`. Não há reuso de
  tarefas de CRM/RH; não havia justificativa técnica para trocar a fonte.
- **Fronteira de ator:** jornada exclusivamente interna de staff (`admin`,
  `ti`). Não existe ator externo, portal, convite ou aceite.
- **Fronteira documental/armazenamento:** o registro é uma **referência
  documental declarada e privada**. A 154 proíbe estruturalmente
  `storage_key`, `file_url` e `file_name` em linha canônica, e a API recusa
  (400 `file_claim_not_supported`) qualquer tentativa de declarar arquivo,
  bytes ou checksum. Não há upload, download, verificação nem antivírus.
- **Fonte da obrigação:** declarada internamente (`source_kind`), nunca
  apresentada como validação jurídica ou confirmação por órgão público.

## 4. Implementação da 154

`db/migrations/154-ext07-compliance-hardening.sql`, aditiva, sem alterar
001–153, sem seed e sem dado retroativo. Usa `NOT VALID` nas constraints e
`::text` nas comparações enum/TEXT, exceto onde o predicado precisa ser
`IMMUTABLE` (índice e coluna gerada usam o operador nativo do enum — a
coerção `enum::text` não é imutável e o PostgreSQL rejeita).

- **Versionamento/renovação:** `superseded_by`, `superseded_at`,
  `version_root`, `renewal_justification`; bloqueio de autorreferência,
  religamento de registro já substituído e ciclo na cadeia de versões.
- **Versão atual única:** o índice parcial da 153 foi substituído por coluna
  gerada `current_version_key` + `UNIQUE ... DEFERRABLE INITIALLY IMMEDIATE`.
  A verificação ocorre no `COMMIT`, porque a renovação insere a nova versão e
  marca a anterior como substituída na mesma transação — um índice sempre
  imediato reprovaria o estado intermediário legítimo.
- **Validade/estado temporal:** emissão e vencimento obrigatórios na linha
  canônica, início dentro da validade, e recusa de `vigente` com validade
  vencida tanto na inserção quanto na atualização.
- **Privacidade:** `is_private` imposto, rebaixamento bloqueado, referência
  declarada obrigatória e proibição de qualquer alegação de arquivo real.
- **Imutabilidade do documento canônico:** identidade, obrigação, autoria,
  datas, regra, versão, referência e número são imutáveis; a alteração
  permitida é a transição de estado da avaliação e a marcação de substituição.
  Terminal não reabre.
- **Tarefas:** responsável e fatos obrigatórios, regra explícita, forma de
  conclusão e de cancelamento, fatos de origem imutáveis, proibição de voltar
  silenciosamente para `aberta` e unicidade defensiva incluindo a obrigação.
- **Obrigações:** autoria imutável, `updated_at` do servidor, terminal não
  reabre, catálogo de `source_kind`.
- **Idempotência/auditoria:** `request_route` registrado no evento e índice de
  consulta por entidade.

Atualizações pontuais, sem substituição numérica ampla: manifesto de
`scripts/migrate-site-visual.mjs`, contagem esperada 154, log final
`001–154` e `latestMigration = 154` em `scripts/qa-wave0-static.mjs`.

## 5. Jornada canônica

`server.mjs` passou a rotear `pathname.startsWith("/api/ext/compliance/")` —
a correção que torna a jornada existente em execução. Rotas:
`GET/POST /obligations`, `GET/POST /documents`, `GET /documents/:id`,
`POST /documents/:id/renew`, `POST /evaluate`, `GET /tasks`,
`POST /tasks/:id/(start|complete|cancel)`. `PATCH/PUT/DELETE` recebem 405
após o same-origin; caminho desconhecido sob o prefixo recebe 404 JSON.

Toda mutação executa `BEGIN` → lock consultivo pela chave →
revalidação da identidade staff na transação → replay da idempotência →
escrita da entidade → geração da tarefa → evento imutável → `audit_log` →
`COMMIT`. A falha de `audit_log` faz `ROLLBACK`, devolve 503
`audit_unavailable` e não deixa obrigação, documento, tarefa, evento ou chave
consumida. Não é usado helper legado tolerante a falha.

**Regra de geração de tarefa:** `expiry_date <= CURRENT_DATE` (data-base do
servidor) sobre a versão atual não cancelada. A tarefa nasce na mesma
transação da avaliação, vinculada a obrigação, documento e período
(`inicio:vencimento`), com regra, data-base e fatos registrados, e é única por
documento/período/regra. **Fail-closed:** sem responsável staff canônico ativo
a tarefa não é criada e o bloqueio é contabilizado em
`blocked_without_responsible`.

**Avaliação:** informa fonte, fonte da tarefa, data-base, regra, fatos,
denominador e `absence_is_not_zero`. O relógio do cliente é recusado (400
`client_clock_not_accepted`).

**Monitoramento contínuo:** não implementado. A avaliação temporal é operação
administrativa explícita; execução agendada futura é necessária para
monitoramento contínuo, e isso está declarado na API (`continuous_monitoring`)
e na UI.

## 6. Resultados exatos

| Validação | Resultado |
| --- | --- |
| `npm ci` | concluído, 0 vulnerabilidades |
| `node --check` dos `.mjs` novos/alterados | sem erro |
| `node scripts/qa-wave0-static.mjs` | `RESUMO: 5/5`, `Migrações SQL 001–154 contínuas e únicas`, `001–154 registradas no migrador PG` |
| `npm run typecheck` | sem erro |
| `node --test tests/ext07-compliance.test.mjs` | `# pass 18 # fail 0 # skipped 0 # todo 0` |
| `npm test` | `# tests 456 # pass 456 # fail 0 # skipped 0 # todo 0` |
| `npm run build` | sucesso; 92 páginas; `/admin/compliance` presente |
| `npm run test:migrations:pg` | exit 0; `001–154` nas duas passagens; `CHECKSUMMED=154/154`; `TABLES=561->561`; clone adulterado rejeitado em 006 sem rebaseline; restauração com 154/154 checksums |
| `npm run test:ext07-compliance:pg` | exit 0; `QA_EXT07_MIGRATIONS: 001–154`; `EXT07_FOCAL_TAP: pass=18 fail=0 skipped=0 todo=0`; `EXT07_TAP_SUMMARY: pass=71 fail=0 skipped=0 todo=0 minimo_exigido=50`; `QA_EXT07_PG_TEMP_CLEANED: true` |
| `npm run test:ext06-satisfaction:pg` | exit 0; `pass=36 fail=0 skipped=0 todo=0` |
| `npm run test:ext05-quality:pg` | exit 0; `pass=33 fail=0 skipped=0 todo=0` |
| `npm run test:staff-auth:pg` | exit 0; `# pass 21 # fail 0` |
| `git diff --check` | sem apontamento |
| `next-env.d.ts` / `tsconfig.json` | revertidos; sem alteração no diff final |

O gate dedicado sobe o próprio cluster, aplica 001–154, exige o texto
`Migration ledger verified: 001–154`, roda o teste focal e a jornada HTTP,
autoaudita o TAP, exige no mínimo 50 casos, rejeita `fail`, `skip` e `todo`,
recusa URLs herdadas, falha (não pula) sem PostgreSQL e limpa cluster,
servidor, diretório temporário e o diretório de build da suíte.

## 7. Gates que não cobrem EXT-07

Não exercitam nenhuma rota, tabela, tela ou invariante da EXT-07:
`test:tenant:pg`, `test:client-access:pg`, `test:demo-local:pg`,
`test:cli-v2:pg` e variantes de objetos, `test:backup-restore:pg` e todas as
suas variantes (clusters, arquivos, http, assinado, inventário, objetos CLI,
parcial), `test:rag`, `test:integration` (lead/client-space/client-access),
`test:l02-delivery:pg` a `test:l08-delivery:pg`, `test:ext02-third-parties:pg`,
`test:ext03-biddings:pg`, `test:ext04-suppliers:pg`. `test:ext05-quality:pg`,
`test:ext06-satisfaction:pg` e `test:staff-auth:pg` foram executados apenas
como prova de não regressão das jornadas reutilizadas, não como cobertura da
EXT-07. A bateria pesada integral não foi executada e não é apresentada como
necessária.

## 8. Pendências explícitas

1. Não há execução agendada contínua de vencimentos; o monitoramento depende
   da avaliação administrativa explícita.
2. Não houve aplicação em ambiente de destino, homologação Windows nem aceite
   humano. Nenhum aceite humano é declarado.
3. Referência documental continua declarada: nenhuma infraestrutura de
   arquivo real, checksum, antivírus, armazenamento verificado ou download foi
   construída ou provada.
4. Nenhuma integração regulatória, ator externo ou confirmação por órgão
   público existe ou é simulada.
5. Defeito pré-existente fora do escopo, reproduzido e documentado, não
   corrigido: `/api/ext/continuity-plans` (EXT-10) consulta `ca.name` em
   `client_accounts`, que declara `display_name` — a rota já falhava em
   `origin/main` antes desta entrega. O gate registra o defeito em caso
   próprio, sem `skip` e sem mascaramento.
6. As constraints da 154 foram criadas `NOT VALID`: valem para linhas novas e
   alteradas; não houve validação retroativa do acervo legado, por decisão de
   não reinterpretar registros anteriores à 153.
