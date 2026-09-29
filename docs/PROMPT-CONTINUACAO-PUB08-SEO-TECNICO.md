# Fatia PUB-08 — SEO técnico (robots derivado, sitemap derivado, redirects reais)

Sessão `arena/01a0ef61-gruposegsystemseguranca`. Base: `main @ b3c1db6`
(merge do PR #26 — mensuração de origem e conversão, PUB-10).

Este documento registra as **decisões de política ANTES da rota**, como exige
o método das sessões anteriores. Nada aqui é implementado sem estar escrito
aqui primeiro.

## Dependência declarada — PR #25 (CRM-07): estava aberto, foi mergeado durante a sessão

O PR #25 (`arena/01a0eef9`, CRM-07 — notas internas e campo a campo de
CRM-05/06) estava **aberto e em conflito** (`CONFLICTING`/`DIRTY`) contra
`main` no início desta sessão. Por decisão do usuário, ele foi **preservado** e
esta fatia foi escolhida para **não disputar os mesmos arquivos**:

- Esta fatia **não toca** `src/server/crm-api.mjs`, `src/server/crm-note-api.mjs`
  nem `src/app/admin/crm/*`.
- Esta fatia **não disputou o número 111**, que o PR #25 reivindicava
  (`111-crm-opportunity-notes-reopen.sql`).
- Em `server.mjs`, os trechos alterados aqui (bloco de imports por volta da
  linha 99, criação do handler de SEO, seção de rotas PUB-08, `API_PATH_MATCH`
  e o `createServer` final) ficam a mais de cem linhas dos três pontos que o
  PR #25 altera (linha 5, linha ~1175 e linha ~2501, todos na seção CRM).

**Atualização durante esta sessão:** o conflito foi resolvido fora desta
sessão e o **PR #25 foi mergeado** em `main @ 8f52137`. Esta branch
**incorporou `origin/main` por merge**, sem conflito em nenhum arquivo, e o
gate voltou a rodar com **os 11 cenários** (os 10 anteriores, já incluindo o
de CRM-07, mais o de PUB-08). A migração **111 passou a ser fato em `main`**;
nova conferência nas branches do GitHub confirmou que **112 é a primeira
livre**, e é a que esta fatia usa (ver a seção *Migração*).

**Consequência registrada:** L04 **continua PARCIAL**. Esta entrega não
revalida o trabalho de CRM-07 além do que o gate compartilhado já executa.

## Problema

PUB-08 pede "SEO técnico, títulos, sitemap, redirects e verificação de domínio
na liberação; preservar `noindex` em ambientes não produtivos".

O que existe hoje é uma casca que **parece** fazer isso e não faz:

1. **Não existe `/robots.txt`.** A única proteção contra indexação é a meta
   `robots` de `src/app/layout.tsx`. Um rastreador que peça `/robots.txt`
   recebe 404 do Next — ou seja, "não há restrição declarada".
2. **O sitemap é digitado à mão.** `seo_sitemap_entries` é uma tabela onde
   alguém escreve qualquer URL; `/sitemap.xml` publica o que foi digitado, sem
   nenhuma relação com as rotas que o site realmente tem. Dá para publicar um
   mapa de páginas inexistentes, ou vazar caminho interno.
3. **O XML é montado sem escapar:** `` `<loc>${r.url}</loc>` `` por concatenação.
   Uma URL com `&`, `<` ou `"` quebra ou injeta o documento.
4. **Os redirects não redirecionam.** `seo_redirects` é só uma tabela: nenhum
   ponto do servidor a consulta no caminho da requisição. Cadastrar um
   redirect hoje não muda absolutamente nada para o visitante.
5. **`GET /api/seo` e `GET /api/seo-configs` são públicos** (o handler trata
   qualquer caminho sem `/admin` como público) e devolvem **todas** as linhas,
   inclusive as de `is_published = false`. Rascunho de SEO é conteúdo interno.
6. **Nenhuma mutação é transacional** e a auditoria é engolida por
   `try {} catch {}`, escrevendo em `audit_log` em vez de `auth_access_audit`.
