---
titulo: Linguagem Ubíqua
tipo: ficha
area: dominio
hub: [[MOC - Domínio e Modelagem]]
tags:
  - ficha
  - area/dominio
  - ddd
  - comunicacao
  - modelagem
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Linguagem Ubíqua

> Um vocabulário único falado por negócio e código — se a reunião diz uma palavra e o código outra, o modelo já está mentindo.

## Definição

- Linguagem Ubíqua é o vocabulário compartilhado entre desenvolvedores e especialistas de domínio, usado em conversas, documentos, testes e nomes de classes.
- Não é glossário de UI: é o compromisso de que o código fala a língua do negócio, inclusive nos termos desconfortáveis.

## Como funciona

- Termos são negociados e registrados; quando o negócio muda o nome, o código muda junto (renomear é barato, traduzir mentalmente todo dia não é).
- A linguagem aparece em três lugares ao mesmo tempo: na fala, no nome das classes/métodos e nos cenários de teste.

## Quando usar

- Em qualquer domínio minimamente rico — o custo de tradução entre fala e código é o maior custo invisível de um time.
- Especialmente ao integrar áreas diferentes, onde a mesma palavra costuma significar duas coisas.

## Armadilhas

- Falsa tradução: manter `Customer` no código e `Cliente` na conversa cria um dicionário mental que só os veteranos dominam.
- Termo genérico demais (`Gestor`, `Item`, `Dado`) é sinal de que o conceito ainda não foi entendido.

## Conexões

- [[Domain-Driven Design]] — a linguagem é o veículo pelo qual o modelo é construído
- [[Bounded Context]] — cada contexto delimita onde a linguagem vale
- [[Entidade, Value Object e Agregado]] — nomes de classes são onde a linguagem vira código de verdade
- [[Acoplamento e Coesão]] — vocabulário compartilhado demais entre módulos é acoplamento disfarçado

## Veja também

- [[MOC - Domínio e Modelagem]]
