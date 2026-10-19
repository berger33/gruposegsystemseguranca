# UX-PRO-E2-C1 — relatório (19/10/2026)

**Subfatia:** E2-C1 — resíduo da E2: rótulos persistentes nos campos legados
das seis abas avançadas de `/admin/operacao`.

**Branch:** `arena/d8c7ed8d-gruposegsystemseguranca` · **Base:** `origin/main` =
`3f771ccaf96f8a5d52b255e63124dfcd99bfead5` (merge da PR #271, UX-PRO-E2).
**Escopo anterior:** [UX-PRO-E2-C1-ESCOPO-ANTES-2026-10-19.md](UX-PRO-E2-C1-ESCOPO-ANTES-2026-10-19.md)

**Guardas:** `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` e
`tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23` — idênticos antes e
depois (o `next build` reescreveu `next-env.d.ts`; restaurado por cópia do
HEAD, sem bypass, como na E6-C1).

**Este documento não declara aceite humano, UAT nem conformidade WCAG.
Homologação/produção NO-GO.**

---

## 1. Correção aplicada

Os 108 campos dos formulários de cadastro das seis abas legadas receberam
`id` estável (`ops-a2-*`/`ops-a3-*`) e `<label htmlFor>` com **legenda
visível** em português empilhada acima do controle (padrão de campo do
`UiActionDialog` da E2):

| Arquivo | Controles rotulados | Antes | Depois |
|---|---|---|---|
| `src/app/admin/ti/OpsAdvanced2Client.tsx` | 47 (OPS-09/10/11/12) | 0 rótulos; 36 só `placeholder`; 11 sem nome algum | 47 pares `id` + `<label for>` + `<span className={styles.caption}>` |
| `src/app/admin/ti/OpsAdvanced3Client.tsx` | 61 (OPS-13/14/15/16) | 0 rótulos; 38 só `placeholder`; 23 sem nome algum | 61 pares `id` + `<label for>` + `<span className={styles.caption}>` |

- `src/app/admin/ti/OpsAdvancedForms.module.css` (novo): duas classes
  (`.field` grade legenda+controle; `.caption` legenda 11px) — sem tocar
  estilos compartilhados.
- `src/app/admin/operacao/OperacaoWorkspace.tsx`: os dois avisos `styles.hint`
  das seções legadas deixaram de afirmar "sem rótulo associado em todo campo"
  (falso após a correção) e passam a declarar o estado real (rótulo associado
  em cada campo; `placeholder` apenas como dica de formato; demais pendências
  seguem em docs/UX-07-OPERACAO-2026-10-05.md).
- `tests/ux-pro-e2-c1-labeled-fields.test.mjs` (novo, RED→GREEN) incluído no
  gate unitário padrão de `package.json`.

`placeholder` (74 dicas de formato como "título 5..200", "post_id UUID"),
`value`, `onChange`, `type`, `rows`, `style`, larguras, opções de `select`,
ordem do DOM, mensagens e recargas permanecem intactos. Preservação provada
mecanicamente: **108/108 linhas de controle preservadas byte a byte fora do
`id` inserido** (comparação git-diff linha a linha).

## 2. Prova estática RED → GREEN

### 2.1 Teste focal: `tests/ux-pro-e2-c1-labeled-fields.test.mjs`

Contrato: (a) todo `input`/`select`/`textarea` dos dois arquivos tem `id`
literal único e `<label htmlFor>` correspondente — nenhum campo depende
apenas de `placeholder`; (b) uma legenda visível (`styles.caption`, texto não
vazio) por controle; (c) o aviso legado de `/admin/operacao` continua honesto;
(d) guardas E2 (sem `prompt`/`confirm`, 6+5 `setActionDialog`) e os 27
endpoints `/api/hr/ops-*` dos formulários permanecem exatamente os mesmos.

**RED (código intocado):** 110 falhas (47+61 campos sem rótulo + 2 legendas
ausentes) + o aviso ainda afirmando ausência de rótulos; guarda de contratos
já verde (ver mensagem no escopo ANTES).

**GREEN:**

```
ok 1 - UX-PRO-E2-C1: todo campo das abas legadas tem rótulo associado, nunca só placeholder
ok 2 - UX-PRO-E2-C1: a legenda do aviso legado de /admin/operacao continua honesta
ok 3 - UX-PRO-E2-C1: a correção preservou os contratos da E2 e os endpoints dos formulários
# pass 3, fail 0
```

### 2.2 Regressões focais

```
ok 1 - UX-PRO-E2: onze decisões operacionais usam o diálogo controlado sem prompt/confirm
ok 2 - UX-PRO-E2: diálogo compartilhado expõe nome, ajuda, foco, validação e estados
ok 3..5 - (focal E2-C1, acima)
ok 6 - UX-PRO-E5: wrappers de tabela administrativos nomeiam região rolável e recebem foco por teclado
ok 7 - UX-PRO-E6: nenhuma rota /admin sob AdminGate emite <main> aninhado ao do shell
ok 8 - UX-PRO-E6: o shell administrativo preserva o marco main[data-admin-theme-scope] nos três estados
# pass 8, fail 0
```

## 3. Gates reproduzíveis

| Gate | Resultado |
|------|-----------|
| `npm test` (gate unitário completo) | **969/969 aprovados** (966 da base + 3 novos) |
| `npm run typecheck` | `tsc --noEmit` sem diagnóstico |
| `node scripts/qa-wave0-static.mjs` | `5/5 verificações estáticas OK` |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK … conferem com o código atual` (100 rotas; nenhum `Ui*` compartilhado novo — CSVs intocados) |
| `npm run build` | compilado sem erro, 105 páginas geradas |
| `git diff --check` | sem marcador de whitespace |
| `next-env.d.ts` / `tsconfig.json` | MD5 idênticos ao HEAD antes/depois |

Inventário: nenhuma mudança de contagem ou classificação — o módulo CSS novo é
local (`src/app/admin/ti/`), fora do eixo `components/ui/Ui*` rastreado.

## 4. O que NÃO mudou (contratos preservados)

Nenhuma mudança em servidor, banco, migrações, RBAC, autenticação ou auditoria.
URLs, métodos HTTP e payloads dos 19 formulários e das onze decisões do
`UiActionDialog` permanecem iguais, inclusive os textos canônicos da E2
(motivo de publicação após revisão humana; nota de encerramento sintético sem
despacho externo; opcionais enviados como string vazia). A comprovação
byte-a-byte das 108 linhas de controle (§1) cobre `value`/`onChange`/`type`/
`style`/opções. Os testes herdados que exercitam as abas (`l06-delivery`,
`ux-ops-workspace`) usam `getByRole('tab'|'button')` e estados de falha —
nenhum seletor de `placeholder`/`label` existia sobre estas telas.

## 5. Limites

- A prova focal é estática e de compilação; não registra captura de navegador,
  teste com leitor de tela, validação manual, aceite humano ou conformidade
  WCAG.
- A legenda visível empilhada aumenta a altura das linhas flexíveis das seis
  abas (larguras, ações e resultados inalterados) — é a mudança visual que
  torna o rótulo persistente também para quem enxerga.
- Continuam **fora** desta fatia: `OpsAdvancedClient.tsx` (órfão, 39 controles
  sem rótulo, não montado por rota alguma), os ~280 `style` inline e a
  reescrita completa das telas legadas (pendências declaradas da UX-07).

## 6. Reprodução

```text
npm test
npm run typecheck
node scripts/qa-wave0-static.mjs
node scripts/ux-pro-00-inventory.mjs --check
node --test tests/ux-pro-e2-c1-labeled-fields.test.mjs tests/ux-pro-e2-action-dialog.test.mjs tests/ux-pro-e6-single-main.test.mjs tests/ux-pro-e5-table-scroll.test.mjs
npm run build
git diff --check
```
