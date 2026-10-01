---
titulo: Arquitetura Orientada a Eventos
tipo: ficha
area: arquitetura
hub: [[MOC - Arquitetura de Software]]
tags:
  - ficha
  - area/arquitetura
  - arquitetura
  - eventos
  - assincrono
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Arquitetura Orientada a Eventos

> Componentes reagem a fatos que já aconteceram, em vez de serem comandados em sequência — desacoplamento temporal em troca de ordem e rastreabilidade.

## Definição

- Estilo em que a comunicação se dá por eventos: um produtor publica um fato (`ContratoAssinado`) e consumidores interessados reagem, sem conhecer quem produziu.
- O desacoplamento é temporal também: o produtor não espera, não sabe quem consome e nem se alguém consome.

## Como funciona

- Um broker (fila ou log) transporta eventos; contratos de evento são versionados como APIs, porque são APIs — quebrar o schema quebra consumidores invisíveis.
- O sistema passa a ter fluxos que ninguém lê de cima para baixo: o rastro do comportamento está no log de eventos, não no call stack.

## Quando usar

- Quando há trabalho assíncrono natural (notificações, integrações, projeções de leitura) ou necessidade de auditar cada fato do domínio.
- Para integrar contextos distintos sem criar dependência síncrona em cascata.

## Armadilhas

- Evento usado como comando disfarçado (`ProcessarPagamentoRequested`) — aí o acoplamento volta, só que mais difícil de ver.
- Ordenação e duplicidade: consumidores precisam ser idempotentes, porque *at least once* é a entrega padrão.
- Sem schema registry ou versionamento, uma mudança de campo derruba consumidores silenciosamente.

## Conexões

- [[Padrão Outbox]] — é o que torna a publicação do evento confiável
- [[Observabilidade]] — fluxo assíncrono sem correlação de IDs é impossível de depurar
- [[Testes de Contrato]] — valida o schema do evento entre produtor e consumidores

## Veja também

- [[MOC - Arquitetura de Software]]
