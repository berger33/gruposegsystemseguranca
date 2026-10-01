---
titulo: Versionamento Semântico
tipo: ficha
area: entrega
hub: [[MOC - Entrega e Operação]]
tags:
  - ficha
  - area/entrega
  - entrega
  - versao
  - api
  - contrato
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Versionamento Semântico

> MAJOR.MINOR.PATCH comunica risco: quebrou, acrescentou ou corrigiu — uma promessa sobre o que esperar de uma atualização.

## Definição

- Convenção em que MAJOR indica mudança incompatível, MINOR funcionalidade nova compatível e PATCH correção compatível.
- O valor não é o número: é transformar a decisão de atualizar em algo que o consumidor pode tomar sozinho.

## Como funciona

- A versão é derivada do contrato público (API, eventos, CLI) — mudança interna não emblemática não altera MAJOR.
- Pré-releases e metadados de build permitem sinalizar instabilidade sem poluir a linha principal.

## Quando usar

- Sempre que houver consumidor fora do seu time: biblioteca, API pública, pacote, schema de evento.
- Para gerar changelog e notas de release de forma automatizada a partir do histórico do tronco.

## Armadilhas

- Versionar por sensação: bump de MAJOR a cada release grande destrói o significado do número.
- Mudança silenciosa de comportamento em PATCH: compatibilidade de compilação não é compatibilidade semântica.

## Conexões

- [[Testes de Contrato]] — o teste é quem acusa se a mudança foi mesmo compatível
- [[Context Map]] — na relação cliente-fornecedor, versão é o contrato de expectativas
- [[Microsserviços]] — serviços com ciclos independentes precisam de compatibilidade negociada
- [[Trunk-Based Development]] — histórico linear do tronco alimenta o changelog automaticamente

## Veja também

- [[MOC - Entrega e Operação]]