7. **Papel errado recebe 401**, não 403 — diferente do padrão do projeto.
8. **A verificação de domínio é fabricada:** `PATCH` grava
   `status = 'verificado'` sem nunca verificar nada, e `SeoClient.tsx` tem o
   botão "Marcar verificado" que diz em seguida "pode liberar produção remover
   noindex".

## Decisão 1 — NÃO conectar `SeoClient.tsx`

O componente órfão `src/app/admin/ti/SeoClient.tsx` permite, por construção,
fabricar exatamente as três coisas que esta fatia precisa tornar confiáveis:

- **"Criar sitemap entry"**: um humano digita qualquer URL e ela entra no
  sitemap público. O mapa deixa de descrever o site.
- **"Criar SEO config"**: campo `robots` livre de 5 a 200 caracteres — dá para
  gravar `index, follow` num ambiente que não é produção.
- **"Marcar verificado"**: um clique declara um domínio verificado sem que
  verificação nenhuma tenha acontecido, e a tela ainda sugere que isso libera
  a remoção do `noindex`. É um portão de autorização que qualquer um
  atravessa apertando um botão.

**Decisão:** o componente permanece órfão e é declarado **descartado para esta
finalidade** na documentação — mesmo tratamento dado a
`OriginMetricsClient.tsx` em PUB-10. Não existe, nesta fatia, nenhuma tela ou
rota que permita digitar uma entrada de sitemap.

Consequência registrada: `seo_sitemap_entries` (migração 090) **não é lida nem
escrita** por esta fatia e **não é fonte de verdade de nada**. A tabela
continua existindo (migrações são imutáveis) e continua sem tela.

## Decisão 2 — sitemap derivado das rotas públicas reais

`/sitemap.xml` passa a ser **gerado a partir do código**, nunca de uma tabela
editável. A fonte é uma lista única em `src/lib/seo-technical.mjs`, composta de:

- as rotas públicas estáticas que existem em `src/app` (`/`, `/servicos`,
  `/segmentos`, `/faq`, `/contato`, `/orcamento`, `/simulador`,
  `/privacidade`);
- as páginas de serviço `/servicos/<serviço>` derivadas de `PUBLIC_SERVICES`
  (`src/lib/service-catalog.mjs`) — o mesmo catálogo de seis serviços que a
  API de leads aceita, com o nome percent-encoded;
- as páginas de segmento `/segmentos/<chave>` derivadas de `SEGMENT_EXAMPLES`.

Para que essa derivação tenha **uma** fonte, `src/lib/segment-examples.ts` é
convertido em `src/lib/segment-examples.mjs` + `.d.mts` (mesmo padrão já usado
por `service-catalog.mjs`), porque `server.mjs` não consegue importar `.ts`.
As duas páginas que o usavam passam a importar o `.mjs`. É refatoração de
fonte única, não mudança de conteúdo: as três chaves e a derivação da pergunta
a partir de `PROPERTY_TYPES` continuam idênticas.

**Ficam fora do sitemap, por decisão explícita:**

- `/layout-01` … `/layout-10` — prévias de layouts alternativos; são conteúdo
  duplicado da home e existem para avaliação interna.
- `/qa/modulos` — página de conferência interna.
- `/proposta/aceite/[token]` — endereço por destinatário, com token.
- Tudo sob `/admin`, `/cliente`, `/funcionario`, `/api` e `/_next`.

**O documento traz somente `<loc>`.** Sem `<lastmod>`, `<priority>` ou
`<changefreq>`: não existe fonte verdadeira para nenhum dos três (as páginas
são código, não conteúdo versionado com data de alteração), e preencher com
`0.5 / weekly / hoje` seria inventar um dado com aparência de fato — o mesmo
erro do painel de métricas digitadas recusado em PUB-10.

Toda URL é escapada para XML (`&`, `<`, `>`, `"`, `'`) por função dedicada e
testada, nunca por concatenação crua.

## Decisão 3 — `noindex` fail-closed fora de produção

A liberação de indexação tem **uma única condição**, idêntica à que
`src/app/layout.tsx` já usa para a meta tag, para que cabeçalho e arquivo
nunca se contradigam:

