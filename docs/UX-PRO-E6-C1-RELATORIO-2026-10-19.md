# UX-PRO-E6-C1 — relatório (19/10/2026)

**Subfatia:** E6-C1 — resíduo de `<main>` aninhado em `/cliente/app/cobrancas` e `/cliente/app/portal`.

**Branch:** `arena/2ba2677d-gruposegsystemseguranca` · **Base:** `origin/main` = `14882357d2f5e7b44cf8cc6a410fe8042f424759` (merge PR #269, UX-PRO-E5). `git rev-parse origin/main` confirmado no início da sessão; `gh pr list --state open` vazio.

**Guardas:** `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` e `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23` — conferidos antes e depois (restauração por cópia do HEAD após `next build`).

**Este documento não declara aceite humano, UAT nem conformidade WCAG. Homologação/produção NO-GO.**

---

## 1. Correção aplicada

Rebaixamento idêntico ao E6, mas no shell cliente `src/app/cliente/RealAccessShell.tsx:26` (`<main className={styles.main}>` via `src/app/cliente/app/layout.tsx`):

| Rota | Arquivo | Antes | Depois |
|------|---------|-------|--------|
| `/cliente/app/cobrancas` | `src/app/cliente/app/cobrancas/page.tsx:15` | `<div className={styles.shell}><ClientAppNavigation/><main className={styles.content}>…</main></div>` | `<div className={styles.shell}><div className={styles.content}>…</div></div>` + remoção do import/duplicidade de `ClientAppNavigation` (layout já fornece o landmark) |
| `/cliente/app/portal` | `src/app/cliente/app/portal/page.tsx:3` | `<main style={{ padding:24, maxWidth:900, … }}>` | `<div style={{ padding:24, maxWidth:900, … }}>` |

Preservados: rotas, títulos (`Cobranças e comprovantes`, `Portal do Cliente — Camada 1`), conteúdo, classes/estilo inline, ordem do DOM, contratos de API/session, RBAC, auditoria, banco. O shell (`RealAccessShell.tsx`) e o layout não foram alterados. `<main>` e `<div>` são ambos `display:block` sem estilo de UA relevante — geometria e estilos computados não mudam (mesma justificativa do E6 §4).

Duplicidade colateral corrigida em `/cobrancas`: dois `nav[aria-label=Navegação da área do cliente]` → um (o do layout). Nenhum teste herdado dependia de `main main` no portal.

## 2. Prova estática RED → GREEN

### 2.1 Teste focal criado: `tests/ux-pro-e6-c1-single-main.test.mjs`

Contrato:
- Para cada `page.tsx` sob `src/app/cliente/app/`, o grafo de imports alcançável não pode emitir `<main>` fora de `RealAccessShell.tsx` (o shell emite exatamente 1 `<main>`; cada documento renderiza exatamente um).

**RED (antes, código intocado):**

```
not ok 1 - UX-PRO-E6-C1: nenhuma rota /cliente/app sob RealAccessShell emite <main> aninhado
  error: |
    UX-PRO-E6-C1: <main> aninhado presente em 2 ocorrência(s):
    rota src/app/cliente/app/cobrancas/page.tsx emite <main> aninhado ao shell RealAccessShell: src/app/cliente/app/cobrancas/page.tsx:15 — o documento deve conter exatamente um <main> (o do shell, em src/app/cliente/RealAccessShell.tsx)
    rota src/app/cliente/app/portal/page.tsx emite <main> aninhado ao shell RealAccessShell: src/app/cliente/app/portal/page.tsx:3 — o documento deve conter exatamente um <main> (o do shell, em src/app/cliente/RealAccessShell.tsx)
ok 2 - UX-PRO-E6-C1: o shell do portal preserva o marco main único
# pass 1, fail 1
```

**GREEN (depois):**

```
ok 1 - UX-PRO-E6-C1: nenhuma rota /cliente/app sob RealAccessShell emite <main> aninhado
ok 2 - UX-PRO-E6-C1: o shell do portal preserva o marco main único
# pass 2, fail 0
```

### 2.2 Regressão administrativa E6

`tests/ux-pro-e6-single-main.test.mjs` continua verde:

```
ok 1 - UX-PRO-E6: nenhuma rota /admin sob AdminGate emite <main> aninhado ao do shell
ok 2 - UX-PRO-E6: o shell administrativo preserva o marco main[data-admin-theme-scope] nos três estados
# pass 2
```

### 2.3 E5 preservado

`tests/ux-pro-e5-table-scroll.test.mjs` verde (51 wrappers com `role="region"`, `aria-label` e `tabIndex`).

## 3. Gates reproduzíveis

| Gate | Resultado |
|------|-----------|
| `npm run typecheck` | `tsc --noEmit` sem diagnóstico |
| `node scripts/qa-wave0-static.mjs` | `5/5 verificações estáticas OK` |
| `node scripts/ux-pro-00-inventory.mjs --check` | `100 rotas` — `OK: docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv e docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv conferem com o código atual` |
| `npm run build` | 105 páginas estáticas (inclui `/cliente/app/cobrancas` e `/cliente/app/portal`), sem erro |
| `git diff --check` | sem marcador de whitespace |
| `next-env.d.ts` / `tsconfig.json` | MD5 idênticos ao HEAD antes/depois |

Inventário: nenhuma mudança de contagem — os mesmos 14 `page.tsx` em `src/app/cliente/app` continuam gerando 100 rotas totais; o CSV não muda (mesmo critério `page.*` = 1 rota).

## 4. Evidência antes/depois — verificação executada (19/10/2026)

- `antes/` (RED): varredura estática documenta `mainCount=2` nas 2 rotas E6-C1 (ver §2.1); 12 rotas restantes com `mainCount=1`.
- `depois/` (GREEN): varredura estática 2/2 + gates acima — `problems` vazio em todas as linhas.
- Fingerprint geometria/estilo: não aplicável como captura de navegador nesta fatia (a troca de tag `<main>` → `<div>` preserva `display:block` e não altera estilos computados; o E6 já provou identidade de fingerprint em 20/28 pares admin e variação apenas por hidratação). A prova estática + build + inventário cobre o contrato de marco único para o portal.

## 5. Limites

- Não altera contratos HTTP, autenticação, RBAC, auditoria, persistência, MFA, cookies, rate limit ou operação local.
- Não declara validação manual, aceite humano, conformidade WCAG, teste com leitor de tela, zoom ou homologação em produção.
- A prova é estática (AST de imports + verificação de shell); não inclui captura de navegador automatizada do portal nesta fatia — a E6 já demonstrou o padrão de captura dia/noite para o admin, reutilizável aqui se requisitado.

## 6. Próximo passo

E6-C1 encerra a família `<main>` aninhado. Próxima fatia autorizada: reconciliação documental pós-#267/#268/#269 ou outro resíduo numerado, mantendo PR pequena, sem alterar contratos/API/autenticação/RBAC/banco ou arquivos gerados.

Reprodução:

```text
npm run typecheck
node scripts/qa-wave0-static.mjs
node scripts/ux-pro-00-inventory.mjs --check
node --test tests/ux-pro-e6-c1-single-main.test.mjs tests/ux-pro-e6-single-main.test.mjs tests/ux-pro-e5-table-scroll.test.mjs
npm run build
git diff --check
```
