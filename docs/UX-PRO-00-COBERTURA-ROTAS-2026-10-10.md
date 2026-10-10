# UX-PRO-00 — Reconciliação e mapa de cobertura de rotas

**Fonte vigente do inventário de interface**

**Data do inventário:** 10/10/2026

**Base de código auditada:** `origin/main` em `c50a99beecb057c2a819d5556cf1405f3434458c`

**Artefato rota a rota:** [`UX-PRO-00-MATRIZ-COBERTURA-ROTAS-2026-10-10.csv`](UX-PRO-00-MATRIZ-COBERTURA-ROTAS-2026-10-10.csv)

Este registro é a fonte vigente para o mapa de páginas desta fatia. Ele inventaria código e aponta evidências já versionadas; não certifica as telas, não afirma execução de todas as suítes, não é aceite humano e não substitui validação por papel. O SHA acima é a base lida antes das alterações documentais desta PR. O `README.md` e o plano mestre apontam para esta fonte; os CSVs e relatórios de 05–08/10 permanecem históricos e inalterados.

## Resultado atual

A regra de contagem adotada é **uma entrada de página do Next App Router** (`src/app/**/page.tsx`) por linha. Cada entrada é convertida em um caminho/template de rota, removendo apenas o sufixo `/page.tsx`; segmentos dinâmicos como `[id]`, `[slug]`, `[key]` e `[token]` permanecem como templates, não são expandidos por valores. Não contamos handlers `route.*`, arquivos `layout.tsx`, APIs, componentes, nem variações de conteúdo em runtime.

| Área de alto nível | Entradas `page.tsx` |
|---|---:|
| Administração | 44 |
| Portal do cliente | 29 |
| Site público, prévias visuais e QA | 26 |
| Portal do funcionário | 1 |
| **Total** | **100** |

Não há grupos de rota `(…)` nem slots paralelos `@…` no `src/app` auditado. O resultado é **100 arquivos e 100 templates únicos**. `/admin/visual` também conta como entrada de página embora seja um redirecionamento para `/admin/aparencia`; não foi convertido em uma tela adicional.

O CSV é a matriz rota → área → papéis declarados → guarda/limite → layout → componentes → sinal de dados demonstrativos → tema → responsividade → teclado → estados → evidências por tipo → lacuna. A inspeção encontrou:

- **39/44** entradas administrativas com `AdminGate allowedRoles` explícito na página; valores distintos: `admin`, `comercial`, `financeiro`, `marcelo`, `operacao`, `rh`, `supervisor`, `ti`.
- As cinco entradas sem lista local não são equivalentes entre si: `/admin` usa `AdminGate` genérico dentro de `AdminHub`; `/admin/entrar` é a entrada de login; `/admin/convite` usa convite por token; `/admin/verificacao-manual` consulta uma ação de verificação que exige TI conforme o código; `/admin/visual` redireciona para a página protegida de aparência. As exceções e listas estão também fixadas por `tests/admin-page-gates.test.mjs`.
- Todas as 100 entradas usam `src/app/layout.tsx` (RootLayout). As **15** páginas sob `/cliente/app` também herdam `src/app/cliente/app/layout.tsx`, com `RealAccessShell`, `ClientSpaceProvider` e `ClientAppNavigation`.
- Componentes compartilhados encontrados no caminho visual incluem `AdminGate`/`AdminChrome`/`AdminThemeToggle`, `PublishedTheme`, `BrandLogo` e componentes UI como `UiField`, `UiState`, `UiTableScroll`, `UiCardLink`, `UiTaskWorkspace`, `UiPanel` e `UiBadge`. A adoção varia por rota; a matriz lista imports e encapsulamentos resolvidos estaticamente, não presume que todo componente esteja montado em todo estado.
- `src/app/layout.tsx` importa os tokens/temas e `admin-theme.css`; `AdminThemeToggle` persiste a preferência dia/noite no `localStorage`, e as regras staff dependem do escopo `data-admin-theme-scope`. O código compartilhado existe, mas a presença dos estilos **não comprova** que cada rota fique correta nos dois temas.
- O campo de dados demonstrativos registra termos encontrados no código ou referências a API/helpers. É apenas um sinal estático: não consulta banco, não comprova a origem dos registros e não declara que dados existentes sejam fictícios. Os arquivos sob `demo/rag/` são conteúdo genérico de demonstração; não foram carregados dados reais nesta auditoria.
- O campo de estados lista referências/marcadores encontrados no arquivo da rota e em imports locais resolvidos até dois níveis. Ele não é observação de runtime nem inventário completo de todas as transições condicionais; imports dinâmicos/lazy e estados produzidos só por dados em runtime não são expandidos.

