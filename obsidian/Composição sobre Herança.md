---
titulo: Composição sobre Herança
tipo: ficha
area: codigo
hub: [[MOC - Design de Código]]
tags:
  - ficha
  - area/codigo
  - design
  - reuso
  - polimorfismo
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Composição sobre Herança

> Montar comportamento encaixando pedaços em vez de estender classes — a hierarquia é a forma mais rígida de reuso que existe.

## Definição

- Preferir que um objeto contenha outros objetos (ou receba funções/estratégias) a herdar comportamento de uma superclasse.
- Herança resolve *é um*; composição resolve *tem um comportamento de* — e comportamento muda mais que identidade.

## Como funciona

- Você extrai a parte que varia numa estratégia/interface e injeta a implementação: `CalculadoraDeFrete` recebe `PoliticaDeFrete`.
- O polimorfismo continua existindo, mas em tempo de composição em vez de tempo de definição da classe.

## Quando usar

- Quando dois objetos compartilham comportamento mas não uma identidade conceitual.
- Sempre que a hierarquia passar de dois níveis ou precisar de exceções — sinal clássico de herança errada.

## Armadilhas

- Hierarquia profunda com método sobrescrito que chama `super` e depois faz algo diferente: ninguém prevê o comportamento resultante.
- Composição extrema com delegantes de um método para todo lado pode ser mais difícil de ler que herança simples e honesta.

## Conexões

- [[SOLID]] — L (substituição de Liskov) é o que a herança costuma violar
- [[Acoplamento e Coesão]] — herança acopla subclasse e superclasse de forma permanente
- [[Entidade, Value Object e Agregado]] — value objects são compostos, não herdados
- [[Test Doubles]] — composição é o que permite trocar a dependência por um dublê

## Veja também

- [[MOC - Design de Código]]
