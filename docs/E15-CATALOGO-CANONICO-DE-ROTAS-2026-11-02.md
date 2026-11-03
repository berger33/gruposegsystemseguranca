# E15 — catálogo canônico de rotas de `server.mjs` (02/11/2026)

**Medição atualizada:** fatia autorizada de execução E15 sobre `main` `1f32604` · **Natureza:** remoção de regras inalcançáveis do despacho; handler público de FAQ mantido; não cria migração,
não toca `TiConsole.tsx`, não abre a borda legada de RH, não mexe em N7.
**Produção: NO-GO.** Aceite humano **0/222**. Reauditoria integral **0/222**.

> **Atualização de 03/11/2026 (fatia B autorizada):** as **três rotas inalcançáveis** deste relatório passaram a ser
> reconhecidas pela borda. O despacho **não** foi tocado. Retrato corrente em **§3.3**; os números de §3 e §3.1 são a
> medição de 02/11 e ficam preservados como registro. `server.mjs` hoje: **6.316** linhas, sha256 `5d3d67bee2be463a…`.

---

## 1. O problema, em uma frase

`server.mjs` resolve o caminho de uma requisição em **dois lugares independentes**: a **borda**
(`API_PATH_MATCH`, que decide "isto é API?") e o **despacho** (`routeApi`, que decide "qual handler?").
Nada garantia que os dois concordassem — e, medido, **não concordam**.

Consequência medida do defeito, não hipótese:

- caminho **no despacho e fora da borda** → o `createServer` manda para o Next, o handler **nunca é chamado**;
- caminho **na borda e fora do despacho** → cai no `404` interno do roteador (medido: **0** hoje).

O comentário que já existe no próprio código, na borda (linha ~5607), descreve um caso real do passado:

> `// Faltava aqui: o alias público estava despachado em routeApi e é o que a tela /cliente/acesso usa,`
> `// mas nunca entrou na lista de caminhos de API — toda requisição caía no Next e voltava 404.`

O defeito não é teórico nem novo: é **recorrente** e invisível em revisão de diff, porque cada linha isolada
parece correta.

## 2. O que esta fatia entrega

| Artefato | Papel |
| --- | --- |
| `src/server/route-catalog.mjs` | Parser determinístico (texto, sem AST, sem I/O de banco/rede/Next) que extrai as três resoluções de caminho e classifica cada regra. |
| `scripts/e15-route-catalog.mjs` | Gerador (`--check` para CI, `--relatorio` para o bloco medido). Mesmo padrão dos outros inventários. |
| `docs/E15-ROTAS-CATALOGO-2026-11-02.json` | Tabela canônica versionada (colunas `tipo, caminho, modulo, linha, provedor`), com as divergências nomeadas. |
| `tests/e15-route-catalog.test.mjs` | **19 testes**: paridade com o código, controle negativo, prova executável da borda e reconciliação das nove decisões históricas com as quatro sombras remanescentes após as cinco remoções autorizadas. |

**Limites declarados, para não virar aceite falso:** o catálogo **não** decide método HTTP (a cadeia de `if`
casa só o caminho; declarar `GET`/`POST` seria inferência); **não** executa rota real (alcance é calculado por
sobreposição de padrões, não por requisição); **não** substitui teste de integração. Ele prova a existência — ou
a ausência — da **regra** em cada camada.

## 3. Retrato medido em 02/11, após as remoções autorizadas

> Registro da medição original. O retrato **corrente** (03/11, após a correção da borda) é o de **§3.3**.

Sobre `server.mjs` após as remoções autorizadas (`wc -l` = **6307** linhas, sha256 `04653b746a06d95d…`):

| Camada | Regras | Composição | Trecho |
| --- | --- | --- | --- |
| Borda `API_PATH_MATCH` | **1514** | 1393 exatas · 121 prefixos · 0 regexes | linhas 4670–6200 (**1531** linhas de cadeia) |
| Despacho `routeApi` | **1735** | 1487 exatas · 25 prefixos · 223 regexes | linhas 2582–4668 (**2087** linhas) |
| — das quais **de handler** | **1704** | em **128** módulos | |
| — das quais **pré-autorização** | **31** | bloco `startsWith` de RH que chama `authorizeLegacyHrRequest` | |