## Reconciliação reproduzível: 98 versus 100

Os números descrevem **snapshots diferentes**, não uma divergência a resolver apagando linhas antigas:

| Registro preservado | Data/entrega | Contagem registrada | Interpretação nesta reconciliação |
|---|---|---:|---|
| [`UX-00-INVENTARIO-ROTAS.csv`](UX-00-INVENTARIO-ROTAS.csv) e [`UX-00-AUDITORIA-BASELINE-2026-10-05.md`](UX-00-AUDITORIA-BASELINE-2026-10-05.md) | UX-00, 05/10; PR #148 (`653c14ffc089055ca17f27390b3fa26563d90f6e`) | 98 | Inventário correto para aquele snapshot. |
| [`FECH-12-INVENTARIO-ROTAS-2026-10-07.csv`](FECH-12-INVENTARIO-ROTAS-2026-10-07.csv) e [`FECH-12-MATRIZ-COBERTURA-2026-10-07.csv`](FECH-12-MATRIZ-COBERTURA-2026-10-07.csv) | FECH-12, 07/10; incluído na PR #183 (`8f5ddc53dd2f49476bc190b2fe53bf943d00afc3`) | 98 | Inventário correto antes de entrar a PR #185. A matriz declara limites estáticos e não validação visual integral. |
| [`AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv`](AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv) e [relatório](AUDITORIA-INTERFACE-ROTAS-2026-10-08.md) | Auditoria de 08/10 | 100 | Conta 100 arquivos de entrada `page.*`; métricas de controles são ocorrências estáticas, não controles renderizados. |
| Matriz vigente desta fatia | código de `origin/main` em `c50a99beecb057c2a819d5556cf1405f3434458c` | 100 | Conta 100 `page.tsx`, com 100 templates únicos; conjunto de arquivos coincide com a auditoria de 08/10. |

A comparação por caminho encontra exatamente estes dois arquivos presentes no inventário de 100 e ausentes nos dois CSVs de 98:

- `src/app/admin/aparencia/page.tsx` → `/admin/aparencia`;
- `src/app/layout-preview/page.tsx` → `/layout-preview`.

A PR #185, **MERGED** (`a52351d6ab7cc0e27aca5ee01a52594ef7e351bc`), é o evento que reconcilia a diferença: o commit `0b2413e03c91272b3114fc00f7057eed209921b7` adicionou ambas as entradas. A PR também ajustou `/admin/visual`, que já existia e continua contado como redirect. A PR #186 foi integrada depois sem adicionar arquivo `page.*`. A lista de PRs abertas consultada antes de abrir esta fatia estava vazia; #183, #185 e #186 estavam integradas. O plano mestre cita `87aef9f…` como base quando foi escrito; o SHA de partida efetivamente confirmado nesta sessão é `c50a99be…`.

**Critério operacional:** 98 + 2 páginas adicionadas pela PR #185 = 100 entradas atuais. Nenhuma linha histórica foi apagada nem reescrita.

### Como reproduzir

Na raiz do repositório:

