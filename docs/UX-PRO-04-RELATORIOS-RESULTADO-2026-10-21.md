# UX-PRO-04 — Relatórios periódicos: resultado

**Data:** 21/10/2026
**Base:** `main` `2481c829ef8b6191abe93527e7d6ee205e813b56`
**Rota:** `/admin/relatorios` (`ReportsWorkspace`)
**Escopo:** somente esta tela montada e a inicialização UTF-8 do gate PostgreSQL EXT-13. Painel, pendências, analytics, APIs, migrações e autorização não foram alterados.

## Antes

- A tela começava com uma lista vazia antes de concluir a primeira leitura, sem diferenciar carregamento, vazio confirmado e falha.
- Uma releitura não comunicava estado nem horário da última resposta válida e não preservava o contexto dos dados anteriores diante de erro transitório.
- O detalhe era apresentado como JSON bruto; tipo, estado e fontes não estavam organizados para leitura operacional.
- A interface enviava justificativas fixas ao registrar aprovação e envio, sem exigir texto de quem operava.
- Os estilos eram inline e não havia componente CSS local para responsividade e foco.
- O gate PostgreSQL EXT-13 herdava o locale do Windows e falhava em WIN1252 ao aplicar uma migração UTF-8; `PGCLIENTENCODING=UTF8` sozinho não corrigia a inicialização do cluster.

## Depois

- A lista distingue carregamento, vazio confirmado, falha inicial, sucesso, atualização, leitura desatualizada e acesso negado. Erros inesperados não viram lista vazia.
- Uma falha transitória mantém a última leitura válida com hora e repetição; respostas 401/403 descartam o dado protegido e preservam a negação fail-closed.
- Detalhe agrupa período, tipo, estado, contagem, fontes, destinatários, justificativas e eventos somente leitura. Campo ausente aparece como não informado/não contado; não é convertido em zero.
- Aprovação e registro interno de envio exigem nota escrita pela pessoa operadora. A tela continua declarando que não envia e-mail nem gera arquivo.
- CSS local usa tokens de tema, layout responsivo e foco visível. A rota mantém `AdminGate` com `ti|admin`, endpoints, métodos, payloads, cabeçalhos e `Idempotency-Key`; nenhum handler/API ou dado canônico foi modificado.
- O teste focal foi adicionado à suíte unitária. O gate EXT-13 agora inicializa o PostgreSQL descartável explicitamente em UTF-8, seguindo o padrão já usado por outro gate da família.

## Validação automatizada

| Verificação | Resultado |
|---|---:|
| `npm run test:ux-pro-04-reports` | 5/5 |
| `npm run test:ext13-reports:pg` | 17/17; zero falhas, skips ou TODOs |
| `npm run typecheck` | passou |
| `npm run build` | passou; 105 páginas estáticas geradas, incluindo `/admin/relatorios` |
| `node scripts/qa-wave0-static.mjs` | 5/5 |
| `node scripts/ux-pro-00-inventory.mjs --check` | passou; 100 rotas |
| `git diff --check` | passou |
| `npm test` | 993/993; zero falhas, skips ou TODOs |

Os dois CSVs de inventário foram regenerados; cada diff contém somente a linha de `/admin/relatorios`. `next-env.d.ts` e `tsconfig.json` foram restaurados e conferidos com SHA-256, iguais à base: `18B697C4794F97EDD5AED1537BF1D1882597F545881DFCBA7FC8C659075F11A2` e `2128C956B8C75820BC217C00557346BEFA1E687565D2D8A0BB970FAADB7A8D65`.

## Evidência visual automatizada e inspeção

O script Playwright `scripts/ux-pro-04-relatorios-browser-evidence.mjs` capturou a rota montada em Chromium nos viewports 320, 390, 768 e 1440 px, em tema claro e escuro. São 10 capturas, todas com rótulo visível de dados sintéticos; o resumo registra resposta HTTP 200, zero erros de navegador e nenhuma rolagem horizontal nas oito combinações de viewport/tema. A matriz regenerada classifica a rota com captura automatizada em tema claro/escuro; não converte esse dado em revisão manual ou aceite.

Também foram exercitados, com fixtures interceptadas, falha de releitura com dado anterior ainda visível, repetição da leitura e habilitação da aprovação somente após nota explícita. A navegação por Tab encontrou foco de 3 px. Os detalhes estão em [`resumo.json`](evidencias/ux-pro-04-relatorios-2026-10-21/resumo.json) e nas imagens da pasta [`evidencias/ux-pro-04-relatorios-2026-10-21`](evidencias/ux-pro-04-relatorios-2026-10-21/).

As capturas foram inspecionadas estaticamente quanto a hierarquia, quebra em telas estreitas, tema e foco. Não houve revisão manual interativa por uma pessoa usuária nem aceite humano.

## Limitações

- Sessão e respostas da UI nas capturas são mocks; os relatórios, destinatários e eventos exibidos são sintéticos. As imagens não comprovam dados de produção.
- O gate PostgreSQL exercitou servidor HTTP real, permissões, isolamento, idempotência, auditoria e transações; isso não equivale a homologação de produção.
- Não houve envio externo, geração de arquivo, auditoria WCAG integral, validação manual completa, revisão de Marcelo ou aceite humano.
- Relógios de leitura exibem o instante de recepção no navegador em fuso de São Paulo; não representam um carimbo canônico gravado pelo servidor.
