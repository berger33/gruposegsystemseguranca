---
titulo: SOLID
tipo: ficha
area: codigo
hub: [[MOC - Design de Código]]
tags:
  - ficha
  - area/codigo
  - design
  - principios
  - manutencao
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# SOLID

> Cinco princípios para manter módulos com responsabilidade única, abertos a extensão e dependentes de abstrações — um checklist de pressões, não um decálogo.

## Definição

- Sigla para Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation e Dependency Inversion.
- São heurísticas sobre onde o código vai doer quando mudar: cada letra aponta um tipo específico de rigidez.

## Como funciona

- S e I limitam o tamanho da superfície de mudança; O e L permitem estender sem editar o que já funciona; D inverte a direção da dependência.
- Na prática, você aplica sob pressão: quando um módulo muda por dois motivos diferentes, é hora de separar (S).

## Quando usar

- Como vocabulário comum de revisão de código — é muito mais produtivo dizer *isso viola S* do que discutir gosto.
- Sempre que uma mudança pequena obrigar a editar muitos arquivos: há um princípio sendo violado, descubra qual.

## Armadilhas

- Aplicar os cinco preventivamente em código trivial: abstração sem segunda implementação é dívida, não investimento.
- Confundir S com *uma função por classe*: responsabilidade é eixo de mudança, não tamanho de arquivo.

## Conexões

- [[Inversão de Dependência]] — a letra com efeito mais profundo sobre arquitetura
- [[Acoplamento e Coesão]] — S e I são coesão; D e O são acoplamento sob controle
- [[Composição sobre Herança]] — L é o princípio que a herança quebra com mais frequência
- [[Clean Architecture]] — aplica SOLID na escala do sistema inteiro

## Veja também

- [[MOC - Design de Código]]
