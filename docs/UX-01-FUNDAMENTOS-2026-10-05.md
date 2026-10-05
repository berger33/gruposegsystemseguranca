# UX-01 — fundamentos visuais e componentes iniciais

**Base:** `main` após UX-00, commit `653c14ffc089055ca17f27390b3fa26563d90f6e`. Esta fatia prepara dois componentes compartilhados e não reorganiza menu, permissões ou APIs. UX-02 fará a navegação agrupada.

## Entrega

- `src/styles/ux-tokens.css` define nomes semânticos para superfície, texto, marca, borda, foco, erro, espaçamento, raio e sombra. Os tokens são importados no layout raiz. Os temas públicos existentes permanecem com suas variáveis próprias até uma migração por jornada; isto evita uma troca global não revisada.
- `UiField` associa rótulo persistente e `id`, aceita dica e erro conectados por `aria-describedby`, define `aria-invalid` quando há erro e tem foco visível. Foi aplicado aos campos de e-mail e senha do login staff sem modificar submissão, sessão, MFA ou bootstrap.
- `UiCardLink` oferece título, descrição, affordance de navegação e foco visível; substitui os cartões de módulo no hub administrativo, preservando URLs e filtragem por papel.

## Guia inicial de uso e linguagem

| Elemento | Regra | Estado coberto agora |
|---|---|---|
| Campo | rótulo sempre visível; dica antes do campo quando necessária; erro específico junto ao campo; não depender de placeholder | base, hover, foco, inválido, dica e erro |
| Link de destino | título curto que nomeia a tarefa; descrição de uma frase; URL permitida pelo envelope visual, com autorização real na API | base, hover, foco, redução de movimento |
| Cor | texto/superfície por significado; foco amarelo distinto; erro com texto além de cor | tokens semânticos; contraste global ainda requer auditoria por tela |
| Cópia | português simples; verbos de ação; evitar siglas internas em títulos; distinguir “prévia” de função operacional | aplicado aos novos componentes; revisão ampla nas próximas etapas |

Não usar `UiCardLink` como controle de permissão: `AdminGate` filtra a navegação e o servidor continua decidindo acesso. Não propagar tokens a CRM/RH por substituição global; há contraste e layout quebrados que requerem correção contextual nas UX-03/04.

## Evidência e limites

Prévia **temporária**, excluída do repositório após a verificação, mostrou os dois componentes em 1440 e 390 px: [desktop](ux-01-evidencias/desktop-componentes.png), [mobile](ux-01-evidencias/mobile-componentes.png). O login staff real renderizado no Next dev isolado mostrou os campos novos: [desktop](ux-01-evidencias/desktop-login.png), [mobile](ux-01-evidencias/mobile-login.png). Com Playwright + Chrome local, em ambos os viewports, o campo foi encontrado pelo rótulo, recebeu digitação, Tab levou ao link, o foco ficou visível e não houve overflow na prévia. A API customizada não foi iniciada nessa prévia; por isso **não** se declara login ou hub autenticado aprovados por ela. A CI deve executar o build e os gates antes do merge.

## Critério para UX-02

Partir da main reconciliada. O menu de 26 destinos deve virar grupos com navegação por papel, foco/teclado e mobile; preservar todas as URLs e guards. A busca inicial pode indexar apenas os rótulos dos destinos do papel. Não mostrar acesso a dados por inferência visual: a UX-00 constatou que a conta admin demo via RH na navegação, mas recebeu `permission_scope_denied` na API.