**Divergências medidas (o RED):**

| Classe | Antes desta fatia | Significado |
| --- | --- | --- |
| **Inalcançáveis** | **3** | rota existe no despacho, a borda não a reconhece |
| **Sombreadas** | **7** (3 declaradas intencionais no código) | regra posterior nunca é alcançada: uma anterior casa primeiro; as cinco remoções autorizadas já foram executadas |
| **Borda sem despacho** | **0** | caminho passa a borda e não tem handler |
| **Formas não reconhecidas** | **0** | o parser cobre 100% das comparações de caminho de hoje |

### 3.1 As 3 rotas inalcançáveis (nomeadas — corrigidas em 03/11, ver §3.3)

| Rota | Linha no despacho | Módulo | Situação em 02/11 |
| --- | --- | --- | --- |
| `/api/crm/management-diary` | 3038 | `contractManagementDiaryApi.handleSearch` | **sombreada pela borda**: `API_PATH_MATCH` devolve `false` |
| `/api/crm/management-diary/search` | 3038 | `contractManagementDiaryApi.handleSearch` | idem |
| `/api/admin/ai-rag-directory-sources` | 4603 | `aiRagDirectoryApi` | idem |

**Prova executável (não leitura de texto):** a cadeia de `API_PATH_MATCH` é extraída, vira função real e é
executada. `API_PATH_MATCH("/api/crm/management-diary")` → **`false`**; `("/api/crm/management-diary/search")`
→ **`false`**; `("/api/admin/ai-rag-directory-sources")` → **`false`** (medição de 02/11; hoje as três devolvem
**`true`**, ver §3.3). Controle positivo no mesmo teste: `("/api/crm/commercial-versions")` → **`true`** (a borda
não barra tudo). O teste que guardava este achado — `E15: as três rotas do achado de 02/11 passam a borda depois da
correção autorizada` — foi **invertido junto com a correção**: hoje ele falha se qualquer uma voltar a ser barrada,
e mantém um controle negativo (`/api/e15/rota-inventada` continua `false`) para não passar por vacuidade.

**Por que isso importa na prática:** `src/app/admin/ti/DirectorySourcesClient.tsx` faz
`fetch("/api/admin/ai-rag-directory-sources")` e a aba `pastas` do `TiConsole` monta esse componente. O caminho
`/api/crm/contracts/:id/management-diary` — o que a tela realmente usa — **é** reconhecido pela borda (está sob o
prefixo `/api/crm/contracts/`), então a tela do contrato continua funcionando; a raiz
`/api/crm/management-diary` é que nunca chega ao handler. **Nada foi alterado nesta fatia** (02/11): corrigir a
borda é mexer no roteador vivo e exige decisão do dono. Essa decisão veio e foi executada em 03/11 — §3.3.

### 3.2 As 12 sombreadas (nomeadas)