```
NEXT_PUBLIC_ENV === 'production'  E  NEXT_PUBLIC_ALLOW_INDEX === 'true'
```

- **Fora de produção (padrão, inclusive no gate):** `/robots.txt` devolve 200
  com `User-agent: *` / `Disallow: /`, sem linha `Sitemap:`, e com o cabeçalho
  `X-Robots-Tag: noindex, nofollow`. `/sitemap.xml` devolve **404**.
- **Em produção liberada:** `/robots.txt` permite o site público e nega
  explicitamente `/admin`, `/api`, `/cliente`, `/funcionario`, `/proposta`,
  `/qa`; e anuncia `Sitemap: <origem>/sitemap.xml`. `/sitemap.xml` devolve 200.

**Por que 404 e não um sitemap vazio:** um sitemap é artefato de publicação.
Enquanto o site não está liberado, não existe mapa publicado. Servir um
`<urlset/>` vazio convidaria à leitura "o mapa existe e está vazio", que é
falsa. Quem precisa revisar o que *seria* publicado usa a prévia autenticada
da Decisão 4.

Nada disso é destravável por parâmetro, cabeçalho ou papel: **não há bypass
administrativo**. Esta fatia **não altera** os valores padrão das variáveis, e
a decisão registrada de não publicar em produção continua valendo.

## Decisão 4 — prévia autorizada, não publicação

`GET /api/admin/seo/sitemap-preview` devolve, para staff autorizado, a lista
derivada e o XML exato que seria publicado, mais o estado de liberação
(`released: false`). É **leitura**: não publica, não grava e não altera
variável nenhuma. Existe porque o requisito fala em "verificação **na
liberação**" — revisar antes de liberar é justamente o passo que faltava — e
porque sem ela não haveria como provar a derivação sem ligar a indexação.

Papéis: `marcelo`, `ti`, `admin` (SEO técnico é administração do site, não
função comercial). Sem sessão → 401; papel fora da lista → 403; método
diferente de GET → 405 com `Allow: GET`.

## Decisão 5 — redirects que de fato redirecionam

`seo_redirects` deixa de ser decorativa: `server.mjs` passa a consultá-la no
caminho da requisição, **antes** de entregar ao Next, e responde com o status
cadastrado (301/302/307/308) e o `Location` correspondente.

Regras, todas fail-closed **no cadastro** (e não só na hora de redirecionar):

- `old_path` e `new_path` precisam ser caminhos internos absolutos: começam
  com `/`, sem `//` inicial (relativo a protocolo), sem `://`, sem barra
  invertida, sem espaço, sem caractere de controle, sem `..`. Qualquer outra
  coisa → 400 `invalid_path`. **Redirect externo é recusado** — é o vetor
  clássico de open redirect.
- `old_path` igual a `new_path` (já normalizados) → 400 `cannot_redirect_to_self`.
- `old_path` **não pode sombrear rota existente**: nem uma rota pública real,
  nem nada sob `/api`, `/admin`, `/cliente`, `/funcionario`, `/_next`,
  `/robots.txt`, `/sitemap.xml` → 400 `cannot_shadow_existing_route`.
  Um redirect capaz de esconder `/admin` ou `/servicos` é risco de
  disponibilidade e de autorização, não configuração de SEO.
- `new_path` precisa ser uma **rota pública conhecida** → 400
  `redirect_target_not_public`. Redirect que aponta para 404 é promessa
  quebrada; e isso impede usar o redirect para alcançar área interna.
- **Sem cadeia e sem laço:** se o destino já é origem de outro redirect ativo,
  ou se a origem já é destino de outro redirect ativo → 400
  `redirect_chain_not_allowed`. No caminho da requisição resolve-se **um único
  salto**, jamais em cascata.
- `old_path` duplicado → 409 `duplicate_old_path`.

No caminho da requisição:

- só `GET` e `HEAD`; nenhum outro método é redirecionado;
- não se consulta o banco para `/_next`, nem para caminho com extensão de
  arquivo (evita uma consulta por asset);
