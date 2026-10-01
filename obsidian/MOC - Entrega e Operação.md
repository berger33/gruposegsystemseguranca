---
titulo: MOC - Entrega e Operação
tipo: moc
area: entrega
hub: [[MOC - Engenharia de Software]]
tags:
  - moc
  - area/entrega
status: ativo
atualizado: 2026-10-01
---

# MOC - Entrega e Operação

> Eixo do caminho até produção: como a mudança viaja do commit até o usuário, com rapidez e a capacidade de voltar atrás.

## Notas deste eixo

- [[Integração Contínua]] — Integrar todo dia, verificar automático em minutos: o objetivo da CI é encurtar o tempo entre errar e descobrir.
- [[Entrega Contínua e Deploy]] — Manter o software sempre liberável — e, se for deploy contínuo, liberado. A métrica que importa é o tempo para voltar atrás.
- [[Trunk-Based Development]] — Um tronco só, branches curtíssimas: o antídoto para o merge que vira evento traumático no fim do sprint.
- [[Feature Flags]] — Separar deploy de liberação: o código vai para produção desligado, e você decide quando (e para quem) acender.
- [[Observabilidade]] — Conseguir responder perguntas que você não previu: logs, métricas e traços correlacionados são o que torna um sistema distribuído legível.
- [[Versionamento Semântico]] — MAJOR.MINOR.PATCH comunica risco: quebrou, acrescentou ou corrigiu — uma promessa sobre o que esperar de uma atualização.

## Travessias para outros eixos

- [[MOC - Arquitetura de Software]]
- [[MOC - Design de Código]]
- [[MOC - Dados e Persistência]]
- [[MOC - Domínio e Modelagem]]
- [[MOC - Testes e Qualidade]]

## Voltar

- [[MOC - Engenharia de Software]]
