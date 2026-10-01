---
titulo: Pirâmide de Testes
tipo: ficha
area: testes
hub: [[MOC - Testes e Qualidade]]
tags:
  - ficha
  - area/testes
  - testes
  - estrategia
  - feedback
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Pirâmide de Testes

> Muitos testes rápidos na base, poucos testes lentos no topo — a forma do seu conjunto de testes determina a velocidade do time.

## Definição

- Modelo que distribui testes em camadas: unidade (rápidos, muitos), integração (médios) e ponta a ponta (lentos, poucos).
- A ideia não é estética: o custo de diagnóstico cresce com o tamanho do pedaço de sistema sob teste.

## Como funciona

- Regras de negócio são testadas isoladas, em milissegundos; só as fronteiras reais (banco, HTTP, fila) ganham testes de integração.
- O topo verifica o caminho crítico do usuário: dois ou três cenários bastam para garantir que o sistema liga e conversa.

## Quando usar

- Como referência para decidir onde um novo teste deve morar — se está no topo, precisa de justificativa.
- Quando a suíte passou de alguns minutos e o time começou a evitar rodar tudo.

## Armadilhas

- Pirâmide invertida (sorvete): muitos testes de UI, suíte de 40 minutos e ninguém confia no resultado.
- Teste de unidade que mocka o próprio objeto testado: verde rápido, confiança zero.

## Conexões

- [[Test Doubles]] — a base da pirâmide depende de dublês confiáveis
- [[Testes de Integração com Dependências Reais]] — o meio da pirâmide, onde o mock não serve mais
- [[Cobertura de Código vs Confiança]] — cobertura alta só na base não garante o sistema funcionando
- [[Arquitetura Hexagonal]] — domínio isolado é o que torna a base da pirâmide possível
- [[Integração Contínua]] — o tempo da suíte define o ritmo do pipeline

## Veja também

- [[MOC - Testes e Qualidade]]