- a query string original é preservada no `Location`;
- **se o banco falhar, não redireciona** e a página é servida normalmente.
  Registrado explicitamente: redirect não é controle de autorização, então a
  saída segura de uma falha de infraestrutura é *não* desviar o visitante —
  derrubar o site público por causa da tabela de redirects seria pior.

**Fora desta fatia:** curinga/regex, redirect por domínio, e a contagem
`hits` (contar exigiria escrever no banco a cada requisição pública, o mesmo
problema de trilha-por-leitura recusado em PUB-10). A coluna `hits` continua
0 e **não é fonte de verdade de nada**.

## Decisão 6 — autorização, mesma origem e trilha transacional

- Todas as rotas administrativas de SEO exigem sessão de staff e papel
  `marcelo`, `ti` ou `admin`. Sem sessão → 401 `admin_session_required`;
  papel fora da lista → **403** (corrige o 401 atual); mutação sem mesma
  origem → 403.
- **Fecha o vazamento:** `GET /api/seo` e `GET /api/seo-configs` deixam de ter
  caminho público. Nenhuma página do site lê essas rotas; o que elas faziam
  era expor rascunho interno a anônimo.
- **Auditoria transacional:** criar e alterar redirect abre transação, grava a
  linha e grava `auth_access_audit` (`seo_redirect_create` /
  `seo_redirect_update`, `actor_kind = papel da sessão`,
  `actor_id = identidade`) **na mesma transação**, e só então confirma. Falha
  de auditoria injetada reverte a mutação e a rota devolve 503.
  A trilha **não** usa o `auditLog` de `createSeoApi`: aquele escreve em
  `audit_log` dentro de `try {} catch {}`, ou seja, perde a trilha em silêncio.
  (A suposição inicial de que as ações já estavam autorizadas se mostrou
  **falsa** ao executar o gate; ver a seção *Migração*.)
- As leituras (`/robots.txt`, `/sitemap.xml`, prévia, listagem) **não gravam
  trilha por consulta**, pelo mesmo motivo registrado em PUB-10: são leituras
  sem dado pessoal, e auditar cada requisição de rastreador degradaria a
  trilha que importa.

## Decisão 7 — verificação de domínio fica FORA, e o caminho que fabricava é fechado

Verificar um domínio de verdade exige consultar DNS ou buscar um arquivo no
domínio real — fronteira externa, fora da entrega local, e o projeto não
publica em produção nem contrata serviço.

Por isso, em vez de deixar um botão que mente, o caminho que fabricava o fato
é **recusado**: `PATCH /api/admin/domain-verifications` com
`status = 'verificado'` devolve 400 `domain_verification_not_supported`,
explicando que a verificação real não é executável nesta entrega. Registrar
"pendente" continua permitido (é um registro honesto de intenção); declarar
verificado, não.

Nenhum outro controle desta fatia depende dessa tabela: a liberação de
indexação depende só das duas variáveis da Decisão 3.

## Decisão 8 — títulos

"Títulos" já são servidos de verdade: cada página pública declara `metadata`
(ou herda a do layout raiz) e o Next os renderiza. O que existe em
`seo_configs.title` é um armazém paralelo, digitado à mão, que **nenhuma
página lê** — manter isso como se fosse a origem dos títulos seria o mesmo
tipo de fabricação do sitemap digitado.

**Decisão:** `seo_configs` é declarada **não fonte de verdade** do que o site
serve, e continua sem tela. Em vez de inventar um CMS de títulos, o gate
**verifica** o que existe: cada URL do sitemap derivado é buscada por HTTP
real e precisa responder 200 com um `<title>` não vazio. Título passa a ser
coisa conferida, não coisa digitada.

## Migração — 112, criada porque o gate provou que a suposição era falsa

**A intenção era não criar migração.** A política escrita antes da rota dizia
que as ações de auditoria de SEO já estavam autorizadas desde a migração 090.
**O gate provou o contrário**, e o achado está registrado aqui em vez de
contornado:

> `POST /api/admin/seo/redirects` devolvia **503**, com
> `new row for relation "auth_access_audit" violates check constraint
> "auth_access_audit_action_check"`.

