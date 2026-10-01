---
titulo: Entrega Contínua e Deploy
tipo: ficha
area: entrega
hub: [[MOC - Entrega e Operação]]
tags:
  - ficha
  - area/entrega
  - entrega
  - cd
  - deploy
  - rollback
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Entrega Contínua e Deploy

> Manter o software sempre liberável — e, se for deploy contínuo, liberado. A métrica que importa é o tempo para voltar atrás.

## Definição

- Entrega contínua: todo commit aprovado gera um artefato candidato a produção. Deploy contínuo: esse artefato vai para produção automaticamente.
- O pré-requisito não técnico é a esteira de segurança: deploy só é rotina quando reverter também é.

## Como funciona

- Artefato imutável é construído uma vez e promovido entre ambientes; rollback é redirecionar tráfego para a versão anterior, não reconstruir.
- Estratégias de liberação (blue/green, canário) reduzem o raio de impacto de um deploy ruim.

## Quando usar

- Quando o custo de uma release grande é alto e o medo de deployar travou o time — frequência reduz risco por lote.
- Quando rollback rápido for mais barato que tentar prever todo defeito antes de liberar.

## Armadilhas

- Deploy automatizado sem plano de reversão: automatizar a ida e não a volta é automatizar o acidente.
- Ambientes divergentes: promover o mesmo artefato é o que garante que *funcionou em homologação* signifique algo.

## Conexões

- [[Integração Contínua]] — CD sem CI é só pressa automatizada
- [[Trunk-Based Development]] — liberar sempre exige tronco sempre liberável
- [[Feature Flags]] — permitem deployar código incompleto sem expor funcionalidade
- [[Migrações de Banco]] — a migração é a parte do deploy que não se reverte com um comando
- [[Observabilidade]] — deploy sem métricas de verificação é liberar de olhos fechados

## Veja também

- [[MOC - Entrega e Operação]]
