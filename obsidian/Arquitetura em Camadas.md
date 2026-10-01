---
titulo: Arquitetura em Camadas
tipo: ficha
area: arquitetura
hub: [[MOC - Arquitetura de Software]]
tags:
  - ficha
  - area/arquitetura
  - arquitetura
  - camadas
  - basico
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Arquitetura em Camadas

> Apresentação, aplicação, domínio e infraestrutura empilhadas: simples de explicar, perigosa de manter quando a pilha vira cebola furada.

## Definição

- Estilo clássico em que o sistema é organizado em camadas horizontais, cada uma só podendo chamar a camada imediatamente abaixo.
- A promessa é separar preocupações; o risco é o domínio virar um DTO anêmico espremido entre controller e repositório.

## Como funciona

- Controller recebe HTTP, serviço de aplicação orquestra, domínio decide, infraestrutura persiste. A regra é de cima para baixo.
- O fracasso típico é o *vazamento*: regras de negócio migram para o serviço de aplicação, e a camada de domínio passa a ser só um monte de getters e setters.

## Quando usar

- CRUDs, sistemas de baixa complexidade de regras e times pequenos — a curva de aprendizado é a menor possível.
- Como ponto de partida honesto, desde que você saiba quais sinais indicam a hora de evoluir.

## Armadilhas

- Camada de domínio anêmica: entidades sem comportamento e serviços com 800 linhas de ifs de negócio.
- Pular camadas por conveniência (controller consultando repositório direto) destrói o contrato implícito da pilha.

## Conexões

- [[Arquitetura Hexagonal]] — a evolução quando a pilha vertical começa a vazar regras
- [[Acoplamento e Coesão]] — vazamento de camada é, na prática, acoplamento indevido
- [[Entidade, Value Object e Agregado]] — é o que impede a camada de domínio de virar DTO anêmico

## Veja também

- [[MOC - Arquitetura de Software]]
- [[ORM como Abstração com Vazamento]]
