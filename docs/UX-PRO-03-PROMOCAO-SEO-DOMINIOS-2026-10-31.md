# UX-PRO-03 — 14ª promoção "com prova": SEO técnico e domínios no console de TI (PUB-08)

**Data:** 31/10/2026 (America/Sao_Paulo)
**Base:** `3ebdef50df83be6991d7929c82713fd6b24df4c5` (`origin/main`, merge da PR #323)
**Branch:** `arena/3f450206-gruposegsystemseguranca`
**Fatia:** `SeoClient` deixa de ser órfão e passa a montar a **27ª aba** do `TiConsole` (*SEO e domínios*, grupo *Experiência e comunicação*).
**Natureza:** promoção com prova (focal RED→GREEN + mutações + cenário de navegador).
**Não** é aceite humano, **não** é homologação e **não** marca item de produção.

---

## 1. Dois defeitos reais no protótipo

O componente não era só órfão: ele prometia operações que o servidor **recusa por política**.

| Defeito | Medido | Correção |
|---|---|---|
| Card de *sitemap* fazia `POST /api/admin/seo-sitemap` | a rota virou **prévia derivada** do catálogo público e só aceita `GET` → **405**; o formulário nunca gravou nada | card virou **prévia somente leitura** (`paths`, `robots`, `xml`, `derived:true`), sem botão de gravar |
| "Publicar após domínio verificado" | `PATCH /api/admin/domain-verifications` com `status:"verificado"` → **400 `domain_verification_not_supported`** (verificação real exige DNS/HTTP no domínio, fronteira externa) e `PATCH` de config publicando com `is_noindex=true` → **400 `cannot_publish_with_noindex`** | a aba **declara** que a publicação é inalcançável nesta entrega e mostra o motivo, em vez de um botão que mente |
| Leitura com `.catch(()=>({items:[]}))` | 403 virava "nenhum registro" | `classificarLista` separa `ok / vazio / negado / falha / invalido` |

O caso do sitemap apareceu no **gate**, não no focal: a rota responder **405** a `POST` é o que prova que o formulário era morto. Corrigido no produto e coberto pelo cenário.

## 2. O que foi entregue

| Item | Antes | Depois |
|---|---|---|
| `SeoClient.tsx` | 96 linhas, `prompt()` para motivo, `any`, erro cru, sitemap editável | **325 linhas**, 4 cards (configurações, redirecionamentos, prévia de sitemap, domínios), validação espelhada do servidor |
| `seo-console-state.ts` | não existia | **238 linhas** puras: `classificarLista`, `classificarPreviaSitemap`, `situacaoPublicacao`, `validarConfig`, `validarRedirect`, `validarDominio`, `validarMotivo` (10..1000), `traduzirErroSeo` (**~34 códigos**), `REGRA_DESTINO`, `CHANGEFREQ`/`REDIRECT_TYPES`/`VERIFICATION_METHODS` |
| `SeoClient.module.css` | não existia | **41 linhas**, tokens, `:focus-visible`, breakpoint 740 px, zero hex |
| `TiConsole.tsx` | 26 abas | **27 abas** (`seo`), grupo *Experiência e comunicação* = `avisos, visual, cliente, cms, seo` |
| `tests/ux-pro-03-ti-seo-dominios-ui.test.mjs` | não existia | focal **13/13** (RED → GREEN) + 4 mutações |
| `tests/ux-pro-03-ti-reaudit.test.mjs` | `EXPECTED_TABS = 26` | `27` |
| `scripts/ux-pro-03-ti-inventory.mjs` | 13 promoções | **14** (órfãos **33 → 32**) |

### O que a tela faz — e o que ela recusa

- **Configurações por caminho:** criar com as faixas do servidor (path 1..500 começando em `/`, título 5..200, descrição 10..500, canônica opcional 5..1.000, robots 5..200, prioridade 0..1, frequência da lista fixa). O `is_noindex` **nunca** sai do formulário: criar nasce `noindex` (padrão do servidor) e a única ação disponível na lista é **"manter noindex"**.
- **Redirecionamentos:** `old_path ≠ new_path`, tipo em `301/302/307/308`, motivo 10..1.000. A tela diz antes do erro que **o destino precisa ser rota pública existente** e que a origem não pode esconder rota que já existe (`REGRA_DESTINO`) — a política do servidor (`redirect_target_not_public`, `cannot_shadow_existing_route`, `cannot_redirect_to_self`, `redirect_chain_not_allowed`) é traduzida, não descoberta por tentativa.
- **Prévia do sitemap:** somente leitura. O texto mostra `derived:true`, origem, contagem de caminhos, o `robots` efetivo e a explicação de que `/sitemap.xml` devolve **404** e `/robots.txt` nega tudo enquanto `NEXT_PUBLIC_ENV` não for produção — é a verdade do ambiente, não um botão.
- **Domínios:** registra **pendente** com método (`dns_txt/file/meta_tag/outro`) e token 10..500. Não há botão de "verificar": a tela declara que a verificação real é fronteira externa.
- **Prioridade de UX:** aviso fixo `seo-publicacao` (`data-permitido="nao"`) com o motivo (pendentes + DNS/HTTP), `seo-ok`/`seo-erro` persistentes com `role`, e nenhuma leitura silenciosa: 401/403 = `negado`, corpo sem `items` = `invalido`, `[]` = `vazio`.

## 3. Prova

### 3.1 Focal — `tests/ux-pro-03-ti-seo-dominios-ui.test.mjs`

```
RED  (módulo ausente)                      → # tests 1  # pass 0  # fail 1
GREEN                                      → # tests 13 # pass 13 # fail 0
```

| Mutação | Detectada em |
|---|---|
| `situacaoPublicacao` sempre permite publicar | `not ok 6` |
| `classificarPreviaSitemap` deixa de exigir `paths/robots/xml` | `not ok 5` |
| criar deixa de forçar `is_noindex: true` | `not ok 7` |
| componente volta a escrever em `/api/admin/seo-sitemap` | `not ok 10` |

Depois das mutações o focal volta a **13/13** (restauração verificada).

### 3.2 Navegador — `browser UX-PRO-03 SEO`

Sessão `ti` real, PostgreSQL 17 descartável, Chromium:

1. anônimo **401**; `rh` **403**; `ti` **200**; `POST /api/admin/seo-sitemap` **405**; prévia **200** com `derived:true`;
2. `PATCH` de domínio para `verificado` → **400 `domain_verification_not_supported`** (o caminho "publicar" é inalcançável, e a tela diz isso);
3. config criada pela API nasce `is_noindex=true`; publicá-la → **400 `cannot_publish_with_noindex`**;
4. **criar configuração pela interface** → `seo-ok` "noindex preservado" + banco `is_noindex=true`, `is_published=false`, `sitemap_priority=0.7`;
5. **manter noindex** pela lista → banco continua `is_noindex=true`, `is_published=false`;
6. **redirect**: primeiro destino inexistente → `seo-erro` traduzido ("rota pública") e **nada gravado**; depois destino público real → banco `new_path` correto, `301`, motivo gravado;
7. **domínio pendente** pela tela → banco `status='pendente'` e `seo-publicacao` segue `data-permitido="nao"`;
8. **320 / 390 / 1440** e **tema noturno** — `sobraDocumentoPx: 0` em todos;
9. **negação** (`403` injetado em `window.fetch`) → `seo-estado-configs` `data-situacao="negado"` e a tela **não** diz "nenhum registro";
10. **`rh` no gate** → `data-admin-gate="forbidden"` e o console de SEO não monta.

Evidência: `docs/ux-pro-03-seo-evidencias/` — **9 PNGs** + `resumo.json` (`problems: []`, `sobraDocumentoPx: 0` em todos os estados).

## 4. Limites declarados

1. **Sem aceite humano, sem homologação, sem UAT:** produção **NO-GO**, **0/222**.
2. **Publicar é inalcançável nesta entrega** — não por falta de botão, mas porque o servidor recusa declarar domínio verificado sem DNS/HTTP real e recusa publicar com `noindex`. Nenhuma tela desta série finge o contrário.
3. **Sem verificação de domínio real:** nenhum DNS, nenhum arquivo publicado, nenhum `meta` lido. O token é registro de intenção.
4. **Sem leitor de tela e sem Windows:** teclado, foco e contraste medidos só no Chromium empacotado.
5. **O sitemap administrativo é prévia derivada** (`GET`): não há loja de linhas para editar, e a tela não inventa uma.
6. **Os outros 32 órfãos continuam órfãos.**

## 5. Reconciliação

- `origin/main` na base: `3ebdef5…`; a **#324** segue **aberta, sem merge** (não foi mergeada, fechada nem reescrita aqui).
- Inventários regenerados **somente** pelos geradores (`ux-pro-00-inventory.mjs`, `ux-pro-03-ti-inventory.mjs`, `requisitos-222-inventory.mjs`, `requisitos-sec-reaudit.mjs`), todos com `--check` verde. O **snapshot histórico de 08/10** (`docs/AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv`) foi deliberadamente **não** regenerado: `audit-ui-inventory.mjs` o reescreve com o código de hoje e destruiria a reconciliação de 100 rotas que `tests/ux-pro-00-inventory.test.mjs` exige; o run que o tocou foi revertido antes do commit.
- `test:unit`: **166 → 167** arquivos; `EXPECTED_TABS` **26 → 27**; promoções **13 → 14**; órfãos **33 → 32**; gate do portal **52 → 53** cenários.
- Retrato do inventário 222 **não mudou**: PUB-08 já era `mencionado_em_gate`, então segue **23 gate_nomeado / 115 mencionado_em_gate / 84 somente_documento** (arquivos varridos **1.651 → 1.656**). É evidência textual acrescentada, **não** promoção de aceite — 0/222 continua.
