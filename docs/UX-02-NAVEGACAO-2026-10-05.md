# UX-02 — navegação administrativa por tarefa

**Base:** `main` `5979d86144dd11a4f09308602eb3d96669dabc80`, após UX-01. Esta fatia altera somente navegação e cópia da interface administrativa; sessões, APIs, permissões e dados continuam como antes.

## Antes e depois

Antes: 26 destinos no catálogo `ADMIN_MODULES`, até 25 para a conta admin demo, espalhados pela faixa superior e repetidos como cartões planos. No celular, a navegação tomava quase uma tela antes do conteúdo; ver [UX-00](UX-00-AUDITORIA-BASELINE-2026-10-05.md).

Depois: sete grupos por intenção, menu lateral com item ativo, busca apenas por **rótulos dos destinos já filtrados pelo papel**, breadcrumb e hub agrupado. No celular, o menu abre como painel, move foco para a busca, prende o Tab dentro dele, fecha por botão, fundo ou Escape e devolve foco ao botão Menu. A área principal não tem overflow em 390 px na prévia do hub. Capturas da prévia: [desktop](ux-02-evidencias/desktop-hub.png) e [mobile com menu aberto](ux-02-evidencias/mobile-hub.png).

## Contrato preservado

- `ADMIN_MODULES` e seus papéis foram mantidos; o agrupamento só reordena destinos. O teste `tests/admin-navigation.test.mjs` verifica os **26 destinos exatamente uma vez** e pesquisa apenas a lista recebida por papel. Destino novo eventualmente sem grupo aparece em “Outros módulos”, evitando sumiço silencioso até revisão.
- O menu permanece navegação visual, nunca autorização. Cada `AdminGate` e API continua decidindo acesso. A UX-00 mostrou a conta admin demo vendo RH no menu e recebendo `permission_scope_denied` na API; a experiência desse erro e as concessões reais exigem trabalho específico na UX-04.
- Rotas existentes fora do catálogo global (por exemplo `/admin/pendencias`, `/admin/continuidade` e rotas secundárias) não foram adicionadas automaticamente: seu papel, contexto e posição serão revisados antes de incluí-las, sem alargar o acesso.
- Busca não envia texto ao servidor, não consulta registros pessoais e não indexa conteúdo de outros papéis.
- `/admin/ti` continua protótipo declarado. A nova apresentação não o transforma em console operacional.

## Validação desta fatia

No Chrome/Playwright com sessão **fictícia servida só por rota temporária de prévia, apagada antes do commit**, foram verificados viewports 1440 e 390 px, 26 links incluindo Início para o papel admin da prévia, sete grupos, busca com resultado e vazio, foco inicial, Tab reverso, Escape/devolução de foco, item ativo e ausência de overflow no hub. Com papel RH fictício, o menu não expôs Marcelo e a rota direta exibiu estado de acesso restrito. Essa prévia não exercitou APIs do servidor customizado nem dados de negócio. O CI deve executar typecheck/build e o gate PostgreSQL/browser de entrada; o aceite de Marcelo/Andreia continua pendente.

## Próxima etapa

UX-03: corrigir o contraste e o estouro horizontal observados no CRM, separar tarefas de criação/importação/funil/consulta, remover códigos internos do texto de uso e provar os fluxos comerciais com dados fictícios. Uma PR por recorte coerente; nenhuma migração visual.
