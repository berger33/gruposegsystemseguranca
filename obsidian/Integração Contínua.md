---
titulo: Integração Contínua
tipo: ficha
area: entrega
hub: [[MOC - Entrega e Operação]]
tags:
  - ficha
  - area/entrega
  - entrega
  - ci
  - pipeline
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Integração Contínua

> Integrar todo dia, verificar automático em minutos: o objetivo da CI é encurtar o tempo entre errar e descobrir.

## Definição

- Prática de integrar mudanças ao tronco várias vezes ao dia, com build e testes automatizados a cada integração.
- CI não é a ferramenta (GitHub Actions, GitLab CI) — é o hábito de manter o tronco sempre em estado liberável.

## Como funciona

- Cada push dispara build, testes, lint e checagens de fronteira/segurança; build quebrado é prioridade máxima do time.
- Quanto mais rápido o pipeline, menor o lote de mudanças e mais fácil atribuir a culpa quando algo quebra.

## Quando usar

- Sempre, a partir de duas pessoas no repositório — o custo do merge manual cresce quadraticamente com o tamanho do time.
- Antes de falar em CD: sem tronco verde não existe entrega contínua, só deploy frequente de coisas não verificadas.

## Armadilhas

- Pipeline de 45 minutos: ninguém espera, o acúmulo de commits torna a falha impossível de atribuir.
- Build intermitente tolerado: uma vez que o time aceita *rodar de novo*, o sinal perde valor para sempre.

## Conexões

- [[Entrega Contínua e Deploy]] — CI verifica, CD libera: a segunda depende da primeira
- [[Trunk-Based Development]] — branch de vida longa é incompatível com integração de verdade
- [[Pirâmide de Testes]] — o tempo da suíte é o tempo do pipeline
- [[Monólito Modular]] — checagem de fronteiras entre módulos vive aqui
- [[Migrações de Banco]] — aplicar migração em banco limpo no CI pega script quebrado

## Veja também

- [[MOC - Entrega e Operação]]
