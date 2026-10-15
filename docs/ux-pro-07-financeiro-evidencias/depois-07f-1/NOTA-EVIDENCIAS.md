# Evidências da UX-PRO-07F-1 — o que está versionado e o que não está

Cada pasta guarda o **texto** que importa (`gate.txt` com o TAP completo e os
marcadores, `07f1-resumo.json`, notas de rejeição) e as **capturas próprias desta
fatia** (`07f1-*.png`).

As capturas herdadas que o gate também regera em cada execução
(`07e1-*.png`, `07e2-*.png`, `desktop-*.png`, `mobile-*.png`) **não** são
versionadas aqui de novo: elas já estão em `docs/ux-pro-07-financeiro-evidencias/`
desde as fatias 07E-1/07E-2, e repeti-las em cada execução só duplicaria bytes no
repositório sem acrescentar prova. Os arquivos continuam sendo gerados no disco
por quem roda o gate; o que está no Git é o texto e o que é específico da 07F-1.

- `antes-07f-1/` — baseline contra a implementação anterior: `gate.txt` (35/44,
  9 reprovações) e a primeira corrida rejeitada
  (`gate-rejeitado-1-ordem-de-fechamento.txt`, 34/10).
- `depois-07f-1/execucao-1/` e `depois-07f-1/execucao-2/` — as duas corridas
  finais independentes (44/44 cada), com `07f1-resumo.json` por execução.
- `depois-07f-1/rejeitada-fuso-do-servidor-nao-utc/` — corrida com o host em
  `Asia/Tokyo` (36/44) e a nota de diagnóstico do achado transversal.
- `depois-07f-1/bateria/` — bateria §6.8 passo a passo: um log por comando e
  `resumo.txt` com o exit code literal de cada passo.
