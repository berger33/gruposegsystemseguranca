# UX-PRO-03 — promoção "com prova" de `NotificationPreferencesClient` (PLT-05)

**Data:** 2026-11-01
**Fatia:** 16ª promoção com prova do console de TI (`/admin/ti`)
**Componente promovido:** `src/app/admin/ti/NotificationPreferencesClient.tsx` (124 → 352 linhas)
**Aba nova:** `plt_notificacoes` — "Preferências e modelos de notificação" (29ª aba)
**Grupo:** Experiência e comunicação
**Commit:** ver `git log --oneline -1` no ramo `arena/3f450206-gruposegsystemseguranca`

---

## 1. Por que este componente, e não os dois candidatos medidos antes

O levantamento de órfãos do console apontava, por ordem de tamanho, `FinClient`
(185 linhas, 8 rotas), `OpsClient` (247 linhas, 13 rotas) e
`EmpAdvanced2Client` (331 linhas, 11 rotas). Os dois primeiros foram **medidos e
descartados antes de qualquer código escrito**:

| Candidato | Rotas medidas (sem outro consumidor em `src/app`) | Superfície que já cobre o mesmo dado | Decisão |
|---|---|---|---|
| `FinClient` | `/api/hr/fin-{suppliers,cost-centers,recurrence-rules,receivables,payables,payments,payment-history,generate-recurring}` | `/admin/financeiro` (`FinanceiroWorkspace.tsx`: contas a receber, regras, baixas via F03, histórico, relatórios) **e** a aba já promovida `financeiro_cadastros` (`FinRegistryClient.tsx`: `/api/fin/*`) | **descartado** |
| `OpsClient` | 13 rotas `/api/hr/ops-*` | `/admin/operacao` (`OperacaoWorkspace.tsx`, 1.607 linhas, consome `/api/ops/*` de alocação, escalas, postos, validações) | **descartado** |
| `NotificationPreferencesClient` | `/api/crm/notification-preferences`, `/api/crm/notification-templates`, `/api/crm/notification-templates/:id` | **nenhuma** — o único outro consumidor de `notification-*` no produto é a própria rota; a aba `avisos` usa `NotificationsClient` + `/api/admin/notifications` (fila de entrega, não preferências) | **promovido** |

O critério é o mesmo registrado em `tests/ux-pro-03-ti-reaudit.test.mjs` e usado
para recusar `AdmAdvancedClient`: **uma segunda superfície para o mesmo dado não
é entrega, é dívida**. Promover `FinClient` ou `OpsClient` obrigaria o operador a
escolher entre duas telas que escrevem as mesmas tabelas.

O arquivo promovido foi **o próprio órfão** (não um irmão novo): órfãos
**31 → 30**, e o nome do arquivo foi mantido para que a contagem de linhas do
inventário continue rastreável.

## 2. Defeitos do protótipo (todos travados pelo teste focal e pelo gate)

| # | No protótipo | Efeito | Agora |
|---|---|---|---|
| 1 | `any` em todo lugar; `msg` único para erro e sucesso; listas só apareciam depois de dois botões | operador não sabia se a tela estava vazia ou negada | `useEffect` lê as duas coleções ao montar; `classificarLista` separa `ok/vazio/negado/falha/invalido`; sucesso (`plt-ok`) e erro (`plt-erro`) têm lugar próprio |
| 2 | quatro botões de situação (`aprovado`, `em_revisao`, `arquivado`, `rejeitado`) em **qualquer** modelo | aprovava modelo arquivado, rejeitava modelo já aprovado | `TRANSICOES` + `proximosEstados`: só o próximo passo válido do ciclo |
| 3 | `rejection_reason: 'Conteúdo não conforme PLT-05'` **fixo no código** | o motivo gravado no registro não era o do operador | campo "motivo da rejeição"; o texto digitado é o que vai ao banco (provado no gate) |
| 4 | `is_medical_safe` exibido como `true/false` cru; nenhum aviso antes do POST | termo médico no assunto virava erro de servidor | lista de termos espelhada do servidor, aviso antes de enviar (`plt-erro-assunto`, `plt-erro-corpo`) |
| 5 | quiet hours como texto livre | silêncio inválido virava **falha de servidor** | par obrigatório + `HH:MM`, validado na tela **e** no servidor (400) |
| 6 | `recipient_kind`/`channel` como `<select>` solto, sem relação com o banco | valor fora do CHECK virava erro de banco | listas espelhadas do enum (teste compara com a migração 043) |

