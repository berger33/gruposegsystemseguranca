# UX-PRO-09E PU4 — medição textual ampliada

**Base:** `main` `fb174f93996944c0b11e64553b4dc81c64a90856`  
**Escopo registrado antes do código:** [escopo PU4](UX-PRO-09E-PU4-ESCOPO-ANTES-2026-10-21.md), commit `5546d6d`.  
**Resultado:** ampliação aditiva do probe e captura das 14 rotas públicas do estágio 09E. Nenhum componente, cor, rota, contrato, dado ou fluxo do produto foi alterado.

## Antes e depois

| Antes na `main` | Depois nesta fatia |
|---|---|
| O probe 09E mediu `h1,h2,h3,p,a,button,label,li`, agregando texto por elemento. Tags e seletores não listados — por exemplo `dt`, texto em `span`, `footer`, `.field span`, `.hint` e `.error` — não tinham cobertura própria. A saída não permitia distinguir no novo relatório “sem amostra” de “amostra aprovada”. | Um probe opt-in do estágio 09E percorre nós de texto renderizados, registra tag/seletor (incluindo contexto do pai), texto limitado, primeiro plano, fundo resolvido, razão ou `null`, e enumera amostras indeterminadas e nós visíveis sem retângulo mensurável. O estágio mantém o antigo `audit.contrast` sem alteração; o resultado novo fica em `audit.textContrast`. |
| No Windows, capturas existentes podiam ser gravadas, mas o filtro de `resumo.json` comparava caminhos com barras diferentes e deixava `entries` vazio. | O filtro associa caminho absoluto normalizado. Capturas e resumos gerados agora correspondem. O metadado registra o navegador/plataforma executados. |

## Medição obtida

Captura real em Google Chrome local, com PostgreSQL descartável, estados iniciais, 14 rotas × 4 larguras (`320`, `390`, `768`, `1440`) × 2 preferências (`day`, `night`): **112 capturas** e **3.768 nós de texto**.

- **2.500** amostras com razão calculável; **1.268** com fundo indeterminado (não aprovadas por inferência).
- **104** nós de texto visíveis não tiveram retângulo mensurável; contabilizados como não medidos.
- **136 ocorrências** abaixo de 4,5:1, agrupadas em **14 combinações** de texto/seletor/razão. São sinais para triagem, não classificação automática de defeitos.
- As ocorrências aparecem em `/`, `/contato` e `/simulador`; nenhum sinal abaixo do limite foi encontrado nas outras 11 rotas observadas. Isso descreve somente estes estados/capturas.
- Sinais conhecidos incluem o título “Assistente de dúvidas” (3,35:1), já classificado na evidência anterior como texto grande sem defeito demonstrado, e números do simulador em `span` (2,72:1), explicitamente mantidos fora das 104 amostras PU3. Os demais sinais também exigem revisão do tamanho, peso e função do texto antes de qualquer correção.
- Há `span` de rodapé e textos aninhados em resumos registrados pelo novo contexto de seletor. `dt`, `.field span`, `.hint` e `.error` não apareceram nos estados públicos efetivamente capturados; a ausência não representa aprovação dessas classes em outras telas ou estados. O teste focal inclui esses casos em fixture Chromium.

Resumo por rota, amostras completas e capturas PNG estão em [`ux-pro-09e-pu4-evidencias-2026-10-21/`](ux-pro-09e-pu4-evidencias-2026-10-21/resumo.json); hashes/dimensões das 112 imagens estão em [`integridade.json`](ux-pro-09e-pu4-evidencias-2026-10-21/integridade.json). O teste focal valida o conteúdo, dimensões e SHA-256 desses arquivos.

## Limitações e evidências

- A inspeção visual direta cobriu as capturas `320×780 day` e `1440×900 night` de `/simulador`; a automação capturou as outras larguras/temas. Isso não é inspeção manual de todos os estados nem aceite humano.
- `day/night` é `prefers-color-scheme`, não alternância de tema do produto. Não foi feito teste de leitor de tela, zoom 200%, teclado completo, outros navegadores, WCAG integral, UAT ou produção.
- A captura não submete formulários nem executa as etapas do simulador; registra apenas o estado inicial efetivamente montado.
- A rota sintética `/proposta/aceite/diagnostico-token-invalido` teve mensagens 404 no console; a captura não atribui a requisição específica, então ela permanece não diagnosticada. Nenhum token real foi usado.
- Um total abaixo de 4,5:1 não é por si só defeito confirmado: tamanho/peso, papel do texto, fundo pintado e critério aplicável pedem revisão. Fundos em gradiente/imagem permanecem indeterminados.

## Gates locais

| Gate | Resultado | Evidência/limite |
|---|---|---|
| `npm run test:ux-pro-09e-pu4` | **5/5** | Inclui Chromium real, os estados `not-measured`/indeterminado e hashes/dimensões das imagens. |
| `node --test tests/ux-pro-09e-public-site.test.mjs` | **8/8** | Regressão das fatias 09E anteriores preservada. |
| `node scripts/qa-wave0-static.mjs` | **5/5** | Nenhum bypass estático detectado. |
| `node scripts/ux-pro-00-inventory.mjs --check` | **passou** | Após regerar, somente as linhas de `/` e `/simulador` ganharam o stage de captura PU4. |
| `npm run typecheck` | **exit 0** | `next-env.d.ts` foi restaurado ao conteúdo da base; `tsconfig.json` não mudou. |
| `npm test` | **978/981; 3 falhas locais** | As três falhas são `EPERM` de symlink em `PLT-BAK-001` e `CLI-04`; testes não foram alterados nem pulados. A limitação é específica do Windows sem permissão de symlink. A CI Linux da branch ainda precisa confirmar o gate integral. |
| `npm run build` | **não passou localmente** | Turbopack recusou a junction de `node_modules` usada para executar a worktree (`Symlink ... invalid, points out of filesystem root`). O mesmo projeto compilou com `npm run build -- --webpack`, que gerou **105/105** páginas; esse resultado alternativo não substitui a validação do comando padrão na CI Linux. |
| `next-env.d.ts` / `tsconfig.json` | **preservados** | `next-env.d.ts` retornou ao conteúdo da base após os comandos Next; `tsconfig.json` permaneceu sem diff. |

Não foi aberto PR porque a suíte local e o comando padrão de build não passaram neste ambiente. O push da branch para obter o gate Ubuntu só deve ocorrer após esta revisão; até então, não há check remoto a apresentar. Nenhum aceite humano foi inferido.