| Rota | Linha | Coberta por (linha) | Classificação |
| --- | --- | --- | --- |
| `/api/crm/contracts/from-proposal` | 3065 | 2980 (`contractL05Api`) | **intencional** — o código diz "remain for historical code references but are not reachable through HTTP" |
| `/api/crm/contracts` | 3074 | 2980 (`contractL05Api`) | **intencional** — idem |
| `/api/client/visits` | 3832 | 2702 (`clientSpaceApi`) | **intencional** — nota de CLI-07 no código |
| `/api/admin/integrations/jobs` | 3192 | 2808 (`integrationsApi`) | **decidida — manter**: falso positivo (o guard `!INTEGRATION_ROUTE_SUBPATHS.has` desvia 2808) |
| `/api/admin/integrations/logs` | 3195 | 2808 | **decidida — manter**: falso positivo, idem |
| `/api/admin/integrations/webhooks` | 3198 | 2808 | **decidida — manter**: falso positivo, idem |
| `/api/admin/integrations/reconciliation` | 3204 | 2808 | **decidida — manter**: falso positivo, idem |
| `/api/admin/hr/journey-corrections` | 3457 | 2636 (`employeeApi` pré-auth) | **decidida — remover regra**: sombra real |
| `/api/crm/hr/journey-corrections` | 3457 | 2636 | **decidida — remover regra**: sombra real |
| `/api/hr/journey-corrections` | 3457 | 2636 | **decidida — remover regra**: sombra real |
| `/api/faq-assisted` | 4580 | 2612 (`faqAnswerApi`) | **decidida — remover alias**: sombra parcial (handler vivo) |
| `/api/public/faq-assisted` | 4580 | 2612 | **decidida — remover alias**: sombra parcial (idem) |

"Intencional" aqui **não** é opinião do autor da fatia: é a classificação que só existe quando o **próprio código**
declara, em comentário imediatamente acima, que a rota é histórica/inalcançável. As 9 restantes foram decididas caso
a caso em 02/11 ([`E15-SOMBREADAS-DECISAO-2026-11-02.md`](E15-SOMBREADAS-DECISAO-2026-11-02.md)): **4 manter**
(falso positivo do modelo de cobertura, que não modela guarda de negação) e **5 remover** (3 regras da linha 3457 e
2 aliases da linha 4577). A decisão está congelada em JSON e em teste; a **remoção não foi executada** — mexer no
despacho vivo exige autorização própria. O teste exige que toda divergência esteja nomeada neste relatório.

### 3.3 Correção da borda — 03/11/2026 (fatia B autorizada)

As três rotas de §3.1 passaram a ser reconhecidas por `API_PATH_MATCH`. A mudança são **três linhas exatas** na
borda, mais comentários de contexto; o **despacho não foi tocado**.

| O que mudou | Onde | Natureza |
| --- | --- | --- |
| `pathname === "/api/crm/management-diary"` | borda, bloco `/api/crm/*` | exata, sem prefixo |
| `pathname === "/api/crm/management-diary/search"` | borda, idem | exata |
| `pathname === "/api/admin/ai-rag-directory-sources"` | borda, bloco `ai-rag` | exata |
| comentário do ledger `001–182` → `001–183` | `server.mjs` (bloco EXT-07) | comentário, sem efeito |

**Por que exata e não prefixo.** Um `startsWith` mais largo abriria caminhos que o despacho não conhece — e a
divergência inverteria de lado (`borda sem despacho`, que termina em 404 interno). O catálogo mede esse número:
continua **0**.

**Retrato corrente** (`wc -l` = **6316** linhas, sha256 `5d3d67bee2be463a…`):

| Camada | Regras | Composição |
| --- | --- | --- |
| Borda `API_PATH_MATCH` (linhas 4670–6209) | **1517** (+3) | 1396 exatas · 121 prefixos · 0 regexes |
| Despacho `routeApi` (linhas 2582–4668) | **1735** (inalterado) | 1704 handlers em 128 módulos · 31 pré-autorização |

| Classe | 02/11 | 03/11 |
| --- | --- | --- |
| **Inalcançáveis** | 3 | **0** |
| **Sombreadas** | 7 | **7** (3 intencionais + 4 falsos positivos) |
| **Borda sem despacho** | 0 | **0** |
| **Formas não reconhecidas** | 0 | **0** |

**Prova.** `node scripts/e15-route-catalog.mjs --check` → **OK**; `node --test tests/e15-route-catalog.test.mjs` →
**19/19**; a prova executável da borda devolve `true` para as três e continua `false` para `/api/e15/rota-inventada`.
O congelamento de inalcançáveis passou de `≤ 3` para **`= 0`**.

