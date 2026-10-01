---
titulo: Consistência Eventual
tipo: ficha
area: dados
hub: [[MOC - Dados e Persistência]]
tags:
  - ficha
  - area/dados
  - dados
  - distribuido
  - tradeoff
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Consistência Eventual

> Aceitar que o sistema fica divergente por alguns instantes em troca de disponibilidade — desde que convirja, e você saiba quanto tempo leva.

## Definição

- Garantia de que, na ausência de novas escritas, todas as réplicas/serviços convergem para o mesmo estado — sem prometer quando.
- Não é desculpa para dado errado: é um contrato sobre a janela de divergência que o negócio aceita.

## Como funciona

- Escrita é confirmada localmente e propagada de forma assíncrona; leituras podem ver estados defasados por milissegundos ou minutos.
- A engenharia está em medir e limitar essa janela: filas com retry, idempotência no consumidor e monitoração do lag.

## Quando usar

- Entre serviços, réplicas de leitura e projeções derivadas — onde transação distribuída custaria disponibilidade.
- Sempre que o negócio aceitar *alguns segundos de atraso* como preço de não derrubar tudo junto.

## Armadilhas

- Vender eventual como forte: se o usuário escreve, recarrega e não vê, o bug é seu, não dele.
- Consumidor não idempotente: entrega duplicada duplica efeito, e o problema só aparece na reconciliação do mês.

## Conexões

- [[Padrão Outbox]] — é o mecanismo que faz a propagação ser confiável
- [[Transações e Consistência]] — o outro lado da moeda: eventualidade começa onde a transação termina
- [[Observabilidade]] — lag de fila e taxa de retry são os sinais de saúde da convergência

## Veja também

- [[MOC - Dados e Persistência]]