```bash
find src/app -type f -name 'page.tsx' | sort | wc -l
# 100

node scripts/ux00-inventory.mjs > /tmp/ux-pro-00-rotas.csv
# o gerador existente escreve um cabeçalho + 100 linhas de rota/papel/arquivo
wc -l /tmp/ux-pro-00-rotas.csv
# 101
```

Para reproduzir a reconciliação dos caminhos históricos sem alterar nenhum artefato datado:

```bash
python3 - <<'PY'
import csv, subprocess

def entries(path, column):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return {row[column] for row in csv.DictReader(f)}

current = {
    row['arquivo']
    for row in csv.DictReader(subprocess.run(
        ['node', 'scripts/ux00-inventory.mjs'], check=True, capture_output=True, text=True
    ).stdout.splitlines())
}
for label, path, column in [
    ('UX-00 05/10', 'docs/UX-00-INVENTARIO-ROTAS.csv', 'arquivo'),
    ('FECH-12 07/10', 'docs/FECH-12-INVENTARIO-ROTAS-2026-10-07.csv', 'arquivo'),
    ('auditoria 08/10', 'docs/AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv', 'entry'),
]:
    old = entries(path, column)
    print(label, len(old), 'histórico-only=', sorted(old-current), 'current-only=', sorted(current-old))
PY
```

Resultado esperado: `UX-00` e `FECH-12` têm 98, cada um com `histórico-only=[]` e `current-only=[src/app/admin/aparencia/page.tsx, src/app/layout-preview/page.tsx]`; a auditoria de 08/10 tem 100 e diferença vazia nos dois sentidos. O atual `scripts/audit-ui-inventory.mjs` grava diretamente o CSV datado de 08/10; **não foi executado**, para preservar o conteúdo histórico. A matriz atual usa o gerador somente como base de rotas e papéis, e foi enriquecida com leitura estática dos imports/layouts/código e referências documentais.

## Como interpretar a matriz e as evidências

As cinco categorias são mantidas separadas no CSV:

| Categoria | O que conta nesta matriz | O que não permite concluir |
|---|---|---|
| **Código** | Arquivo `page.tsx`, layouts ancestrais, imports e escopos/estados identificáveis estaticamente. | Não prova que o componente foi renderizado, que uma API conceda acesso ou que o estado funcione em runtime. `allowedRoles` do `AdminGate` é envelope da interface; autorização e grants continuam no servidor. |
| **Teste automatizado** | Caminho de um teste existente que se relaciona com a rota/área. A matriz possui 73 linhas com ao menos um artefato de teste mapeado; há testes estáticos, de contrato, API, PostgreSQL e browser com escopos diferentes. | A presença do arquivo não é resultado de execução; um teste de vocabulário/API não é teste visual. Só o log do check registra se executou, passou, falhou ou foi pulado. |
| **Captura visual** | PNG existente no repositório, com rota/contexto/viewport quando declarados no documento que a acompanha. A matriz referencia arquivos em 30 linhas. | Uma imagem não prova teclado, autorização ou estados não visíveis. Capturas de prévias/rotas temporárias, vazios ou cenários sintéticos não são validação do ambiente operacional nem equivalem a cobertura completa. |
| **Validação manual** | Apenas avaliações manuais de escopo explícito encontradas: revisão focal do CRM em 08/10 e comparação/teclado da galeria visual feita em rota temporária, conforme seus relatórios. | Não é um aceite de usuário nem validação manual de todas as rotas. A revisão do CRM não cobre todas as larguras/papéis/estados. |
| **Aceite humano** | Não há aceite individual por rota documentado nesta matriz; todas as linhas dizem isso explicitamente. | O README contém uma afirmação geral de aprovação das dez propostas visuais, mas ela não foi extrapolada como aceite de cada rota, jornada, papel, tema ou estado. Nenhum aceite foi criado nesta fatia. |

