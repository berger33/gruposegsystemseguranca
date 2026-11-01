# UX-PRO-03 — promoção "com prova" de `EmpPwaClient` (EMP-18/EMP-19)

**Data:** 2026-11-01
**Fatia:** 17ª promoção com prova do console de TI (`/admin/ti`)
**Componente promovido:** `src/app/admin/ti/EmpPwaClient.tsx` (342 → 391 linhas, reescrito; + `emp-pwa-state.ts` 306 linhas + `EmpPwaClient.module.css` 40 linhas)
**Aba nova:** `emp_pwa` — "App do funcionário: PWA e FAQ" (30ª aba)
**Grupo:** Experiência e comunicação
**Commit:** ver `git log --oneline -1` no ramo `arena/3f450206-gruposegsystemseguranca`

---

## 1. Por que este componente, e por que **não** `EmpAdvanced2Client`

O maior órfão restante era `EmpAdvanced2Client.tsx` (332 linhas, 11 rotas). Ele
foi medido e **descartado antes de qualquer código escrito**, pelo mesmo motivo
que barrou `AdmAdvancedClient`:

| Candidato | Rotas medidas | Obstáculo medido | Decisão |
|---|---|---|---|
| `EmpAdvanced2Client` | 11 rotas `/api/{admin/,crm/}hr/{communications,communication-reads,notifications-center,hr-tickets,hr-messages,hr-attachments,confidential-*}` | o roteador despacha essas rotas **dentro** do bloco protegido por `authorizeLegacyHrRequest` (`server.mjs:2653`), que exige `employees.read`/`employees.write` e devolve **403 justamente para `admin` e `ti`** — os papéis que o próprio handler autoriza. Promover a tela exigiria abrir a borda legada de RH para **dado de funcionário** (mensagem, anexo, denúncia confidencial) em 11 rotas. Não é aditivo nem seguro. | **descartado** |
| `EmpPwaClient` | 6 rotas na borda legada (`pwa-configs`, `faq-internal`, `faq-access-logs`, `offline-queue`, `offline-conflicts`, `accessibility-preferences`) + as 2 públicas que `layout.tsx` já usa (`/api/pwa/manifest.json`, `/api/pwa/sw.js`) | **configuração de aplicativo e conteúdo de FAQ não são dado pessoal**: bastam dois caminhos canônicos de administração, sem abrir a borda de RH | **promovido** |

O critério é o mesmo registrado em `tests/ux-pro-03-ti-reaudit.test.mjs`: uma
segunda superfície para o mesmo dado não é entrega, é dívida. Aqui não há
segunda superfície — as tabelas `emp_pwa_configs` e `emp_faq_internal` **não têm
nenhum outro consumidor** em `src/app` (verificado por grep): o console de TI é a
única tela que escreve nelas.

Partes que **permanecem fora** desta tela, de propósito: fila offline,
conflitos de sincronização, log de acesso ao FAQ e preferências de
acessibilidade. Todas são dado de funcionário e continuam atrás de
`employees.read`; a tela **declara** cada uma com rota e tabela
(`emp-lista-fora`), em vez de montar botão que sempre falha.

## 2. O que o protótipo fazia (e o que passou a fazer)

| # | No protótipo | Efeito medido | Agora |
|---|---|---|---|
| 1 | as cinco leituras em `/api/hr/*` | `ti` — o papel que monta a tela — recebia **403 em tudo** | `/api/admin/pwa-configs` e `/api/admin/faq-internal`, fora da borda legada; o gate prova que os aliases `/api/hr/*` **continuam 403** para `ti` e **continuam 200** para `rh` |
| 2 | `api(...).catch(() => ({configs: []}))` em cada leitura | negação virava "nada aqui" | `classificarLista` separa `ok`/`vazio`/`negado`/`falha`/`invalido`; cada coleção mostra seu estado (`emp-estado-configs`, `emp-estado-faqs`) |
| 3 | `any` em todos os tipos; uma `msg` única para erro e sucesso | operador não sabia se gravou ou falhou | tipos reais; `emp-ok` e `emp-erro` em lugares distintos; nenhuma mensagem fixa de sucesso |
| 4 | criação de FAQ nascia com `status: "publicado"` e quatro botões de situação fixos para qualquer linha | publicava sem revisão e permitia arquivar→publicado direto | criação só em `rascunho`/`em_revisao`; `proximosEstados` oferece **só** o próximo passo do ciclo |
| 5 | nenhuma validação antes do POST | fila `0`, cor `azul`, descrição curta, categoria inventada iam ao banco | `validarConfig`/`validarFaq` espelham os CHECK/enums da migração 069 (`emp-erro-fila`, `emp-erro-cor`…) |
| 6 | `is_active`, `is_published`, tags e tarefas offline exibidos como `true/false`/JSON | operador lia valor cru | `simNao`, `estadoConfig`, `tagsLegiveis`, `tarefasLegiveis` |

