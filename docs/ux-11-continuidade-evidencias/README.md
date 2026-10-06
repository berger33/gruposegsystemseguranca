# Evidências visuais — UX-11 / EXT-10 `/admin/continuidade`

Tudo aqui foi gerado por execução, com PostgreSQL 17 descartável e Chromium
real, em 2026-10-06. Nenhuma imagem foi montada à mão. A massa é fictícia,
criada pelas rotas canônicas; não há credencial, nome real ou dado pessoal.

## Quem gerou o quê

| Arquivo | Executor | O que registra |
|---|---|---|
| `desktop-continuidade.png` | `scripts/ux-evidence-capture.mjs --stage=ux-11-continuidade` | a rota como ela abre em 1440×900, com grant provisionado |
| `mobile-continuidade.png` | idem | a mesma rota em 390×844 |
| `resumo.json` | idem | foco de teclado, ausência de rolagem horizontal, problemas e recursos externos bloqueados |
| `gate-negado-403.png` | `tests/ux-continuity-workspace.integration.test.mjs` | recusa real do servidor (403 `forbidden`) como estado NEGADO |
| `gate-404-escopo.png` | idem | 404 real de escopo de conta, sem afirmar remoção |
| `gate-datas-honestas.png` | idem | data documentada ao lado de ausência dita |
| `gate-idempotencia.png` | idem | repetição após falha real, sem duplicar plano |
| `gate-falha-de-rede.png` | idem | servidor derrubado: falha de leitura que não vira lista vazia |
| `gate-recuperacao.png` | idem | recuperação pelo próprio botão de nova tentativa |
| `gate-tablist.png` | idem | tablist com roving tabindex após navegação por teclado |
| `gate-mobile-390px.png` | idem | lista em 390px sem transbordo horizontal |

Os `gate-*.png` só são escritos quando `UX_CONTINUITY_EVIDENCE_DIR` aponta
para esta pasta; o gate focal não grava imagem por padrão.

## Como reproduzir

```bash
npm ci
npm run ux:evidence -- --stage=ux-11-continuidade
UX_CONTINUITY_EVIDENCE_DIR=docs/ux-11-continuidade-evidencias npm run test:ux-continuity:pg
```

## O que estas imagens NÃO provam

Não provam homologação humana, aceite de Marcelo ou de Andreia, conformidade
WCAG integral, nem comportamento em produção. O indicador "Compiling" que
aparece no canto inferior esquerdo é do servidor Next em modo desenvolvimento,
usado pelo gate; não faz parte da tela. As duas requisições externas
bloqueadas registradas em `resumo.json` são a fonte do Google, sem saída de
rede neste ambiente — limitação do ambiente, não defeito da página.
