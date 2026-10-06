# Evidências visuais — UX-11 / EXT-10 `/cliente/app/continuidade`

Todos os arquivos desta pasta foram produzidos por execução em **2026-10-06**,
com PostgreSQL 17 descartável, servidor HTTP canônico e Chromium real. A massa
é inteiramente fictícia: não há nome, conta, credencial ou plano real.

## Arquivos e origem

| Arquivo | Executor | Registro |
|---|---|---|
| `desktop-continuidade-cliente.png` | `scripts/ux-evidence-capture.mjs --stage=ux-11-continuidade-cliente` | portal autenticado em 1440×900, com plano publicado por HTTP canônico |
| `mobile-continuidade-cliente.png` | idem | o mesmo portal em 390×844, no fuso `America/Sao_Paulo` |
| `resumo.json` | idem | primeiro foco, ausência de rolagem horizontal, problemas e recursos externos bloqueados |
| `gate-plano-publicado-datas-utc.png` | `tests/ux-continuity-client-portal.integration.test.mjs` | plano publicado com datas em UTC, sem deslocar um dia no fuso brasileiro |
| `gate-vazio-honesto.png` | idem | leitura concluída com conta vinculada sem plano publicado |
| `gate-negado-403-vinculo-revogado.png` | idem | 403 real após revogar o vínculo de cliente, como NEGADO e sem nova tentativa |
| `gate-falha-auditoria-503.png` | idem | 503 real produzido por falha de auditoria, como falha recuperável |
| `gate-falha-rede-status-zero.png` | idem | servidor derrubado com a página aberta: rede indisponível (`status: 0`), nunca lista vazia |
| `gate-recuperacao-rede.png` | idem | recuperação pelo botão de nova tentativa depois de o servidor voltar |
| `gate-mobile-390px.png` | idem | portal publicado em 390px sem transbordo horizontal |

Os `gate-*.png` são escritos apenas quando
`UX_CONTINUITY_CLIENT_EVIDENCE_DIR` aponta para esta pasta; o gate não grava
imagens por padrão.

## Reprodução

```bash
npm ci
npm run ux:evidence -- --stage=ux-11-continuidade-cliente
UX_CONTINUITY_CLIENT_EVIDENCE_DIR=docs/ux-11-continuidade-cliente-evidencias \
  npm run test:ux-continuity-client:pg
```

## Limites declarados

Essas provas não constituem homologação humana, aceite de Marcelo ou de
Andreia, auditoria WCAG integral nem observação de produção. As duas
requisições externas bloqueadas que podem aparecer em `resumo.json` são fontes
de tipografia sem saída de rede no ambiente de captura; não são falhas da tela.
