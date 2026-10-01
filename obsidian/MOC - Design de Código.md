---
titulo: MOC - Design de Código
tipo: moc
area: codigo
hub: [[MOC - Engenharia de Software]]
tags:
  - moc
  - area/codigo
status: ativo
atualizado: 2026-10-01
---

# MOC - Design de Código

> Eixo da escala menor: como o código é organizado para que a próxima mudança seja barata. Arquitetura protege o sistema; design de código protege o dia a dia.

## Notas deste eixo

- [[Clean Architecture]] — Camadas concêntricas com a regra de dependência apontando para dentro: entidades no núcleo, detalhes na borda, e nada no centro sabe que a web existe.
- [[SOLID]] — Cinco princípios para manter módulos com responsabilidade única, abertos a extensão e dependentes de abstrações — um checklist de pressões, não um decálogo.
- [[Inversão de Dependência]] — Módulo de alto nível não deve depender do de baixo nível: ambos dependem de uma abstração que o alto nível define.
- [[Acoplamento e Coesão]] — As duas medidas que explicam quase todo problema de manutenção: o quanto as partes se conhecem e o quanto o que está junto pertence junto.
- [[Composição sobre Herança]] — Montar comportamento encaixando pedaços em vez de estender classes — a hierarquia é a forma mais rígida de reuso que existe.

## Travessias para outros eixos

- [[MOC - Arquitetura de Software]]
- [[MOC - Dados e Persistência]]
- [[MOC - Domínio e Modelagem]]
- [[MOC - Entrega e Operação]]
- [[MOC - Testes e Qualidade]]

## Voltar

- [[MOC - Engenharia de Software]]
