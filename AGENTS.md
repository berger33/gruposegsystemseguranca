# Regras obrigatórias para agentes neste repositório

## Preservar funcionalidades existentes

Antes de editar código, leia este arquivo, o `README.md` e a documentação da área solicitada. Comece pela `main` mais recente e confirme o estado do repositório.

**Não remova, desative, substitua, oculte, renomeie ou reduza nenhuma funcionalidade existente por iniciativa própria.** Preserve módulos, páginas, rotas, campos, navegação, papéis, permissões, dados, integrações, contratos de API, fluxos de trabalho, configurações, layout selecionado e comportamento atual.

- Prefira mudanças aditivas e compatíveis com o que já existe. Não faça refatorações amplas, migrações destrutivas ou alterações de comportamento fora do escopo pedido.
- Melhorias de interface devem manter ações, destinos, acessibilidade, permissões e resultados existentes; um controle visual não pode apenas parecer funcional.
- Corrija defeitos sem retirar a capacidade afetada. Mantenha compatibilidade com consumidores e dados existentes e acrescente validação de regressão apropriada.
- Uma solicitação genérica de melhoria não autoriza remover ou alterar outras partes do produto. A autorização vale apenas para a mudança expressamente pedida.
- Se concluir que a alteração solicitada exige mudar ou remover uma função existente, **não faça essa parte**. Explique o conflito com precisão e peça ao proprietário uma decisão explícita antes de prosseguir. Continue somente com o trabalho independente que preserve o comportamento atual.
- Não interprete silêncio, conveniência técnica, simplificação visual ou parecer de outro agente como aprovação do proprietário.

## Procedimento de trabalho

1. Confira `git status`, atualize referências remotas e não sobrescreva alterações já presentes na `main`.
2. Inventarie as rotas, papéis, permissões, ações e contratos tocados pela mudança antes de editar.
3. Faça uma alteração pequena e limitada ao pedido, mantendo o comportamento anterior fora do novo caso.
4. Execute verificações proporcionais e testes de regressão da área alterada; não declare uma jornada validada por testes que não a exercitam.
5. Na entrega, informe o que foi alterado, quais funcionalidades existentes foram preservadas, verificações executadas, limitações e qualquer decisão ainda necessária.

Nunca registre credenciais, tokens, cookies, dados reais ou segredos em código, documentação, commits, capturas ou logs versionados.