Causa: as migrações **099, 100 e 103 redigitaram a lista inteira** do CHECK em
vez de ampliá-la. O comentário delas afirma "mantém todas as anteriores"; a
lista digitada **não mantém**. Comparando a lista vigente na 093 com a vigente
na 103, **148 valores desapareceram**, entre eles **todas** as ações de SEO,
CMS, temas, pacotes, origem/conversão e reclamação:
`seo_config_create`, `seo_config_update`, `seo_redirect_create`,
`seo_redirect_update`, `seo_sitemap_update`, `domain_verification_create`,
`domain_verification_verify`, `cms_content_*`, `theme_*`, `package_*`,
`origin_metric_*`, `ab_test_*`, `cli_complaint_*`, entre outras.

O defeito ficou invisível por dois anos de migrações porque quase todo
gravador de trilha do projeto embrulha o `INSERT` em `try {} catch {}` — a
trilha simplesmente não era escrita, sem ninguém perceber. Só apareceu agora
porque esta fatia grava a trilha **na mesma transação e sem engolir erro**.

**`db/migrations/112-pub08-seo-redirect-audit-action.sql`** — aditiva,
seguindo o padrão da 110/111: lê a definição vigente com
`pg_get_constraintdef`, **falha** (`audit_action_constraint_missing`) se a
constraint pai sumir, e reescreve como `CHECK ((definição anterior) OR action
IN (...))`. Nunca afrouxa: apenas aninha. Além disso **falha**
(`audit_actor_kind_ti_missing`) se `auth_access_audit_actor_kind_check` deixar
de aceitar `'ti'`, que é o `actor_kind` que esta fatia grava. É idempotente.

**Escopo deliberadamente estreito:** a 112 reautoriza **apenas os dois valores
que esta fatia escreve e prova por portão** — `seo_redirect_create` e
`seo_redirect_update`. Os outros 146 continuam fora da lista. Reautorizar em
bloco seria "autorizar" trilha de caminhos que nenhum portão desta entrega
exercita — inventar cobertura. **O restante fica declarado como achado aberto**
em `docs/EVIDENCIAS-ENTREGA-LOCAL.md`: qualquer rota que grave uma daquelas
ações em `auth_access_audit` hoje perde a trilha (silenciosamente, pelo
`catch {}`) ou falha.

O gate prova os dois lados: o `201` com uma linha de trilha por escrita **e**
que uma ação não autorizada (`seo_redirect_bogus`) continua sendo recusada
pelo banco com `23514` — ou seja, a ampliação foi cirúrgica, não afrouxamento.