## 3. Defeitos do servidor — encontrados no gate, corrigidos com prova

### 3.1 Preferência global duplicava a cada gravação

`crm_notification_preferences` tem `UNIQUE(recipient_kind, recipient_id, channel)`
e `recipient_id UUID REFERENCES auth_identities(id)` — **anulável**. Em Postgres,
`NULL` nunca colide com `NULL`, então o `ON CONFLICT (recipient_kind, recipient_id, channel)`
do `POST` **nunca disparava** para preferência sem destinatário: cada gravação
global criava uma linha nova, todas com o mesmo `recipient_kind`/`channel`, e o
`GET ... ORDER BY recipient_kind, channel` devolvia duplicatas sem dizer qual
valia.

Correção (sem tocar no schema): `UPDATE ... WHERE recipient_kind=$1 AND
recipient_id IS NOT DISTINCT FROM $2 AND channel=$3 RETURNING *` e `INSERT`
apenas quando não havia linha. Provado no gate: **duas gravações → uma linha**,
com o segundo valor sobrescrevendo o primeiro.

### 3.2 Silêncio inválido era erro de servidor

`quiet_hours_start`/`end` são `TIME`. Valor como `25:00` chegava direto ao
Postgres (`22007`) e o `catch` genérico devolvia **503 `preference_update_failed`**
— erro do operador apresentado como falha do servidor. Agora o servidor valida
`HH:MM` e exige o par: **400 `invalid_quiet_hours`**. Destinatário torto também
deixou de passar como string qualquer: **400 `invalid_recipient_id`**.

### 3.3 Modelo marcado como inseguro podia ser aprovado

O `POST` calcula `is_medical_safe` e recusa termo médico no assunto e no push,
mas o `PATCH` de `status` **não olhava esse campo**: um e-mail com "laudo" no
corpo nascia `is_medical_safe: false` e podia ser aprovado em seguida. Agora
aprovar modelo não seguro responde **409 `medical_safety_required`** e a
situação no banco não muda (provado no gate).

### 3.4 Criar já aprovado gravava aprovação sem aprovador

`POST /api/crm/notification-templates` aceitava `status: "aprovado"` e inseria a
linha **sem** `approved_by`, `approved_by_id` e `approved_at` — um modelo
aprovado, sem trilha de quem aprovou, em qualquer papel. Agora: papel diferente
de `admin`/`ti` recebe **403 `approval_requires_admin_ti`**, e a criação
aprovada grava a trilha completa. `rejeitado` na criação exige motivo
(**400 `rejection_reason_required`**).

Além disso, `crypto.randomUUID()` sem import foi substituído por
`import { randomUUID } from 'node:crypto'`: depender do global `crypto` funciona
hoje, mas não é contrato do módulo — e a fatia anterior pagou caro por um
`require('node:crypto')` silencioso em ESM.

## 4. Contrato da tela (`src/app/admin/ti/notification-prefs-state.ts`, 372 linhas)

* `classificarLista(status, corpo, "preferences" | "templates", rótulo)` —
  `negado` (401/403) é negativa explícita, nunca lista vazia;
* `traduzirErroPlt` — 27 códigos do servidor traduzidos, sem despejar snake_case;
* `CANAIS`, `TIPOS_DESTINATARIO`, `STATUS_MODELO` — **espelhados** do CHECK/enums
  da migração 043 (o teste focal compara as três listas com o SQL);
* `TERMOS_MEDICOS` + `contemInfoMedica` — **espelhados** de
  `containsMedicalInfo` do servidor (teste compara as duas listas, para que não
  divirjam em silêncio);
