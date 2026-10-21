# UX-PRO-09E PU4 — escopo e validação (antes)

**Base:** `origin/main` `fb174f93996944c0b11e64553b4dc81c64a90856`  
**Superfície:** somente o coletor `scripts/ux-evidence-capture.mjs`, no estágio opt-in `ux-pro-09e`, e seus testes/documentos próprios.  
**Objetivo:** medir texto visível em estados de rota realmente capturados para PU4, incluindo seletores hoje omitidos (`dt`, `span`, `footer`, `.field span`, `.hint`, `.error`), sem tratar falta de amostra como aprovação.

## Fronteira e riscos

- Não alterar componentes do produto, CSS, rotas, APIs, autenticação, permissões, banco, dados ou navegação.
- Não executar ações de escrita para produzir estados. Esta coleta observa somente páginas e estados que o plano 09E já monta.
- Evitar dupla contagem de texto em elementos aninhados: cada amostra deve apontar para nó/elemento textual folha apropriado e registrar rota, cenário, viewport/tema, texto limitado, cores, fundo resolvido e razão ou `null`.
- Fundo complexo, gradiente, transparência não resolvida ou elemento sem amostra permanece explicitamente indeterminado/não medido; nunca é aprovado por omissão.
- Preservar o formato e conteúdo dos estágios não relacionados. O comportamento ampliado fica restrito ao 09E e a diretório de evidência próprio.
- Evitar capturar dados reais: saídas sintéticas, limitadas e sem segredos; não versionar tokens/cookies.

## Validações planejadas

1. Registrar este escopo em commit isolado antes de editar coletor ou tela.
2. Escrever teste focal que falhe na `main` para a omissão das tags/classes e que exija semântica explícita para amostra ausente/indeterminada.
3. Executar a coleta 09E em browser/DB descartáveis, sem escrita de produto, confirmando metadados, contagens, estados e ausência de segredo; comparar resumos e hashes de etapas não 09E antes/depois.
4. Rodar teste focal, typecheck, suíte completa, build, QA estático e inventário/checks CI obrigatórios.
5. Inspecionar as amostras com viewport/tema/estado e registrar limitações. Automação não equivale a revisão manual ou aceite humano.

**Critério:** somente abrir PR se todos os gates obrigatórios estiverem verdes; não mesclar sem revisão concluída. Nenhuma alteração visual de produto é autorizada por esta fatia.
