# E15 — catálogo canônico de rotas de `server.mjs` (02/11/2026)

**Medição atualizada:** fatia autorizada de execução E15 sobre `main` `1f32604` · **Natureza:** remoção de regras inalcançáveis do despacho; handler público de FAQ mantido; não cria migração,
não toca `TiConsole.tsx`, não abre a borda legada de RH, não mexe em N7.
**Produção: NO-GO.** Aceite humano **0/222**. Reauditoria integral **0/222**.

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

## 3. Retrato medido após as remoções autorizadas

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

### 3.1 As 3 rotas inalcançáveis (nomeadas)

| Rota | Linha no despacho | Módulo | Situação |
| --- | --- | --- | --- |
| `/api/crm/management-diary` | 3038 | `contractManagementDiaryApi.handleSearch` | **sombreada pela borda**: `API_PATH_MATCH` devolve `false` |
| `/api/crm/management-diary/search` | 3038 | `contractManagementDiaryApi.handleSearch` | idem |
| `/api/admin/ai-rag-directory-sources` | 4603 | `aiRagDirectoryApi` | idem |

**Prova executável (não leitura de texto):** a cadeia de `API_PATH_MATCH` é extraída, vira função real e é
executada. `API_PATH_MATCH("/api/crm/management-diary")` → **`false`**; `("/api/crm/management-diary/search")`
→ **`false`**; `("/api/admin/ai-rag-directory-sources")` → **`false`**. Controle positivo no mesmo teste:
`("/api/crm/commercial-versions")` → **`true`** (a borda não barra tudo). O teste
`E15: as três rotas medidas como inalcançáveis são de fato barradas pela borda` falha se qualquer uma passar a
ser reconhecida — e aí o achado precisa ser reavaliado, não silenciado.

**Por que isso importa na prática:** `src/app/admin/ti/DirectorySourcesClient.tsx` faz
`fetch("/api/admin/ai-rag-directory-sources")` e a aba `pastas` do `TiConsole` monta esse componente. O caminho
`/api/crm/contracts/:id/management-diary` — o que a tela realmente usa — **é** reconhecido pela borda (está sob o
prefixo `/api/crm/contracts/`), então a tela do contrato continua funcionando; a raiz
`/api/crm/management-diary` é que nunca chega ao handler. **Nada foi alterado nesta fatia**: corrigir a borda é
mexer no roteador vivo e exige decisão do dono.

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

## 4. GREEN desta fatia

- `node --test tests/e15-route-catalog.test.mjs` — **15/15** (inclui controle negativo sintético nas duas direções:
  rota injetada só no despacho vira `inalcançável +1`; caminho injetado só na borda vira `borda sem despacho +1`).
  A fatia da decisão das sombreadas (02/11) acrescentou 4 testes ao mesmo arquivo: hoje **19/19**.
- `node scripts/e15-route-catalog.mjs --check` — **OK**, catálogo confere com `server.mjs`.
- Guarda contra "verde no vazio": o teste exige >1000 regras na borda, >1000 no despacho, >50 módulos e >100
  caminhos presentes nas duas camadas. Se o recorte de função quebrar, o teste **falha**, não passa.
- Congelamento: `bordaSemDespacho = 0`, `avisos = 0`, `inalcançáveis ≤ 3`, `sombreadas ≤ 12`. Aumentar qualquer
  número é regressão estrutural e exige atualizar o teste **na mesma PR**, com o nome da rota no relatório.

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

- **As 3 rotas inalcançáveis** continuam inalcançáveis: corrigir exige editar `API_PATH_MATCH` (roteador vivo).
- **As 9 sombreadas "a revisar"** foram **decididas** em 02/11 (4 manter, 5 remover — ver
  [`E15-SOMBREADAS-DECISAO-2026-11-02.md`](E15-SOMBREADAS-DECISAO-2026-11-02.md)), mas **continuam no lugar**:
  remover regra do despacho vivo é mudança de comportamento e exige autorização própria.
- **Método HTTP por rota** não está no catálogo: exigiria ler o corpo do handler, não a condição de despacho.
- **Reescrita do despacho em tabela**: não autorizada nesta sessão.

## 7. Assinatura de estado

**Produção: NO-GO.** Aceite humano **0/222**. Reauditoria integral **0/222**. Nenhuma migração criada
(`001–182` intactas, próxima livre **183**). N7 intocada (`mailer: null`). As 4 PRs abertas (#321, #308, #310,
#324) não foram mergeadas, fechadas, rebaseadas nem comentadas nesta fatia.
