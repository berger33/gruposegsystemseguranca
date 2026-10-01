---
titulo: Inversão de Dependência
tipo: ficha
area: codigo
hub: [[MOC - Design de Código]]
tags:
  - ficha
  - area/codigo
  - design
  - dependencias
  - abstracao
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Inversão de Dependência

> Módulo de alto nível não deve depender do de baixo nível: ambos dependem de uma abstração que o alto nível define.

## Definição

- Princípio que inverte a direção natural das dependências: em vez de Regra → Banco, temos Regra → Interface, e Banco → Interface.
- A abstração pertence a quem a usa, não a quem a implementa — é o que diferencia inversão de mera interface.

## Como funciona

- O domínio declara a interface do que precisa; a infraestrutura a implementa; a composição acontece na borda (fábrica ou container de DI).
- Isso transforma escolha de tecnologia em decisão adiável: trocar o adaptador não toca no centro.

## Quando usar

- Sempre que um detalhe de infraestrutura ameaçar contaminar regra de negócio.
- Quando você precisa testar uma regra sem rede, disco ou relógio de verdade.

## Armadilhas

- Interface com uma única implementação criada só para *fazer certo*: se nunca muda, o custo é puro overhead.
- Inversão falsa: interface definida no pacote da implementação, com o domínio importando de lá — a seta continua apontando para fora.

## Conexões

- [[SOLID]] — é a letra D, e a que mais influencia arquitetura
- [[Clean Architecture]] — a regra de dependência que mantém o domínio no centro
- [[Test Doubles]] — dublê só entra limpo onde existe uma abstração real
- [[Acoplamento e Coesão]] — inverter é reduzir acoplamento em direção a detalhes voláteis

## Veja também

- [[MOC - Design de Código]]
