---
titulo: Padrão Outbox
tipo: ficha
area: dados
hub: [[MOC - Dados e Persistência]]
tags:
  - ficha
  - area/dados
  - dados
  - eventos
  - confiabilidade
  - padrao
status: rascunho
criado: 2026-10-01
atualizado: 2026-10-01
---

# Padrão Outbox

> Gravar o evento na mesma transação do banco de dados e publicá-lo depois: elimina o *gravei mas não avisei*.

## Definição

- Transactional Outbox: em vez de escrever no banco e publicar no broker como duas operações separadas, você grava o evento numa tabela `outbox` dentro da mesma transação.
- Um processo separado lê essa tabela e publica, com retry até o broker confirmar.

## Como funciona

- A transação confirma estado + linha na outbox juntos; se o processo cair depois, a linha continua lá para ser publicada.
- Publicação é *at least once*, então o consumidor precisa ser idempotente — as duas peças formam o par.

## Quando usar

- Sempre que um efeito colateral (evento, integração) precisar acontecer exatamente quando o estado muda — sem exceção.
- Em microsserviços e qualquer sistema onde escrita local e notificação externa não podem divergir.

## Armadilhas

- Publicar direto do processo após o commit: a falha entre commit e publish é rara, e por isso mesmo passa despercebida por meses.
- Esquecer de limpar a tabela: outbox sem purga cresce e vira problema de armazenamento e varredura.

## Conexões

- [[Transações e Consistência]] — a outbox só funciona porque a transação local é atômica
- [[Consistência Eventual]] — garante a confiabilidade da janela de divergência
- [[Arquitetura Orientada a Eventos]] — é o que torna publicação de evento digna de confiança
- [[Observabilidade]] — tamanho da fila da outbox é métrica de saúde da integração

## Veja também

- [[MOC - Dados e Persistência]]
