# UX-PRO-E2 — formulários acessíveis no legado operacional

**Data:** 19/10/2026  
**Base verificada:** `origin/main` = `dd9a4befc3fd8ec9ebdcc3823af3bdc3eb882e95` (merge da PR #270); nenhuma PR aberta.  
**Autorização:** proprietário solicitou iniciar a implementação da UX-PRO-E2.

## Defeito reproduzido no código-base

As seis abas avançadas de `/admin/operacao` montam `OpsAdvanced2Client.tsx` e `OpsAdvanced3Client.tsx`. Onze ações operacionais dependem de 13 chamadas ao diálogo bloqueante nativo `prompt()`. Esses diálogos não expõem rótulos persistentes, ajuda contextual, validação no próprio fluxo, estado de envio, erro junto ao campo/formulário nem uma experiência consistente de foco e cancelamento.

Ocorrências antes da mudança:

- `OpsAdvanced2Client.tsx`: 8 chamadas em verificação de visita, plano e ponto, e revisão/aprovação de relatório;
- `OpsAdvanced3Client.tsx`: 5 chamadas em revisão/publicação de proposta e reconhecimento/tratamento/encerramento de evento.

## Escopo

1. Substituir apenas essas 13 entradas por um diálogo compartilhado controlado, com campos rotulados, descrição da decisão, obrigatoriedade explícita, erro anunciado, estado ocupado, cancelamento e foco inicial.
2. Preservar integralmente URLs, métodos HTTP, payloads, estados de domínio, mensagens de sucesso e recargas já existentes.
3. Preservar os avisos de decisão humana, privacidade, conflitos e natureza sintética dos eventos.
4. Usar tokens administrativos existentes para dia/noite e alvos mínimos de 44 px.
5. Adicionar contrato automatizado focal que impeça o retorno de `prompt()`/`confirm()` nesses componentes e confira a montagem do diálogo nas onze ações.

## Fora do escopo

Não redesenhar as seis abas, não corrigir os demais campos legados sem `<label>`, não alterar servidor, banco, RBAC, autenticação, auditoria, contratos de API ou dados. Esta fatia não declara conformidade WCAG, teste com leitor de tela, homologação humana ou prontidão de produção.

## Gates planejados

- teste focal UX-PRO-E2;
- `npm run typecheck`;
- `node scripts/qa-wave0-static.mjs`;
- `node scripts/ux-pro-00-inventory.mjs --check`;
- regressões E5/E6;
- `npm run build` e `git diff --check`.
