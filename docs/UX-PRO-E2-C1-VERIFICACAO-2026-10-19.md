# UX-PRO-E2-C1 — verificação independente da implementação (19/10/2026)

**Subfatia:** E2-C1 — rótulos persistentes nos 108 controles do legado operacional (`OpsAdvanced2Client.tsx` e `OpsAdvanced3Client.tsx`).

**Branch da sessão:** `arena/064f7f53-gruposegsystemseguranca` · **Base:** `main` = `f38ef3d5a99509c0238792e51f58db172000a933` (merge da PR #272, "UX-PRO-E2-C1: rótulos persistentes nos 108 controles do legado operacional"). `git log`/`git status` conferidos nesta sessão com árvore limpa antes de qualquer alteração.

**Este documento não declara aceite humano, UAT nem conformidade WCAG. Homologação e produção permanecem NO-GO.**

---

## 1. O que já estava feito (mergeado na PR #272)

| Artefato | Estado encontrado |
|---|---|
| `src/app/admin/ti/OpsAdvanced2Client.tsx` | 47 controles, cada um com `id` + `<span>` colunar + `<label htmlFor>` visível; comentário de escopo no topo |
| `src/app/admin/ti/OpsAdvanced3Client.tsx` | 61 controles no mesmo padrão |
| `tests/ux-pro-e2-c1-field-labels.test.mjs` | 2 testes focais, já incluídos em `npm run test:unit` |
| `docs/UX-PRO-E2-C1-ESCOPO-ANTES-2026-10-19.md` | escopo "antes" com o defeito reproduzido e os 19 formulários |
| `docs/UX-PRO-E2-C1-RELATORIO-2026-10-19.md` | relatório RED → GREEN, gates e limites |

Ou seja: a implementação não estava pendente — ela existe em `main` desde a PR #272. Esta sessão **verifica** o que foi entregue e **reforça a guarda** que impede regressão.

## 2. Verificação mecânica do estado atual

Recorte independente do código desta sessão (não é a saída do teste; é uma varredura própria):

| Arquivo | Controles | `input` | `select` | `textarea` | `<label htmlFor>` | Ids únicos | Órfãos | Controles sem `placeholder` (antes sem nome algum) |
|---|---|---|---|---|---|---|---|---|
| `OpsAdvanced2Client.tsx` | 47 | 40 | 6 | 1 | 47 | 47 | 0 | 11 |
| `OpsAdvanced3Client.tsx` | 61 | 47 | 14 | 0 | 61 | 61 | 0 | 23 |
| **Total** | **108** | **87** | **20** | **1** | **108** | **108** | **0** | **34** |

Conferências adicionais desta sessão:

- prefixos `ops2-` (47 ids) e `ops3-` (61 ids) distintos entre si: nenhum id colide quando as seis abas de `/admin/operacao` montam os dois componentes no mesmo documento;
- todo `htmlFor` resolve para um controle do próprio arquivo (0 órfãos) e todo controle tem exatamente um rótulo;
- as 74 dicas de `placeholder` (36 em A2, 38 em A3) continuam presentes — 34 controles nunca tiveram dica e agora têm nome persistente;
- cada controle segue controlado (`value` + `onChange`), com ordem e atributos originais preservados (o `id` é o único atributo acrescentado);
- componentes consumidos por `src/app/admin/operacao/OperacaoWorkspace.tsx:41-42`, o que mantém a correção alcançável em `/admin/operacao` e na composição histórica de `/admin/ti`.

## 3. Reforço aplicado nesta sessão (única alteração de código)

`tests/ux-pro-e2-c1-field-labels.test.mjs` ganhou duas asserções no teste 2, sem afrouxar nenhuma existente:

1. **Todo controle é efetivamente verificado:** a varredura é por linha (um controle por linha, padrão do legado). A nova contagem global de `<input|select|textarea` iguala-se à lista de controles verificados — se dois controles forem escritos na mesma linha, o segundo escaparia da checagem de rótulo e a asserção falha. Prova sintética executada nesta sessão (`tagsTotais=2`, `linhasComTag=1` → guarda dispara).
2. **Um rótulo por controle:** a contagem bruta de `<label htmlFor=` iguala-se à de controles, impedindo rótulo duplicado para o mesmo `id` (que o `Map` do teste colapsaria e mascararia ambiguidade de nome acessível).

O teste segue verde: `# tests 2, # pass 2, # fail 0`. Nenhum arquivo de aplicação, servidor, banco, migração, RBAC, autenticação ou auditoria foi alterado nesta sessão.

## 4. Gates executados nesta sessão (saída real)

| Gate | Resultado |
|---|---|
| `node --test tests/ux-pro-e2-c1-field-labels.test.mjs` | `# tests 2 · # pass 2 · # fail 0` |
| regressões E2/E5/E6/E6-C1/inventário (`6` arquivos) | `# tests 13 · # pass 13 · # fail 0` |
| `npm test` (gate unitário completo) | `# tests 968 · # pass 968 · # fail 0` |
| `npm run typecheck` (`tsc --noEmit`) | sem diagnóstico |
| `node scripts/qa-wave0-static.mjs` | `RESUMO: 5/5 verificações estáticas OK; 0 imports ausentes; 0 migrações ausentes` |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK: … conferem com o código atual` (100 rotas, CSVs inalterados) |
| `npm run build` | `✓ Generating static pages (105/105)`, sem erro |
| `next-env.d.ts` / `tsconfig.json` | MD5 `87a8bf5c65d00003ad1eba1613711943` / `99f7042f814e77e67b785906e5d4df23`; o `next build` reescreve `next-env.d.ts` (como documentado no escopo da E2-C1) e o arquivo foi restaurado do HEAD — guardas conferidas **depois** |
| `git diff --check` | sem marcador de whitespace |

## 5. Contratos preservados (confirmados por leitura e por regressão)

URLs, métodos HTTP, payloads, estados de domínio (`pendente_verificacao`, `verificado`, `visitado`, `em_revisao`, `aprovado`, `em_analise`, `publicado`, `reconhecido`, `em_tratamento`, `resolvido`…), mensagens de sucesso, recargas (`loadAll` e correlatas), as onze decisões do `UiActionDialog` da E2 (regressão verde), o motivo canônico da publicação, a nota canônica de encerramento do evento sintético e os avisos de decisão humana/privacidade/natureza sintética: intocados. Nenhuma alteração de servidor, banco, migração, RBAC, autenticação ou auditoria.

## 6. Limites

- A prova é estática e de compilação: **não** inclui captura de navegador, teste com leitor de tela, validação manual, aceite humano ou conformidade WCAG.
- As dicas de `placeholder` permanecem visíveis, porém sem `aria-describedby` programático — recorte aditivo deliberado; o **nome** do campo não depende mais delas.
- A geometria legada dos controles (larguras fixas, alvos abaixo de 44 px) foi preservada por decisão de escopo.
- `OpsAdvancedClient.tsx` (órfão, 29 `placeholder`), `AdmAdvancedClient.tsx` e os demais `placeholder` do repositório seguem fora desta fatia.
- Não declara homologação, revisão humana ou prontidão de produção.

## 7. Reprodução

```text
npm run typecheck
node scripts/qa-wave0-static.mjs
node scripts/ux-pro-00-inventory.mjs --check
node --test tests/ux-pro-e2-c1-field-labels.test.mjs tests/ux-pro-e2-action-dialog.test.mjs tests/ux-pro-e5-table-scroll.test.mjs tests/ux-pro-e6-single-main.test.mjs tests/ux-pro-e6-c1-single-main.test.mjs tests/ux-pro-00-inventory.test.mjs
npm test
npm run build
git diff --check
md5sum next-env.d.ts tsconfig.json
```
