# Evidências visuais — UX-11 / EXT-10 `/cliente/app/continuidade`

Todos os arquivos desta pasta foram produzidos por execução em
**2026-10-06**, com PostgreSQL 17 descartável, servidor HTTP canônico e
Chromium real. A massa é inteiramente fictícia: não há nome, conta, credencial
ou plano real. Não houve `page.route()`, resposta sintetizada, servidor fake ou
substituição de `window.fetch`.

## Vínculo/grant necessário e cenário de baseline

O executor cria uma identidade de cliente fictícia, credencial, conta ativa e
`client_access_grants` ativo para essa mesma conta. O login é o endpoint real
`/api/auth/login`; a sessão usada no Chromium é a cookie real emitida por ele.
A equipe fictícia recebe `continuity.read`, `continuity.write` e
`continuity.activate` em `auth_permissions`. O plano exibido nasce, é
aprovado, recebe simulado e é publicado pelas APIs canônicas de continuidade.

Esse vínculo é necessário para que o baseline seja uma leitura publicada, e
não um **NEGADO** legítimo. A recusa 403 por vínculo revogado continua provada
pelo gate focal em `gate-negado-403-vinculo-revogado.png`.

## Arquivos, executor, cenário e limite

| Arquivo | Executor | Cenário provado | Limite declarado |
|---|---|---|---|
| `desktop-continuidade-cliente.png` | `scripts/ux-evidence-capture.mjs --stage=ux-11-continuidade-cliente` | portal autenticado em 1440×900 com plano fictício publicado por APIs canônicas | baseline, não toda a jornada de detalhe |
| `mobile-continuidade-cliente.png` | idem | o mesmo portal em 390×844 no fuso `America/Sao_Paulo` | não cobre todos os dispositivos |
| `resumo.json` | idem | foco, overflow, problemas e recursos externos bloqueados | retrata apenas o runner da captura |
| `gate-plano-publicado-datas-utc.png` | `tests/ux-continuity-client-portal.integration.test.mjs` com `UX_CONTINUITY_CLIENT_EVIDENCE_DIR` | plano publicado com datas UTC sem voltar um dia no fuso brasileiro | não é prova de todos os fusos |
| `gate-vazio-honesto.png` | idem | leitura concluída para conta vinculada sem plano publicado | não é falha de rede nem recusa |
| `gate-negado-403-vinculo-revogado.png` | idem | 403 real após revogar vínculo, como NEGADO sem repetição | vínculo fictício e ambiente descartável |
| `gate-falha-auditoria-503.png` | idem | 503 real de auditoria, como falha recuperável | falha injetada apenas no banco descartável |
| `gate-falha-rede-status-zero.png` / `gate-recuperacao-rede.png` | idem | servidor desligado e recuperação pelo botão real | não mede disponibilidade de produção |
| `gate-404-detalhe-indisponivel-real.png` | idem | detalhe aberto após retirada pela UI da equipe: 404 `plan_not_found` real, lista preservada, sem retry ou vazamento | não afirma causa da indisponibilidade |
| `gate-mobile-390px.png` | idem | portal publicado em 390px sem transbordo horizontal | viewport único |

Os `gate-*.png` só são escritos quando
`UX_CONTINUITY_CLIENT_EVIDENCE_DIR=docs/ux-11-continuidade-cliente-evidencias`;
o gate não grava imagens por padrão.

## Reprodução

```bash
npm ci
UX_CONTINUITY_CLIENT_EVIDENCE_DIR=docs/ux-11-continuidade-cliente-evidencias \
  npm run test:ux-continuity-client:pg
npm run ux:evidence -- --stage=ux-11-continuidade-cliente
```

## Limites gerais

Estas provas não constituem homologação humana, aceite de Marcelo ou Andreia,
auditoria WCAG integral ou observação de produção. Recursos externos bloqueados
que podem aparecer no `resumo.json` são fontes sem saída de rede no ambiente de
captura; não são falhas da tela nem respostas do servidor canônico.
