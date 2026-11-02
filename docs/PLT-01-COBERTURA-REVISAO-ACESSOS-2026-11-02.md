# PLT-01 — cobertura da revisão periódica de acessos

**Data:** 02/11/2026 (America/Sao_Paulo)
**Base:** `a36d48f` (`main`, merge da PR #327)
**Branch da sessão:** `arena/c25f07ad-gruposegsystemseguranca`
**Natureza:** fatia aditiva de jornada/RBAC/evidência. **Não** promove PLT-01,
**não** registra aceite humano, UAT, homologação ou reauditoria integral.
**Produção continua NO-GO.**

---

## 1. Motivo da fatia

A decisão do proprietário registrada em [`STATUS-VIGENTE.md`](STATUS-VIGENTE.md)
declarou o console de TI **esgotado** para “promoção de tela” (sem 20ª
promoção, sem abrir a borda legada de RH `authorizeLegacyHrRequest` /
`employees.read`, sem substituir superfícies vivas). A frente seguinte é
trabalho próprio de **jornada, RBAC e evidência de gate**.

No eixo PLT-01 (diretório de usuários, papéis, escopos, convites,
suspensão/revogação e **revisão periódica de acesso**) o que existia era:

- `auth_access_reviews` (migração 010) com decisão `keep|revoke|adjust`;
- `POST /api/admin/access-reviews` gravando a decisão **sem** alterar permissões
  (comportamento documentado na própria tela);
- `GET /api/admin/access-reviews` listando as 100 decisões mais recentes.

Faltava o que o requisito nomeia explicitamente: **periodicidade**. Sem prazo
declarado, “revisão periódica” era apenas um histórico de decisões avulsas, e
qualquer tentativa de marcar atraso inventaria regra que o proprietário não
aprovou (mesmo erro já evitado em EXT-02/EXT-03 para alerta e prazo).

## 2. O que foi entregue (aditivo)

### 2.1 Módulo puro `src/server/access-review-coverage.mjs`

- Regra declarada por ambiente: `ACCESS_REVIEW_INTERVAL_DAYS` (inteiro de 1 a
  730 dias). Ausente, vazio, não inteiro ou fora do intervalo ⇒ **regra não
  declarada**, com motivo explícito (`nao_informada`, `nao_inteira`,
  `fora_do_limite`). Nunca há prazo “razoável” inferido.
- `classifyCoverage({ rule, identities, reviews, asOf, limit })` puro e
  determinístico (`asOf` sempre recebido; nenhum relógio implícito):
  - `nunca_revisada` — nenhuma revisão registrada;
  - `revisado_sem_regra` — há revisão, mas não há periodicidade declarada;
  - `em_dia` / `vencida` — só existem com regra declarada, derivadas da
    revisão **mais recente** por identidade;
  - `pendente` só é `true` com regra declarada;
  - ordenação põe pendentes primeiro e, entre eles, quem nunca foi revisado;
  - datas inválidas são ignoradas (nunca viram `Invalid Date` nem veredito);
  - entrada não é mutada; `limit` é limitado a 1..500 (padrão 200) e
    `truncado` declara o corte;
  - `fronteira` afirma `altera_permissoes:false`, `revoga_acesso:false`,
    `substitui_decisao_humana:false`, `veredito_sem_regra_declarada:false`.

### 2.2 API (sem nova rota e sem tocar `server.mjs`)

`GET /api/admin/access-reviews?view=coverage` — mesma rota existente, nova
**visão de leitura**:

- sessão staff + permissão `admin.access_review` (a mesma da revisão): anônimo
  **401** `admin_session_required`; papel `rh` **403** `permission_required`;
- escopo `staff_ativo` (identidades `kind='staff' AND status='active'`), com
  papel derivado de `auth_staff_profiles`;
- `POST` com `view=coverage` responde **405** e **não** cria revisão;
- sem `view`, `GET`/`POST` mantêm o contrato anterior **byte a byte** (a
  listagem continua devolvendo apenas `{ reviews }`, sem campos novos);
- falha de banco continua mapeada como 503 (`migration_required` /
  `database_not_configured` / `rbac_unavailable`);
- a leitura **não escreve**: nenhuma revisão, nenhum evento em
  `auth_access_audit`, nenhuma alteração em `auth_permissions` (provado).

### 2.3 Tela (aba **Acessos** do console de TI, `RbacClient.tsx`)

Nova seção **“Cobertura da revisão periódica”**, somente leitura, com:

- aviso de fronteira “Sem regra declarada não existe atraso” e explicação de que
  a cobertura não altera permissões nem substitui a revisão humana;
- veredito da regra (declarada com fonte e intervalo, ou não declarada com o
  motivo traduzido) e `as_of` do servidor;
- resumo por situação e tabela identidade/papel/última revisão/dias/situação,
  com selo de pendência por tokens de tema;
- estados honestos: carregando, vazio (“Cobertura ainda não consultada”),
  erro com repetição (`role="alert"`), `aria-busy` na seção;
- nenhuma ação de escrita a partir da cobertura.

`.env.example` documenta `ACCESS_REVIEW_INTERVAL_DAYS` (vazio por padrão) e diz
que definir o prazo **não** revoga acesso automaticamente.

## 3. Prova

### 3.1 Focal — `tests/plt01-access-review-coverage.test.mjs` (no `npm test`)

**10/10**, cobrindo: as três famílias de valor inválido; limite de leitura;
classificação sem regra (sem pendência e `veredito_sem_regra_declarada:false`);
classificação com regra de 180 dias (revisão recente em dia, antiga vencida,
nunca revisada pendente, ordenação `[nunca, vencida, em dia]`, revisão mais
recente vence a antiga); dados tortos sem mutar entrada; 401/403 no handler;
leitura sem escrita; 405 no `POST` com `view=coverage`; 503 de banco; e as
strings da tela/`.env.example`/`TiConsole`.

**Controle negativo (3 mutações, todas detectadas e revertidas):**

| Mutação | Resultado |
|---|---|
| `resolveReviewRule` passa a declarar 180 dias quando a variável está ausente | 2 falhas (testes 1 e 3) |
| cobertura executa um `UPDATE auth_access_reviews` antes de ler | 1 falha (teste 7, “só lê”) |
| remove a guarda `405` do `POST` na visão de cobertura | 1 falha (teste 8) |

### 3.2 Gate dedicado — `npm run test:plt01-access-review-coverage:pg`

`scripts/qa-plt01-access-review-coverage-postgres.mjs`: cluster PostgreSQL 17
descartável (`embedded-postgres`), migrações **001–181**, servidor HTTP real
(`server.mjs --dev`), sessões staff reais `ti` e `rh`, resumo TAP autoauditado
(`MINIMUM_CASES=12`, zero skip/todo).

**12/12**, exit 0: anônimo 401; `rh` 403 com `permission`; sem regra declarada
(`motivo=nao_informada`, `pendentes=0`, `fronteira` completa, identidades `ti` e
`rh` do teste presentes); `limit=1` truncando e `limit=abc` caindo no padrão;
`POST ?view=coverage` em 405 sem gravar revisão; revisão registrada aparecendo
como `revisado_sem_regra` com data vinda do banco e auditoria existente
preservada (`auth_access_audit` = 1); três leituras sem alterar revisões,
auditoria ou permissões; segunda instância com `ACCESS_REVIEW_INTERVAL_DAYS=180`
classificando revisão recente como `em_dia` e nunca revisada como pendente;
revisão antiga inserida no banco (400 dias) virando `vencida` com
`dias_desde_ultima_revisao >= 399`; listagem original (`{ reviews }`) sem campos
novos; `/admin/ti` continuando servido.

Duas correções foram necessárias para o gate ficar honesto: cada instância
precisa de `NEXT_DIST_DIR` próprio (o Next dev recusa duas instâncias no mesmo
diretório) e as instâncias precisam compartilhar `SITE_ADMIN_SESSION_SECRET`
para a mesma sessão valer nos dois servidores. A prova de valores inválidos de
ambiente permanece no focal (determinística, sem custo de mais um processo).

### 3.3 Bateria e estáticos

- `npm test` **1374/1374** (1373 anteriores + 10 do focal novo, 0 falhas,
  0 skip) — 173 arquivos no `test:unit`.
- `npm run typecheck` limpo.
- `npm run build` limpo.
- `npm run test:ux-pro-03-rbac-ui` (focal do componente) e
  `tests/ux-pro-03-ti-reaudit.test.mjs` verdes junto do focal novo (20/20).
- Inventários **regenerados pelos scripts oficiais** (nunca editados à mão) e
  `--check` verde nos três: `ux-pro-00-inventory` (`/admin/ti` passa a 43 testes
  de jornada), `ux-pro-03-ti-inventory` (84 componentes, 19 promoções — nenhuma
  promoção nova) e `requisitos-222-inventory` (PLT-01 sai de
  `somente_documento` para `gate_nomeado`; **24** `gate_nomeado` / **74**
  `somente_documento` / **124** `mencionado_em_gate`; `a_revalidar` sem menção
  em gate cai de 16 para **15**).

## 4. Comportamento preservado

- Endpoint, rota e visão padrão da lista de revisões inalterados; nenhuma
  coluna, campo ou resposta removida.
- Semântica da decisão de revisão preservada: registrar decisão **não** altera
  permissões nem revoga acesso (a tela continua dizendo isso, agora com a
  cobertura ao lado).
- Nenhuma permissão concedida ou revogada por esta fatia; `rbac.mjs` intocado.
- Borda legada de RH (`authorizeLegacyHrRequest`, `employees.read`) **não**
  aberta: `rh` continua recebendo 403 nas duas visões.
- Console de TI mantém **32 abas**, **19 promoções com relatório**,
  **27 órfãos** e `promovidosSemSairDaClassificacao=0`; nenhum componente órfão
  foi montado e `TiConsole.tsx` não foi alterado.
- `server.mjs` não foi editado (nenhuma rota nova, nenhum padrão de caminho
  novo, sem risco de sombrear subcaminhos).

## 5. Limitações declaradas

- **Não** houve aceite humano, UAT, homologação Windows, leitor de tela, revisão
  WCAG manual nem reauditoria integral. PLT-01 permanece `a_revalidar`.
- O gate cobre um recorte da jornada (leitura/RBAC/derivação). Não exercita em
  navegador (Chromium) a nova seção; a prova de UI é estática + handler HTTP.
- A “revisão periódica” ainda **não** tem campanha formal (lote de revisão por
  período, atribuição de revisores, prazo por identidade, notificação). O que
  existe agora é a **cobertura derivada** com regra declarada e sem veredito
  quando ela não existe.
- Sem regra declarada no ambiente atual: o padrão é **sem prazo**, e portanto a
  tela mostra fatos, não atraso. Definir o prazo é decisão do proprietário.
- Papéis/escopos continuam avaliados por `auth_permissions`; a matriz
  papel × ação × escopo do CLI-02 e o `team` sem efeito prático no avaliador
  seguem como estavam.
- A auditoria de concessão/revogação/revisão continua **auxiliar** (`.catch()`
  silencioso) e a tela segue declarando isso; tornar a auditoria transacional é
  fatia separada, com risco de mudar comportamento existente.
- Nada foi aplicado em banco de destino; nenhum dado real foi tocado.
