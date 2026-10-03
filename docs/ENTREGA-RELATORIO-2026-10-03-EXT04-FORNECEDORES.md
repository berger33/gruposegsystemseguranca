# EXT-04 — fornecedores: jornada interna canônica

**Data:** 2026-10-03 · **Base:** `main` em `5abc199a7694c5bc0f508ac13cb2569a515a034d`
(merge da PR #98 / EXT-03, feito por decisão expressa do proprietário nesta sessão) ·
**Migração:** 150, aditiva; 001–149 imutáveis ·
**Branch:** `arena/01a10305-gruposegsystemseguranca`

**Classificação honesta:** implementação local + validação automática + gate dedicado HTTP/DB.
Isto **não** é bateria pesada integral homologada, aceite humano, homologação Windows nem aplicação
no destino. O aceite existente de Marcelo e Andreia continua valendo **somente para L07**.

---

## 0. Decisão da PR #98 e base usada

O passo zero encontrou a PR #98 `OPEN`, `MERGEABLE`, `mergedAt=null`; `origin/main` e a branch da
sessão estavam em `4518b3f`, divergência 0/0 e árvore limpa. Como a instrução proibia construir por
cima da PR aberta, o trabalho parou e pediu decisão. O proprietário respondeu: *"faça o
merge/decisão da 98 e depois dê continuidade"*.

A #98 foi então mesclada **sem auto-merge**, pelo mesmo método de merge commit das entregas
anteriores. O merge commit é `5abc199a7694c5bc0f508ac13cb2569a515a034d`; depois do fetch e
fast-forward, `origin/main` e esta branch ficaram nesse SHA, novamente com divergência 0/0. Só
então a EXT-04 começou. Assim, 001–149 permaneceram imutáveis e a única migração nova é a 150.

---

## 1. Condição do plano: "se volume justificar"

O critério é condicional, não autorização automática:

- `docs/PLANO-MESTRE-IMPLEMENTACAO.md:414-423` diz que expansões condicionais só entram com
  condição própria e, na linha 423, define EXT-04 como *"Cotações/documentos/pedidos com escopo
  próprio; se volume justificar"*.
- `docs/EXECUCAO-ENTREGA-LOCAL.md:142-144` exige conectar apenas fluxos aplicáveis, mostrar motivo
  quando um condicional não está configurado e provar fornecedor restrito.
- `docs/AUDITORIA-TERRENO-L08.md:85` registra apenas handler/tabelas e diz que fornecedor restrito
  não está provado; as linhas 102–107 recusam promover tabela/API sem autorização, rollback,
  idempotência e derivação.
- `db/migrations/085-...sql:164-192` cria tabelas de cotação/documento, mas não registra medição,
  meta, histórico de volume ou decisão do proprietário. Schema não é volume.

O ensaio pré-implementação aplicou 001–149 num PostgreSQL vazio e obteve:

```text
BASELINE_VOLUME_COUNTS {"suppliers":0,"ast_quotations":0,"ast_orders":0,"portal_quotations":0,"portal_documents":0}
```

Esse zero prova somente que as migrações não trazem massa operacional; ele **não** prova que o
volume real da empresa é zero. A busca no repositório também não encontrou medição ou meta.

**Veredito declarado na API, na tela e nesta documentação: `sem_evidencia`.** O volume não está
confirmado, nem sequer indicado por dado mensurado. A ativação comercial da capacidade continua
pendente de decisão do proprietário, que pode vetar a fatia. A implementação não semeia fornecedor,
cotação, documento ou pedido e nunca afirma volume real.

---

## 2. Fronteira de "escopo próprio": ator externo pendente

Não existe identidade, credencial, login, sessão, grant ou canal HTTP canônico de fornecedor. As
sessões reais continuam sendo as sessões canônicas já existentes; nenhuma tabela de segurança v2
foi promovida a fonte de autenticação. A EXT-04 usa **somente sessão staff**.

Por isso, o que foi implementado é uma **jornada administrativa interna**. A API devolve
`external_actor_boundary.situacao = "pendente"` e declara todos estes itens como `false`:
identidade, login, sessão, grant, canal HTTP, upload e aceite do fornecedor. A tela repete a mesma
fronteira. O requisito *"fornecedor não vê concorrente nem dados de RH"* **não é apresentado como
aceite do ator externo**, porque esse ator ainda não existe. Não há endpoint externo que possa
listar concorrentes ou RH.

`file_url` e `storage_key` continuam sendo referências textuais declaradas pela equipe. Não existe
upload, armazenamento verificado, entrega ao fornecedor ou aceite. A API e a tela chamam esses
campos de referências, não de arquivos recebidos.

---

## 3. Lacunas reproduzidas por execução antes da implementação

O ensaio usou PostgreSQL 17 descartável com migrações 001–149, servidor `server.mjs` real, login
staff real e chamadas HTTP reais. O script temporário foi apagado depois da execução; os dados eram
sintéticos em domínio `.invalid`.

| # | Lacuna | Saída observada |
|---|---|---|
| 1 | Namespace canônico não existia | `GET /api/ext/supplier/quotations` ⇒ **404 HTML**. |
| 2 | Tela real não existia | `GET /admin/fornecedores` ⇒ **404**. O `ExtClient.tsx` órfão não foi contado. |
| 3 | Documento e pedido do critério não existiam por HTTP | `/quotations/<uuid>/documents` ⇒ **404**; `/orders` ⇒ **404**. |
| 4 | Papel indevido era confundido com anônimo | anônimo na rota legada ⇒ 401; `rh` autenticado ⇒ **também 401**, em vez de 403. |
| 5 | Retry idêntico duplicava | mesma chave/corpo ⇒ respostas `201/201`; banco ficou com **2 linhas**. |
| 6 | Não havia máquina de estados | `rascunho → aprovado` ⇒ 200 e `aprovado → rascunho` ⇒ **200**, reabrindo silenciosamente. |
| 7 | Auditoria não era fail-closed | com `audit_log` indisponível, mutação ⇒ **201** e contagem **2 → 3**; sem rollback. |
| 8 | Não havia decisão imutável | o handler fazia apenas `UPDATE status`, sem autor/data/justificativa de decisão. A reabertura executada confirmou a lacuna funcional. |
| 9 | Condição e fronteiras não eram declaradas | a resposta legada não tinha veredito de volume, ator externo, upload nem data-base. |
| 10 | Banco de migrações não trazia evidência de volume | contagens do cluster limpo foram todas zero; nenhuma medição/meta existia para justificar a condição. |

A primeira tentativa do **harness do ensaio** foi recusada por
`qa_database_name_required: seg_qa_ prefix`, porque o banco temporário tinha nome fora da guarda.
Isso não foi classificado como resultado do produto: o cluster foi limpo e o ensaio foi repetido
integralmente com nome permitido. Nenhuma guarda foi afrouxada.

---

## 4. Implementação

### Migração 150

`db/migrations/150-ext04-supplier-journey.sql` é aditiva, sem seed e sem autoria retroativa:

- endurece `ext_supplier_portal_quotations` com `origin`, cálculo canônico de total, vínculos
  obrigatórios para a jornada e decisão com autor/data/justificativa; constraints sobre tabela
  existente entram `NOT VALID`;
- cria `ext_supplier_quotation_validities`, com data e fonte declaradas, um registro vigente e
  substituição explícita;
- estende `ext_supplier_portal_documents` com origem, tipo, versão, substituição e desativação;
  linhas anteriores permanecem `registro_legado` e sem autoria inventada;
- cria `ext_supplier_portal_orders`, derivado de uma cotação aprovada, e
  `ext_supplier_order_deadlines`, com prazo/fonte e substituição explícita;
- cria `ext_supplier_alert_rules`; sem regra não existe o rótulo "a vencer";
- cria `ext_supplier_portal_events`, histórico imutável e ledger único por
  `(created_by_identity, idempotency_key)`;
- gatilhos recusam reabrir cotação/pedido terminal, alterar decisão, editar fontes/datas históricas,
  alterar versão documental e atualizar/apagar eventos/regras.

Os três pontos de guarda foram atualizados juntos: manifesto, contagem e log `001–150` em
`scripts/migrate-site-visual.mjs`, mais `latestMigration = 150` em
`scripts/qa-wave0-static.mjs`.

### API canônica

`src/server/ext-supplier-api.mjs`, namespace singular `/api/ext/supplier/*`:

- referências canônicas de `ast_suppliers`/`ast_products`;
- cotações, validade, regra explícita de alerta, decisão e documentos versionados;
- pedidos derivados de cotação aprovada, estados e prazos;
- IDs e vínculos vêm da URL ou do registro canônico; autoria vem da sessão; campos forjados no
  corpo são ignorados; UUID é validado no servidor;
- anônimo 401, papel não autorizado 403, same-origin nas mutações e identidade staff UUID;
- corpo máximo 32768 bytes e chave conforme o contrato já usado nas EXT anteriores;
- `BEGIN` → replay `FOR UPDATE` → trabalho → evento → `audit_log` → `COMMIT`; auditoria indisponível
  devolve 503 e reverte negócio/evento;
- documento obtém versão **dentro da transação, depois do lock da cotação**. O gate lançou duas
  escritas concorrentes e obteve versões 1 e 2;
- rota legada `/api/ext/supplier-portal-quotations` mantém leitura autorizada e alias `items`;
  mutações retornam 410 somente depois das guardas.

### Tela real

`/admin/fornecedores` carrega dados reais, declara vazio, erro e retry, confirma somente depois da
resposta do servidor e preserva a mesma chave de idempotência após falha. A tela gerencia cotação,
validade, regra de alerta, referências documentais, decisão, pedido, estados e prazo. Os banners
mostram `SEM EVIDÊNCIA` de volume e `PENDENTE` para ator/upload externo.

O componente `src/app/admin/ti/ExtClient.tsx` continua órfão, sem rota importadora, e **não** é
contado como entrega. Ele não foi removido porque essa decisão permanece com o proprietário.

---

## 5. Critério imposto em aplicação e banco

| Regra | Aplicação | Banco |
|---|---|---|
| vínculos/autoria confiáveis | supplier/product no caminho; pedido deriva tudo da cotação; autor da sessão | FKs, CHECK canônico e colunas imutáveis |
| validade/prazo/situação | derivação expõe fonte e `base_date`; ausência declarada | registros com fonte restrita e histórico de substituição |
| alerta sem estimativa | `a_vencer` só com regra explícita | `ext_supplier_alert_rules` |
| decisão não sobrescrita | endpoint próprio, apenas em `em_analise` | CHECK autor/data/justificativa + gatilho imutável |
| terminal não reabre | máquinas `QUOTATION_STATUS_TRANSITIONS`/`ORDER_STATUS_TRANSITIONS` | gatilhos equivalentes |
| versão sem corrida | lock da cotação antes de calcular e inserir | índice único parcial por cotação/versão |
| retry seguro | fingerprint e replay por identidade/chave | UNIQUE no ledger |
| auditoria obrigatória | 503 `audit_unavailable` | mesma transação do negócio e evento |

---

## 6. Gate dedicado — 28/28

`npm run test:ext04-suppliers:pg` sobe PostgreSQL descartável, aplica 001–150, inicia o servidor real
e executa `tests/ext04-suppliers.integration.test.mjs` com sessão staff canônica.

Os 28 casos cobrem: anti-skip; 401; 403; same-origin; chave obrigatória; rota de UI real; declarações
de volume/ator/upload; autoria/IDs/total forjados; vínculo produto-fornecedor; replay e conflito;
máquina de cotação; decisão com autor/data e não sobrescrita; terminal protegido por API/banco;
decisão imutável no banco; validade ausente/vencida; alerta somente após regra; substituição e trava
de validade; corrida real de versões documentais; vínculo de versão pela URL; desativação sem apagar;
pedido exige aprovação e deriva vínculos/valores; pedido fechado não reabre por API/banco; prazo
ausente/vencido com fonte/data-base; legado `items`/401/410; evento imutável; e auditoria derrubada
retornando 503 sem cotação nem evento persistido.

Resumo autoauditado:

```text
EXT04_TAP_SUMMARY: pass=28 fail=0 skipped=0 todo=0 minimo_exigido=28
EXT04_SUPPLIERS_TEST_EXIT: 0
QA_EXT04_PG_TEMP_CLEANED: true
```

A guarda foi verificada nos dois sentidos:

- `QA_EXT04_REQUIRE_DB=1` sem banco ⇒ `not ok 1`, exit 1; não fica verde por skip;
- `DATABASE_URL` herdada no harness ⇒ `QA_PG_REFUSED`, exit 2, antes de criar banco;
- execução correta ⇒ 28/28, zero skipped/todo.

A primeira execução real do gate dedicado passou 28/28. Não houve reprovação de produto a corrigir
nesse gate. O teste focal teve uma execução inicial 41/42 porque a declaração dizia
"metadados declarados" e a prova exigia a expressão inequívoca "referências declaradas"; o produto
foi tornado mais explícito e a mesma asserção passou 42/42 — nenhum assert foi enfraquecido.

---

## 7. Validação executada

| Verificação | Resultado | O que prova / não prova |
|---|---|---|
| `npm ci` | exit 0; 0 vulnerabilidades | instalação reproduzível; não prova jornada |
| `node scripts/qa-wave0-static.mjs` | **5/5**, 001–150 | manifesto/CI estáticos; não prova jornada |
| `npm run typecheck` | 0 erros | tipos; não prova HTTP/DB |
| `tests/ext04-suppliers.test.mjs` | **42/42**, 0 pulados | derivações, guardas e transação em unidade; não substitui banco real |
| `npm test` | **424/424**, 0 pulados; baseline 382/382 | regressão unitária; não prova sozinho EXT-04 em PostgreSQL |
| `npm run build` | **89 páginas**, `/admin/fornecedores`; baseline 88 | compilação/rota; não é aceite de UX |
| `npm run test:migrations:pg` | **150/150 ×2**, checksum negativo rejeitado, clone preservado | replay/checksum/schema; não prova jornada |
| **`npm run test:ext04-suppliers:pg`** | **28/28**, 0 pulados | prova dedicada HTTP/DB desta jornada |

Não foram executadas nesta fatia a bateria pesada integral nem a cascata completa dos demais gates.
Em particular, `test:ext02-third-parties:pg`, `test:ext03-biddings:pg`, L04–L08, tenant, staff-auth,
client-access, CLI v2, backup/restore, RAG e demo-local **não cobrem a jornada EXT-04** e não são
apresentados como prova dela. Estático, typecheck, build, suíte unitária e migrations também não
substituem o gate dedicado.

Os seis gates já registrados sem workflow (`cli-v2:pg`, `staff-auth:pg`, `client-access:pg`,
`backup-restore:pg`, `l02-delivery:pg`, `l03-delivery:pg`) continuam pendentes; esta entrega não os
alterou nem os apresenta como cobertura de EXT-04.

---

## 8. Pendências explícitas

1. Confirmação do proprietário de que o **volume justifica** a capacidade; veredito atual:
   `sem_evidencia`.
2. Desenho e aprovação de ator externo fornecedor real (identidade, login, sessão, grants e ponto de
   imposição de escopo). Até lá, "fornecedor não vê concorrente/RH" não tem aceite ponta a ponta.
3. Upload/armazenamento/entrega/aceite real de documento; hoje são somente referências.
4. Bateria pesada integral, aplicação no destino e homologação Windows.
5. Aceite humano de EXT-04. Nenhum foi inventado; Marcelo/Andreia vale somente para L07.
6. EXT-05..17.

Sem dado real, sem SMTP real, sem timeout aumentado, sem caso pulado e sem auto-merge.
