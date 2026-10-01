---
titulo: Modelagem Relacional
tipo: ficha
area: dados
hub: [[MOC - Dados e Persistência]]
tags:
  - ficha
  - area/dados
  - dados
  - modelagem
  - sql
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Modelagem Relacional

> Normalizar até as regras ficarem explícitas, desnormalizar quando a leitura exigir — o modelo é a primeira documentação do domínio.

## Definição

- Modelagem relacional organiza dados em tabelas, chaves e relacionamentos, com normalização para eliminar redundância e anomalias de escrita.
- Normalização é sobre facilitar a escrita correta; desnormalização é sobre tornar a leitura viável — conhecer os dois lados é o jogo.

## Como funciona

- Você identifica entidades, cardinalidades e restrições (PK, FK, UNIQUE, CHECK), e traduz regras de negócio em constraints que o banco impõe.
- Índices e plano de execução entram depois: o modelo lógico é decidido antes da otimização.

## Quando usar

- Sempre que houver integridade referencial importante e consultas ad-hoc imprevisíveis — SQL é imbatível aí.
- Como base do modelo transacional, mesmo em arquiteturas que depois projetam leituras em outras estruturas.

## Armadilhas

- Modelar o banco como espelho das classes: herança e polimorfismo viram tabelas que ninguém consegue consultar.
- Deixar integridade só na aplicação: sem UNIQUE e FK no banco, uma concorrência infeliz cria dados impossíveis.

## Conexões

- [[Migrações de Banco]] — modelo muda com o tempo, e a migração é o histórico dessa mudança
- [[ORM como Abstração com Vazamento]] — o ORM traduz (e às vezes distorce) esse modelo para objetos
- [[Entidade, Value Object e Agregado]] — agregado é uma fronteira lógica que nem sempre é uma tabela
- [[Cobertura de Código vs Confiança]] — regras de integridade no banco pedem testes que usam banco real

## Veja também

- [[MOC - Dados e Persistência]]
