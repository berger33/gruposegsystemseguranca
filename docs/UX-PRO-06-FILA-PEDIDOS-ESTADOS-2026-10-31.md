# UX-PRO-06 — fila de pedidos: leitura sequenciada e estados honestos

**Data:** 31/10/2026 · **Base real:** `d9d2356b25ca421dab61ee0f3af562288911a3e1` (`origin/main`, merge da PR #320) · **Branch:** `arena/a27b3a4a-gruposegsystemseguranca`.

**Escopo:** somente a fila de `/admin/leads`, seu estado de leitura/escrita e a prova dessa superfície. Não é uma nova tela, uma promoção do TiConsole nem a conclusão de UX-PRO-06. Produção permanece **NO-GO**, conforme `docs/PRODUCAO-GATE.md`; não há aceite humano ou homologação.

## 1. Inventário antes da implementação

A árvore estava limpa e HEAD era idêntico a `origin/main`; nenhum reset foi necessário. Foram lidos, nesta ordem, `AGENTS.md`, `README.md`, `STATUS-VIGENTE.md`, os dois registros da jornada RH de 29–30/10, o gate de produção e, depois do inventário, o código da fila e seus consumidores.

| Item | Medição na base |
|---|---|
| TiConsole | 84 componentes; 24 abas, 24 com prova; 35 órfãos; 11 promoções; 403 literais de API, 0 sem despacho |
| Índice 222 | 222 IDs; 46 `a_revalidar`; 20 sem gate; classes 23/114/85; 0 aceite humano; 0 reauditorias integrais; 1.629 arquivos varridos |
| Rotas | 101 entradas; 101 com gate; 54 com captura visual; `/admin/leads` **sem captura registrada** |
| Testes | 161 arquivos explícitos; suíte hermética 1245/1245 em execução serial |
| Gate CRM | 37/37, 0 skips, PostgreSQL 17 descartável, 001–181, HTTP e Chromium reais |
| Sonda focal da fila | 6/6 nos cenários cujo título contém `fila`, 0 skips |
| Estrutura | 49 workflows; migrações 001–181; próxima livre 182 |

As quatro verificações de inventário passaram na base. A primeira execução de `npm test`, sobreposta ao gate, teve 1244/1245: a guarda de higiene leu `next-env.d.ts` enquanto o Next do gate o apontava temporariamente para seu distDir. A repetição **serial**, após o encerramento e restore do gate, fechou **1245/1245**. Não se atribuiu essa falha de concorrência à aplicação nem se alterou a guarda. Os hashes canônicos permaneceram intactos.

### Escolha e alternativas

- Carteira, funil, casca/histórico comercial, lista/detalhe de contratos e cadastros centrais de clientes já têm fatias próprias. Não foram reimplementados.
- Os componentes comerciais compartilhados com `/admin/ti` ampliam o raio da mudança; ficam fora desta fatia.
- A fila de pedidos já é rota viva e possui ações reais, mas ainda não tinha captura registrada. Seu carregamento não tinha sequência, negativa explícita, validação integral do envelope nem retry no próprio estado de falha. Esses são defeitos delimitados e verificáveis, sem necessidade de novo contrato.
- `OriginMetricsPanel`, embora montado nesta página, tem outro ciclo de leitura e não foi alterado. Suas eventuais limitações não são declaradas resolvidas.

### Contrato que deve permanecer

| Superfície | Papel/ação preservados |
|---|---|
| `/admin/leads` | `AdminGate`: comercial, marcelo, admin, ti; login local de contingência e navegação existentes |
| `GET /api/admin/session` | sessão staff real, inclusive o formulário local existente |
| `GET /api/admin/leads?limit=100&status=…` | 401 sem sessão; 403 fora dos quatro papéis; lista administrativa global, máximo 100; filtros e total do servidor preservados |
| `PATCH /api/admin/leads/:id` | corpo `{status}`; mesmos papéis, mesma origem, transação e auditoria do servidor |
| `POST /api/crm/leads/:id/convert` | corpo `{create_company:true,company_name:…}`; criação/reaproveitamento idempotente existentes |
| Apresentação | espera, atenção, fonte, responsável, protocolo, próxima ação, ordenação, contato, WhatsApp, conversão, seleção de situação, métricas e todos os campos atuais |

**Não entram:** API, autorização do servidor, banco, migrações, papéis, navegação, métricas, reclamações do RH, mensagens/evidências, backup, F02, B2 ou provedores. A fila administrativa é global por contrato; A/B nesta fatia significa ausência de resíduos de sessão/interface, **não** isolamento de dados por conta.

## 2. Hipóteses provadas antes da correção

1. Trocar rapidamente os filtros deixava uma resposta antiga substituir a nova e encerrar o carregamento antes da hora.
2. Um 403 após uma leitura válida não tinha negativa explícita nem descarte próprio.
3. Um envelope malformado podia virar `[]` e ser apresentado como ausência real de pedidos.
4. A primeira falha não oferecia repetição dentro do próprio alerta; um 503 de escrita usava a mensagem genérica de carregamento.

## 3. Implementação e contrato preservado

Arquivos de produto: `src/app/admin/leads/page.tsx`, novo `lead-queue-state.ts` e estados CSS em `LeadAdmin.module.css`. Nenhuma migration, handler, dependência, papel, permissão, campo ou contrato HTTP foi alterado. `OriginMetricsPanel` fica intacto. Não há promoção de aba nem incremento de `EXPECTED_TABS`/`PROMOCOES_COM_PROVA`.

- `parseLeadQueue` valida envelope, lista e total; preserva campos adicionais e o enum amplo já aceito pelo TypeScript. Payload malformado não vira lista vazia.
- Leituras têm sequência monotônica própria: lista, resumo, filtro efetivamente carregado, loading e erro só publicam a leitura atual. Troca de filtro/sessão invalida respostas antigas.
- Escritas têm sequência de **contexto** separada: duas escritas podem coexistir; releituras não invalidam uma escrita; troca de filtro/login/logout invalida sucesso/releitura atrasados. Cada pedido mantém seu próprio bloqueio.
- 401 e 403 encerram o acesso local e descartam dados, sem retry. Falha de rede/0/408/429/5xx/`db-not-configured`/`migration-required` preserva a última leitura válida, identificada como possivelmente desatualizada com horário e filtro. Resposta inválida é erro explícito, não sucesso nem vazio.
- Retry lê o filtro atual. `Atualizar pedidos` permanece. Resumo/total só aparecem após leitura válida; antes dela o total é `—`.
- Logout/login limpam papel, dados, avisos, erros, credenciais, filtro, ordem e sequências. A resposta atrasada de escrita não reabre A nem mostra seu sucesso em B.
- Conversão usa o corpo real e preserva `dedup`; atualização usa `lead` validado. Erros de escrita continuam junto aos controles globais e ao cartão, sem duplicar o código cru.

## 4. RED → GREEN real e correções durante a investigação

Comando focal, explicitamente listado em `package.json` → `test:unit`:

```sh
AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x node --test tests/ux-pro-06-fila-pedidos-estados.test.mjs
```

| Momento | Resultado | Leitura honesta |
|---|---:|---|
| Focal antes do produto | **0/7** | Sete contratos ainda ausentes na superfície viva. |
| Focal após implementação | **7/7** | Contratos estáticos e parser executado. |
| Mutação das guardas de sequência | **5/7** | Dois testes detectam a remoção; restauração **7/7**. |
| Browser RED inicial | **0/3** | Inclui duas premissas erradas da sonda, corrigidas antes de atribuir defeito ao produto. |
| Browser RED corrigido | **1/3** | A resposta antiga do filtro substitui a nova: A mostra 0, B mostra 1. Defeito real. A/B ainda falhava por premissa de redirect da sonda, não por prova de resíduo. |
| Browser GREEN focal | **3/3** | Escrita/auditoria, sequência/503/retry/inválido/negativa e A/B/larguras. |
| Primeira bateria CRM completa | **39/40** | Regressão real: sequência de leitura invalidava a primeira de duas escritas simultâneas; teste antigo de concorrência falhou. |
| Correção de contexto de escrita | **4/4** no recorte | O cenário antigo de concorrência + três novos passam; focal **7/7**. |

Uma tentativa intermediária de aplicar a separação de sequências falhou por erro de sintaxe no script de edição, antes de alterar arquivos. O log `05-concurrent-writes-green.log` ainda contém a falha 3/4 e **não** é evidência GREEN. A aplicação corrigida está em `05-concurrent-writes-green-real.log` (**4/4**). Não foi descartada a falha anterior.

Também foram corrigidas as sondas: conversão CRM aceita staff individual, inclusive RH; logout local da página não redireciona ao login central. O contrato existente foi preservado, não “consertado” por restrição de papel. A asserção A/B usa avisos visíveis (`p[role=status]`), não texto de scripts/RSC. A sonda segura apenas a **resposta** da escrita já persistida; não transforma a escrita em requisição não autenticada. Duas asserções focais inicialmente acopladas a detalhes literais do código foram relaxadas após a implementação; o RED original permanece registrado, sem alegar que essas duas versões eram idênticas.

## 5. Evidência PostgreSQL + navegador

```sh
AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x \
UX_CRM_TEST_PATTERN='UX-PRO-06 fila:' \
UX_LEADS_STATE_EVIDENCE_DIR=docs/ux-pro-06-fila-estados-evidencias \
npm run test:ux-crm:pg
```

Runner oficial, PostgreSQL 17 descartável, migrations **001–181**, servidor Next real e Chromium. Apenas identidades/leads sintéticos. `QA_PG_TEMP_CLEANED: true` nas execuções registradas.

| Prova | Resultado observado |
|---|---|
| Papel comercial | PATCH real **200**, `lead.status=confirmada`, registro em `public_lead_status_audit` e `auth_access_audit`. |
| Conversão | POST real **201**; repetição **200**, `dedup:true`; uma oportunidade e uma ação `crm_lead_convert`. |
| RH | `/admin/leads` GET/PATCH **403**; AdminGate mostra negativa e não monta a fila. A conversão CRM individual permitida ao RH continua **201**, sem redução de contrato. |
| Fora de ordem | Filtro A atrasado não substitui B; resumo/filtro permanecem B. |
| 503/retry | Falha transitória preserva dados com aviso de desatualização; retry real recupera a leitura. |
| Payload inválido | Erro de leitura, não vazio/sucesso; retry recupera. Contexto novo com `storageState` garante a sonda antes do boot após reload. |
| Negativa | 403 descarta dados e não oferece retry de leitura. |
| A/B | UI de A grava PATCH e converte; resposta final da escrita é adiada através do logout. B não recebe formulário, aviso ou dados de A; entra com `Acesso autenticado.`. A escrita já persistida permanece `confirmada` no banco. |
| Larguras | **320/390/768/1440** claro + **390** noite, sem overflow horizontal; cinco capturas e `resumo.json`, todos `problems: []`. |
| Teclado | `lead-filter → Atualizar pedidos → lead-order`; primeiro foco e outline registrados no recorte noturno. |

A/B prova **limpeza de sessão/UI**, não isolamento de registros: a fila administrativa é compartilhada e B pode legitimamente ler o mesmo pedido. Não se alega isolamento por conta que o contrato atual não possui.

Evidências: `docs/ux-pro-06-fila-estados-evidencias/fila-{320,390,768,1440}.png`, `fila-390-noite.png` e `resumo.json`. Logs integrais serão publicados nos comentários da PR; não são versionados.

## 6. Preservação e bateria final

Resultados da árvore final estão na tabela da PR, com logs integrais em comentários. A primeira bateria completa já preservou portal **49/49**, RH **20/20**, unidade **1252/1252**, build **106 páginas**, inventários, Wave0, SEC e dependências; sua falha CRM **39/40** foi corrigida. Na bateria final serial, CRM **40/40**, RH **20/20**, unidade **1252/1252**, build **106 páginas**, inventários, Wave0, SEC e dependências passaram. O portal teve a falha G5 descrita abaixo e, após investigação, passou **49/49** na repetição completa sem filtro. Não se chama a primeira execução de bateria verde.

Baseline limpa: `npm test` 1244/1245 com interferência de gate concorrente em `next-env.d.ts`; repetição serial **1245/1245**. CRM antigo **37/37**. Nenhuma execução final foi feita em paralelo com gates que reescrevem arquivos canônicos. Hashes SHA-256 esperados após restauração:

- `next-env.d.ts`: `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`;
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

Inventários regenerados exclusivamente pelos quatro geradores aprovados. TI permanece **84 componentes / 24 abas com prova / 35 órfãos / 11 promoções**; nenhum contador de promoção foi incrementado. O índice 222 passa a varrer **1.633 arquivos** (valor também atualizado no relatório E23), mantendo **222 IDs**, **46 a_revalidar**, **20 sem gate** e **zero aceite humano**. A matriz de rotas registra as quatro larguras e dia/noite da fila; não transforma captura automatizada em aceite manual.

Na repetição final, o portal teve **48/49**: o cenário antigo G5 de foco após erro em `/cliente/convite` perdeu o foco para BODY a 390 px. Esse cenário passou na primeira bateria e não toca os arquivos da fatia. A investigação extraiu a base `d9d2356` sem trocar de branch e repetiu o cenário **duas vezes na base e duas na árvore alterada**: **1/1 nas quatro execuções**, sem reproduzir. Uma quinta execução do script herdou `UX_PORTAL_TEST_PATTERN` por engano e rodou apenas **1/1**; foi identificada como filtrada, não como gate completo. O portal completo foi então repetido **sem filtro**: **49/49**, 0 falhas/skips, `QA_PG_TEMP_CLEANED: true`, log `07-portal-changed-full-clean.log`. A falha 48/49 permanece registrada. Não houve SIGSEGV de Chromium nesta sessão. Não se declara estabilidade absoluta nem se atribui a falha à fatia sem reprodução. Não foram alterados `PATCH /api/admin/employee-complaints`, mensagens/evidências item-level, matriz de autorização, provedores, backup, F02 ou B2. Nenhum upload real, anonimização, revisão jurídica, leitor de tela, Windows real, UAT ou aceite humano foi realizado. Produção permanece **NO-GO** conforme `docs/PRODUCAO-GATE.md`.

## 7. Entrega

Uma fatia aditiva em `/admin/leads`; um commit na branch da sessão; uma PR contra `main`, sem merge automático. O ledger único é `docs/STATUS-VIGENTE.md`. PR **#322**: <https://github.com/berger33/gruposegsystemseguranca/pull/322>, aberta contra `main`, sem merge. Número reconciliado no próprio commit.
