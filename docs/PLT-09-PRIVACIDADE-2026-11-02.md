# PLT-09 — privacidade: contrato, RBAC, evidência e gate de inventário, política, pedidos LGPD e retenção

**Data:** 02/11/2026 (America/Sao_Paulo)
**Base do trabalho:** `565206ab4742e04b5a6b4614694b6f27d1ae518d` (`main`, merge da PR #331 — a sessão anterior a esta fatia)
**Branch da sessão:** `arena/5bb53afc-gruposegsystemseguranca`
**Natureza:** fatia aditiva de jornada/RBAC/evidência de gate. **Não** promove aba, **não** abre a borda legada de RH (`authorizeLegacyHrRequest` / `employees.read`), **não** substitui superfície viva, **não** cria migração (001–181 imutáveis, próxima livre **182**), **não** publica política de privacidade real, **não** registra aceite humano, UAT, homologação nem reauditoria integral. **Produção continua NO-GO.**

---

## 1. Motivo e fronteira

A fila da auditoria de 02/11 ([`AUDITORIA-PENDENCIAS-2026-11-02.md`](AUDITORIA-PENDENCIAS-2026-11-02.md), §B10) lista **13 IDs `a_revalidar` sem nenhum gate**: `PLT-09`, `EXT-16`, `EXT-17` e `AI-01`…`AI-10`. `PLT-09` é o menor ID do núcleo com **três superfícies vivas já com prova focal** — abas `privacidade` (`PrivacyClient.tsx`), `retencao` (`RetentionClient.tsx`) e `lgpd` (`LgpdRequestClient.tsx`) do `TiConsole`, servidas por `src/server/privacy-api.mjs`, `retention-api.mjs` e `lgpd-request-api.mjs`, com as tabelas criadas nas migrações **047/048/049**.

A decisão do proprietário registrada em [`STATUS-VIGENTE.md`](STATUS-VIGENTE.md) declarou o console de TI **esgotado para promoção de tela**; a frente elegível é **jornada, RBAC e evidência de gate**. Esta fatia portanto **não mexeu no `TiConsole.tsx`**: as 32 abas, as 19 promoções e os 27 órfãos continuam como estavam.

Fronteira fixada antes de codar: nenhuma aba nova, nenhum texto jurídico aprovado, nenhum envio (e-mail/WhatsApp/SMS/push), nenhum upload, nenhum descarte real de dado pessoal, nenhuma migração nova.

## 2. RED medido antes das correções

Sonda descartável (`/tmp`, fora do repositório) contra **PostgreSQL 17 descartável** (`embedded-postgres`, migrações 001–181) + **`server.mjs --dev` real** + sessões staff reais `ti`/`rh`/`admin`. Cada linha abaixo é um resultado medido, não uma suspeita:

| # | Cenário medido | Resultado ANTES | Esperado |
|---|---|---|---|
| P1 | `POST /api/admin/privacy/inventory` como **`admin`** | **403** `privacy_inventory_restricted_admin_ti` | 200 |
| P1 | `POST /api/admin/privacy/inventory` como **`ti`** | **403** `privacy_inventory_restricted_admin_ti` | 200 |
| P2 | id torto em `/api/admin/privacy/policies/nao-e-uuid` (GET e PATCH) | **404** `not_found` do roteador | 400 `invalid_policy_id` |
| P2 | id torto em `/api/admin/lgpd/requests/nao-e-uuid` (GET e PATCH) | **404** do roteador | 400 `invalid_request_id` |
| P2 | id torto em `/api/admin/retention/exceptions/nao-e-uuid` | **404** do roteador | 400 `invalid_id` |
| P2 | id torto em `/api/admin/retention/disposal/jobs/nao-e-uuid` | **404** do roteador | 400 `invalid_id` |
| P3 | `POST /api/admin/retention/disposal/logs` | **200** com a lista de logs | 405 + `Allow: GET` |
| P3 | `DELETE /api/admin/retention/disposal/logs` | **200** com a lista de logs | 405 + `Allow: GET` |
| P3 | `DELETE /api/admin/retention/disposal/jobs/:id` | **200** com job + logs | 405 + `Allow: GET` |
| P3 | 405 da retenção (exceção por id) | **sem cabeçalho `Allow`** | `Allow: GET, PATCH` |
| P4 | `GET /retention/policies?category=inventado` | **200** com a lista inteira | 400 `invalid_category` |
| P4 | `GET /retention/exceptions?status=inventado` | **200** com a lista inteira | 400 `invalid_status` |
| P4 | `GET /retention/disposal/logs?category=inventado` | **200** com a lista inteira | 400 `invalid_category` |
| P4 | `GET /privacy/policies?published=talvez` | **200** com a lista inteira | 400 `invalid_published` |
| P5 | `POST /privacy/policies` com `contact_email: "a"` | **503** `policy_create_failed` (CHECK da 047) | 400 `invalid_contact_email` |
| P5 | `POST /public/lgpd` com `requester_email: "a@b"` | **503** `lgpd_create_failed` (CHECK da 048) | 400 `invalid_requester_email` |
| P6 | `PATCH` política `publicado` → `arquivado` | 200 e **`is_published` continua `true`** | 200 e `is_published=false` |
| P6 | `PATCH` política `publicado` → `rejeitado` | 200 e **`is_published` continua `true`** | 200 e `is_published=false` |
| P7 | job de descarte com **1** política ativa e **2** exceções | `total_scanned=110` (**políticas × 10**), `total_expired=0` | `total_scanned=3`, `total_expired` real |
| P8 | criação de pedido LGPD público | **`audit_log` sem linha** (o `INSERT` ia para `auth_access_audit` com `actor_kind='public'`, recusado pelo CHECK) | 1 linha de trilha |
| P8 | escrita de inventário / política / aprovação (`admin`, `ti`) | **nenhuma linha de auditoria** (`privacy_*` fora do CHECK desde as migrações 100/103, engolido por `catch {}`) | 1 linha por escrita |

A causa de **P1** é de precedência de operador: `await readAdminSession(req)?.role` avalia `Promise?.role` (que é `undefined`), então o `includes` recebia `undefined` e **toda** escrita de inventário respondia 403 — inclusive `admin`. Medido também em unidade, com sessão sintética:

```
$ node -e "const f=async()=>({role:'admin'}); (async()=>console.log(['admin','ti'].includes(await f()?.role)))()"
false
```

**P8** é a mesma classe de dívida que a PLT-06 registrou: o `CHECK` de `auth_access_audit` foi reconstruído pelas migrações 100/103 sem as ações `privacy_*`/`lgpd_*`, e o `catch {}` transformava a recusa em silêncio — nenhuma das três superfícies deixava trilha.

**RED do focal:** `tests/plt09-privacy-contract.test.mjs` **10/24, exit 1** com o código de produção revertido (`git stash` dos quatro arquivos alterados).
**RED do gate:** `npm run test:plt09-privacy:pg` **13/28, exit 1**, com o resumo TAP autoauditado rejeitando o placar (`PLT09_GATE_REJECTED: 15 caso(s) reprovado(s); apenas 13 caso(s) aprovado(s); a jornada exige ao menos 26`).

## 3. Entregue (aditivo e pontual)

### 3.1 Módulo puro `src/server/privacy-read-contract.mjs` (221 linhas)

Contrato determinístico, sem banco, sessão, relógio, ambiente ou rede. Espelha o que as três superfícies já faziam e passa a ser a fonte única dos vocabulários:

- **9 categorias** de dado, **9 bases legais**, **6 status** de política (iguais aos `CREATE TYPE` das migrações 047/048/049 — o focal compara o contrato com o SQL);
- **8 tipos** de pedido LGPD, **9 status**, **5 métodos de verificação** e a **matriz de transição**; **6 status** de exceção de retenção, **4 métodos** de descarte, **5 status** de job e a matriz correspondente;
- parsers que recusam valor inventado, `sanitizePrivacyText`, `uuidRe()` canônico (E17) e as faixas que o `CHECK` do banco já impõe (`CONTACT_EMAIL_MIN/MAX`, `REQUESTER_EMAIL_MIN/MAX`);
- **`is_published` derivado do estado** (`isPublishedStatus`), com `policyPublishProblem` exigindo `aprovado` antes de `publicado`;
- `disposalCounters` — números do job de descarte só com o que foi lido (sem multiplicador sintético);
- **fronteira declarada `PRIVACY_READ_BOUNDARY`**: leitura não grava auditoria nem altera política/inventário/pedido; não abre a borda RH; não substitui superfície; não promove tela; **não publica política de verdade**; `exige_aprovacao_admin_antes_de_publicar: true`; `envio_externo: false`; `documento_do_titular_vira_hash: true`; `upload_de_arquivo: false`; `retencao_executa_descarte_real: false`; `prazo_legal_inferido: false`; `aceite_humano: false`; `reauditoria_integral: false`;
- `LGPD_DECLARED_DUE_DAYS = 15` com `LGPD_DUE_DAYS_LEGALLY_VALIDATED = false` — o prazo do pedido é **declarado**, não parecer jurídico.

### 3.2 Correções de produção (só o que o RED mediu)

- **`src/server/privacy-api.mjs`** — (1) a sessão da escrita de inventário é lida **uma vez** e o papel vem do objeto resolvido (P1); (2) `contact_email` é validado no valor **bruto** e responde 400 antes do banco (P5); (3) `is_published` passou a ser derivado do estado e a leitura do status atual é **fail-closed** (antes um `catch {}` deixava publicar quando a consulta falhava) (P6); (4) `?published=` fora de `true|false` responde 400 (P4); (5) a trilha das escritas vai para `audit_log` (P8).
- **`src/server/lgpd-request-api.mjs`** — e-mail do titular validado na faixa 5..320 com um `@` (400 em vez de 503, P5); vocabulários e matriz vindos do contrato; trilha do pedido público e das transições em `audit_log` (P8); prazo de 15 dias lido da constante declarada.
- **`src/server/retention-api.mjs`** — guarda de método nas duas leituras (`logs` e `job` por id) com **405 + `Allow`** (P3); filtros fora do enum em **400** (P4); 405 das coleções passam a declarar `Allow`; contadores do job medidos (`total_scanned` = políticas ativas + exceções avaliadas; `total_expired` vem do `RETURNING` do próprio `UPDATE`) (P7).
- **`server.mjs`** — quatro linhas de roteamento: o casamento dos ids de política, pedido LGPD, exceção e job de descarte passou de `([0-9a-f-]{36})` para `([^/]+)`, para que um id torto chegue ao handler e receba **400** em vez do 404 genérico do fim do roteador (P2).

### 3.3 Gate dedicado e ligação ao CI

- `tests/plt09-privacy.integration.test.mjs` (**28 casos**, 631 linhas) e `scripts/qa-plt09-privacy-postgres.mjs` (**91 linhas**) com `MINIMUM_CASES=26`, guarda E19 (`qa-generated-files-guard.mjs`), `QA_PG_REFUSED` e resumo TAP autoauditado (zero skip/todo).
- `npm script test:plt09-privacy:pg`; focal `tests/plt09-privacy-contract.test.mjs` (**24 casos**) no `test:unit`.
- `.github/workflows/plt-jornadas-delivery.yml`: novo passo **PLT-09** e os `paths:` de `privacy-api.mjs`, `retention-api.mjs`, `lgpd-request-api.mjs`, `privacy-read-contract.mjs`, dos dois arquivos de teste e do runner.
- `tests/plt-gates-wired.test.mjs`: `PLT-09` acrescentado à lista `PLT_GATES` — sem isso o `test:unit` acusaria gate órfão.

### 3.4 O que **não** mudou

`TiConsole.tsx` e as 32 abas; as 19 promoções e os 27 órfãos; papéis e permissões (RBAC `admin`/`ti`, `rh` restrito); mensagens de erro existentes; os aliases (`/api/crm/privacy/*`, `/api/privacy/*`, `/api/admin/privacy/retention`, `/api/privacy/disposal/*`, `/api/privacy/requests`); as tabelas e as migrações **001–181**; nenhum envio, nenhum upload, nenhum descarte real.

## 4. Prova (executada e medida em 02/11)

| Prova | Resultado |
|---|---|
| Focal `tests/plt09-privacy-contract.test.mjs` (no `test:unit`) | **24/24, exit 0** |
| RED do focal (produção revertida com `git stash`) | **10/24, exit 1** |
| Gate `npm run test:plt09-privacy:pg` | **28/28, exit 0** — `PLT09_TAP_SUMMARY: pass=28 fail=0 skipped=0 todo=0 minimo_exigido=26` |
| RED do gate (mesma reversão) | **13/28, exit 1** — `PLT09_GATE_REJECTED` |
| `npm test` | **1442/1442, exit 0** (177 arquivos no `test:unit`) |
| `npm run typecheck` / `npm run build` | exit 0 / exit 0 |
| `node scripts/qa-wave0-static.mjs` | **5/5** — migrações 001–181 contínuas, próxima livre 182 |
| `npm run reaudit:sec` | **35/35**, exit 0 |
| Quatro inventários `--check` (222, UX-PRO-00, UX-PRO-03, E18) | todos **exit 0** |
| Gates irmãos `test:plt01-…`, `test:plt06-…`, `test:plt12-…` | **12/12**, **23/23**, **20/20**, todos exit 0 |
| Cluster | PostgreSQL 17 descartável (`embedded-postgres`), migrações 001–181 aplicadas pelo migrador oficial |
| Servidor | `server.mjs --dev` real; sessões staff reais `ti`/`rh`/`admin` criadas no banco |

**Cobertura do gate:** anônimo 401 nas quatro leituras (com a diferença real de mensagem entre `privacy`/`lgpd` e retenção preservada); `rh` 403 na escrita de privacidade e 200 na leitura que já era liberada; `ti`/`admin` 200 nos sete blocos de leitura; `same_origin_required` nas escritas com GET seguro sem `Origin`; **escrita de inventário por `ti` e por `admin` com trilha em `audit_log`**; upsert idempotente por `(data_category, data_field)`; **400 em id torto nos seis detalhes** e 404 em UUID inexistente; rascunho de política com `is_published=false`; publicar direto do rascunho em 400; aprovação restrita a `admin` com `approved_by`/`approved_at`; publicar → `is_published=true`; **arquivar e rejeitar retirando a publicação** e desaparecendo do filtro `?published=true`; contato inválido em 400 sem gravar; filtros inválidos de política, inventário e retenção em 400; **405 + `Allow` em `logs` e no detalhe do job**; contadores honestos do job de descarte; pedido LGPD público com **documento virando hash** (nenhum campo com o documento cru), prazo declarado de 15 dias e trilha; e-mail do titular inválido em 400 sem gravar; transição inválida, enum inválido e método de verificação inválido em 400; verificação de identidade, histórico e atribuição de responsável; leitura sem `auth_access_audit`, sem `audit_log` e sem alterar política/inventário (fingerprint `md5`); correlação `x-request-id`/`x-correlation-id` no cabeçalho **e** na telemetria; aliases preservados; `/admin/ti` servido.

## 5. Efeito nos inventários

- Matriz de 222 (regenerada por `requisitos-222-inventory.mjs`): `gate_nomeado` **26 → 27**, `somente_documento` **72 → 71**, `mencionado_em_gate` **124** (inalterado); núcleo `a_revalidar` sem gate **13 → 12**; núcleo duro **16 → 15** IDs. `PLT-09` sai de `somente_documento` para `gate_nomeado`. **0/222 com aceite humano**, **0/222 com reauditoria integral** — inalterado.
- `docs/REQUISITOS-222-REAUDITORIA-INVENTARIO-2026-10-27.md`: §2, §3 e o núcleo duro recontados, com nota datada da PLT-09.
- Inventário do console de TI (`ux-pro-03`, regenerado): **84 componentes**, **32 abas com prova**, **19 promoções**, **27 órfãos** — os três clientes (`PrivacyClient`, `RetentionClient`, `LgpdRequestClient`) passam a citar o focal novo como prova adicional; nenhuma aba foi promovida.
- `ux-pro-00` e `E18` regenerados, `--check` verde.
- `STATUS-VIGENTE.md`: linha do ledger reconciliada (**177** arquivos no `test:unit`, `npm test` **1442/1442**) e seção datada desta fatia.

## 6. Limites declarados

- **Sem parecer jurídico.** Nenhuma política foi publicada de verdade: o gate prova a máquina de estados (`aprovado` antes de `publicado`, `is_published` derivado) e que o texto da migração 047 continua **rascunho**. Aprovar/publicar exige decisão do dono e revisão competente.
- **Sem exercício das três abas em navegador (Chromium).** A prova é HTTP + PostgreSQL; a aba `retencao` já tinha prova de UI própria (`ux-pro-03-ti-retention-ui`) e continua com ela.
- **Sem migração.** A trilha de `privacy_*`/`lgpd_*` passou a usar `audit_log` (ação como TEXTO) porque o `CHECK` de `auth_access_audit` foi reconstruído sem essas ações nas migrações 100/103 e o `catch {}` as descartava. A correção definitiva — ampliar o `CHECK` — exigiria a migração 182, que esta fatia **não** cria.
- **Descarte continua declarativo.** O job expira exceções vencidas e grava `disposal_logs`; **não** apaga dado pessoal de tabela real. Os contadores agora são medidos, mas a superfície continua declarando que é simulação.
- **Prazo de 15 dias é declarado, não validado.** `LGPD_DECLARED_DUE_DAYS` existe para impedir que alguém transforme "prazo padrão da tela" em obrigação legal cumprida.
- **Sem envio e sem upload.** Nenhum e-mail/WhatsApp/SMS/push é disparado por estas rotas; o documento do titular vira hash e não é armazenado. A fila de notificações do console (**N7**: `mailer: null` em `server.mjs`) **não** foi tocada — segue como decisão pendente do dono.
- **PLT-09 permanece `a_revalidar`.** 0/222 com aceite humano, 0/222 com reauditoria integral. Produção **NO-GO**.
