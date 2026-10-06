# Evidências visuais — UX-11 / EXT-10 `/admin/continuidade`

Os PNGs desta pasta foram produzidos por execução em **2026-10-06**, contra
PostgreSQL 17 descartável, servidor HTTP canônico e Chromium real. A massa é
inteiramente fictícia: não há nome, conta, credencial ou plano real. O gate
não troca `window.fetch`, não usa `page.route()` e não sintetiza respostas.

## Vínculo e cenário declarados

A preparação SQL do gate limita-se a identidades, contas e vínculos fictícios.
O ator de equipe recebe os grants administrativos reais
`continuity.read`, `continuity.write` e `continuity.activate`. O cliente
fictício vinculado recebe um `client_access_grants` ativo para a conta A; outro
cliente fictício recebe vínculo somente para a conta B. Assim a captura do
portal publicado não abre legitimamente em **NEGADO**. A recusa de grant e a
recusa de vínculo continuam cenários negativos do gate focal, não baselines
das imagens de publicação.

## Arquivos, executor, cenário e limite

| Arquivo | Executor | Cenário provado | Limite declarado |
|---|---|---|---|
| `desktop-continuidade.png` | `scripts/ux-evidence-capture.mjs --stage=ux-11-continuidade` | baseline autenticado da equipe em 1440×900 | não percorre todas as ações do plano |
| `mobile-continuidade.png` | idem | baseline da equipe em 390×844 | não substitui auditoria WCAG integral |
| `resumo.json` | idem | foco inicial, overflow, problemas e recursos externos bloqueados | retrata apenas o runner da captura |
| `gate-transicao-efetivada.png` | `tests/ux-continuity-workspace.integration.test.mjs` com `UX_CONTINUITY_EVIDENCE_DIR` | criação e aprovação pelo botão real; confirmação também pelo servidor | não é homologação humana |
| `gate-simulado-documentado.png` | idem | simulado enviado pelo formulário real, datas UTC, responsável e efeito `Em teste` → `Testado` | não avalia procedimento operacional fora do sistema |
| `gate-plano-visivel-no-portal.png` | idem | plano publicado pela UI da equipe aparece para o cliente fictício vinculado | não representa um cliente real nem produção |
| `gate-retirada-vazio-honesto.png` | idem | retirada pela UI e atualização pelo botão real do portal, resultando em vazio honesto | não afirma erro ou perda de vínculo |
| `gate-negado-403.png` | idem | 403 `forbidden` real como estado NEGADO | é recusa de grant fictício |
| `gate-404-escopo.png` | idem | 404 real de escopo de conta, sem especular a causa da indisponibilidade | não é o 404 de detalhe do portal |
| `gate-datas-honestas.png` | idem | data documentada ao lado de ausência dita | não mede todas as localidades/fusos |
| `gate-idempotencia.png` | idem | repetição após falha real; chave confirmada pelo ledger canônico | não simula concorrência externa |
| `gate-falha-de-rede.png` / `gate-recuperacao.png` | idem | queda real e recuperação pelo controle real | não mede disponibilidade de produção |
| `gate-tablist.png` | idem | tablist e roving tabindex | não substitui teste assistivo completo |
| `gate-mobile-390px.png` | idem | lista em 390px sem transbordo horizontal | viewport único, não todos os dispositivos |

Os `gate-*.png` são escritos somente quando
`UX_CONTINUITY_EVIDENCE_DIR=docs/ux-11-continuidade-evidencias`; o gate não
grava imagens por padrão.

## Reprodução

```bash
npm ci
UX_CONTINUITY_EVIDENCE_DIR=docs/ux-11-continuidade-evidencias \
  npm run test:ux-continuity:pg
npm run ux:evidence -- --stage=ux-11-continuidade
```

## Limites gerais

As imagens não constituem homologação humana, aceite de Marcelo ou Andreia,
auditoria WCAG integral ou observação de produção. As requisições externas
bloqueadas que podem constar em `resumo.json` são fontes sem saída de rede no
ambiente de captura; não são respostas da tela nem do servidor canônico.