## 3. Defeitos do servidor — encontrados e corrigidos com prova

### 3.1 O `PATCH` não validava nada: erro do operador voltava como 500

`handlePwaConfigs` e `handleFaqInternal` validavam **todos** os campos no `POST`
e **quase nenhum** no `PATCH`. Quem respondia pelo valor inválido era o banco:
`CHECK (max_queue_size BETWEEN 1 AND 200)`, `CHECK (max_retries BETWEEN 1 AND 20)`,
`CHECK (description ...)`, enums `emp_pwa_display`, `emp_faq_category`,
`reading_level`. Resultado: fila `0`, 21 tentativas, `display: "janela"`,
`theme_color: "azul"`, `category: "inventada"` e `reading_level: "doutorado"`
devolviam **500 `internal_error`** — indistinguível de queda do servidor, sem
dizer ao operador qual campo errou.

Correção (espelhada, sem tocar no schema), com 400 e código próprio por campo:

* `invalid_name`, `invalid_short_name`, `invalid_description`,
  `invalid_theme_color`, `invalid_background_color`, `invalid_display`,
  `invalid_scope`, `invalid_start_url`, `invalid_approved_offline_tasks`,
  `invalid_max_queue_size`, `invalid_max_retries`, `invalid_do_not_cache_patterns`;
* `invalid_category`, `invalid_reading_level`, `invalid_tags`.

O gate prova os nove casos de `pwa-configs` e os três de `faq-internal` como
**400**, e prova que a linha **não muda** depois de cada recusa.

### 3.2 O caminho canônico não bastava: o adaptador de papéis barrava `ti` e `admin`

Adicionar `/api/admin/pwa-configs` ao roteador foi necessário, mas **não
suficiente**: `empPwaApi` é criado com `requireRole: hrPermissionCompat`, que
traduz a lista de papéis em permissão granular de RH e, para listas **sem `rh`**
— exatamente `['admin','ti']` do `POST`/`PATCH` de configuração —, exige
`employees.compensation.write`. O gate mediu **403** no `POST` de `ti` antes da
correção.

Correção: `empPwaRequireRole` — nos dois caminhos canônicos de administração
(`/api/admin/pwa-configs`, `/api/admin/faq-internal`) a checagem é de **papel**,
como nos módulos que nunca passaram pela borda de RH; nos aliases `/api/hr/*`,
`/api/admin/hr/*` e `/api/crm/hr/*` nada mudou (borda legada + `hrPermissionCompat`
na mesma ordem). Provado no gate: `ti` **201** no caminho canônico, `rh` **403
`forbidden`** na escrita, alias de RH **200** só para quem tem `employees.read`.

## 4. Contrato da tela (`src/app/admin/ti/emp-pwa-state.ts`, 306 linhas)

Puro: sem React, sem DOM, sem `fetch`.

* `DISPLAY`, `TAREFAS_OFFLINE`, `CATEGORIAS_FAQ`, `STATUS_FAQ`, `NIVEIS_LEITURA` —
  espelhos dos enums da migração 069 (o teste compara com o próprio `.sql`);
* `TRANSICOES_FAQ` + `proximosEstados` — política desta tela, declarada como tal;
* `classificarLista(status, corpo, chave, rótulo)` — `ok`/`vazio`/`negado`/`falha`/`invalido`,
  com chave errada tratada como resposta inválida (não como lista vazia);
* `traduzirErroEmp` — 31 códigos do servidor, um por código; o teste garante que
  nenhum deles cai no texto genérico;
* `validarConfig`/`validarFaq`/`validarTransicao` — faixas do CHECK, UUID e ciclo;
* `simNao`, `estadoConfig`, `tarefasLegiveis`, `tagsLegiveis`, `chaveConfig`,
  `chaveFaq` — exibição honesta: `null` não vira "false".

## 5. Prova

### 5.1 Teste focal — `tests/ux-pro-03-ti-emp-pwa-faq-ui.test.mjs` (10 testes)

