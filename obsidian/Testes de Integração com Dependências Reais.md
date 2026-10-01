---
titulo: Testes de Integração com Dependências Reais
tipo: ficha
area: testes
hub: [[MOC - Testes e Qualidade]]
tags:
  - ficha
  - area/testes
  - testes
  - integracao
  - infraestrutura
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Testes de Integração com Dependências Reais

> Testar contra Postgres de verdade, não contra um banco em memória que só imita Postgres — o dialeto importa.

## Definição

- Teste de integração exercita o código contra a dependência real (banco, broker, HTTP) em ambiente descartável — containers são a forma usual.
- Serve para validar aquilo que o dublê não consegue mentir bem: SQL, transação, serialização, constraints.

## Como funciona

- Cada execução sobe a dependência limpa, aplica migrações, roda o teste e destrói tudo; o isolamento vem do ambiente, não do mock.
- Como sobem devagar, a quantidade precisa ser pequena e o escopo, bem recortado — daí o meio da pirâmide.

## Quando usar

- Nas fronteiras: repositórios, migrações, configuração de ORM, serialização de eventos.
- Sempre que o bug que você está caçando só acontece *no banco*, nunca no mock.

## Armadilhas

- Banco em memória para simular Postgres: comportamento de transação, types e SQL diferem, e o teste mente.
- Suíte de integração sem isolamento entre testes: estado vazando gera falhas intermitentes que corroem a confiança.

## Conexões

- [[Test Doubles]] — o limite do dublê é exatamente onde este teste começa
- [[Pirâmide de Testes]] — camada do meio: mais lenta, por isso menor
- [[Migrações de Banco]] — aplicar migração em banco limpo é o teste mais honesto do script

## Veja também

- [[MOC - Testes e Qualidade]]
- [[Cobertura de Código vs Confiança]]
