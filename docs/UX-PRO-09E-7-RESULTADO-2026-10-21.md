# UX-PRO-09E-7 — probe opt-in de overflow por texto

**Base:** `main` `0637cd63e25b0a92ec1d05d4f69b76a7574138ce` (merge da #286).
**Escopo prévio:** [UX-PRO-09E-7 — escopo e riscos](UX-PRO-09E-7-ESCOPO-ANTES-2026-10-21.md), commit `2ce3535`.
**Etapa:** `ux-pro-09e-7`, com saída própria em [`UX-PRO-09E-7-evidencias-2026-10-21/`](UX-PRO-09E-7-evidencias-2026-10-21/).

## Alteração

Antes, `attributeTextOverflow` existia na etapa 09E, mas o `Range.getClientRects()` só era executado quando `documentElement.scrollWidth > clientWidth + 1`. Assim, as capturas sem rolagem global não registravam se o probe textual havia executado.

Agora, uma etapa independente habilita `probeTextOverflowWithoutDocumentOverflow`. Ela executa a inspeção de texto em 14 rotas públicas × 4 viewports × 2 preferências de cor (112 amostras), registra `textOverflowProbed: true` e sempre grava `textOverflowCandidates` como array, inclusive vazio. Só transforma candidato em mensagem de problema quando há overflow horizontal real do documento. As saídas históricas da 09B e 09E mantêm seus diretórios, opções e formato; a etapa 09E original continua condicionada ao overflow global.

Nenhuma tela, CSS, rota, API, autenticação, permissão, isolamento, auditoria, dado ou fluxo de produto foi alterado. A captura não enviou formulários e a rota de aceite usou apenas o caminho diagnóstico de token sintético inválido.

## Resultado medido

| Medição | Resultado |
|---|---:|
| Rotas públicas selecionadas | 14 |
| Viewports | 320×780, 390×844, 768×1024, 1440×900 |
| Preferências | `day` e `night` via `prefers-color-scheme` |
| Navegações HTTP 200 | 112/112 |
| Capturas com probe explicitamente executado | 112/112 |
| PNGs com SHA-256 e dimensões no manifesto | 112/112 |
| Overflow horizontal do documento | 0/112 |
| Candidatos de Range além da borda direita | 14 em 4 capturas da home (320/390 px, day/night) |

Os 14 candidatos são observações do algoritmo, não defeitos confirmados. Oito ocorrências são duas legendas (`Supervisão e ronda` e `Portaria e acesso`) repetidas nas quatro capturas da faixa `ticker__inner`, que permite rolagem horizontal em mobile. As seis restantes são o e-mail institucional (4 ocorrências) e o endereço do rodapé (2 ocorrências); o documento reportou largura igual à área útil nas 112 amostras. Esses nós exigem inspeção no contexto de seus ancestrais/rolagem antes de qualquer mudança de produto. Nenhum deles foi automaticamente tratado como bug nem alterado nesta fatia.

O `node scripts/ux-pro-00-inventory.mjs --check` inicialmente sinalizou os CSVs, porque as novas capturas precisavam constar na cobertura por rota. Após `node scripts/ux-pro-00-inventory.mjs`, o check passou. O diff gerado restringe-se às referências do stage `ux-pro-09e-7` nas linhas públicas afetadas; o total continua em 100 rotas. O gerador não foi modificado.

O caminho de aceite diagnóstico inválido registrou três erros de console para recursos 404 em duas capturas; não houve falha de navegação nem resposta 5xx. O capturador já documenta esse caminho como token sintético inválido. Um recurso externo foi bloqueado pela rede do ambiente e permanece separado dos problemas da aplicação.

## Evidência visual e limites

As 112 capturas foram produzidas com Chromium 156 do Playwright em Windows, PostgreSQL temporário e servidor local; o banco descartável foi removido ao final. Fiz inspeção estática de capturas em 320 px/claro e 1440 px/escuro. O site não possui modo noturno de produto: `day`/`night` é a preferência do navegador. As imagens exibem a barra de demonstração e o overlay de desenvolvimento Next.js. A rota `/proposta/aceite/diagnostico-token-invalido` é deliberadamente inválida.

O probe mede `Range` de nós de texto contra o limite direito do viewport; não modela recorte/rolagem de cada ancestral, intenção de carrossel, zoom, leitor de tela nem comportamento de outros browsers. Portanto os itens acima são candidatos para triagem. Não houve teste manual interativo, UAT, aceite humano, homologação ou declaração de conformidade WCAG.

Manifesto: [`integridade.json`](UX-PRO-09E-7-evidencias-2026-10-21/integridade.json). Para conferir ou regenerar as referências após nova captura:

```powershell
$env:UX_EVIDENCE_09E7_DIR = 'docs/UX-PRO-09E-7-evidencias-2026-10-21'
$env:UX_EVIDENCE_CHROMIUM_CHANNEL = 'chromium'
npm run ux:evidence -- --stage=ux-pro-09e-7
node scripts/ux-pro-09e-7-verify-evidence.mjs --write
```

## Verificações

| Gate | Resultado |
|---|---|
| Teste focal `npm run test:ux-pro-09e-7` | 4/4 passou; inclui configurações isoladas e manifesto SHA-256/dimensões. |
| Captura `ux-pro-09e-7` | `UX_EVIDENCE_EXIT: 0`; 112/112 navegações; cluster PostgreSQL descartável removido. |
| `npm run typecheck` | Passou (`tsc --noEmit`, exit 0). |
| `npm run build` | Passou; Next.js 16.3.8/Turbopack compilou e gerou 105 páginas. |
| `node scripts/qa-wave0-static.mjs` | 5/5 passou. |
| `node scripts/ux-pro-00-inventory.mjs --check` | Passou após regeneração dos dois CSVs a partir das capturas. Inventário: 100 rotas. |
| `git diff --check` | Passou no diff final staged. |
| `next-env.d.ts` / `tsconfig.json` | `next-env.d.ts` restaurado ao conteúdo original após a captura/build; SHA-256 `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`. `tsconfig.json` permaneceu SHA-256 `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`. |
| `npm test` | **980/983; 3 falhas** `EPERM` ao criar symlinks no Windows: `tests/qa-backup-coverage-inventory.test.mjs:65`, `tests/qa-cli-v2-local-provider.test.mjs:63` e `tests/qa-cli-v2-transfer.test.mjs:61`. Cada falha ocorreu antes da asserção porque `fs.symlink` retornou `EPERM`. Nenhum teste foi pulado, alterado ou declarado aprovado; a execução focal desses três confirmou a mesma limitação. |

Inspeção visual limitada a screenshots estáticas: home em 320 px/claro e 1440 px/escuro. A validação manual interativa continua não realizada. **Estado para publicação:** bloqueado pelo gate local `npm test`; não abrir PR nem iniciar outra fatia até resolver/validar legitimamente a criação de symlinks no Windows ou obter ambiente de execução compatível e completar os checks obrigatórios.
