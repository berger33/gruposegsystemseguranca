---
titulo: Test Doubles
tipo: ficha
area: testes
hub: [[MOC - Testes e Qualidade]]
tags:
  - ficha
  - area/testes
  - testes
  - mocks
  - isolamento
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Test Doubles

> Substitutos de dependências reais: existe uma diferença enorme entre simular uma resposta e simular um contrato quebrado.

## Definição

- Dublês de teste se dividem em dummy, stub, spy, mock e fake: cada um resolve uma pergunta diferente sobre a dependência substituída.
- Fake é uma implementação real simplificada (banco em memória); stub devolve valores prontos; mock verifica interações.

## Como funciona

- Você isola o objeto sob teste injetando dublês nas suas dependências — o que só é limpo quando existe uma abstração real (porta).
- Mocks verificam comportamento (`enviou e-mail uma vez`); stubs só alimentam o teste com dados.

## Quando usar

- Para dependências lentas, não determinísticas ou impossíveis de reproduzir: relógio, sorteio, gateway de pagamento.
- Para acelerar a base da pirâmide, onde a dependência não é o objeto do teste.

## Armadilhas

- Mockar tudo: o teste passa com o contrato real quebrado, porque o mock repete a suposição errada do autor.
- Mock de tipo que você não controla: quando a biblioteca muda, o mock continua verde e a produção quebra.

## Conexões

- [[Pirâmide de Testes]] — dublês são o que viabiliza a base larga e rápida
- [[Inversão de Dependência]] — sem abstração, o dublê entra por gambiarra
- [[Testes de Integração com Dependências Reais]] — o contraponto necessário: dublê demais esconde bugs reais
- [[Testes de Contrato]] — são os dois lados da mesma moeda na integração entre serviços
- [[Composição sobre Herança]] — composição permite trocar a dependência pelo dublê

## Veja também

- [[MOC - Testes e Qualidade]]
- [[Cobertura de Código vs Confiança]]