**Limite declarado, igual ao do resto do catálogo.** Isto prova que a **regra** existe nas duas camadas. Não prova
que a rota responde 200 em ambiente real: isso continua exigindo teste de integração com banco, e nenhum foi
executado nesta fatia.

## 4. GREEN desta fatia

- `node --test tests/e15-route-catalog.test.mjs` — **15/15** (inclui controle negativo sintético nas duas direções:
  rota injetada só no despacho vira `inalcançável +1`; caminho injetado só na borda vira `borda sem despacho +1`).
  A fatia da decisão das sombreadas (02/11) acrescentou 4 testes ao mesmo arquivo: hoje **19/19**. A fatia B (03/11)
  não acrescentou teste: **inverteu** o das três rotas e manteve 19/19.
- `node scripts/e15-route-catalog.mjs --check` — **OK**, catálogo confere com `server.mjs`.
- Guarda contra "verde no vazio": o teste exige >1000 regras na borda, >1000 no despacho, >50 módulos e >100
  caminhos presentes nas duas camadas. Se o recorte de função quebrar, o teste **falha**, não passa.
- Congelamento (03/11): `bordaSemDespacho = 0`, `avisos = 0`, `inalcançáveis = 0`, `sombreadas ≤ 7`. Aumentar
  qualquer número é regressão estrutural e exige atualizar o teste **na mesma PR**, com o nome da rota no relatório.
  O teto de inalcançáveis desceu de 3 para 0 **por correção da borda**, não por afrouxamento de limite.

## 5. Por que a fatia é aditiva (e o que ela NÃO faz)

A proposta registrada do E15 é **tabela canônica + teste de paridade**. Entregues os dois. O passo seguinte —
**substituir** a cadeia de `if` por busca na tabela — foi deliberadamente **não** feito:

1. trocar o despacho muda o roteador vivo de **1704** regras em **128** módulos; o risco não é proporcional ao ganho
   de uma fatia docs+gate;
2. o despacho hoje também **autoriza** (31 regras de pré-autorização misturadas à cadeia), e separar autorização de
   roteamento é decisão de arquitetura, não de manutenção;
3. o dono autorizou **E15 como tabela + paridade**, não a reescrita do despacho.

O catálogo existe para tornar a reescrita **segura quando** ela for autorizada: qualquer divergência nova aparece
como número, com nome e linha, antes de virar incidente.

## 6. O que fica em aberto (não foi feito de propósito)

- **As 3 rotas inalcançáveis** foram **corrigidas em 03/11** na borda (§3.3) — deixam de ser pendência. O que
  continua ausente é a prova ponta a ponta (requisição real com banco), que nunca esteve no escopo do catálogo.
- **As 9 sombreadas "a revisar"** foram **decididas** em 02/11 (4 manter, 5 remover — ver
  [`E15-SOMBREADAS-DECISAO-2026-11-02.md`](E15-SOMBREADAS-DECISAO-2026-11-02.md)) e as cinco remoções foram
  **executadas** na #340. Os quatro falsos positivos **continuam no lugar de propósito**: removê-los reintroduziria
  o 405 do PLT-03.
- **Método HTTP por rota** não está no catálogo: exigiria ler o corpo do handler, não a condição de despacho.
- **Reescrita do despacho em tabela**: não autorizada nesta sessão.

## 7. Assinatura de estado

**Produção: NO-GO.** Aceite humano **0/222**. Reauditoria integral **0/222**. Nenhuma migração criada
(`001–183` intactas, próxima livre **184**). N7 intocada (`mailer: null`). As 4 PRs triadas em 02/11 estão
**fechadas** (#321/#310 como superseded após porte; #308/#324 superseded), e não foram reabertas nesta fatia.

**Assinatura desta atualização (03/11/2026):** `server.mjs` **6.316** linhas, sha256
`5d3d67bee2be463a…`; borda **1.517** regras, despacho **1.735** em **128** módulos; **0** inalcançáveis,
**7** sombreadas (3 intencionais), **0** borda sem despacho, **0** formas não reconhecidas.
