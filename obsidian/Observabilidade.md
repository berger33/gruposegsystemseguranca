---
titulo: Observabilidade
tipo: ficha
area: entrega
hub: [[MOC - Entrega e Operação]]
tags:
  - ficha
  - area/entrega
  - operacao
  - metricas
  - logs
  - tracing
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Observabilidade

> Conseguir responder perguntas que você não previu: logs, métricas e traços correlacionados são o que torna um sistema distribuído legível.

## Definição

- Observabilidade é a capacidade de inferir o estado interno do sistema a partir dos sinais que ele emite — logs estruturados, métricas e tracing distribuído.
- Monitoramento diz *está ruim*; observabilidade permite perguntar *por que está ruim para este usuário específico*.

## Como funciona

- Um ID de correlação percorre todas as chamadas; métricas agregadas mostram taxa, erro e duração; traços mostram onde o tempo foi gasto.
- Instrumentação é código: sem spans nas fronteiras (fila, HTTP, banco), o traço tem buracos exatamente onde o problema mora.

## Quando usar

- A partir do momento em que há mais de um processo envolvido num request.
- Antes do primeiro incidente sério — instrumentar durante o incidente é a pior hora.

## Armadilhas

- Log sem correlação: dez mil linhas por minuto que não permitem seguir um pedido do começo ao fim.
- Métrica demais: dashboard com 80 gráficos é decoração; defina SLOs e alerte no que o usuário sente.

## Conexões

- [[Arquitetura Orientada a Eventos]] — fluxo assíncrono exige correlação explícita, não call stack
- [[Consistência Eventual]] — lag de fila e taxa de retry são sinais de saúde da convergência
- [[Padrão Outbox]] — tamanho da outbox é métrica de integração confiável
- [[Feature Flags]] — liberação gradual só é experimento se houver medição
- [[Cobertura de Código vs Confiança]] — produção é onde os bugs que a suíte não pegou aparecem

## Veja também

- [[MOC - Entrega e Operação]]
- [[ORM como Abstração com Vazamento]]
- [[Entrega Contínua e Deploy]]
