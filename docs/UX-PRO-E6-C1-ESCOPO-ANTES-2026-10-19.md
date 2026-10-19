# UX-PRO-E6-C1 — escopo ANTES (19/10/2026)

**Subfatia:** E6-C1 — resíduo de `<main>` aninhado em `/cliente/app` (família portal do cliente).

**Branch:** `arena/2ba2677d-gruposegsystemseguranca` · **Base:** `origin/main` = `14882357d2f5e7b44cf8cc6a410fe8042f424759` (merge da PR #269, UX-PRO-E5), confirmada por `git rev-parse origin/main` nesta sessão. Árvore limpa antes de qualquer alteração.

**Guardas de arquivo:** `next-env.d.ts` e `tsconfig.json` — conferidos **antes** e após; nenhuma alteração gerada. Cópias não são reescritas por esta fatia (sem bypass).

**PRs abertas no início:** nenhuma (`gh pr list --state open` vazio).

**Este documento não declara aceite humano, UAT nem conformidade WCAG. Homologação e produção permanecem NO-GO.**

---

## 1. Origem confirmada no código

O shell cliente é `src/app/cliente/RealAccessShell.tsx:26`:

```tsx
<main className={styles.main}>{children}</main>
```

O layout `src/app/cliente/app/layout.tsx` envolve todo o conteúdo de `/cliente/app/*` nesse `<main>`:

```tsx
<RealAccessShell>
  <ClientSpaceProvider>
    <div className={appStyles.wide}>
      <ClientAppNavigation />
      {children}
    </div>
  </ClientSpaceProvider>
</RealAccessShell>
```

Duas páginas sob esse layout emitem **outro `<main>`** dentro do `<main>` do shell → **`<main>` aninhado (HTML inválido: um documento não pode ter dois `main`)**:

| # | Rota | Arquivo e linha | `<main>` de conteúdo observado |
|---|------|----------------|-------------------------------|
| 1 | `/cliente/app/cobrancas` | `src/app/cliente/app/cobrancas/page.tsx:15` | `<main className={styles.content}>` dentro de `<div className={styles.shell}><ClientAppNavigation/>…` |
| 2 | `/cliente/app/portal` | `src/app/cliente/app/portal/page.tsx:3` | `<main style={{ padding:24, maxWidth:900, … }}>` com 4 cards e nota de regra |

Varredura em `src/app/cliente/app/**/*page.tsx` (14 arquivos) — somente essas 2 contêm `<main`. As demais 12 (`agenda`, `assistente`, `chamados`, `continuidade`, `contratos`, `documentos`, `reclamacoes-colaborador`, `relatorios`, `renovacao`, `satisfacao`, `seguranca`, `solicitacoes`, e `page.tsx` da visão geral) retornam `<section>`/`<div>`/fragmento e dependem exclusivamente do marco do shell — sem aninhamento.

**Nenhum** `<main>` do repositório (incluindo estes 2) declara `aria-label`/`aria-labelledby`; não há nome acessível de marco em jogo. O tema cliente não está acoplado ao `<main>` do shell (diferente do admin), mas o marco único continua sendo o contrato semântico do documento.

**Duplicidade adicional em `/cobrancas`:** a página importa e renderiza `ClientAppNavigation` novamente, enquanto o layout já fornece exatamente o mesmo componente. Resultado: dois landmarks `nav[aria-label=Navegação da área do cliente]` por documento, além dos dois `main`. As demais páginas do portal não repetem a navegação.

## 2. Reconciliação com a memória E6

A memória “19 rotas” do E6 descreveu o shell administrativo (`src/app/admin/AdminGate.tsx:115`) e contou 28 rotas com `<main>` aninhado sob ele — 19 no padrão transversal `UiWorkspace` + 9 com classes próprias. O documento E6 registrou explicitamente as 2 rotas de cliente como **resíduo E6-C1** (origem `RealAccessShell`, família ID3/portal do cliente, com pendências próprias), sem alteração naquela subfatia por regra de preservação item a item.

Medição da base atual (`1488235`):

| Conjunto | Contagem | Critério |
|---|---|---|
| Rotas `/admin/*` com `<main>` aninhado ao shell admin | **0** | já corrigido na E6 — todas viraram `<div data-admin-content="true">` |
| Rotas `/cliente/app/*` com `<main>` aninhado ao shell cliente | **2** | página sob `RealAccessShell` + `<main>` alcançável no arquivo da página |
| Demais rotas `/cliente/app/*` | 12 | 1 `<main>` por documento (o do shell) — sem aninhamento |
| Demais rotas do repo | 1 `<main>` por documento/estado | site público, prévias, `/funcionario`, `/admin/entrar` etc. — estados mutuamente exclusivos |

**Decisão de escopo E6-C1:** corrigir os 2 documentos `/cliente/app` restantes com a mesma forma aditiva do E6: **rebaixar o `<main>` interno para `<div>`** (ou `<section>`), preservando atributos, conteúdo, classes/estilos e ordem do DOM. O shell (`RealAccessShell.tsx`) **não é alterado**. A duplicidade de navegação em `/cobrancas` é removida como consequência direta do rebaixamento — o layout já fornece o único landmark.

## 3. Estrutura e semântica observadas

Em ambas as rotas, o `<main>` interno é descendente direto/indireto do `<main>` do shell, sem nome acessível, e é o único `<main>` da página além do shell.

| Rota | Atributos do `<main>` interno | Conteúdo/identidade (h1) |
|------|-------------------------------|--------------------------|
| `/cliente/app/cobrancas` | `className={styles.content}` (`ClientApp.module.css` — classe inexistente, sem estilo aplicado; `styles.shell`/`breadcrumb`/`notice` também inexistentes) | Cobranças e comprovantes |
| `/cliente/app/portal` | `style` inline (`padding:24, maxWidth:900, margin:0 auto, fontFamily:var(--theme-font), color:var(--theme-fg), background:var(--theme-bg), borderRadius:var(--theme-radius), boxShadow:var(--theme-shadow)`) | Portal do Cliente — Camada 1 |

As 12 rotas `/cliente/app` sem `<main>` não podem perder o marco do shell; o rebaixamento não as toca.

## 4. Decisão de marco

Não há escolha livre de marco — a única direção aditiva é manter o `<main>` do shell:

- Promover o `<main>` da página exigiria remover o marco do shell, quebrando o layout compartilhado de todas as rotas do portal e exigindo editar o layout.
- Manter o `<main>` do shell e rebaixar o interno não muda o marco: o elemento sobrevivente continua byte a byte o mesmo (mesma tag, mesmos atributos, mesma posição, mesma cobertura). O que desaparece é o duplicado inválido — o próprio defeito E6-C1. `<main>` e `<div>` são ambos `display:block` sem estilo de UA relevante; a geometria e os estilos computados não mudam (ver §6 da E6).

O shell e os estados transitórios do portal (loading, empty, error) já existem dentro do único `<main>` do shell; nenhum deles cria segundo marco.

## 5. Teste RED canônico (gravado antes do reparo)

**Arquivo:** `tests/ux-pro-e6-c1-single-main.test.mjs` (estático, incluído em `npm test`). Contrato: para **cada** página `/cliente/app/*` sob `RealAccessShell`, o arquivo da página **não** pode emitir `<main>` — o documento deve conter exatamente um `<main>` (o do shell, em `src/app/cliente/RealAccessShell.tsx:26`). O walk cobre imports estáticos por caminho relativo; imports de pacote não carregam `<main>` de portal hoje.

**Prova DOM (gate opcional):** não há gate de navegador próprio para o portal nesta fatia; a prova estática é suficiente para o contrato de um único marco por documento. A verificação visual do portal segue o mesmo padrão do gate E6 se requisitada em fatia futura.

**Mensagem exata da falha RED** (saída real desta sessão, `node --test tests/ux-pro-e6-c1-single-main.test.mjs` antes de qualquer reparo — 2 ocorrências):

```
not ok 1 - UX-PRO-E6-C1: nenhuma rota /cliente/app sob RealAccessShell emite <main> aninhado
  error: |
    UX-PRO-E6-C1: <main> aninhado presente em 2 ocorrência(s):
    rota src/app/cliente/app/cobrancas/page.tsx emite <main> aninhado ao shell RealAccessShell: src/app/cliente/app/cobrancas/page.tsx:15 — o documento deve conter exatamente um <main> (o do shell, em src/app/cliente/RealAccessShell.tsx)
    rota src/app/cliente/app/portal/page.tsx emite <main> aninhado ao shell RealAccessShell: src/app/cliente/app/portal/page.tsx:3 — o documento deve conter exatamente um <main> (o do shell, em src/app/cliente/RealAccessShell.tsx)
ok 2 - UX-PRO-E6-C1: o shell do portal preserva o marco main único
```

O segundo teste (preservação do shell) já passa no RED e continua verde após o reparo.

## 6. Colateral e invariantes

- Nenhum teste herdado usa `main main` para o portal; não há adaptação de seletor necessária.
- Não alterar: rotas, destinos, papéis, permissões, grants, navegação (além de remover duplicidade idêntica), títulos, conteúdo, contratos de API/session, payloads, cookies, MFA, auditoria ou isolamento.
- Não declarar aceite humano, UAT nem conformidade WCAG.
- Inventário `node scripts/ux-pro-00-inventory.mjs` + `--check` após tocar `src/app`; diff dos CSVs aceitando apenas mudanças justificadas por evidência real desta subfatia (nenhuma mudança de contagem de rotas esperada — são os mesmos 100 `page.*`).
- Verificar `next-env.d.ts`/`tsconfig.json` byte a byte (não tocados).

## 7. Resíduos

Nenhum resíduo numerado novo além deste. Resíduos anteriores E6 já resolvidos (28 rotas admin). E6-C1 é o último da família `<main>` aninhado.

## 8. Limites

- Não alterar contratos HTTP, autenticação, RBAC, banco ou operação local.
- Evidência é estática (AST de imports + verificação de arquivo); não prova renderização em navegador, leitor de tela ou aceite humano.
- Homologação/produção NO-GO.
