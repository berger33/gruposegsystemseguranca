# UX-PRO-03 — 13ª promoção "com prova": CMS do site no console de TI (PUB-06)

**Data:** 31/10/2026 (America/Sao_Paulo)
**Base:** `3ebdef50df83be6991d7929c82713fd6b24df4c5` (`origin/main`, merge da PR #323)
**Branch:** `arena/3f450206-gruposegsystemseguranca`
**Fatia:** `CmsClient` deixa de ser órfão e passa a montar a **26ª aba** do `TiConsole` (*Conteúdo do site*, grupo *Experiência e comunicação*).
**Natureza:** promoção com prova (focal RED→GREEN + mutações + cenário de navegador).
**Não** é aceite humano, **não** é homologação e **não** marca item de produção.

---

## 1. Dois defeitos reais no protótipo

O componente tinha 56 linhas e **nenhum importador**, mas o problema não era só ser órfão — ele não funcionava:

| Defeito | Medido | Correção |
|---|---|---|
| Transições chamavam `PATCH /api/admin/cms-contents` (**sem id**) | servidor responde **405 `method_not_allowed`** — revisão, aprovação, publicação, arquivamento e reversão nunca funcionaram | `PATCH /api/admin/cms-contents/:id`, com o corpo **só** `{status, reason}` |
| O detalhe lia `detail.content` | a API devolve o registro **plano** (`{...conteudo, versions, history}`) → a tela mostrava `undefined` | `classificarDetalhe` valida o formato plano |

O segundo `PATCH` errado apareceu **no gate**, não no focal: mandar `id` no corpo faz o handler recusar com `create_revision_to_edit` (`Object.keys(b)` só aceita `status` e `reason`). Corrigido no produto e coberto pelo cenário.

## 2. O que foi entregue

| Item | Antes | Depois |
|---|---|---|
| `CmsClient.tsx` | 56 linhas, `style` inline, `prompt()` para motivo, `any`, erro cru | 291 linhas, CSS module, motivo em campo com validação, estados honestos |
| `cms-content-state.ts` | não existia | módulo puro: `TRANSICOES` (espelho do servidor), `proximosEstados`, `podePublicar`, `classificarLista`, `classificarDetalhe`, `traduzirErroCms` (21 códigos), `validarMotivo` (10..1000), `validarRascunho` |
| `CmsClient.module.css` | não existia | tokens, `:focus-visible`, breakpoints 900/740 px, zero hex |
| `TiConsole.tsx` | 25 abas | **26 abas** (`cms`) |
| `tests/ux-pro-03-ti-cms-conteudo-ui.test.mjs` | não existia | focal **12/12** (RED → GREEN) + 4 mutações |
| `tests/ux-pro-03-ti-reaudit.test.mjs` | `EXPECTED_TABS = 25` | `26` |
| `scripts/ux-pro-03-ti-inventory.mjs` | 12 promoções | **13** (órfãos **34 → 33**) |

### O fluxo coberto (real, não desenho)

`rascunho → em_revisão → (aprovado | rejeitado) → publicado → arquivado`, com **case** exigindo autorização explícita para publicar; publicação substitui a versão publicada anterior **arquivando-a** (nada é apagado), cada transição grava um evento no histórico imutável com motivo, e **reverter** cria uma versão nova em rascunho.

A tela valida antes de enviar com as **mesmas regras do servidor** (slug 3..200 minúsculo-kebab, título 5..200, conteúdo 50..20.000, resumo/SEO opcionais com faixa, metadata JSON), e nenhuma leitura vira lista vazia por omissão: 401/403 são `negado`, corpo sem `items` é `inválido`, `[]` é `vazio`.

## 3. Prova

### 3.1 Focal

```
RED  (módulo ausente)                      → # tests 1  # pass 0  # fail 1
GREEN                                      → # tests 12 # pass 12 # fail 0
```

| Mutação | Detectada em |
|---|---|
| `proximosEstados` inventa transições | `not ok 1` (+2) |
| detalhe volta a ler `corpo.content` (bug do protótipo) | `not ok 5` |
| transição volta a fazer `PATCH` na coleção | `not ok 9` |
| 403 classificado como `vazio` | `not ok 3` |

### 3.2 Navegador — `browser UX-PRO-03 CMS`

Sessão `ti` real, PostgreSQL 17 descartável, Chromium:

1. anônimo **401**; `rh` **403**; `ti` **200**; `PATCH` na coleção **405** (prova de por que a rota certa importa);
2. **criar rascunho pela interface** → `cms_ok` "nada foi publicado" + banco com `status='rascunho'`, `is_published=false`;
3. **três transições reais** pela interface → banco `status='publicado'`, `is_published=true` e histórico imutável com `["rascunho","em_revisao","aprovado","publicado"]` e o motivo gravado;
4. **case sem autorização**: o botão "→ Publicado" fica **travado** e o banco confirma `aprovado`;
5. **reverter para v1** → nova versão em rascunho criada;
6. **320 / 390 / 1440** e **tema noturno** — `sobraDocumentoPx: 0` em todos;
7. **negação** (`403` injetado) e **payload inválido** (`{}`): `cms-estado-lista` declara `negado`/`invalido` e a tela **não** diz "nenhum conteúdo".

Evidência: `docs/ux-pro-03-cms-conteudo-evidencias/` — **10 PNGs** + `resumo.json` (`problems: []`, `sobraDocumentoPx: 0` em todos os estados).

## 4. Limites declarados

1. **Sem aceite humano, sem homologação, sem UAT:** produção **NO-GO**, **0/222**.
2. **Sem leitor de tela e sem Windows:** teclado, foco e contraste só no Chromium empacotado.
3. **Sem upload e sem HTML arbitrário:** o CMS guarda texto e metadados; imagens/arquivos continuam fora do escopo.
4. **Sem e-mail:** publicar não notifica ninguém (não há SMTP).
5. **A aba mostra todos os papéis do `AdminGate`** (`ti|admin`); a API aceita `admin`, `marcelo` e `ti` — `rh` é negado nas duas camadas, e o cenário prova o 403.
6. **Os outros 33 órfãos continuam órfãos.**

## 5. Reconciliação

- `origin/main` na base: `3ebdef5…`; a **#324** segue **aberta, sem merge** (não foi mergeada, fechada nem reescrita aqui).
- Inventários regenerados **somente** pelos geradores (`ux-pro-03-ti-inventory.mjs`, `ux-pro-00-inventory.mjs`, `requisitos-222-inventory.mjs`).
- `test:unit`: **165 → 166** arquivos; `EXPECTED_TABS` **25 → 26**; promoções **12 → 13**; gate do portal **51 → 52** cenários.
