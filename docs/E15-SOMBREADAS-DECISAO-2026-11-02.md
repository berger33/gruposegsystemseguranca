# E15 — decisão das 9 regras sombreadas “a revisar” (02/11/2026)

**Fatia:** decisão documental, aditiva. **Base:** `e8fefe967970c024247c3713d926f8e405d3c48a` (`main`, merge da PR #335) ·
**Branch:** `arena/ec0b32aa-gruposegsystemseguranca` · **Migrações:** `001–182` intactas (nenhuma criada) ·
**`server.mjs`:** **não** foi tocado (6.310 linhas, sha256 `c42a7ef6757014d8…`, o mesmo do catálogo do E15).

**O que esta fatia é:** a decisão caso a caso das **9** regras que o catálogo do E15 registrou como sombreadas e
“a revisar”. **O que esta fatia não é:** execução. Nenhuma das 9 foi removida, nenhum handler foi apagado, nenhuma
migração foi criada. As duas decisões que implicam remoção (`remover_regra`, `remover_alias`) descrevem o que uma
**fatia autorizada** deve fazer — e continuam bloqueadas até essa autorização, porque removem linha do despacho vivo.

O retrato medido não mudou: **12** sombreadas, das quais **3** o próprio código declara intencionais
(`/api/crm/contracts/from-proposal`, `/api/crm/contracts`, `/api/client/visits`) e **9** entram nesta decisão.

---

## 1. As 9 decisões, uma por uma

Decisão por caminho, com a regra que cobre e a prova. O arquivo [`E15-SOMBREADAS-DECISAO-2026-11-02.json`](E15-SOMBREADAS-DECISAO-2026-11-02.json)
é a versão legível por máquina — e é ele que o teste confere contra o catálogo.

| # | Caminho | Linha | Regra (módulo) | Coberta por | Natureza | **Decisão** |
|---|---|---|---|---|---|---|
| 1 | `/api/admin/integrations/jobs` | 3192 | `integrationLogApi.handleJobs` | 2808 `integrationsApi` | **falso positivo** | **manter** |
| 2 | `/api/admin/integrations/logs` | 3195 | `integrationLogApi.handleLogs` | 2808 `integrationsApi` | **falso positivo** | **manter** |
| 3 | `/api/admin/integrations/webhooks` | 3198 | `integrationLogApi.handleWebhooks` | 2808 `integrationsApi` | **falso positivo** | **manter** |
| 4 | `/api/admin/integrations/reconciliation` | 3204 | `integrationLogApi.handleReconciliation` | 2808 `integrationsApi` | **falso positivo** | **manter** |
| 5 | `/api/admin/hr/journey-corrections` | 3457 | `empPortalApi.handleJourneyCorrections` | 2636 `employeeApi` | sombra real | **remover regra** |
| 6 | `/api/crm/hr/journey-corrections` | 3457 | `empPortalApi.handleJourneyCorrections` | 2636 `employeeApi` | sombra real | **remover regra** |
| 7 | `/api/hr/journey-corrections` | 3457 | `empPortalApi.handleJourneyCorrections` | 2636 `employeeApi` | sombra real | **remover regra** |
| 8 | `/api/faq-assisted` | 4580 | `pubFaqAssistedApi.handleSessions` | 2612 `faqAnswerApi` | sombra real (parcial) | **remover alias** |
| 9 | `/api/public/faq-assisted` | 4580 | `pubFaqAssistedApi.handleSessions` | 2612 `faqAnswerApi` | sombra real (parcial) | **remover alias** |

Resumo da decisão: **4 manter · 5 remover** (3 regras + 2 aliases). A regra da linha 3457 tem três caminhos e sai
inteira; a da linha 4580 tem cinco e perde **dois** — o handler continua vivo pelos outros três.

---

## 2. Por que 4 são falso positivo, não código morto

O modelo de cobertura do E15 compara padrões, e não modela **guarda de negação**. A linha 2808 casa
`/api/admin/integrations/<id>` e é a “anterior” no cálculo — mas ela só despacha quando o `id` **não** é um
subcaminho reservado:

```js
// server.mjs:2808–2815
const integrationMatch = url.pathname.match(/^\/api\/admin\/integrations\/([^\/]+)$/i);
if (integrationMatch && !INTEGRATION_ROUTE_SUBPATHS.has(integrationMatch[1].toLowerCase())) {
  return integrationsApi.handleUpdate(req, res, integrationMatch[1]);
```

E o `Set` (o mesmo do módulo, em `src/server/integrations-api.mjs:7`) é:

```js
export const INTEGRATION_ROUTE_SUBPATHS = new Set(["jobs","logs","webhooks","reconciliation"]);
```

Para `/api/admin/integrations/jobs`, `integrationMatch[1]` é `jobs`, `Set.has("jobs")` é `true` e a negação é
`false`: **a linha 2815 não responde**. O despacho segue e a regra literal da linha 3192 despacha
`integrationLogApi.handleJobs`. Ou seja: as quatro rotas **são alcançáveis** — o número “sombreada” está errado
para elas, não o código.

Esse desvio é deliberado e está documentado no próprio arquivo (linhas 2809–2814): é o conserto do **PLT-03**, que
antes fazia os quatro painéis da aba viva responderem **405** porque o padrão `/:id` casava primeiro. Um teste já
protege o efeito pelo lado da tela: `tests/ux-pro-03-ti-integration-logs-ui.test.mjs` exige que os cinco caminhos
(incluindo `/webhooks/deliveries`) sigam presentes no cliente **e** no `server.mjs`.

**Decisão:** manter as quatro regras. Remover qualquer uma delas reintroduziria o 405 do PLT-03.

---

## 3. Por que 5 são sombra real

### 3.1 `journey-corrections` (linha 3457, três caminhos)

A fronteira L03 casa os três caminhos **exatos** e retorna antes:

```js
// server.mjs:2636 (dentro do bloco que começa em 2628 e termina em 2643)
|| ["/api/admin/hr/journey-corrections", "/api/crm/hr/journey-corrections", "/api/hr/journey-corrections"].includes(url.pathname)
...
return await employeeApi.handle(req, res, url);   // server.mjs:2642
```

Não há negação, condição extra nem `else` entre o casamento e o `return`: a linha 3457 não é alcançada por
requisição nenhuma. E o caminho **tem** tratamento vivo: `src/server/employee-api.mjs:947` encaminha os mesmos três
caminhos para `timeClock.handle`. Por isso a regra da linha 3457 é código morto — não uma rota sem handler.

`empPortalApi.handleJourneyCorrections` aparece **uma única vez** em `server.mjs`: na própria linha 3458, como
provedor da regra morta. Nenhum outro despacho o chama e nenhum teste o referencia — removida a regra, o handler
fica órfão.

**Decisão:** remover a regra (linhas 3457–3459) e, no mesmo movimento, o handler órfão em
`src/server/emp-portal-api.mjs` — em fatia autorizada, com o catálogo regenerado. Até lá, nada muda.

### 3.2 `faq-assisted` (linha 4580, cinco caminhos, dois mortos)

A linha 2612 casa os dois caminhos exatos, sem guarda, e retorna primeiro:

```js
// server.mjs:2612
if (["/api/faq-assisted","/api/public/faq-assisted"].includes(url.pathname)) return faqAnswerApi(req,res);
```

A regra da linha 4580 tem cinco caminhos e só **dois** são sombreados; `pubFaqAssistedApi.handleSessions` continua
alcançável por `/api/pub/faq-sessions`, `/api/admin/faq-assisted-sessions` e `/api/admin/pub-faq-sessions` — que são
os que a tela de TI usa (`src/app/admin/ti/PubFaqAssistedClient.tsx` lê `/api/admin/pub-faq-sessions`).

Prova de comportamento, não só de texto: `tests/l04-delivery.integration.test.mjs` **sobe o `server.mjs` real** e
exercita `POST /api/faq-assisted` (linhas 3429–3434); quem responde é `faqAnswerApi` — o mesmo handler público que o
widget do site chama (`src/components/FaqAssistedWidget.tsx`).

**Decisão:** remover **os dois aliases** da condição da linha 4580, mantendo os outros três caminhos e o handler
inteiro. Remover o handler seria mudança de comportamento — e não é o que a medição pede.

**Fato registrado, sem veredito de segurança:** o bloco de pré-autorização da linha 2615 tem uma regex que também
casa `/api/faq-assisted*`, mas ele vem **depois** da linha 2612 e, para esses dois caminhos exatos, nunca é
executado. A exigência de sessão de equipe descrita na tela de TI vale para os caminhos de sessão/mensagem/handoff,
não para o par que o handler público responde. Isto é medição de ordem de `if`, não avaliação de risco; se o dono
quiser tratar como achado de segurança, é outra fatia (A3/A4).

---

## 4. O que fica congelado em teste

Quatro testes novos em `tests/e15-route-catalog.test.mjs` (de **15** para **19**) transformam a decisão em guarda:

1. **as 9 estão decididas**: o JSON precisa conter exatamente os 9 caminhos que o catálogo mede como sombreados
   **não intencionais**, com `linha`, `modulo` e `cobertaPorLinha` iguais aos medidos, decisão dentro do vocabulário
   fechado (`manter_rota` · `remover_regra` · `remover_alias`) e `motivo`/`prova` não vazios;
2. **integrações são falso positivo**: o `Set` precisa continuar contendo os quatro nomes, a linha 2815 precisa
   continuar negando o `Set` e as regras literais precisam continuar existindo depois dele — se o guard cair, o teste
   falha e obriga a rever as quatro decisões;
3. **`journey-corrections` é sombra real**: a regra que cobre precisa vir antes e o provedor
   `empPortalApi.handleJourneyCorrections` precisa continuar aparecendo **uma única vez** em `server.mjs`; se passar a
   haver um segundo despacho, o teste falha;
4. **`/api/faq-assisted` é sombra parcial**: a regra de cobertura precisa vir antes, a condição da linha 4580 precisa
   continuar com os três caminhos vivos, e só dois caminhos podem constar como decididos — remover o handler quebra o
   teste, como deve.

Nenhum desses testes executa rota, importa `server.mjs` ou toca banco: leem texto e o catálogo, como o resto do E15.

---

## 5. Limite declarado do catálogo (pendência nomeada, não corrigida aqui)

O cálculo de cobertura (`regraCobre`) ignora guardas de negação como `!SET.has(...)`. Consequência medida: **4 dos 12**
números de “sombreada” são falsos positivos. Corrigir o cálculo mudaria os números congelados (`12` sombreadas,
`3` intencionais) e o `--check` do catálogo na mesma PR — é fatia própria, com decisão de arquitetura, e **não** foi
feita aqui. O que esta fatia faz é impedir que o falso positivo seja confundido com código morto: a decisão está
escrita, provada e congelada em teste.

---

## 6. O que continua igual

Aceite humano **0/222**, reauditoria integral **0/222**, **produção NO-GO**. As **3 rotas inalcançáveis**
(`/api/crm/management-diary`, `/api/crm/management-diary/search`, `/api/admin/ai-rag-directory-sources`) continuam
inalcançáveis e congeladas — corrigir exige editar `API_PATH_MATCH`, fora desta autorização. As fatias B (EXT-16,
EXT-17, AI-01..AI-10) seguem bloqueadas; #321, #308, #310 e #324 seguem abertas e sem decisão. N7 intocada
(`mailer: null`); migração **183** continua livre e não foi criada.
