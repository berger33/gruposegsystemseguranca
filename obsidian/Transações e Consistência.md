---
titulo: Transações e Consistência
tipo: ficha
area: dados
hub: [[MOC - Dados e Persistência]]
tags:
  - ficha
  - area/dados
  - dados
  - transacao
  - acid
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Transações e Consistência

> A transação é a menor unidade de verdade: tudo ou nada, e o nível de isolamento define o que você aceita enxergar no meio do caminho.

## Definição

- Transação agrupa operações em uma unidade atômica (ACID): ou tudo é confirmado ou nada é.
- Isolamento é o mais mal compreendido: read committed, repeatable read e serializable têm custos e anomalias diferentes.

## Como funciona

- O banco garante que escritas concorrentes não deixem o estado pela metade; o nível de isolamento escolhido define se você pode ver leituras fantasmas ou não.
- O raio da transação deve coincidir com uma invariante de negócio — em DDD, com um agregado.

## Quando usar

- Sempre que duas escritas precisarem ser verdadeiras juntas (débito e crédito, contrato e sua primeira parcela).
- Quando a pergunta *o que acontece se o processo cair no meio?* tiver resposta inaceitável.

## Armadilhas

- Transação longa aberta durante chamada de rede: lock retido por segundos vira fila de espera e timeout em cascata.
- Achar que transação resolve tudo: invariantes que cruzam serviços exigem outro mecanismo, e aí entra a consistência eventual.

## Conexões

- [[Consistência Eventual]] — quando a invariante não cabe numa transação, você negocia tempo em vez de ordem
- [[Padrão Outbox]] — mantém atomicidade entre escrita no banco e publicação de evento
- [[Entidade, Value Object e Agregado]] — o agregado é o raio natural de uma transação
- [[Microsserviços]] — transação distribuída é a armadilha clássica desse estilo

## Veja também

- [[MOC - Dados e Persistência]]
