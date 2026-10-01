---
titulo: Domain-Driven Design
tipo: ficha
area: dominio
hub: [[MOC - Domínio e Modelagem]]
tags:
  - ficha
  - area/dominio
  - ddd
  - dominio
  - modelagem
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Domain-Driven Design

> Colocar o domínio — não o banco, nem o framework — no centro do desenho, com um modelo que o time todo consegue falar.

## Definição

- DDD é um conjunto de práticas para modelar software a partir do domínio do negócio, alinhando código, linguagem e limites organizacionais.
- Divide-se em tático (entidades, agregados, repositórios) e estratégico (bounded contexts, context map) — o estratégico é o que decide arquitetura.

## Como funciona

- O time constrói um modelo na Linguagem Ubíqua, recorta Bounded Contexts e desenha um Context Map com as relações entre eles.
- O código então reflete esse modelo: agregados protegem invariantes, repositórios devolvem objetos de domínio, e regras vivem no lugar onde o especialista as reconheceria.

## Quando usar

- Domínios com regras intrincadas, onde o custo está no entendimento e não na tecnologia.
- Sistemas que precisam sobreviver anos: o modelo de domínio muda mais devagar que qualquer framework.

## Armadilhas

- DDD de biblioteca: adotar *Repository*, *Service*, *Factory* e *Specification* sem modelar nada — cerimônia com zero domínio.
- Começar pelo tático e ignorar o estratégico: agregados perfeitos dentro de contextos errados não salvam o sistema.

## Conexões

- [[Bounded Context]] — a unidade de modelagem: dentro dele um modelo é consistente
- [[Linguagem Ubíqua]] — a língua que faz o modelo sobreviver a trocas de pessoas
- [[Monólito Modular]] — bounded contexts viram módulos quando tudo roda num deploy só
- [[Clean Architecture]] — oferece a forma de código que protege o modelo no centro

## Veja também

- [[MOC - Domínio e Modelagem]]
