# UX-PRO-09E PU6 — medir prévia montada de Layout 09 (escopo antes)

**Data:** 21/10/2026  
**Base:** `main` `acb4d7f3dfa3cb14eb214821fc6a4357b7e0dbe6` (PRs #284 e #285 integradas)  
**Superfície:** componente `Layout09` efetivamente montado em `/layout-preview?visual=09`, incluindo a prévia real em `iframe` da galeria `/admin/aparencia` quando for possível exercer essa rota com identidade sintética autorizada.  
**Alvo histórico a reavaliar:** rótulos da progressão em `src/components/Layout09.module.css` (`.progressStep`, linha 64 na base), citados em `UX-PRO-09E-PROMPT-PROXIMA-SUBFATIA-2026-10-16.md` com contraste de 2,36:1. Essa medição antiga, isolada, não confirma que o defeito persiste no componente montado.

## Objetivo e antes

Reproduzir a prévia atual em Chromium, identificar os nós e estados realmente renderizados, medir texto/fundo resolvidos nos rótulos das três etapas (`ESPAÇO`, `INTERESSES`, `CONTATO`) em todos os estados exercitáveis e larguras representativas, e somente propor correção aditiva se a razão insuficiente se repetir em texto que exige o critério aplicável. A amostra histórica de 2,36:1 em `.progressStep` é o “antes” documental; o “antes” automatizado desta base será produzido após este escopo ser commitado.

## Riscos e limites

- **Classificar um sinal errado:** medir cada rótulo visível separadamente, sem texto concatenado com números/ícones; registrar tamanho, peso, foreground, fundo resolvido, viewport, etapa e SHA da captura. Fundo não resolvido e ausência de amostra significam `não medido`, nunca aprovado.
- **Alteração ampla ou involuntária:** se reproduzido, limitar produto a `Layout09.module.css` e somente à regra dos rótulos afetados; não tocar nos outros layouts, no tema global nem em `SiteVisualRenderer.module.css`.
- **Comportamento do briefing:** não submeter formulário, abrir WhatsApp, publicar layout, gravar configuração ou acionar API de negócio. Avanço de etapa usa conteúdo sintético local e não salva dados.
- **Autorização e isolamento:** `/layout-preview` é uma prévia explícita e não grava publicação. `/admin/aparencia` só será exercida se o harness de teste fornecer perfil sintético documentado; não reutilizar sessão/cookies pessoais nem alterar grants. Se não houver perfil, relatar inspeção direta da prévia e deixar galeria autenticada não verificada.
- **Arquivos gerados:** capturas/resumos ficam em diretório dedicado PU6; confirmar que não contêm nomes, contatos, tokens, cookies ou dados reais. Não regenerar matriz/inventário, pois nenhuma rota ou cobertura será adicionada sem justificativa.
- **Evidência sintética:** seleções de espaço/serviço e contato serão fictícios; a evidência demonstra renderização automatizada e não representa aceite de Marcelo ou do usuário.

## Plano de validação

1. Commitar este escopo isoladamente antes de tocar na captura, teste focal ou CSS.
2. Inspecionar rota direta e, se a identidade sintética existente permitir, a rota `/admin/aparencia` com `visual=09` selecionado; coletar `320`, `390`, `768` e `1440` px em claro e escuro, anotando o ambiente real.
3. Exercitar os três estados do briefing por interações locais sem envio e medir os rótulos montados em cada estado. Preservar evidência de “antes” (PNG, DOM/estilos computados, valores e hashes).
4. Se todos os estados relevantes passarem o critério aplicável ou o sinal histórico não se reproduzir, não alterar CSS; registrar a ausência de reprodução e encerrar como medição. Se um defeito atual se reproduzir, escrever primeiro o teste focal RED na regra/renderização pertinente, executá-lo na base para demonstrar o defeito, e só então aplicar a correção mínima e aditiva.
5. Após qualquer mudança: executar teste focal, `npm run typecheck`, `npm test`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `git diff --check` e os checks obrigatórios da PR. Preservar `next-env.d.ts` e `tsconfig.json`; não contornar falhas EPERM.
6. Registrar resultado, comparativo antes/depois, limitações por evidência (estática, automatizada, visual manual e aceite humano) e decisões ainda abertas. Capturas automatizadas não são inspeção manual nem aceite humano.

## Fora de escopo e preservações

Não implementar PU4, 09E-7, ID3 nem resíduos UX-PRO-03/04/05/06 nesta PR. Não mudar conteúdo, contraste de outros elementos, tamanho/posição da progressão, fluxo de etapas, campos, validações, links, navegação, APIs, autenticação, permissões, isolamento, auditoria, dados ou funcionamento local. Se PU6 não reproduzir o defeito, encerrar sem alteração de produto e não ampliar a coleta para as 14 rotas públicas.
