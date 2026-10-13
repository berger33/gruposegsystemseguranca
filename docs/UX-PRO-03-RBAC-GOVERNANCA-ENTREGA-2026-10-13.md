# UX-PRO-03 — Governança de permissões (RBAC)

Data: 13/10/2026  
Base: `main` `80b3e57`  
Escopo desta PR: área “Papéis e permissões” do console TI, exclusivamente na apresentação e nos estados visíveis.

## Antes e depois

| Antes | Depois |
|---|---|
| O formulário expunha UUID, nomes de campos e escopos em inglês, sem indicar claramente como escolher o identificador nem quando ele é necessário. | Campos receberam rótulos, ajuda e validação do UUID no navegador. Unidade, conta e contrato pedem o identificador correspondente; a API continua sendo a autoridade final. |
| A lista era uma tabela sem carregamento/erro/vazio distintos, sem filtro e com cores fixas. | A lista tem estados separados, filtro local nos até 200 itens carregados, data `pt-BR`, contagem, tabela rolável, detalhe técnico recolhido e cores semânticas compatíveis com tema. |
| “Equipe” aparecia como opção aparentemente funcional; a implementação atual aceita o valor, mas `hasPermission` não avalia grants desse escopo. O texto também sugeria auditoria garantida. | A interface mantém a opção e explica que ela não concede acesso efetivo no avaliador atual. A nota agora diz que a API tenta gravar o evento de auditoria auxiliar; o handler atual não condiciona a operação ao sucesso dessa escrita. |

## Comportamento preservado

- Endpoints `/api/admin/permissions`, `/api/admin/permissions/:id` e `/api/admin/session`, métodos, nomes dos campos e payloads não mudaram.
- A lista continua limitada aos grants ativos conforme a API, que retorna até 200. O filtro só pesquisa os dados já carregados.
- Concessão e revogação continuam exigindo motivo; o servidor continua verificando permissão, validação de UUID, identidade ativa, escopo, invalidando sessões anteriores e executando as operações existentes.
- Nenhuma permissão, papel, bypass, rota ou regra de negócio foi adicionada/removida.

## Limites de governança encontrados

- `team` é um escopo aceito pela validação, mas não tem regra correspondente no avaliador atual de `hasPermission`; por isso, um grant com esse tipo não satisfaz a autorização atual.
- A gravação em `auth_access_audit` nas funções de concessão/revogação usa tratamento que ignora falha. A operação pode ser confirmada mesmo quando a escrita auxiliar do evento falha. Esta PR torna o limite explícito na interface; corrigir atomicidade do ledger requer uma etapa de segurança/backend separada, com gate de regressão.
- A tela não cria usuários e não busca identidades por e-mail. O operador precisa obter o UUID da conta por um fluxo autorizado já existente.
- A aprovação de acesso continua pertencendo ao backend; a opção de menu e a lista não são prova de acesso efetivo.

## Validação

- `node --test tests/ux-pro-03-rbac-ui.test.mjs` — 4/4 verificações de contrato de API preservado, escopo `team`, honestidade sobre auditoria e CSS responsivo/foco.
- `npm run typecheck` — aprovado.
- `npm run build` — aprovado; 105 páginas geradas.
- Desktop/mobile: regra CSS preserva tabela rolável e reorganiza campos e cabeçalho abaixo de 760px; revisão de código/CSS somente, sem captura visual autenticada.
- Teclado: elementos nativos, ordem DOM, rótulos persistentes, estado de erro com retry, `summary` e foco visível estão presentes; percurso manual completo não foi executado nesta sessão.
- A tela exige sessão com grant `admin.permissions.grant` para listar/conceder e `admin.permissions.revoke` para revogar. Sem uma sessão operacional disponível nesta sessão, não foi possível validar as interações autenticadas no navegador.

## Próxima etapa e limite

Esta PR cobre somente RBAC/governança dentro da UX-PRO-03. Permanecem as famílias de orçamento técnico, SEO, relatórios, retenção, catálogo, backup, auditoria, observabilidade, integrações, notificações e privacidade. A próxima família coerente é orçamento técnico e relatórios de uso/custo.
