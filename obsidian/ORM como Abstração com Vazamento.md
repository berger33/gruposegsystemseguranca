---
titulo: ORM como Abstração com Vazamento
tipo: ficha
area: dados
hub: [[MOC - Dados e Persistência]]
tags:
  - ficha
  - area/dados
  - dados
  - orm
  - performance
  - tradeoff
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# ORM como Abstração com Vazamento

> O ORM acelera o começo e cobra depois: toda abstração deixa escapar o SQL que você não viu escrever.

## Definição

- ORMs mapeiam tabelas para objetos e prometem que você não precisa pensar em SQL — mas consultas N+1, lazy loading e transações implícitas são o SQL voltando pela janela.
- Lei do vazamento de abstrações: toda abstração não trivial vaza, e em persistência o vazamento custa ordens de magnitude de performance.

## Como funciona

- Por padrão, o ORM carrega relacionamentos sob demanda: um loop sobre 100 pedidos dispara 100 consultas de itens.
- A defesa é observar o SQL gerado (log, contador de queries no teste) e usar carregamento explícito ou consulta dedicada quando o acesso é em massa.

## Quando usar

- Use para CRUD e operações sobre um agregado por vez — é onde o ganho de produtividade é real.
- Saia dele (SQL cru ou query builder) para relatórios, agregações e qualquer leitura que cruze muitas tabelas.

## Armadilhas

- N+1 em produção: passa em teste com 3 registros, derruba o banco com 30 mil.
- Entidades de domínio com anotações de persistência: o modelo fica refém do framework e a regra perde pureza.

## Conexões

- [[Modelagem Relacional]] — o ORM é a ponte entre o relacional e o objeto — e a ponte é onde se perde performance
- [[Arquitetura em Camadas]] — entidade anotada é o vazamento clássico entre camadas
- [[Observabilidade]] — contar e medir queries é a forma de ver o vazamento acontecendo
- [[Arquitetura Hexagonal]] — manter o ORM atrás de um repositório impede que ele contamine o domínio

## Veja também

- [[MOC - Dados e Persistência]]
