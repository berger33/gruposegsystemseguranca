---
titulo: Monólito Modular
tipo: ficha
area: arquitetura
hub: [[MOC - Arquitetura de Software]]
tags:
  - ficha
  - area/arquitetura
  - arquitetura
  - modularidade
  - fronteiras
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Monólito Modular

> Um único deploy, mas com fronteiras internas rígidas: cada módulo é tratado como se pudesse virar serviço amanhã.

## Definição

- Monólito modular é um sistema implantado como uma única unidade, dividido internamente em módulos com fronteiras explícitas e contratos próprios.
- A disciplina é a mesma de um distribuído — só que sem a rede no meio: módulo A não acessa o banco do módulo B nem classes internas de B, apenas a interface pública.

## Como funciona

- Cada módulo expõe uma fachada (porta de entrada) e esconde seu modelo de dados; a comunicação acontece por chamadas diretas ou eventos em memória, nunca por SQL cruzado.
- A regra que sustenta tudo: se um dia você extrair o módulo, o custo deve ser trocar chamada de função por chamada de rede — não reescrever o modelo.

## Quando usar

- Time único ou poucos times, domínio ainda em descoberta e necessidade de velocidade — o caso padrão, não a exceção.
- Quando a complexidade do seu problema é de regra de negócio e não de escala operacional.

## Armadilhas

- Módulo de fachada: a fronteira existe no desenho, mas o código todo alcança o banco inteiro. Se um `SELECT` com join entre módulos é comum, a modularidade é decorativa.
- Sem verificação automática de fronteira, a degradação é silenciosa — vale uma checagem de dependências no CI.

## Conexões

- [[Arquitetura Hexagonal]] — dá a mecânica de portas e adaptadores que mantém o módulo isolado
- [[Integração Contínua]] — é onde a checagem de fronteiras precisa rodar para não apodrecer
- [[Acoplamento e Coesão]] — a métrica que diz se seus módulos são módulos ou só pastas

## Veja também

- [[MOC - Arquitetura de Software]]
- [[Domain-Driven Design]]
