---
titulo: Feature Flags
tipo: ficha
area: entrega
hub: [[MOC - Entrega e Operação]]
tags:
  - ficha
  - area/entrega
  - entrega
  - flags
  - liberacao
  - experimentacao
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Feature Flags

> Separar deploy de liberação: o código vai para produção desligado, e você decide quando (e para quem) acender.

## Definição

- Feature flag é um condicional controlado por configuração que permite ativar comportamento sem novo deploy.
- Tipos principais: liberação (liga para todos), operacional (kill switch) e experimento (liga para uma amostra).

## Como funciona

- O código convive com os dois caminhos temporariamente; a configuração decide qual roda, geralmente por usuário, tenant ou porcentagem.
- Kill switch permite desligar uma funcionalidade problemática em segundos, sem esperar pipeline.

## Quando usar

- Para liberar gradualmente e medir impacto antes de expor a todos.
- Para integrar trabalho em andamento ao tronco sem quebrar produção.

## Armadilhas

- Flag eterna: código com seis flags cruzadas tem 64 estados e nenhum deles foi testado — toda flag precisa de data de expiração.
- Flag em regra de negócio crítica sem teste dos dois lados: o caminho desligado apodrece sem ninguém notar.

## Conexões

- [[Trunk-Based Development]] — sem flags, integrar cedo significa expor código inacabado
- [[Entrega Contínua e Deploy]] — transforma deploy em não-evento: liberação é decisão separada
- [[Observabilidade]] — ligar uma flag sem métrica é experimento às cegas
- [[Acoplamento e Coesão]] — flags acumuladas são dívida de complexidade, não configuração

## Veja também

- [[MOC - Entrega e Operação]]
