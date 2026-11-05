# Fatia 01 — status e proveniência N1

**Data:** 04/11/2026. **Base:** `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. **Branch:** `arena/a5202d09-gruposegsystemseguranca`.
**Resultado:** implementada e validada localmente. Não houve commit, push, PR ou deploy nesta entrega.

## Problema e contrato

A auditoria havia registrado uma falha unitária porque o ledger declarava a base anterior ao merge que o publicou. Igualdade obrigatória com o novo topo criava débito documental por construção.

O cabeçalho foi reconciliado com a base atual e a guarda passou a aceitar apenas:

1. Base igual a um topo de main conhecido no ambiente; ou
2. Base igual ao primeiro pai de um único merge de exatamente dois pais, cujo arquivo de ledger publicado seja igual à fotografia sob teste (desconsiderando somente espaços externos ao arquivo).

Não há tolerância genérica por idade ou ancestralidade. A guarda recusa segundo pai, commit linear, ancestral mais antigo, objeto indisponível, fotografia diferente e avanço posterior sem reconciliação. Merges octopus não recebem exceção implícita. Isto não elimina a obrigação de atualizar o ledger nas próximas entregas; elimina a obrigação de uma entrega exclusivamente para atualizar o SHA gerado pelo próprio merge.

O evento de CI fornece o topo autoritativo quando presente (`after` em push de main; base.sha em PR); `before` não é um topo atual. Refs locais são fallback quando o evento não traz topo válido. Pais são lidos com `git cat-file`, funcionando mesmo na fronteira de clone raso sem objeto do primeiro pai.

## Arquivos

- `scripts/lib/ledger-base.mjs`: coleta de topos e validação da proveniência; sem rede ou mutação de refs.
- `tests/package-artifacts.test.mjs`: integração da guarda e três novos testes herméticos em repositórios temporários, executados pelo comando unitário já existente.
- `docs/STATUS-VIGENTE.md`: cabeçalho/base/branch, nova atualização corrente, registro local da #348 e resultados.
- `docs/REQUISITOS-222-INVENTARIO-2026-10-27.json`: regeneração; somente arquivos varridos de 1.725 para 1.726.
- `docs/REQUISITOS-222-REAUDITORIA-INVENTARIO-2026-10-27.md`: contagem correspondente.
- `auditoria-2026-11-04/PLANO-EXECUCAO.md`: marcação desta entrega e próxima fatia.

## Verificações

| Comando | Resultado |
|---|---|
| `git fetch origin main` + conferência de refs | HEAD/main/origin/main na base declarada; sem troca de branch |
| `npm ci` | OK |
| `node --test tests/package-artifacts.test.mjs` | 11/11 |
| `npm test` | **1.522/1.522**, 0 falhas, 0 skips |
| `npm run typecheck` | OK |
| `npm run build` | OK |
| `node scripts/qa-wave0-static.mjs` | 5/5 |
| `node scripts/requisitos-222-inventory.mjs --check` | OK; 222 IDs, 12 a_revalidar sem gate |
| Focal final package-artifacts + requisitos-222-inventory | 18/18 após atualização da documentação |
| `git diff --check` | OK |

A primeira tentativa de regressão neste turno encontrou dependências ausentes no workspace (`tsc` e módulos não instalados). Foi executado `npm ci`. Após a regeneração do índice, a suíte ainda apontou a contagem documental antiga de arquivos; a documentação foi reconciliada, sem alterar a guarda. Os resultados finais acima são posteriores a essas correções.

## Preservação e limites

Nenhum comportamento de produção foi alterado: páginas, rotas, permissões, fluxos, dados, configurações, APIs, integrações, workflows e 183 migrações estão preservados. Nenhum novo arquivo foi adicionado à lista explícita do test:unit; a contagem total aumentou pelos três cenários novos no arquivo já listado.

Permanece o limite preexistente: em checkout sem ref de main nem evento com base determinável, a proveniência não é verificável. O helper retorna explicitamente `no-main-tip`, e o teste registra diagnóstico; formato e cenários herméticos permanecem obrigatórios. Não se declara validação de base nesse ambiente. Não houve execução remota do CI nem merge real: o cenário pós-merge e o clone raso foram provados em fixtures Git descartáveis.

**Próxima fatia:** 02, documentação de instalação/produção e contrato de variáveis de ambiente. N7 (fila administrativa), N8/N9, backup real, aceite humano e autorização de produção continuam pendentes. Produção permanece NO-GO.
