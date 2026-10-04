# Continuidade Arena — auditoria de 04/10/2026

Leia nesta ordem:
1. [Auditoria e matriz de 222 requisitos](AUDITORIA.md).
2. [Plano de implementação F00–F16](02-PLANO-ARENA.md).
3. [Critérios de aceite](03-ACEITE.md).
4. [Prompt master](04-PROMPT-MASTER-ARENA.md).

Comece reconciliando o main vigente (F00) e implemente login/navegação (F01), salvo se já resolvido com evidência. Depois prossiga por fatias pequenas. A ausência de pendências na última PR do Arena não significa conclusão de todos os requisitos.

## Origem e limites das evidências

A auditoria de origem usou main `540faf6c5124fd243fc3e287527ff4f6983ce8f1`. O relato de execução Windows foi produzido na máquina do operador: build passou, migrações 156/156 com replay, unitários 511/514 (três falhas EPERM em symlinks), login e painel pelo navegador, scheduler 3600/TI e deduplicação após reinício. Os logs e capturas locais não são anexados nesta publicação; trate-os como resultados relatados nesta auditoria e reproduza os gates no ambiente disponível. Não invente acesso aos caminhos locais mencionados.

A matriz transcreve estados declarados no checklist: não equivale a 222 testes novos. Os documentos históricos precisam ser reconciliados com entregas posteriores. Validação no Linux não substitui aceite Windows nem humano.

Servidor e túnel de demonstração foram encerrados a pedido do usuário; banco e arquivos preservados. A prioridade é resolver pendências antes da próxima instalação. Nenhuma senha, configuração de ambiente, dump ou link ativo de demonstração é necessário para este trabalho.

## Publicação

Esta pasta é documentação apenas. Não altera código, migrações ou implantação. Caso a PR ainda não esteja integrada, leia a branch `docs/auditoria-arena-2026-10-04`; não é necessário mesclar outras PRs para consultar os documentos. Ao desenvolver a partir do main, leve esta pasta à branch de trabalho sem substituir mudanças novas do main.
