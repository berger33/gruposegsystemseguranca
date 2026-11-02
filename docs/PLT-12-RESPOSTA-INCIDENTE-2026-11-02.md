# PLT-12 — contrato, RBAC, evidência e gate da resposta a incidente

**Data:** 02/11/2026 (America/Sao_Paulo)
**Base do trabalho:** `5fde81d21a77b85a7f66ee664c889b04cb9a1f67` (`main`, merge da PR #328)
**Commit da fatia:** `39fdc74e953a2c650c4c46cb9c15fb8e489acef7` · **merge:** `a46bd884d40fdb371bfc57e79b23f86ab4601db6` (HEAD em 02/11)
**Branch da sessão original:** `arena/c25f07ad-gruposegsystemseguranca`
**Natureza:** fatia aditiva de jornada/RBAC/evidência de gate. **Não** é promoção de tela, **não** fecha PLT-12, **não** registra aceite humano, UAT, homologação nem reauditoria integral. **Produção continua NO-GO.**

> Este relatório foi publicado tardiamente, na sessão de auditoria de 02/11: a fatia reconciliou os ledgers e os inventários, mas não deixou relatório datado, rompendo o padrão de PLT-01, PLT-02, PLT-06 e PLT-07. O conteúdo abaixo foi reconstruído a partir do commit, do código e de **reexecução medida** nesta data (RED e GREEN reproduzidos, não citados de memória).

---

## 1. Motivo e fronteira

A decisão do proprietário registrada em [`STATUS-VIGENTE.md`](STATUS-VIGENTE.md) declarou o console de TI **esgotado** para “promoção de tela”: os 10 candidatos remanescentes da borda legada de RH (`authorizeLegacyHrRequest` / `employees.read`) e os 17 com segunda superfície viva continuam fora de questão. A frente elegível é **jornada, RBAC e evidência de gate**.

A auditoria de 28/10, §4.2 item B10, listava o núcleo duro de IDs `a_revalidar` sem gate nomeado, entre eles `PLT-12` (resposta a incidente). A superfície já existia e estava montada — aba `incidentes` do `TiConsole` e `src/server/incident-api.mjs` —, mas **não havia contrato declarado nem gate nomeado** que provasse a jornada em HTTP real com PostgreSQL.

Fronteira fixada antes de codar: nenhuma aba nova, nenhuma abertura da borda legada de RH, nenhum upload, nenhum envio externo, nenhuma migração nova (001–181 permanecem imutáveis, próxima livre 182).

## 2. RED medido antes das correções

Dois defeitos reais foram encontrados **antes** de escrever a correção. Nesta data (02/11) o RED foi **reproduzido** revertendo os dois hunks de produção (`git apply -R` do próprio commit) e reexecutando o gate contra PostgreSQL 17 descartável + `server.mjs --dev` real:

- gate `npm run test:plt12-incidents:pg`: **18/20, exit 1**, com o resumo TAP autoauditado rejeitando o placar (`PLT12_GATE_REJECTED: 2 caso(s) reprovado(s); apenas 18 caso(s) aprovado(s); a jornada exige ao menos 20`).
  - cenário 11 — `id inválido chega ao handler e responde 400 invalid_id`: o roteador exigia `([0-9a-f-]{36})`, então `/api/admin/incidents/nao-e-uuid` nem chegava ao handler e caía no **404 genérico** do fim do roteador;
  - cenário 15 — `ação de resposta e conclusão com auditoria`: `UPDATE incident_actions SET completed_at=CASE WHEN $1='concluida' THEN now() ELSE completed_at END` fazia o PostgreSQL devolver **`inconsistent types deduced for parameter $1`**, derrubando a conclusão da ação.
- focal `tests/plt12-incident-response.test.mjs`: **17/17** antes e depois — ele chama o handler diretamente, com UUID canônico e pool sintético, e por isso **não enxerga** nenhum dos dois defeitos. Fica registrado: o contrato sozinho não teria pegado os dois erros; quem pegou foi o gate HTTP + PostgreSQL.

Após a medição, os arquivos foram restaurados (`git checkout --`), sem deixar resíduo.

## 3. Entregue (aditivo e pontual)

### 3.1 Módulo puro `src/server/incident-read-contract.mjs` (109 linhas)

Contrato determinístico, sem banco, sessão, relógio ou rede. Espelha o que a superfície já fazia e fixa o vocabulário:

- **8 tipos** de incidente (`vazamento_dados`, `acesso_nao_autorizado`, `perda_dados`, `indisponibilidade`, `malware`, `phishing`, `violacao_privacidade`, `outro`);
- **4 severidades** e **8 status** (`aberto → em_contencao → em_analise → em_remediacao → aguardando_comunicacao → comunicado → encerrado`, mais `reaberto`);
- **6 tipos de evidência**, **7 tipos de ação**, **4 status de ação**, **6 destinatários de comunicação**;
- **matriz de transição fechada** (`INCIDENT_ALLOWED_TRANSITIONS`) e campos exigidos por transição: `em_contencao` exige `containment_lead_name`; `encerrado` exige `root_cause`;
- parsers que recusam valor inventado, `sanitize` com limite e `uuidRe()` no padrão canônico do E17;
- **fronteira declarada** `INCIDENT_READ_BOUNDARY`: leitura não grava auditoria, não altera incidente, não altera permissões, não abre borda RH, não substitui superfície, não promove tela; evidência **não é upload**; comunicação **só registro interno**.

### 3.2 Correções de produção (dois pontos)

- `server.mjs`: o casamento do segmento passou de `([0-9a-f-]{36})` para `([^/]+)`, **e** os sub-recursos `/evidences`, `/actions`, `/communications` passaram a ser despachados **antes** do `:id`, para não serem engolidos pelo regex alargado. Um id torto agora chega ao handler e recebe **400 `invalid_id`** em vez de 404 genérico.
- `src/server/incident-api.mjs`: o `CASE` ambíguo virou lógica em JS (`completedAtSql = status === 'concluida' ? 'now()' : 'completed_at'`) com status whitelistado (`invalid_status` → 400).

### 3.3 O que **não** mudou

`TiConsole.tsx`, as 32 abas, as 19 promoções, os 27 órfãos, papéis e permissões (RBAC `admin`/`ti`, `rh` restrito), mensagens de erro, aliases `/api/crm/incidents` e `/api/security/incidents`, tabelas, e as migrações **001–181**. Nenhuma superfície foi substituída e nenhum componente órfão foi montado.

## 4. Prova (reexecutada e medida em 02/11)

| Prova | Resultado |
|---|---|
| Focal `tests/plt12-incident-response.test.mjs` (no `test:unit`) | **17/17, exit 0** |
| Gate `npm run test:plt12-incidents:pg` | **20/20, exit 0** — `PLT12_TAP_SUMMARY: pass=20 fail=0 skipped=0 todo=0 minimo_exigido=20` |
| RED reproduzido (reversão dos 2 hunks) | **18/20, exit 1** — falham os cenários 11 e 15 |
| Cluster | PostgreSQL 17 descartável (`embedded-postgres`), migrações **001–181** aplicadas pelo migrador oficial |
| Servidor | `server.mjs --dev` real, sessões staff reais `ti`/`rh`/`admin` criadas no banco |

**Cobertura do gate:** anônimo 401 na leitura e na criação; `rh` 403 **sem abrir a borda legada de RH**; `ti`/`admin` 200 na lista e no detalhe; `same_origin_required` nas escritas com origem divergente (GET seguro não exige `Origin`); criação gravando linha em `security_incidents`, histórico de abertura e `audit_log`; filtros `type`/`severity`/`status`; transição inválida em **400 `invalid_transition`** sem alterar o incidente; `encerrado` sem `root_cause` e contenção sem lead recusados; **400 `invalid_id`** para id torto e **404 `not_found`** para UUID inexistente; evidência como referência com checksum (sem upload); comunicação como registro interno (flags DPO/autoridade/titular, sem envio); leitura sem gravar `audit_log` nem alterar incidentes; correlação `x-request-id` / `x-correlation-id` no cabeçalho **e** na telemetria; aliases preservados; console de TI servido sem promoção de aba.

## 5. Efeito nos inventários

- Matriz de 222: PLT-12 sai de `somente_documento` para **`gate_nomeado`** (25/124/73 → **26/124/72**) e o núcleo `a_revalidar` sem gate cai de **14 para 13**. **0/222 com aceite humano**, **0/222 com reauditoria integral** — inalterado.
- Inventário do console de TI (`ux-pro-03`) regenerado com `--check` verde: 84 componentes, 32 abas com prova, 19 promoções, 27 órfãos.
- `STATUS-VIGENTE.md`: linha do ledger reconciliada (175 arquivos no `test:unit`, `npm test` 1.415/1.415).

## 6. Limites declarados

- Sem exercício da aba `incidentes` em navegador (Chromium); a prova é HTTP + PostgreSQL.
- Sem worker, sem provedor externo e **sem envio**: a comunicação é registro interno por construção.
- Evidência é **referência declarada** com checksum — não há upload de arquivo nesta superfície (ver auditoria de 02/11, §7).
- A periodicidade e os prazos de notificação a DPO/autoridade/titular **não** estão parametrizados; nada de prazo legal foi inferido.
- **`test:plt12-incidents:pg` não estava ligado a nenhum workflow** até 02/11 — só rodava na mão (corrigido no mesmo bloco de higiene que publicou este relatório).
- PLT-12 permanece `a_revalidar`. Produção **NO-GO**.
