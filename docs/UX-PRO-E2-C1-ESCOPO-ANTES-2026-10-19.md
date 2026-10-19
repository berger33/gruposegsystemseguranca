# UX-PRO-E2-C1 — escopo ANTES (19/10/2026)

**Subfatia:** E2-C1 — resíduo da E2: campos legados das seis abas avançadas de
`/admin/operacao` ainda nomeados apenas por `placeholder` (ou sem nome algum).

**Branch:** `arena/d8c7ed8d-gruposegsystemseguranca` · **Base:** `origin/main` =
`3f771ccaf96f8a5d52b255e63124dfcd99bfead5` (merge da PR #271, UX-PRO-E2),
confirmada por `git rev-parse HEAD` nesta sessão. Árvore limpa antes de qualquer
alteração.

**Guardas de arquivo:** `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943`
e `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23` — conferidos **antes**;
serão re-conferidos após `next build` (restauração por cópia do HEAD, sem
bypass, se o build os reescrever).

**PRs abertas no início:** nenhuma (`gh pr list --state open` vazio).

**Este documento não declara aceite humano, UAT nem conformidade WCAG.
Homologação e produção permanecem NO-GO.**

---

## 1. Origem confirmada no código-base

A UX-PRO-E2 (PR #271) removeu as 13 chamadas bloqueantes a `prompt()` das seis
abas avançadas de `/admin/operacao` (`OpsAdvanced2Client.tsx` e
`OpsAdvanced3Client.tsx`) e registrou explicitamente o resíduo desta fatia no
seu relatório (§Limites):

> "Os demais campos antigos das abas ainda baseados apenas em `placeholder`
> continuam fora deste recorte e devem ser tratados em uma fatia própria, sem
> ampliar retroativamente E2."

A mesma pendência foi declarada desde a UX-07 (§4/§6 de
[UX-07-OPERACAO-2026-10-05.md](UX-07-OPERACAO-2026-10-05.md)): campos sem
`<label>` associado (só `placeholder`) nas duas telas legadas.

Medição da base atual (`3f771cc`), varredura literal das tags de controle nos
dois arquivos:

| Arquivo | Controles (`input`/`select`/`textarea`) | Com `placeholder` | Sem nome algum | Com `id`/`<label for>` |
|---|---|---|---|---|
| `src/app/admin/ti/OpsAdvanced2Client.tsx` | **47** (40 input, 6 select, 1 textarea) | 36 | 11 (5 `input[type=date]`, 6 `select`) | **0** |
| `src/app/admin/ti/OpsAdvanced3Client.tsx` | **61** (47 input, 14 select) | 38 | 23 (8 `input[type=date]`, 1 `input[type=datetime-local]`, 14 `select`) | **0** |
| **Total em escopo** | **108** | **74** | **34** | **0** |

Defeito reproduzido: os 108 campos dos formulários de cadastro das seis abas
(`visitForm`, `inspForm`, `apForm`, `patrolForm`, `pointForm`, `keyForm`,
`movForm`, `reportForm`, `defForm`, `snapForm`, `reincForm`, `propForm`,
`entryForm`, `envForm`, `routForm`, `execForm`, `ncForm`, `connForm`,
`evForm`) não possuem rótulo associado. 74 nomeiam-se apenas por `placeholder`
(o texto desaparece ao digitar; leitor de tela não o trata como nome
persistente) e 34 não têm nome acessível algum (datas e `select`, cujo valor
exibido é a primeira opção).

## 2. Reconciliação com a memória E2/E6-C1

- E2 removeu somente os `prompt()` e proibiu ampliar retroativamente aquele
  recorte; o resíduo de rótulos é o objeto **desta** fatia, autorizada pelo
  proprietário (pedido de início da UX-PRO-E2-C1).
- A composição histórica de `/admin/ti` não monta estes componentes
  (`TiConsole` não os importa); as seis abas são alcançáveis apenas por
  `/admin/operacao` (`OperacaoWorkspace.tsx:700,714`), que já foi reescrita em
  UX-07 e cujo aviso legado (`styles.hint`) afirma hoje "sem rótulo associado em
  todo campo" — texto que esta fatia tornará falso e atualizará para continuar
  honesto.
- `src/app/admin/ti/OpsAdvancedClient.tsx` (OPS-05..08, 39 controles, também
  sem rótulos) **não é montado por rota alguma** (arquivo órfão; verificado por
  varredura de imports). Fica **fora do escopo** E2-C1: não pertence às seis
  abas do resíduo E2. Seu eventual aproveitamento é resíduo próprio, decidido
  pelo proprietário.

## 3. Decisão de escopo E2-C1

Tratar os 108 campos no padrão já estabelecido pelo repositório para este
defeito (UX-05 §3.6: "todo `input`/`select` tem `id` + `<label for>` +
`aria-describedby`", e o contrato do teste UX-06: "nenhum campo pode depender
apenas de placeholder"):

1. **Cada controle recebe `id` estável** (prefixos `ops-a2-*`/`ops-a3-*`,
   únicos por documento) **e um `<label for>` associado com rótulo visível**
   em português, empilhado acima do controle (mesmo padrão de campo do
   `UiActionDialog` da E2: legenda pequena + controle). O rótulo é persistente
   (não desaparece ao digitar) e é o nome acessível do campo.
2. **`placeholder` permanece apenas como dica de formato** ("título 5..200",
   "post_id UUID", …) — nada é removido; nenhum valor, opção de `select`,
   `value`, `onChange`, `type`, `rows`, `style`, largura ou ordem do DOM é
   alterado.
3. **Empacotamento mínimo**: cada controle passa a ser filho de
   `<label className={styles.field} htmlFor=…>` com
   `<span className={styles.caption}>{rótulo}</span>` imediatamente antes.
   As duas classes vivem num módulo CSS local novo
   (`src/app/admin/ti/OpsAdvancedForms.module.css`) — sem tocar estilos
   compartilhados (`UiWorkspace.module.css`) nem os ~280 `style` inline
   declarados como pendência própria.
4. **Preservação integral de contratos**: URLs, métodos HTTP, payloads,
   estados de domínio, mensagens de sucesso, recargas, avisos de decisão
   humana/privacidade/conflitos/sintético, e as onze decisões do
   `UiActionDialog` da E2 continuam byte a byte os mesmos. Nenhuma mudança em
   servidor, banco, migrações, RBAC, autenticação ou auditoria.
5. **Atualização honesta do aviso legado** em `OperacaoWorkspace.tsx` (os dois
   `styles.hint`): o texto "sem rótulo associado em todo campo" deixa de ser
   verdade e passa a declarar o estado real (rótulos presentes; `placeholder`
   só como dica; pendências restantes da área legada).

## 4. Fora do escopo

- Redesenho das seis abas, reescrita dos ~280 `style` inline, vocabulário dos
  botões/listas, ou qualquer outro acerto de apresentação além dos rótulos.
- `OpsAdvancedClient.tsx` (órfão) e qualquer outro componente não alcançado
  pelas seis abas.
- Servidor, banco, migrações, RBAC, autenticação, auditoria, contratos de API,
  dados, payloads ou mensagens canônicas.
- Declaração de conformidade WCAG, teste com leitor de tela, validação manual,
  aceite humano ou prontidão de produção.

## 5. Teste RED canônico (a ser gravado antes do reparo)

**Arquivo:** `tests/ux-pro-e2-c1-labeled-fields.test.mjs` (estático, incluído em
`npm test`). Contrato:

1. Em cada um dos dois arquivos, **todo** `input`/`select`/`textarea` possui
   `id` literal; os ids são únicos por arquivo; cada id tem `<label
   htmlFor="…">` correspondente — **nenhum campo depende apenas de
   `placeholder`**;
2. cada controle tem uma legenda visível associada (um
   `<span className={styles.caption}>` por controle, com texto não vazio);
3. guarda de regressão E2: nenhum `prompt()`/`confirm()` volta aos dois
   arquivos e as onze ações `setActionDialog` permanecem (6 + 5);
4. guarda de contratos: os endpoints `/api/hr/ops-*` consumidos pelos
   formulários permanecem exatamente os mesmos.

**Mensagem resumida da falha RED** (saída real desta sessão,
`node --test tests/ux-pro-e2-c1-labeled-fields.test.mjs` antes de qualquer
reparo — 2 de 3 testes falham; o terceiro, guarda de contratos, já passa):

```
not ok 1 - UX-PRO-E2-C1: todo campo das abas legadas tem rótulo associado, nunca só placeholder
  error: |-
    UX-PRO-E2-C1: 110 campo(s) sem rótulo associado nas abas legadas:
    …/OpsAdvanced2Client.tsx: input sem id (linha 224) — o campo depende apenas de placeholder ou do valor da opção
    … (47 ocorrências em OpsAdvanced2Client.tsx + 2 de legenda ausente)
    …/OpsAdvanced3Client.tsx: select sem id (linha 204) — o campo depende apenas de placeholder ou do valor da opção
    … (61 ocorrências em OpsAdvanced3Client.tsx + 2 de legenda ausente)
not ok 2 - UX-PRO-E2-C1: a legenda do aviso legado de /admin/operacao continua honesta
  error: 'o aviso não pode continuar afirmando ausência de rótulos depois da correção'
ok 3 - UX-PRO-E2-C1: a correção preservou os contratos da E2 e os endpoints dos formulários
# pass 1, fail 2
```

(O terceiro teste — guardas E2/endpoints — já está verde no RED e continua
verde após o reparo.)

## 6. Colateral e invariantes

- Nenhum teste herdado usa seletores de `placeholder`/`label` nestas telas
  (verificado em `tests/`); `l06-delivery` e `ux-ops-workspace` exercitam as
  abas por `getByRole('tab'|'button')` e estados de falha — inalterados.
- A medição de alvos ≥44px de `ux-ops-workspace` (07D-1) roda sobre a aba
  inicial ("Postos e alocações"), onde os controles legados não são renderizados
  — os wrappers novos não a afetam.
- Inventário `node scripts/ux-pro-00-inventory.mjs --check` após tocar
  `src/app`: nenhuma mudança esperada (nenhum componente/estilo
  `components/ui/Ui*` novo; mesmas 100 rotas).
- `git diff --check` e guardas de arquivo (§cabeçalho).

## 7. Resíduos

- `OpsAdvancedClient.tsx` (órfão, 39 controles sem rótulo) — declarado acima.
- Os ~280 `style` inline e a reescrita completa das telas legadas continuam
  como pendência declarada da UX-07.

## 8. Limites

- A prova focal é estática e de compilação; não há captura de navegador,
  leitor de tela, homologação ou UAT nesta fatia.
- A legenda visível adicionada acima de cada campo altera a altura das linhas
  flexíveis das seis abas (sem mudar larguras, ações nem resultados); é a
  mudança visual autorizada que torna o rótulo persistente também para quem
  enxerga.