* GREEN **10/10** depois da fatia, com **4 mutações medidas** (cada uma derrubou
  pelo menos um teste): (M1) aceitar qualquer destino no `validarTransicao`,
  ignorando o ciclo → 9/10; (M2) apagar a validação de `max_queue_size` no
  `PATCH` → 9/10; (M3) voltar a leitura de configuração para
  `/api/hr/pwa-configs` → 9/10 (a primeira versão da guarda **não** pegava esta
  mutação, porque só olhava `fetch`; foi corrigida para cobrir `ler(...)`, e a
  mutação passou a falhar); (M4) remover `/api/admin/pwa-configs` do despacho →
  9/10;
* as cinco listas são comparadas com os enums **da migração** (`069-…sql`), não
  com documentação;
* guardas estáticas: nenhum `any`, nenhuma leitura em `/api/hr/*`, nenhum
  `.catch(() => ({configs: []}))`, `useEffect` de leitura, caminho canônico
  presente, aliases de RH **intactos** em `server.mjs`, `emp_pwa` na 30ª aba e
  no grupo "Experiência e comunicação", CSS só com tokens.

### 5.2 Gate de navegador — `browser UX-PRO-03 EMP-18/19` (PostgreSQL 17 + Chromium)

Sessões `ti` e `rh` reais, cookie de sessão de equipe:

| Verificação | Resultado medido |
|---|---|
| leitura anônima | **401** nas duas rotas |
| `ti` no caminho canônico | **200** configuração, **200** FAQ |
| `ti` no alias legado de RH | **403** `employee_permission_required` (`employees.read`) |
| `rh` no alias legado | **200** (nada foi afrouxado para quem já podia) |
| `rh` escrevendo configuração | **403** `forbidden` |
| `PATCH` inválido (9 casos de configuração) | **400** com código próprio, **linha intacta** no banco |
| `PATCH` inválido (3 casos de FAQ) | **400** `invalid_category`/`invalid_reading_level`/`invalid_tags` |
| `POST` de configuração pela tela | **201**, versão = `MAX(version)+1` (não vem do cliente), tarefa `shift_swap` gravada |
| fila `0` na tela | recusada **antes** do envio; contagem em `emp_pwa_configs` não muda |
| desativar a configuração ativa | `is_active=false`; `/api/pwa/manifest.json` continua **200** (padrão do código) |
| criar FAQ pela tela | nasce `rascunho`, `is_published=false`; só `em_revisao`/`arquivado` oferecidos |
| ciclo `rascunho→em_revisao→publicado` | `is_published=true`, `published_by="ti"` |
| `publicado→arquivado` | `is_published=false` |
| tela em 320/390/1440 e à noite | `sobraDocumentoPx: 0` nos quatro retratos |
| negação injetada na leitura | `data-situacao="negado"`, sem "Nenhum registro" |
| `rh` no console | `data-admin-gate="forbidden"`, nenhum card montado |

Evidências: `docs/ux-pro-03-emp-pwa-evidencias/` (11 PNGs + `resumo.json` com
`problems: []`).

### 5.3 Suíte e guardas estáticas

* `npm test`: **1341/1341** (`| Testes |` em `docs/STATUS-VIGENTE.md`, 170
  arquivos explícitos no `test:unit`);
* `npx tsc --noEmit`: limpo; `npm run build`: limpo; `npm audit`: 0;
* `npm run reaudit:sec`: 35/35 âncoras;
* inventário TI: **30 abas com prova**, **17 promoções**, órfãos **29** (`--check` verde);
* gate completo do portal: **56/56** (1.093 s), incluindo o cenário novo desta
  fatia.

## 6. Limites declarados (não são promessas)

* **Não há app publicado nesta fatia**: a tela administra a configuração
  versionada e a FAQ. Instalação real, push, cache e sincronização offline
  continuam sem prova de dispositivo — só o manifest e o service worker servidos
  pelo servidor.
* O servidor continua **sem máquina de estados** para a FAQ: qualquer um dos
  quatro valores é aceito a qualquer momento; a ordem é política desta tela.
* Publicar liga `is_published`/`published_at`/`published_by` no servidor; a tela
  não desliga a publicação por edição silenciosa de outro campo.
* Fila offline, conflitos, log de acesso e preferências de acessibilidade
  **não** foram promovidos: são dado de funcionário e seguem atrás de
  `employees.read`. A tela os declara com rota e tabela.
* `EmpAdvanced2Client` foi **descartado com medição**: 11 rotas de dado de
  funcionário presas na borda legada que nega `admin`/`ti`.
* Sem leitor de tela e sem Windows: teclado, foco e contraste medidos só no
  Chromium empacotado.
* **Sem aceite humano, sem homologação, sem UAT.** Promoção de tela não é aceite
  de requisito: o retrato do inventário 222 é atualizado apenas pelo gerador.
* **Produção: NO-GO. Aceite humano: 0/222.**
