# Instrução para o Arena: preservar o sistema existente

Leia este documento e o [`AGENTS.md`](../AGENTS.md) antes de iniciar qualquer alteração. O proprietário pediu que o Arena **não altere nenhuma funcionalidade existente** ao fazer os próximos ajustes.

Isso significa manter as páginas, módulos, rotas, campos, papéis, permissões, operações, dados, contratos de API, integrações, navegação, configurações e resultados atuais. Faça somente a mudança expressamente solicitada e prefira uma implementação aditiva, compatível e pequena.

Não remova, substitua, desative, esconda, renomeie ou simplifique funcionalidades existentes, mesmo que pareçam duplicadas, antigas, pouco utilizadas ou inconvenientes para a implementação. Não execute refatoração ampla nem migração destrutiva como parte de uma melhoria pontual.

Se uma solicitação depender de alterar uma capacidade atual, pare antes dessa alteração e apresente ao proprietário: (1) a capacidade afetada; (2) por que o pedido entra em conflito com a preservação; e (3) a alternativa compatível. Só faça a mudança incompatível se o proprietário autorizar especificamente aquela alteração. Não presuma autorização pelo contexto, por silêncio ou pela recomendação de outro agente.

Antes de implementar, verifique a `main` mais recente, leia a documentação da área, consulte o estado do Git e registre o comportamento que precisa permanecer. Depois, valide os fluxos atingidos e reporte explicitamente o que foi preservado e o que não pôde ser validado. Nunca inclua credenciais ou dados reais no repositório.

## Texto curto para incluir nos pedidos ao Arena

> **Regra de preservação:** implemente somente o ajuste solicitado e de forma aditiva/compatível. Não remova, desative, substitua, oculte, renomeie ou altere nenhuma funcionalidade, rota, permissão, fluxo, dado ou contrato existente fora do escopo autorizado. Se o pedido exigir uma alteração incompatível, pare e peça minha aprovação explícita antes de fazê-la. Leia `AGENTS.md` e este documento antes de editar.
