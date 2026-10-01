---
titulo: Bounded Context
tipo: ficha
area: dominio
hub: [[MOC - Domínio e Modelagem]]
tags:
  - ficha
  - area/dominio
  - ddd
  - fronteiras
  - modelagem
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Bounded Context

> A fronteira onde um modelo faz sentido por completo — a mesma palavra pode significar coisas diferentes do outro lado dela.

## Definição

- Bounded Context é um limite explícito dentro do qual um modelo de domínio é válido e consistente, com sua própria linguagem e suas próprias regras.
- Dois contextos podem ter entidades com o mesmo nome e significados distintos — e isso não é erro de modelagem, é o domínio sendo honesto.

## Como funciona

- Você desenha o limite e traduz na fronteira: `Cliente` em Vendas (com limite de crédito) é traduzido para `Cliente` em Faturamento (com endereço de cobrança).
- O contexto é a unidade natural de time, de módulo e — se precisar — de serviço.

## Quando usar

- Sempre que duas áreas do sistema discordarem sobre o significado de um termo: a discordância é o sintoma de que há dois contextos.
- Antes de desenhar microsserviços: serviço sem contexto é chute de fronteira.

## Armadilhas

- Modelo único compartilhado: uma entidade `Cliente` usada por seis áreas acumula campos contraditórios e ninguém mais entende as regras.
- Contexto do tamanho da classe: granularidade excessiva transforma tradução em trabalho de meio período.

## Conexões

- [[Context Map]] — contextos só existem em relação: o mapa diz como se conectam
- [[Linguagem Ubíqua]] — cada contexto tem sua própria língua interna
- [[Domain-Driven Design]] — o bounded context é a peça central do DDD estratégico
- [[Microsserviços]] — fronteira de serviço errada quase sempre é bounded context mal desenhado

## Veja também

- [[MOC - Domínio e Modelagem]]
