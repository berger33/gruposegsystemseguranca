---
titulo: MOC - Arquitetura de Software
tipo: moc
area: arquitetura
hub: [[MOC - Engenharia de Software]]
tags:
  - moc
  - area/arquitetura
status: ativo
atualizado: 2026-10-01
---

# MOC - Arquitetura de Software

> Eixo das decisões de forma: até onde vai um deploy, onde ficam as fronteiras e como as partes conversam. É aqui que se escolhe o formato do sistema antes do código existir.

## Notas deste eixo

- [[Monólito Modular]] — Um único deploy, mas com fronteiras internas rígidas: cada módulo é tratado como se pudesse virar serviço amanhã.
- [[Microsserviços]] — Serviços independentes, cada um com seu deploy e seu banco — você troca simplicidade local por autonomia de times e escala seletiva.
- [[Arquitetura Hexagonal]] — O domínio no centro, o mundo lá fora atrás de adaptadores: banco, HTTP e filas são detalhes plugáveis, não a estrutura do sistema.
- [[Arquitetura em Camadas]] — Apresentação, aplicação, domínio e infraestrutura empilhadas: simples de explicar, perigosa de manter quando a pilha vira cebola furada.
- [[Arquitetura Orientada a Eventos]] — Componentes reagem a fatos que já aconteceram, em vez de serem comandados em sequência — desacoplamento temporal em troca de ordem e rastreabilidade.

## Travessias para outros eixos

- [[MOC - Design de Código]]
- [[MOC - Dados e Persistência]]
- [[MOC - Domínio e Modelagem]]
- [[MOC - Entrega e Operação]]
- [[MOC - Testes e Qualidade]]

## Voltar

- [[MOC - Engenharia de Software]]
