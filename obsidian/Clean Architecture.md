---
titulo: Clean Architecture
tipo: ficha
area: codigo
hub: [[MOC - Design de Código]]
tags:
  - ficha
  - area/codigo
  - design
  - camadas
  - dependencias
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Clean Architecture

> Camadas concêntricas com a regra de dependência apontando para dentro: entidades no núcleo, detalhes na borda, e nada no centro sabe que a web existe.

## Definição

- Modelo proposto por Robert Martin em que o sistema é organizado em anéis — entidades, casos de uso, adaptadores de interface, frameworks — com dependências sempre apontando para o centro.
- A consequência prática: banco, web e UI são plugáveis; o que não é plugável é a regra de negócio.

## Como funciona

- Casos de uso orquestram entidades e conversam com o mundo por interfaces definidas no centro (portas); os adaptadores implementam essas interfaces na borda.
- Testar o caso de uso não exige subir servidor: as dependências externas são injetadas como dublês.

## Quando usar

- Sistemas de médio a grande porte em que você espera trocar detalhes de infraestrutura sem tocar em regra de negócio.
- Quando o time reclama que *mudar uma coisa quebra três* — sinal de dependência apontando para a direção errada.

## Armadilhas

- Camadas como religião: projeto pequeno com sete pastas e interfaces para tudo rende burocracia, não manutenibilidade.
- Caso de uso que é só repasse para o repositório: se não há orquestração nem regra, a camada é ruído.

## Conexões

- [[Inversão de Dependência]] — o princípio que faz as setas apontarem para dentro
- [[SOLID]] —  conjunto de princípios que a clean architecture aplica em escala
- [[Test Doubles]] — a fronteira de interface é onde o dublê entra naturalmente

## Veja também

- [[MOC - Design de Código]]
- [[Domain-Driven Design]]
