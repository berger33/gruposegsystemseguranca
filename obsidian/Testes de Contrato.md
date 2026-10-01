---
titulo: Testes de Contrato
tipo: ficha
area: testes
hub: [[MOC - Testes e Qualidade]]
tags:
  - ficha
  - area/testes
  - testes
  - integracao
  - api
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Testes de Contrato

> O consumidor publica suas expectativas e o provedor prova que as cumpre — integração verificada sem subir o mundo inteiro.

## Definição

- Teste de contrato verifica, de forma isolada, se produtor e consumidor concordam sobre o formato e o comportamento de uma API ou evento.
- Ferramentas como Pact registram as expectativas do consumidor e as reproduzem contra o provedor no CI.

## Como funciona

- O consumidor gera um arquivo de contrato a partir dos seus testes; o provedor roda esse contrato contra a sua própria base de código.
- Se o provedor mudar o schema, o contrato quebra no CI dele — antes do deploy, não depois do incidente.

## Quando usar

- Integrações entre times/serviços onde o teste fim-a-fim é caro, instável ou lento demais.
- Sempre que houver mais de dois consumidores para a mesma API, ou eventos consumidos por equipes diferentes.

## Armadilhas

- Contrato superficial que só valida status 200: o problema real é campo renomeado, e isso passa batido.
- Contratos sem governança de versão: exigir mudança sincronizada de cinco times devolve o acoplamento que você queria evitar.

## Conexões

- [[Microsserviços]] — substitui o teste fim-a-fim entre múltiplos serviços
- [[Arquitetura Orientada a Eventos]] — schema de evento é contrato, e consumidor invisível é risco
- [[Versionamento Semântico]] — quebrar contrato é major version, e o teste é quem acusa
- [[Test Doubles]] — o contrato mantém o dublê honesto em relação ao provedor real

## Veja também

- [[MOC - Testes e Qualidade]]
