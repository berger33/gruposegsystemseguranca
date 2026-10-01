---
titulo: Context Map
tipo: ficha
area: dominio
hub: [[MOC - Domínio e Modelagem]]
tags:
  - ficha
  - area/dominio
  - ddd
  - integracao
  - estrategico
  - times
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Context Map

> O mapa das relações entre contextos — quem é fornecedor, quem é cliente, quem só precisa de uma camada anticorrupção.

## Definição

- Context Map é o desenho explícito de como Bounded Contexts e seus times se relacionam, nomeando cada padrão de integração.
- Padrões clássicos: núcleo compartilhado, cliente-fornecedor, camada anticorrupção, conformista e caminhos separados.

## Como funciona

- Para cada fronteira você decide uma relação: o downstream aceita o modelo do upstream (conformista), traduz com uma camada anticorrupção, ou negocia um contrato (cliente-fornecedor).
- O mapa é organizacional antes de ser técnico: cada relação implica quem espera por quem e quem pode quebrar quem.

## Quando usar

- Em qualquer sistema com mais de um contexto — ou seja, mais de um time ou mais de uma área de negócio.
- Antes de propor integração: o mapa responde se aquele acoplamento é aceitável ou se precisa de tradução.

## Armadilhas

- Mapa que existe só na cabeça de uma pessoa: a integração acidental aparece quando ninguém escreveu quem depende de quem.
- Camada anticorrupção para tudo — tradução custa manutenção; às vezes ser conformista é a escolha certa.

## Conexões

- [[Bounded Context]] — o mapa é o conjunto das fronteiras e suas relações
- [[Arquitetura Orientada a Eventos]] — publicar fatos é a forma mais frouxa de relação entre contextos
- [[Acoplamento e Coesão]] — o mapa é, literalmente, um diagrama de acoplamento entre contextos

## Veja também

- [[MOC - Domínio e Modelagem]]
- [[Versionamento Semântico]]
