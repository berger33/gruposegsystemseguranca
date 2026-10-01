---
titulo: Trunk-Based Development
tipo: ficha
area: entrega
hub: [[MOC - Entrega e Operação]]
tags:
  - ficha
  - area/entrega
  - entrega
  - git
  - fluxo
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Trunk-Based Development

> Um tronco só, branches curtíssimas: o antídoto para o merge que vira evento traumático no fim do sprint.

## Definição

- Fluxo em que desenvolvedores integram ao tronco principal pelo menos uma vez por dia, com branches que duram horas, não semanas.
- Trabalho inacabado vai para o tronco protegido por Feature Flags em vez de esperar numa branch paralela.

## Como funciona

- Branch nasce, recebe poucos commits, passa no CI e é integrada; conflitos são pequenos porque a divergência é pequena.
- Releases saem por tag ou corte do tronco — não por merge de uma branch de release que ninguém testou junto.

## Quando usar

- Times que querem entrega contínua de verdade: branch longa é o maior inimigo do *sempre liberável*.
- Projetos com integração frequente entre pessoas — quanto maior o time, pior a branch longa.

## Armadilhas

- Branch longa disfarçada de trunk: abrir PR e esperar três dias de review é branch longa com nome bonito.
- Sem flags e sem CI rápido, o tronco fica invariavelmente quebrado e o time volta para as branches.

## Conexões

- [[Integração Contínua]] — integrar todo dia só é seguro com verificação automática
- [[Feature Flags]] — são o que permite integrar código que ainda não está pronto
- [[Entrega Contínua e Deploy]] — tronco verde é a condição para liberar a qualquer momento
- [[Versionamento Semântico]] — o tronco conta a história linear que gera o changelog

## Veja também

- [[MOC - Entrega e Operação]]
