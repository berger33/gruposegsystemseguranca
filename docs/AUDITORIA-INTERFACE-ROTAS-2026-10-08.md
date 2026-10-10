# Auditoria de interface e legibilidade — 08/10/2026

> **Reconciliação de 10/10/2026 (UX-PRO-00):** registro histórico — preserva a contagem e os limites da sua data. A fonte vigente do inventário de rotas e da cobertura é [UX-PRO-00-RECONCILIACAO-COBERTURA-2026-10-10.md](UX-PRO-00-RECONCILIACAO-COBERTURA-2026-10-10.md): **100 entradas de rota** na `main` `c50a99beec…`, com critério reproduzível (`node scripts/ux-pro-00-inventory.mjs`) e a reconciliação 98 × 100.

## Resultado e escopo

Foi feita uma auditoria estática do código de rotas e superfícies visuais e uma revisão manual focal da área administrativa, com atenção a CRM, filtros, seletores e tabelas no desktop e em viewport estreita. A interface administrativa recebeu uma camada visual compartilhada para RH, TI e Marcelo; o site público não foi alterado pela tipografia/tabelas globais.

A listagem completa está em [AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv](AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv). Ela registra 100 arquivos de entrada `page.*`, contagens locais de controles, labels, `aria-label`, placeholders e marcação de tabelas. São ocorrências de código, não uma contagem de campos efetivamente renderizados: componentes compartilhados, conteúdo condicional e campos criados dinamicamente podem não estar atribuídos à rota correta.

## Ajustes aplicados

- Fonte de interface unificada em pilha legível (DM Sans/Segoe UI/sistema), com hierarquia de títulos Manrope e espaçamento de leitura consistente.
- Formulários administrativos padronizados para herdar a fonte e manter tamanho confortável.
- Tabelas com superfície, cabeçalho distinto, alinhamento numérico, espaçamento, bordas, linhas alternadas e destaque ao passar o cursor.
- Tabelas em telas estreitas rolam dentro de um único contêiner, sem criar uma segunda barra horizontal quando já existe um wrapper.
- Listas sem classe visual recebem limites e espaçamento para separar registros; listas com componente próprio preservam seus padrões.
- Chamadas de formatação de data/hora sem idioma explícito em `src/app` e `src/components` foram substituídas por `pt-BR`.
- Opções de função e origem no CRM exibem nomes em português, preservando os códigos canônicos enviados à API.
- Fallback patrimonial `N/A` foi trocado por “Não informada”.

## Evidências e validações

A validação automatizada `tests/ui-surface-locale.test.mjs` varre as superfícies para impedir chamadas `toLocaleString()` sem idioma. O inventário pode ser regenerado com `node scripts/audit-ui-inventory.mjs`.

Na revisão visual manual, a área de CRM foi inspecionada com registros fictícios em viewport estreita; foram conferidos o cabeçalho, leitura das linhas, rolagem horizontal e rótulos traduzidos das opções de contato. O painel administrativo permanece escopado pelo atributo `data-admin-theme-scope`, e o seletor de modo escuro usa os mesmos tokens.

## Limites conhecidos / próxima rodada

Esta entrega não certifica visualmente e por interação manual cada uma das 100 rotas, cada permissão, todos os estados vazios/erro/carregamento, acessibilidade com leitor de tela, nem todos os tamanhos entre 320 e 1920 px. A verificação manual focal não substitui uma rodada completa de aceitação por papel.

Há interfaces antigas de TI com texto técnico, nomes de campos da API e instruções operacionais em inglês ou em formato de código. O ajuste `pt-BR` desta entrega corrige datas e horários, mas não traduz indiscriminadamente identificadores técnicos, contratos de API, payloads, logs, códigos ou mensagens de integrações. Devem ser revisados por módulo e traduzidos apenas quando forem rótulos destinados ao usuário.

Para concluir a auditoria integral reivindicada pelo produto, a próxima etapa recomendada é uma passagem roteirizada por cada papel (Marcelo, RH e TI), exercitando criação/edição, validação, permissões, erros, vazio, carregamento, teclado e mobile, registrando screenshots/evidências por rota. Nenhuma falha de autenticação ou regra de autorização foi flexibilizada nesta rodada.

### Resultado desta execução (08/10/2026)

- `npm run typecheck`: aprovado (executado pelo build de produção).
- `npm run build` com `NEXT_DIST_DIR=.next-audit`: concluído com código 0; compilação e verificação TypeScript aprovadas, 105 rotas estáticas geradas e rotas dinâmicas enumeradas.
- Testes focados de localidade e painel Marcelo: 17 aprovados após a correção do rótulo do requisito.
- `npm run test:unit`: 863 aprovados e 3 falharam. As três falhas são criação de symlink bloqueada pelo Windows (`EPERM`) em `qa-backup-coverage-inventory`, `qa-cli-v2-local-provider` e `qa-cli-v2-transfer`; não falharam superfícies desta alteração.
- Healthcheck da demonstração local e através do túnel: saudável/HTTP 200. A página pública e a entrada da equipe responderam; `GET /api/admin/session` anônimo respondeu HTTP 401 (`admin_session_required`).
- `git diff --check`: aprovado antes da publicação.