As marcações `tema_codigo`, `responsividade_codigo`, `teclado_codigo` e `estados_identificados_no_codigo` descrevem sinais no código ou escopo compartilhado. A lacuna de cada linha registra o que ainda não foi comprovado por rota. Em particular, **não** existe nesta entrega uma varredura manual/browser das 100 páginas em 320/390/768/1440 px, nos dois temas e por todos os papéis/estados; também não existe auditoria integral de leitor de tela, zoom, contraste ou WCAG.

## Verificações observadas nesta execução

Os comandos obrigatórios foram descobertos em `.github/workflows/ci.yml`; nenhum workflow de outra família tem path configurado para estes documentos. Os resultados locais registrados até aqui:

| Check/comando do workflow | Resultado verificável |
|---|---|
| `npm ci` | Exit 0; 81 pacotes adicionados, 0 vulnerabilidades na instalação. |
| `node scripts/qa-wave0-static.mjs` | Exit 0; 5/5 verificações estáticas. |
| `npm audit --audit-level=high` | Exit 0; 0 vulnerabilidades. |
| `npm run typecheck` | Exit 0. |
| `npm test` | Exit 0; 866 aprovados, 0 falhas, 0 pulados/cancelados. |
| `node --test tests/admin-navigation.test.mjs` | A primeira execução expôs baseline obsoleto (`26 !== 27`). O código atual e grupos têm 26 destinos; UX-02 documenta 26, e o link legado `/admin/visual` foi retirado do menu ao redirecionar para Aparência. Ajustada somente a asserção estática `27 → 26`, sem mudar catálogo/grupos/renderização; repetição: 2/2 aprovados. |
| `npm run build` | Exit 0; Next compilou e gerou 105 caminhos de saída, incluindo expansões SSG. Isso não altera a contagem de 100 arquivos `page.tsx` (entradas/template). |
| `npm run test:rag` | Exit 0; smoke HTTP de rota canônica, escopo privado e rascunho oculto aprovado. |
| `npm run test:tenant:pg` | Exit 0; 22/22; cluster PostgreSQL temporário limpo (`QA_PG_TEMP_CLEANED: true`). |
| `npm run test:demo-local:pg` | **Não aprovado localmente:** excedeu 1800 s após registrar `QA-HOM-009_RESTORED_HTTP_SCOPE`, sem emitir marcador final de sucesso/limpeza. O processo foi interrompido e os três diretórios temporários sintéticos identificados desta execução foram removidos. O resultado não é tratado como verde; a execução obrigatória do workflow no runner do GitHub precisa concluir normalmente para liberar merge. |
| Comparação da matriz e `git diff --cached --check` | Exit 0; 100 linhas únicas coincidem com o conjunto do gerador e todos os arquivos apontados existem; diff staged sem whitespace errors. |

O resultado remoto do PR (checks, estado de revisão e merge) deve ser conferido no próprio GitHub; a tentativa local interrompida nunca conta como aprovação. Checks em fila, cancelados, pulados ou sem runner continuam pendentes.

## Funcionalidade preservada e limites

Esta fatia alterou documentação e corrigiu uma asserção de baseline obsoleta em `tests/admin-navigation.test.mjs`: o catálogo e os grupos atuais têm 26 destinos (como já registra o relatório histórico de UX-02), mas o teste ainda esperava 27 desde a inclusão temporária do link legado `/admin/visual`, depois retirado da navegação quando a entrada passou a redirecionar para `/admin/aparencia`. O ajuste foi apenas `27 → 26`; os catálogos, grupos, papéis, links renderizados e funcionalidades não mudaram. Não foram alterados páginas, grants, autenticação, isolamento de dados, APIs, navegação, estados de domínio, auditoria, idempotência, dados, configuração nem operação local. Nenhuma credencial, segredo, URL temporária ou dado real foi consultado ou registrado. Não foi aplicado redesign.

A matriz é uma fotografia estática datada da base indicada. Em mudança futura de `page.tsx`, layouts, imports ou evidências, o inventário deve ser refeito sobre a `main` atual. O material histórico de 05–08/10 continua acessível como registro de seu escopo e de seus limites.
