---
titulo: MOC - Dados e Persistência
tipo: moc
area: dados
hub: [[MOC - Engenharia de Software]]
tags:
  - moc
  - area/dados
status: ativo
atualizado: 2026-10-01
---

# MOC - Dados e Persistência

> Eixo do estado: onde a verdade mora, como ela muda com segurança e o que acontece quando a escrita e a leitura precisam de formas diferentes.

## Notas deste eixo

- [[Modelagem Relacional]] — Normalizar até as regras ficarem explícitas, desnormalizar quando a leitura exigir — o modelo é a primeira documentação do domínio.
- [[ORM como Abstração com Vazamento]] — O ORM acelera o começo e cobra depois: toda abstração deixa escapar o SQL que você não viu escrever.
- [[Migrações de Banco]] — Mudança de schema é deploy com estado: precisa ser versionada, reversível em intenção e compatível com a versão anterior rodando.
- [[Transações e Consistência]] — A transação é a menor unidade de verdade: tudo ou nada, e o nível de isolamento define o que você aceita enxergar no meio do caminho.
- [[Consistência Eventual]] — Aceitar que o sistema fica divergente por alguns instantes em troca de disponibilidade — desde que convirja, e você saiba quanto tempo leva.
- [[Padrão Outbox]] — Gravar o evento na mesma transação do banco de dados e publicá-lo depois: elimina o *gravei mas não avisei*.

## Travessias para outros eixos

- [[MOC - Arquitetura de Software]]
- [[MOC - Design de Código]]
- [[MOC - Domínio e Modelagem]]
- [[MOC - Entrega e Operação]]
- [[MOC - Testes e Qualidade]]

## Voltar

- [[MOC - Engenharia de Software]]
