# UX-PRO-10B — relatório parcial e bloqueio de validação

> **Atualização (19/10/2026):** este relatório preserva abaixo o retrato de 18/10, quando `npm test` local ainda estava bloqueado por `EPERM`. A PR #265 confirmou a suíte no CI Linux, recebeu 43/43 checks concluídos com sucesso e foi mesclada em `3e9a4eec4fb4b14e70f02bb15e38fddeb07d3774`. O gate de expansão que falhou inicialmente foi reexecutado e passou. A revisão técnica ficou registrada na PR sem alegar aceite humano. A 10B está concluída; o histórico de bloqueio abaixo não descreve o estado atual. Veja o [fechamento 10C](UX-PRO-10C-CLOSEOUT.md).

**Data:** 18/10/2026
**Base:** `origin/main` em `d3f8e1711a37b8acbb0b147f5d30f5bbee9655b3` (merge da PR #264)
**Branch:** `arena/ux-pro-10b-browser-20261018`
**Status:** implementação e evidências locais preservadas; bloqueada antes da PR por falhas no `npm test`.

## Escopo executado

A UX-PRO-10B cobre a inspeção de navegador das dez prévias de layout e o fluxo de comparação em `/admin/aparencia`. A única correção de interface é o indicador `:focus-visible` para o campo de busca “Buscar módulo” na navegação lateral compartilhada. Nenhuma rota, API, autenticação, permissão, persistência de negócio ou publicação de layout foi alterada.

O documento de escopo e os resultados “antes” foram registrados antes da correção em [UX-PRO-10B-ESCOPO-ANTES-2026-10-18.md](UX-PRO-10B-ESCOPO-ANTES-2026-10-18.md). O teste focal reproduziu a ausência do seletor para `input`; após a correção, o teste passou.

## Antes e depois

| Ponto | Antes | Depois |
|---|---|---|
| Busca da navegação lateral | A regra de foco visível abrangia links, botões e `summary`, mas não `input`; o teste focal falhava com `a regra existente precisa incluir o campo Buscar módulo`. | O seletor inclui `input` e reutiliza os tokens de foco já existentes; teste focal: 1/1 passou. |
| Rotas de prévia | Não havia execução automatizada desta matriz no navegador nesta fatia. | 41 capturas/medições: 40 combinações de `/layout-preview?visual=01..10` em 320, 390, 768 e 1440 px, mais uma inspeção de teclado em `/layout-01`. |
| Comparação administrativa | As capturas anteriores não cobriam os quatro tamanhos nos dois temas. | 8 capturas em `/admin/aparencia`, usando sessão sintética TI, em 320, 390, 768 e 1440 px nos temas claro e escuro. O script exercitou o toggle de tema, comparou a galeria por teclado e restaurou a preferência de teste. Não publicou nem salvou layout. |

Os dados de captura estão em [resumo-layouts.json](ux-pro-10b-evidencias-2026-10-18/resumo-layouts.json) e [resumo.json](ux-pro-10b-evidencias-2026-10-18/resumo.json); as imagens PNG correspondentes estão no mesmo diretório. Resultado automatizado: 41/41 prévias com HTTP 200, zero overflow horizontal, zero erro de navegador; 8/8 capturas administrativas sem problemas reportados, sem falha no toggle ou na medição de teclado.

## Evidência e limites

- **Inspeção estática:** código e montagem das rotas foram revisados; somente o CSS de foco da navegação lateral recebeu correção. Inventário atualizado exclusivamente para registrar a etapa de captura em `/admin/aparencia`.
- **Validação automatizada:** teste focal, Playwright/Chromium com capturas nas larguras listadas, medição de foco/teclado e alternância de tema; typecheck, build e checks estáticos abaixo.
- **Validação manual:** não realizada. Não há aceite humano, UAT ou confirmação de usuários. As capturas foram feitas em runtime de desenvolvimento e exibem a marca de ferramenta do Next; não são evidência de produção.
- A sessão administrativa é sintética e de papel TI; o exercício limita-se a comparar layouts e alterar/restaurar a preferência visual local. Não testa publicação, escrita de layout nem comportamento com contas reais.
- A base temporária de evidência usa PostgreSQL descartável com locale UTF-8 no Windows para executar migrações; isso não constitui teste de compatibilidade de locale.
- A automação observou funcionamento do navegador e ausência dos erros medidos; não substitui testes humanos de legibilidade, contraste percebido ou qualidade visual em dispositivos reais.

## Checks

| Verificação | Resultado |
|---|---|
| `npm run test:ux-pro-10b-keyboard` | Passou, 1/1. |
| `npm run typecheck` | Passou. |
| `npm run build` | Passou; 105 páginas geradas. `next-env.d.ts` foi restaurado ao conteúdo versionado após a geração local. |
| `node scripts/qa-wave0-static.mjs` | Passou, 5/5. |
| `node scripts/ux-pro-00-inventory.mjs --check` | Passou após atualizar somente a linha de `/admin/aparencia` nos dois CSVs de cobertura. |
| `git diff --check` | Passou na checagem final. |
| `npm test` | **Falhou: 960/963 passaram; 3 falharam** (testes 543, 547 e 554) com `EPERM` ao criar symlinks em `C:\Users\berge\AppData\Local\Temp`. Os casos pertencem aos testes da CLI/backup e não foram alterados nesta fatia. Log: `C:\Users\berge\AppData\Local\Temp\ux-pro-10b-npm-test-final2.log`. |

## Decisão e retomada

A suíte geral é um check obrigatório e ficou vermelha. Portanto esta fatia não foi declarada concluída: nenhuma PR foi aberta, nenhum merge foi feito e a UX-PRO-10C não foi iniciada. O trabalho permanece na branch indicada acima para investigação do ambiente que bloqueia a criação de symlinks. Não relaxar ou alterar os testes/semântica de backup para contornar a falha; reproduzir em ambiente autorizado que permita symlinks (por exemplo, CI/Linux), executar novamente todos os checks, revisar o diff e só então abrir PR pequena. Merge somente com revisão concluída e todos os checks obrigatórios verdes.