* `TRANSICOES`/`proximosEstados`/`validarTransicao` — política local: o servidor
  confere o **valor** da situação, não a **ordem**;
* `validarPreferencia`, `validarModelo` — faixas do banco (`1..100`, `1..5000`,
  `≤200`, `HH:MM`), com o aviso médico antes do POST;
* `simNao`, `horaCurta`, `janelaSilencio`, `chavePreferencia`, `chaveModelo` —
  exibição honesta: `null` não vira "false", `HH:MM:SS` vira `HH:MM`.

## 5. Prova

### 5.1 Teste focal — `tests/ux-pro-03-ti-preferencias-notificacao-ui.test.mjs` (11 testes)

* RED antes da correção do servidor: teste 10 (`o servidor não duplica
  preferência global…`) falhava em `a atualização precisa tratar NULL como valor`;
* GREEN depois: **11/11**;
* comparação de listas com a migração e com o servidor (não com a documentação).

### 5.2 Gate de navegador — `browser UX-PRO-03 PLT-05` (PostgreSQL 17 + Chromium)

Sessão `ti` e `rh` reais, cookie de sessão de equipe:

| Verificação | Resultado medido |
|---|---|
| leitura anônima | **401** nas duas rotas |
| `rh` lê preferências | **200** (a escrita é que restringe) |
| duas gravações globais | **uma linha**, segundo valor vence |
| `25:00` / silêncio sozinho / UUID torto | **400** `invalid_quiet_hours` / `invalid_quiet_hours` / `invalid_recipient_id` |
| termo médico em push e em assunto | **400** `medical_info_not_allowed_in_subject_push` |
| e-mail com "laudo" no corpo | **201** com `is_medical_safe: false` |
| aprovar o modelo inseguro | **409** `medical_safety_required`, situação continua `rascunho` |
| criar aprovado como `rh` | **403** `approval_requires_admin_ti` |
| criar aprovado como `ti` | **201** com `approved_by: "ti"` e `approved_at` |
| rejeitar sem motivo / como `rh` | **400** `rejection_reason_required` / **403** |
| motivo digitado na tela | gravado em `rejection_reason` (comparado com o texto do operador) |
| tela em 320/390/1440 e à noite | `sobraDocumentoPx: 0` nos cinco retratos |
| negação injetada na leitura | `data-situacao="negado"`, sem "Nenhum registro" |
| `rh` no console | `data-admin-gate="forbidden"`, nenhum card montado |

Evidências: `docs/ux-pro-03-preferencias-notificacao-evidencias/` (10 PNGs +
`resumo.json` com `problems: []`).

### 5.3 Suíte e guardas estáticas

* `npm test`: contagem declarada em `docs/STATUS-VIGENTE.md` (linha `| Testes |`);
* `npx tsc --noEmit`: limpo; `npm run build`: limpo; `npm audit`: 0;
* `npm run reaudit:sec`: 35/35 âncoras;
* inventário TI: **29 abas com prova**, **16 promoções**, órfãos **30**;
* gate completo do portal: cenários declarados em `docs/STATUS-VIGENTE.md`.

## 6. Limites declarados (não são promessas)

* **Não há envio real** de e-mail, WhatsApp, SMS, push ou webhook nesta fatia:
  ela promove preferências e modelos, não a entrega.
* O servidor continua **sem máquina de estados**: qualquer um dos cinco valores
  é aceito em qualquer momento; a ordem é política desta tela.
* Aprovar/rejeitar exige `admin` ou `ti`; o `rh` **lê** preferências e não
  aprova nada — o gate mede exatamente esse 403.
* Modelo com informação médica **continua gravado** (não apagamos histórico);
  apenas não pode ser aprovado enquanto `is_medical_safe` for `false`.
* Sem leitor de tela e sem Windows: teclado, foco e contraste medidos só no
  Chromium empacotado.
* **Sem aceite humano, sem homologação, sem UAT.** O retrato do inventário 222
  segue **23/115/84**: PLT-05 já era citado em gate, e promoção de tela não é
  aceite de requisito.
* **Produção: NO-GO. Aceite humano: 0/222.**
