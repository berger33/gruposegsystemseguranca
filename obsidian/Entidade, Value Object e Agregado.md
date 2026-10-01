---
titulo: Entidade, Value Object e Agregado
tipo: ficha
area: dominio
hub: [[MOC - Domínio e Modelagem]]
tags:
  - ficha
  - area/dominio
  - ddd
  - modelagem
  - tatico
  - invariantes
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Entidade, Value Object e Agregado

> As três peças táticas do DDD: o que tem identidade, o que é definido pelo valor, e até onde vai a fronteira que protege uma regra.

## Definição

- Entidade tem identidade que sobrevive a mudanças de atributo; Value Object é definido só pelos seus valores e é imutável; Agregado é um grupo de objetos tratado como uma unidade, com uma raiz que garante as invariantes.
- A pergunta que separa os dois primeiros é simples: se todos os campos mudarem, ainda é o mesmo objeto? Sim → entidade. Não → value object.

## Como funciona

- Toda escrita passa pela raiz do agregado: ela valida o estado inteiro antes de confirmar, então o sistema nunca persiste um agregado inválido.
- Agregados são carregados e salvos por inteiro, e referenciam outros agregados por ID — não por ponteiro de objeto.

## Quando usar

- Quando existem regras que só fazem sentido sobre um conjunto: um pedido é válido se a soma dos itens bate com o total.
- Sempre que uma invariante de negócio puder ser violada por uma sequência de escritas independentes.

## Armadilhas

- Agregado gigante: puxar metade do sistema numa transação gera contenção e lock — se o agregado explode, a fronteira está errada.
- Modelo anêmico: entidades só com getters/setters e regras espalhadas em serviços é o oposto do que o padrão propõe.

## Conexões

- [[Transações e Consistência]] — o agregado define o raio de uma transação: uma por vez
- [[Composição sobre Herança]] — value objects compostos substituem hierarquias de tipos
- [[Modelagem Relacional]] — agregado nem sempre vira tabela: é uma fronteira lógica, não um mapeamento 1:1
- [[Consistência Eventual]] — invariantes que cruzam agregados viram processos, não transações

## Veja também

- [[MOC - Domínio e Modelagem]]
- [[Linguagem Ubíqua]]
