---
titulo: Cobertura de Código vs Confiança
tipo: ficha
area: testes
hub: [[MOC - Testes e Qualidade]]
tags:
  - ficha
  - area/testes
  - testes
  - metricas
  - qualidade
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Cobertura de Código vs Confiança

> Cobertura mede linhas executadas, não certezas adquiridas: 90% de cobertura com zero assertions conta a mesma história que 0%.

## Definição

- Cobertura de código é a fração de linhas/ramos exercitados pelos testes; confiança é a probabilidade de o verde significar que está funcionando.
- A primeira é automática e barata de medir; a segunda exige olhar o que o teste afirma.

## Como funciona

- Cobertura serve para achar o não testado: um relatório mostrando o módulo em 0% é um achado valioso.
- Confiança vem de asserts sobre comportamento nas fronteiras certas, dados realistas e verificação dos efeitos — inclusive no banco.

## Quando usar

- Use cobertura como radar de áreas esquecidas, nunca como meta de gestão.
- Avalie confiança fazendo a pergunta oposta: que bug real passaria por esta suíte sem falhar?

## Armadilhas

- Meta de cobertura: gera testes sem assert, escritos só para pintar a linha de verde.
- Perseguir 100%: as últimas linhas custam mais que o risco que cobrem, quase sempre getters e tratamento defensivo.

## Conexões

- [[Pirâmide de Testes]] — confiança vem da distribuição certa, não do volume
- [[Test Doubles]] — mockar demais infla cobertura e esvazia confiança
- [[Testes de Integração com Dependências Reais]] — onde a confiança em regras de banco realmente se constrói
- [[Observabilidade]] — produção é o teste final: métricas mostram o que a suíte não pegou
- [[Modelagem Relacional]] — constraints e integridade só são verificadas com banco real

## Veja também

- [[MOC - Testes e Qualidade]]