Consequências de registro: migrações passam a ser **001–112** (510 tabelas,
com a 111 do PR #25 já em `main`); `scripts/migrate-site-visual.mjs` recebe a
112 no manifesto e `scripts/qa-wave0-static.mjs` passa a `latestMigration = 112`.
As migrações **001–111 permanecem imutáveis**.

## Achados registrados durante a execução (não contornados)

### 1. A regra de cadeia é hoje estruturalmente inalcançável pelo cadastro

Com a Decisão 5 valendo, **origem ∉ rotas públicas** e **destino ∈ rotas
públicas**. Para existir cadeia `A→B→C` seria preciso que um mesmo caminho
fosse destino de um redirect (logo, rota pública) e origem de outro (logo,
não pública) ao mesmo tempo. **É impossível pelo cadastro.**

A checagem **fica** no código, como segunda barreira, porque a premissa pode
mudar sem aviso: **o catálogo de serviços muda**. Se `PUBLIC_SERVICES` perder
um serviço, `/servicos/<aquele serviço>` deixa de ser rota pública e passa a
poder ser cadastrado como origem — e aí pode já existir um redirect antigo
apontando para ele. Removida a checagem, nasceria a cadeia.

No gate, portanto, a cadeia só é alcançável por **fixture SQL** que simula uma
linha gravada antes da mudança de catálogo. Está declarado no cenário.

### 2. Tentativa de laço em rota reservada é recusada como laço, não como sombra

`/faq → /faq` devolve `cannot_redirect_to_self`, não `cannot_shadow_existing_route`:
a ordem de validação checa o laço antes da sombra. A expectativa do cenário
foi ajustada para o comportamento real; **a regra não foi afrouxada** (as duas
saídas são 400 e ambas recusam a gravação).

### 3. A migração 090 semeia quatro redirects, e três nascem inertes

A 090 (imutável) já insere em `seo_redirects`:

| `old_path` | `new_path` | tipo | ativo |
| --- | --- | --- | --- |
| `/cliente/acesso` | `/cliente/entrar` | 301 | sim |
| `/cliente/login` | `/cliente/entrar` | 301 | sim |
| `/servicos/cerca-eletrica` | `/servicos` | 302 | sim |
| `/admin/funcionarios` | `/admin/ti` | 302 | não |

Os três com origem sob prefixo reservado (`/cliente`, `/admin`) ficam
**inertes**: o caminho da requisição pula a consulta para prefixo reservado,
então `/cliente/acesso` continua servindo a página real mesmo com a linha
ativa no banco. Só `/servicos/cerca-eletrica` passa a desviar de fato.

**Esses seeds não são retro-validados** pela política de cadastro (nenhum
deles seria aceito hoje: origem sob rota reservada). Migração é imutável;
apagá-los ou reescrevê-los seria mexer no passado. Ficam registrados aqui, e
o gate **prova** que existem (bloco 7b) para que nenhuma asserção futura
confunda "linha semeada" com "linha criada pelo teste".

## Prova executada no gate

Unidade (`tests/seo-technical.test.mjs`, dentro de `npm test`) sobre o módulo
puro: robots fora de produção e em produção liberada, sitemap nos dois
estados, escape de XML com `&`/`<`/`"`, exclusão de `/admin`, `/api` e
`/layout-0x`, normalização de caminho e recusa de `//evil`, `http://`,
`\\`, espaço, controle e `..`, além das regras de sombra, destino e cadeia.

Integração (cenário novo em `tests/l04-delivery.integration.test.mjs`: HTTP
real + PostgreSQL descartável + Chromium real, sem `--disable-web-security`):

1. Anônimo em `/robots.txt` → 200, `Disallow: /`, sem `Sitemap:`, com
   `X-Robots-Tag: noindex`.
2. Anônimo em `/sitemap.xml` → 404 (fora de produção não há mapa publicado).
3. Prévia: 401 sem sessão, 403 com papel `comercial`, 405 em POST, 200 para
   `ti` — e o XML da prévia não contém `/admin`, `/api`, `/cliente`,
   `/funcionario` nem `/layout-0`.
4. Cada URL da prévia é buscada por HTTP real: 200 e `<title>` não vazio.
5. Redirect: criação negada para anônimo (401), para papel errado (403) e sem
   mesma origem (403); recusa de destino externo, de `//`, de sombra de rota
   pública, de sombra de `/admin`, de destino inexistente, de laço e de
   cadeia (nos dois sentidos).
6. Redirect válido criado por `ti` e, **no navegador Chromium real**, a
   visita a `/promo-portaria` chega em `/servicos` (301 seguido de verdade,
   com `page.waitForResponse` na resposta do endereço antigo, nunca
   `waitForTimeout`), preservando a query string, sem erro de console.
7. Falha de auditoria injetada por gatilho em `auth_access_audit`: a criação
   do redirect devolve 503 e **nenhuma linha** fica em `seo_redirects`.
8. Vazamento fechado: `GET /api/seo` e `/api/seo-configs` anônimos → 401.
9. Verificação de domínio: `PATCH` com `verificado` → 400
   `domain_verification_not_supported`, e a linha continua `pendente`.
10. Trilha: a criação deixa **exatamente uma** linha com `actor_kind = 'ti'`, e
    cada alteração de `is_active` deixa a sua (duas no total). Uma ação **não**
    autorizada (`seo_redirect_bogus`) continua sendo recusada pelo banco com
    `23514` em `auth_access_audit_action_check` — a migração 112 ampliou, não
    afrouxou.
11. As 14 recusas nomeadas do cadastro não gravam nada: a contagem é escopada
    aos `old_path` tentados, porque a migração 090 já semeia quatro linhas
    (achado 3 acima).
