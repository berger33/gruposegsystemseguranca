---
titulo: Arquitetura Hexagonal
tipo: ficha
area: arquitetura
hub: [[MOC - Arquitetura de Software]]
tags:
  - ficha
  - area/arquitetura
  - arquitetura
  - portas-e-adaptadores
  - testabilidade
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Arquitetura Hexagonal

> O domínio no centro, o mundo lá fora atrás de adaptadores: banco, HTTP e filas são detalhes plugáveis, não a estrutura do sistema.

## Definição

- Também chamada de Portas e Adaptadores, coloca a lógica de negócio no centro e define portas (interfaces que o domínio precisa) e adaptadores (implementações concretas que falam com o mundo).
- O domínio declara o que precisa — `RepositorioDeContratos` — e não sabe se por trás existe Postgres, um arquivo ou um stub de teste.

## Como funciona

- Dependências apontam para dentro: adaptador conhece a porta, a porta não conhece o adaptador. Trocar Postgres por DynamoDB é escrever um adaptador novo, não reescrever regras.
- Na prática, o teste de unidade do domínio roda sem banco, sem rede e sem framework — o que derruba o tempo de feedback de minutos para milissegundos.

## Quando usar

- Sistemas com regras de negócio ricas, que precisam sobreviver a trocas de tecnologia e a uma suíte de testes rápida.
- Sempre que a pergunta *como testo isso sem subir metade do mundo?* aparecer com frequência.

## Armadilhas

- Hexagonal de fachada: interfaces para tudo, incluindo o que nunca muda. Cada abstração precisa pagar aluguel.
- Confundir a arquitetura com a estrutura de pastas — `adapters/`, `ports/` e `domain/` sem inversão real de dependência não muda nada.

## Conexões

- [[Arquitetura em Camadas]] — o modelo tradicional que a hexagonal corrige quando camadas vazam
- [[Pirâmide de Testes]] — com o domínio isolado, a base da pirâmide fica barata e estável

## Veja também

- [[MOC - Arquitetura de Software]]
- [[Monólito Modular]]
