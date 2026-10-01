---
titulo: Acoplamento e Coesão
tipo: ficha
area: codigo
hub: [[MOC - Design de Código]]
tags:
  - ficha
  - area/codigo
  - design
  - medidas
  - fronteiras
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Acoplamento e Coesão

> As duas medidas que explicam quase todo problema de manutenção: o quanto as partes se conhecem e o quanto o que está junto pertence junto.

## Definição

- Acoplamento é o grau de dependência entre módulos; coesão é o grau em que o conteúdo de um módulo pertence ao mesmo propósito.
- O objetivo é coesão alta e acoplamento baixo — e, principalmente, acoplamento apenas na direção de coisas mais estáveis.

## Como funciona

- Sinais de acoplamento ruim: mudança que se espalha, módulo que não compila sozinho, teste que precisa de três subsistemas de pé.
- Sinais de coesão ruim: classe com métodos que nunca compartilham estado, módulo que muda por motivos não relacionados.

## Quando usar

- Em toda revisão de código: é o critério mais objetivo para aceitar ou pedir mudança.
- Como bússola para decidir onde cortar módulos, serviços ou pacotes.

## Armadilhas

- Reduzir acoplamento criando camadas de indireção sem sentido: às vezes o melhor é aceitar o acoplamento e isolá-lo.
- Medir acoplamento por contagem de imports: o que importa é a volatilidade da dependência, não a quantidade.

## Conexões

- [[SOLID]] — os cinco princípios são receitas de coesão alta e acoplamento baixo
- [[Monólito Modular]] — módulo bom é coeso por dentro e acoplado só por contrato
- [[Inversão de Dependência]] — ferramenta para escolher a direção do acoplamento
- [[Composição sobre Herança]] — herança é a forma mais forte (e rígida) de acoplamento

## Veja também

- [[MOC - Design de Código]]
- [[Arquitetura em Camadas]]
