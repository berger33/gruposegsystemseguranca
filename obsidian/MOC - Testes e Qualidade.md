---
titulo: MOC - Testes e Qualidade
tipo: moc
area: testes
hub: [[MOC - Engenharia de Software]]
tags:
  - moc
  - area/testes
status: ativo
atualizado: 2026-10-01
---

# MOC - Testes e Qualidade

> Eixo da confiança: o que você testa, onde testa e o quanto pode acreditar no verde. Teste é uma decisão de design tanto quanto de qualidade.

## Notas deste eixo

- [[Pirâmide de Testes]] — Muitos testes rápidos na base, poucos testes lentos no topo — a forma do seu conjunto de testes determina a velocidade do time.
- [[Test Doubles]] — Substitutos de dependências reais: existe uma diferença enorme entre simular uma resposta e simular um contrato quebrado.
- [[Testes de Contrato]] — O consumidor publica suas expectativas e o provedor prova que as cumpre — integração verificada sem subir o mundo inteiro.
- [[Cobertura de Código vs Confiança]] — Cobertura mede linhas executadas, não certezas adquiridas: 90% de cobertura com zero assertions conta a mesma história que 0%.
- [[Testes de Integração com Dependências Reais]] — Testar contra Postgres de verdade, não contra um banco em memória que só imita Postgres — o dialeto importa.

## Travessias para outros eixos

- [[MOC - Arquitetura de Software]]
- [[MOC - Design de Código]]
- [[MOC - Dados e Persistência]]
- [[MOC - Domínio e Modelagem]]
- [[MOC - Entrega e Operação]]

## Voltar

- [[MOC - Engenharia de Software]]
