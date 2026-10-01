---
titulo: Migrações de Banco
tipo: ficha
area: dados
hub: [[MOC - Dados e Persistência]]
tags:
  - ficha
  - area/dados
  - dados
  - migracao
  - deploy
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Migrações de Banco

> Mudança de schema é deploy com estado: precisa ser versionada, reversível em intenção e compatível com a versão anterior rodando.

## Definição

- Migração é um script versionado que leva o banco de um estado a outro, aplicado de forma automatizada e repetível.
- Em sistemas sem janela de parada, a migração precisa ser compatível com as duas versões do código que vão conviver durante o rollout.

## Como funciona

- O padrão seguro é expandir e contrair: primeiro adiciona coluna nullable, depois o código passa a escrever nas duas, backfill em lote, migra a leitura, remove a antiga só numa release seguinte.
- Cada passo é deployável sozinho, o que transforma uma mudança perigosa em cinco mudanças pequenas.

## Quando usar

- Sempre que houver schema versionado — que é sempre, assim que mais de uma pessoa mexe no banco.
- Obrigatoriamente quando Deploy e rollback acontecem sem parada.

## Armadilhas

- Migração destrutiva num passo só (`DROP COLUMN` junto com deploy): se precisar voltar, o dado já era.
- Backfill numa transação gigante: trava a tabela, estoura o log e derruba o sistema — faça em lotes com pausa.

## Conexões

- [[Entrega Contínua e Deploy]] — migração é parte do pipeline: define se o deploy é reversível
- [[Integração Contínua]] — rodar migrações em banco limpo no CI pega script quebrado antes da produção
- [[Modelagem Relacional]] — migração é o histórico vivo do modelo
- [[Testes de Integração com Dependências Reais]] — testar migração com mock não diz nada sobre o banco real

## Veja também

- [[MOC - Dados e Persistência]]
