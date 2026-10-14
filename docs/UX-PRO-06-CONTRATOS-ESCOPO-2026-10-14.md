# UX-PRO-06 — escopo e riscos da fatia `/admin/contratos` (lista)

**Data:** 14/10/2026 · **Registrado antes de tocar em tela** (regra da sessão).
**Base confirmada por `git fetch`:** `origin/main` `259ee43c38deeb35fb29a2c622f2ed3e6f6a6712` — merge da **PR #214** (13/10/2026, 23:32Z), que entregou os estados do histórico e o contraste noturno de `/admin/comercial`. O SHA esperado na sessão (`267fb55…`, merge da PR #213) já foi superado pela `main`; a fatia recomendada (`/admin/comercial`) **já está entregue** e não será reaberta nem reimplementada.

## Escolha da tela

- **Recomendação original da sessão** (`/admin/comercial`): **já entregue pela PR #214**. A matriz de 13/10 registra a rota com capturas em 1440/320/390/768 e gate de jornada (`ux-crm-delivery`). Reabri-la duplicaria trabalho integrado — proibido pelo plano mestre ("não reimplemente nem reverta trabalho que já está correto").
- **Escolhida:** a alternativa **`/admin/contratos`** — "Contratos e implantação", a tela da família CRM/comercial interna apontada pela própria PR #214 como "próxima candidata". A matriz de 13/10 registra para ela: capturas apenas em 1440×900 e 390×844 (estágio `ux-07-contratos`), **faltam 320 px e 768 px**, "tema noturno sem captura", "percurso de teclado não verificado", "estados não exercitados em navegador".
- **Fora desta PR, deliberadamente:** `/admin/contratos/[id]` (detalhe com 6 abas, 8 leituras e dezenas de escritas — tela própria, fatia seguinte candidata); `/admin/crm`, `/admin/leads`, `/admin/carteira`, `/admin/comercial` (entregues em #210–#214, não reabertas); `/admin/clientes` (família distinta); portal `/cliente/app/*` (área separada); `UiWorkspace.module.css` (32 consumidores — não tocado); componentes de domínio `src/app/admin/ti/*`; APIs, papéis, permissões e dados canônicos.

## Comportamento que precisa permanecer (inventariado no código antes de editar)

- `AdminGate allowedRoles={["marcelo","admin","comercial"]}` nas duas rotas de contrato — papéis e sessão inalterados.
- `GET /api/crm/companies?type=client` — mesma leitura, mesmo filtro canônico (`invalid_type` fora da lista), mesma resposta `{companies, total, limit, offset}`.
- `GET /api/crm/proposals?status=aceita&limit=100` — mesma leitura.
- `GET /api/crm/contracts` — mesma leitura; `comercial` continua com recorte pessoal (`responsible_id = sessão`), `marcelo`/`admin` continuam vendo tudo; leitor fora da família continua 403 `contract_access_forbidden`.
- `POST /api/crm/contracts` — `source: "manual" | "proposal"`, `request_key` idempotente, criação restrita a `marcelo | admin` (`contract_management_forbidden` para `comercial`), mesma trilha de auditoria.
- Títulos "Contratos e implantação" e "Cadastro manual identificado" (contrato do gate herdado `tests/l05-delivery.integration.test.mjs`), navegação "Comercial · Empresas e funil", os três painéis e o vocabulário de situação/origem (`contract-vocabulary.mjs`).
- Estados pré-existentes de carregando/vazio/erro/negado (UX-07), incluindo "falha de leitura da carteira NÃO vira 'nenhum contrato'" e "vazio honesto diz que a leitura funcionou", exercitados pelo gate `test:ux-contract:pg`.
- Tabela com rolagem contida (`tableWrap`) e link "Abrir composição e implantação" por linha.

## Defeito a medir (hipótese, a confirmar pelo "antes")

As três leituras (`carregarEmpresas`, `carregarPropostas`, `carregarContratos`) fazem, na falha, `itens: []` — **uma releitura que falha apaga a lista já lida** — e, durante qualquer recarga, `carregando: true` substitui o conteúdo por bloco cheio de carregamento. É a mesma família de defeito corrigida no funil (#212), na carteira (#213) e no histórico do comercial (#214), que nesta tela atinge o caminho real "criou contrato → a releitura da lista falhou": o registro recém-criado some da tela junto com tudo o que já estava lido. Não há como distinguir "dados possivelmente desatualizados" de "nunca houve leitura concluída".

## Padrão a seguir (já entregue na família)

- Falha na atualização **preserva** o que já foi lido: faixa `role="alert"` com o motivo real (`contract-vocabulary`), a **hora da última leitura concluída** (relógio do navegador no instante do sucesso; nada estimado nem gravado), o aviso de que dado antigo não significa lista vazia e o botão "Tentar novamente" quando o erro permite repetição.
- Releitura em curso **mantém a lista visível** com `role="status"`; o bloco cheio de carregamento só existe quando não há leitura concluída.
- **Autorização falha fechada**: `denied`/`auth` descarta dado anterior, substitui pelo estado negado completo e não oferece repetir a mesma chamada (a apresentação para de oferecer "Tentar ler de novo" em negativa `auth`, alinhando-se às demais telas da família).
- Estados honestos com `UiState`; estilos novos em **módulo CSS local** (`Contratos.module.css`) com os mesmos tokens de aviso da carteira — `UiWorkspace.module.css` **não é tocado**.

## Riscos registrados e tratamento

1. **Falha que apaga dados (o defeito em si).** Correção de apresentação apenas; nenhum endpoint, payload ou regra muda. Prova "antes" em checkout descartável limpo de `259ee43`, com a suíte nova desta fatia.
2. **Autorização mascarada por dado preservado.** `denied`/`auth` nunca preservam: o estado negado substitui o conteúdo e não oferece repetição. Teste próprio de negativa fail-closed na releitura.
3. **Recorte divergente do dado preservado.** Enquanto a faixa estiver visível, a tela declara que a lista é a última leitura concluída (com a hora) e pode não refletir a ação acabada de fazer; a faixa sai quando a leitura concluir. Nesta tela não há filtro/paginação no cliente — o recorte é único —, então o risco é menor que na carteira e ainda assim é declarado no texto da faixa.
4. **Módulos compartilhados.** Nenhuma alteração em `UiWorkspace.module.css`, `contract-request.ts`, `contract-vocabulary.mjs` ou `UiState`. Tudo novo é arquivo local da rota.
5. **Arquivos gerados.** `next-env.d.ts` (`18b697c4…`) e `tsconfig.json` (`2128c956…`) conferidos por hash após cada execução; a suíte do gate restaura os dois ao encerrar.
6. **Inventário divergente.** O par vigente de CSVs de 13/10 será regenerado pelo próprio gerador; a conferência esperada é **somente a linha `/admin/contratos`** mudando (capturas 320/768 passam a existir; evidência cita o estágio desta fatia). Qualquer outra linha mudando é regressão e bloqueia o merge.
7. **Evidência sintética.** Massa 100% fictícia criada pelas mesmas APIs (`crm_companies` tipo `client`, contrato manual com `origin_details` explícito de massa de teste); sessão de staff provisionada pelo gate; nenhuma credencial, dado pessoal ou endpoint efêmero em captura, log ou documento.
8. **Regressão nos gates que já tocam a tela.** `test:ux-contract:pg` (estados e teclado do detalhe, falha de lista, vazio honesto, 390 px) e `test:l04-delivery:pg` (jornada comercial) executados junto com o gate da família `test:ux-crm:pg`, que recebe os testes novos desta fatia (padrão das fatias #210–#214).

## Validações planejadas

1. Testes novos **primeiro**, rodados contra a `main` limpa (`259ee43`) em worktree descartável, como "antes" — a medida do defeito (esperado: os casos de preservação/atualização falharem na `main`).
2. Depois da implementação: `npm run typecheck`, `npm test`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check` (com o par de CSVs regenerado), `npm run test:ux-crm:pg` (gate da família, com os casos novos), `npm run test:ux-contract:pg` e `npm run test:l04-delivery:pg`.
3. Evidência própria em `docs/ux-pro-06-contratos-evidencias/` com `resumo.json`: capturas 320/390/768/1440, dia e noite pelo controle real do envelope, percurso de teclado, medição de transbordo e de contraste noturno por CSS calculado.
4. PR pequena com antes/depois, rotas/papéis, comportamento preservado, tabela de checks e limitações; merge só com todos os checks verdes, sem conflitos e revisão concluída.

## Limite declarado

O detentor da decisão sobre permissões não foi acionado: nenhum papel, grant ou escopo de API muda nesta fatia. A matriz de papéis já exercitada pelo gate `test:ux-contract:pg` (comercial lê, não gerencia) permanece intocada.
