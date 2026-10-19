# UX-PRO-E2-C1 — relatório (19/10/2026)

**Subfatia:** E2-C1 — resíduo `sem rótulos` do legado operacional (`OpsAdvanced2Client.tsx` e `OpsAdvanced3Client.tsx`), declarado no limite da E2.

**Branch:** `arena/955d1208-gruposegsystemseguranca` · **Base:** `origin/main` = `3f771ccaf96f8a5d52b255e63124dfcd99bfead5` (merge PR #271, UX-PRO-E2). `git fetch origin main` + `git rev-parse origin/main` confirmados no início da sessão; `gh pr list --state open` vazio.

**Guardas:** `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` e `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23` — conferidos antes e depois (restauração por cópia do HEAD após `next build`).

**Escopo anterior:** [UX-PRO-E2-C1-ESCOPO-ANTES-2026-10-19.md](UX-PRO-E2-C1-ESCOPO-ANTES-2026-10-19.md).

**Este documento não declara aceite humano, UAT nem conformidade WCAG. Homologação/produção NO-GO.**

---

## 1. Correção aplicada

Os 19 formulários de criação dos dois componentes da família E2 receberam rótulos persistentes. Cada um dos **108 controles** (`<input>`/`<select>`/`<textarea>`) foi envolvido em um `<span>` colunar com `<label htmlFor>` visível e `id` estável com prefixo de componente (`ops2-…`/`ops3-…`, únicos mesmo com os dois componentes vivos no mesmo documento):

```tsx
// antes (OpsAdvanced2Client.tsx:224)
<input placeholder="post_id UUID" value={visitForm.post_id} onChange={e=>setVisitForm({...visitForm, post_id:e.target.value})} style={{ width:220 }} />

// depois
<span style={{ display:"flex", flexDirection:"column", gap:2, fontSize:12 }}>
  <label htmlFor="ops2-visit-post">Posto (UUID)</label>
  <input id="ops2-visit-post" placeholder="post_id UUID" value={visitForm.post_id} onChange={e=>setVisitForm({...visitForm, post_id:e.target.value})} style={{ width:220 }} />
</span>
```

| Componente | Formulários | Controles rotulados | Com `placeholder` (preservado como dica) | Sem nenhuma orientação antes (datas/seletores) |
|---|---|---|---|---|
| `OpsAdvanced2Client.tsx` | 8 (`visitForm`, `inspForm`, `apForm`, `patrolForm`, `pointForm`, `keyForm`, `movForm`, `reportForm`) | 47 | 36 | 11 |
| `OpsAdvanced3Client.tsx` | 11 (`defForm`, `snapForm`, `reincForm`, `propForm`, `entryForm`, `envForm`, `routForm`, `execForm`, `ncForm`, `connForm`, `evForm`) | 61 | 38 | 23 |
| **Total** | **19** | **108** | **74** | **34** |

Vocabulário dos rótulos em português, no mesmo registro dos rótulos criados pela E2 no `UiActionDialog` (`Responsável pela verificação`, `Notas da verificação`…): nomes humanos (`Responsável`, `Prazo`, `Título`, `Nome do ponto`, `Frequência`, `Severidade`) e identificadores que o operador precisa digitar com sufixo reconhecível (`Posto (UUID)`, `Empresa (ID)`, `Chave (ID)`, `Modelo de turno (ID)`). Os rótulos não declaram cor — herdam o texto do tema administrativo em dia e noite.

Prova mecânica de aditividade (saída desta sessão, `git show HEAD:<arquivo>` × arquivo alterado):

- pares `value={…} onChange={…} …style` extraídos dos 47 controles de A2 e dos 61 de A3: **idênticos byte a byte** antes/depois (`diff` vazio; 108 controles);
- multiconjunto dos 74 `placeholder="…"`: **MD5 idêntico** antes/depois por arquivo (`4b1e9c70…` em A2, `c4ed84e2…` em A3) — nenhuma dica apagada;
- o único atributo acrescentado aos controles é o `id`; o restante da linha (ordem do DOM inclusive) é o mesmo.

## 2. Prova estática RED → GREEN

### 2.1 Teste focal criado: `tests/ux-pro-e2-c1-field-labels.test.mjs`

Contratos (incluído no gate unitário padrão de `package.json`):

1. todo controle dos dois arquivos tem `id` único + `<label htmlFor>` com texto não vazio — cada ocorrência listada com `arquivo:linha`;
2. nenhuma associação órfã (todo `htmlFor` resolve para um controle do mesmo arquivo);
3. preservação: todo controle segue controlado (`value` + `onChange`), as contagens de controles (47/61) e de `placeholder` (36/38) permanecem — a fatia não apaga campos nem dicas para passar no teste.

**RED (antes, código intocado — saída real desta sessão, `node --test tests/ux-pro-e2-c1-field-labels.test.mjs`):**

```
not ok 1 - UX-PRO-E2-C1: todo controle do legado operacional tem rótulo persistente
  error: |
    UX-PRO-E2-C1: 108 controle(s) sem <label htmlFor> associado:
    OpsAdvanced2Client.tsx:224 — <input placeholder="post_id UUID"> sem <label htmlFor> associado — o controle deve ter id único e rótulo persistente com texto visível
    OpsAdvanced2Client.tsx:225 — <input placeholder="company_id"> sem <label htmlFor> associado — o controle deve ter id único e rótulo persistente com texto visível
    OpsAdvanced2Client.tsx:226 — <input placeholder="supervisor_employee_id"> sem <label htmlFor> associado — o controle deve ter id único e rótulo persistente com texto visível
    OpsAdvanced2Client.tsx:227 — <input> sem <label htmlFor> associado — o controle deve ter id único e rótulo persistente com texto visível
    OpsAdvanced2Client.tsx:228 — <input placeholder="responsável"> sem <label htmlFor> associado — o controle deve ter id único e rótulo persistente com texto visível
    …
    OpsAdvanced3Client.tsx:315 — <input placeholder="connector_id"> sem <label htmlFor> associado — o controle deve ter id único e rótulo persistente com texto visível
    …
    OpsAdvanced3Client.tsx:320 — <input placeholder="notas"> sem <label htmlFor> associado — o controle deve ter id único e rótulo persistente com texto visível
ok 2 - UX-PRO-E2-C1: associações sem órfãos, ids únicos e contratos de campo preservados
# pass 1, fail 1
```

A mensagem lista as 108 ocorrências (47 em `OpsAdvanced2Client.tsx`, 61 em `OpsAdvanced3Client.tsx`); o recorte acima mostra a abertura e o fechamento. O teste 2 já passava na base (as contagens e os vínculos existem; faltavam só os rótulos).

**GREEN (depois):**

```
ok 1 - UX-PRO-E2-C1: todo controle do legado operacional tem rótulo persistente
ok 2 - UX-PRO-E2-C1: associações sem órfãos, ids únicos e contratos de campo preservados
# pass 2, fail 0
```

### 2.2 Regressões preservadas

`tests/ux-pro-e2-action-dialog.test.mjs` (E2), `tests/ux-pro-e5-table-scroll.test.mjs` (E5), `tests/ux-pro-e6-single-main.test.mjs`, `tests/ux-pro-e6-c1-single-main.test.mjs` (E6/E6-C1) e `tests/ux-pro-00-inventory.test.mjs`: **13 testes, 13 aprovados** com o foco E2-C1 (conjunto completo do comando na seção 6).

## 3. Gates reproduzíveis

| Gate | Resultado |
|------|-----------|
| `node --test tests/ux-pro-e2-c1-field-labels.test.mjs` | RED `# pass 1, fail 1` (108 ocorrências) → GREEN `# pass 2, fail 0` |
| `npm run typecheck` | `tsc --noEmit` sem diagnóstico |
| `node scripts/qa-wave0-static.mjs` | `5/5 verificações estáticas OK` |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK: … conferem com o código atual` (100 rotas; CSVs inalterados — os rótulos não mudam alcançabilidade nem classificação) |
| regressões E2/E5/E6/E6-C1/inventário | `# pass 13, fail 0` |
| `npm run build` | `✓ Generating static pages (105/105)`, sem erro |
| `npm test` (gate unitário completo, com o novo teste incluso) | `# tests 968 … # pass 968, # fail 0` |
| `git diff --check` | sem marcador de whitespace |
| `next-env.d.ts` / `tsconfig.json` | MD5 idênticos ao HEAD antes/depois |

## 4. Contratos preservados

Não houve mudança em servidor, banco, migrações, RBAC, autenticação ou auditoria. URLs, métodos, payloads, estados de domínio (`pendente_verificacao`, `verificado`, `visitado`, `em_revisao`, `aprovado`, `em_analise`, `publicado`, `reconhecido`, `em_tratamento`, `resolvido`…), mensagens de sucesso e recargas permanecem iguais; as onze decisões do `UiActionDialog` da E2 seguem intocadas (regressão verde), inclusive o motivo canônico da publicação após revisão humana dos conflitos e a nota canônica de encerramento do evento sintético sem despacho externo. Os avisos de decisão humana, privacidade, anti-replay e natureza sintética dos eventos (`GPS/QR isolado não prova execução…`, `Não construir substituto de central 24h…`) e os textos de todos os botões são os mesmos.

## 5. Limites

- A prova desta fatia é estática e de compilação. Não registra captura de navegador, teste com leitor de tela, validação manual, aceite humano ou conformidade WCAG.
- As dicas de `placeholder` (regras `5..200`, vocabulário do campo) permanecem **visíveis**, mas sem associação `aria-describedby` programática: o **nome** do campo não depende mais delas (rótulo persistente), porém a dica não é anunciada separadamente pelo leitor de tela — recorte aditivo deliberado, sem redesenho das abas.
- A geometria dos controles legados (larguras fixas, alvos abaixo de 44 px) foi preservada por decisão de escopo — o requisito de 44 px da E2 vale para o `UiActionDialog`, não para estes campos.
- `OpsAdvancedClient.tsx` (29 `placeholder`, órfão — sem consumidor), `AdmAdvancedClient.tsx` e os demais `placeholder` do repositório seguem fora desta fatia, cada família com decisão própria.
- Não declara validação manual, homologação, revisão humana ou prontidão de produção.

## 6. Próximo passo

E2-C1 fecha o item E2 (`prompt()/confirm, sem rótulos`) do resíduo transversal. Os resíduos E3 (datas/horas `timestamptz` fatiadas sem fuso) e E9 (quebra de palavra em cabeçalhos a 768px) ainda exigem decisão explícita do proprietário; a reconciliação documental continua à parte.

Reprodução:

```text
npm run typecheck
node scripts/qa-wave0-static.mjs
node scripts/ux-pro-00-inventory.mjs --check
node --test tests/ux-pro-e2-c1-field-labels.test.mjs tests/ux-pro-e2-action-dialog.test.mjs tests/ux-pro-e5-table-scroll.test.mjs tests/ux-pro-e6-single-main.test.mjs tests/ux-pro-e6-c1-single-main.test.mjs tests/ux-pro-00-inventory.test.mjs
npm test
npm run build
git diff --check
```
