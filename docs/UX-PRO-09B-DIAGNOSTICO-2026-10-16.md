# UX-PRO-09B — diagnóstico do site público (16/10/2026)

**Status:** diagnóstico concluído; sem alterações de comportamento público. Esta entrega não declara aceite humano, UAT ou conformidade WCAG. Homologação e produção permanecem **NO-GO**.

## Escopo e método

- Base: `main` após merge da PR #255, commit `d0ffffb6519c3a8ca825309b5970f3d614a833a3`.
- Inventário: 14 rotas classificadas como `site publico` em `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`. Os exemplos dinâmicos observados foram `/conteudos/diagnostico-sem-conteudo`, `/segmentos/condominio`, `/servicos/Segurança%20Desarmada` e a rota de aceite com identificador sintético inválido.
- 14 rotas × 4 larguras (320, 390, 768 e 1440 px) × 2 preferências de cor do navegador (`day`/`night`) = **112 capturas PNG**. Cada pasta de rota contém oito PNGs e um `resumo.json` com estado observado, foco do primeiro Tab, overflow, estrutura semântica básica, cores/contraste computável e limitações.
- Chromium headless Linux, servidor local e **PostgreSQL temporário descartável**, migrado e removido ao fim do gate. Navegação sem cookies ou sessão; nenhum formulário submetido. Sem credenciais ou dados reais. A rota de aceite usa apenas token claramente sintético e inválido.
- HTTP de navegação: **200 em 112/112 medições**. Recursos externos foram bloqueados pelo ambiente e anotados como limitação; não foram interpretados como defeito do site.

## Achados observacionais

| Área | Medição | Observação |
|---|---|---|
| Overflow | `/contato`, 320 px | Documento em 343 px para viewport de 320 px; o elemento apontado pelo probe foi `br` em x=343 px. Reproduzido nas duas preferências de cor. |
| Overflow | `/faq`, 320 px | Documento em 347 px para viewport de 320 px; o probe não conseguiu atribuir o excesso a um elemento específico. Reproduzido nas duas preferências de cor. |
| Contraste | 1.246 amostras com fundo sólido computável; 969 amostras em contexto indeterminado | **104 amostras** computáveis ficaram abaixo da referência 4,5:1, distribuídas por 16 capturas (nas rotas `/contato` e `/simulador`). São sinais para revisão visual, não conclusão de não conformidade: texto grande, estados, sobreposições e contexto real de pixels não foram avaliados segundo WCAG. Gradientes/imagens/camadas complexas são marcados como indeterminados e excluídos da razão. |
| Estados | 14 rotas, ambiente sem sessão e sem submissões | O resumo registra texto visível e marcadores heurísticos de loading/vazio/falha. É uma amostra dos estados iniciais; não força nem exaure erros de API, submissões ou todos os estados do produto. |
| Token de aceite | identificador sintético inválido | A navegação da rota respondeu 200; apareceram respostas 404 de recursos durante a renderização. O caso é deliberadamente inválido e não representa o comportamento de um token real. |
| Teclado | primeiro Tab por captura | O elemento focado e estilo de contorno computado foram registrados. Isto não equivale a percurso completo, teste de leitor de tela ou validação de acessibilidade. |

Nenhum achado foi corrigido nesta etapa, por decisão de escopo: **somente diagnóstico**, sem mudança de comportamento público, RBAC, contratos de API, mensagens ou indexação.

## Evidências e reprodutibilidade

- PNGs e `resumo.json` por rota/largura/preferência: [`UX-PRO-09B-evidencias-2026-10-16/`](UX-PRO-09B-evidencias-2026-10-16/).
- Geração: `LD_LIBRARY_PATH=/tmp/al2023/lib npm run ux:evidence -- --stage=ux-pro-09b` (usa o wrapper existente `scripts/ux-evidence-postgres.mjs`; cluster destruído ao terminar).
- CSVs de inventário e matriz regenerados pelo gerador existente; `node scripts/ux-pro-00-inventory.mjs --check` confirma os arquivos versionados.
- Verificações: `node --check scripts/ux-evidence-capture.mjs`; `node --test tests/ux-pro-00-inventory.test.mjs` (**4/4**); `git diff --check` limpo.

## Limitações

A preferência `day`/`night` representa `prefers-color-scheme`, não alternância explícita do produto. Amostragem de contraste só é calculada quando o fundo sólido pode ser resolvido; fundos com gradiente, imagem ou composição complexa permanecem indeterminados. A rede externa indisponível pode alterar fontes e recursos. Não foram avaliados leitores de tela, zoom a 200%, navegadores/SO adicionais, teclado além do primeiro Tab, validação humana, UAT ou conformidade WCAG. Capturas não medem produção.
