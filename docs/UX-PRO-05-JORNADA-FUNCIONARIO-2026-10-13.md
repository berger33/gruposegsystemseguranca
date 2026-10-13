# UX-PRO-05 — Jornada e comprovantes do funcionário

**Base:** `main` `bb8a5dcde85f1279fcd5a76962fa76d9f7a05104` (13/10/2026).  
**Superfície desta PR:** `/funcionario` → aba `Jornada` → `EmployeeTimeClock`, já montado dentro de `JourneyTab`.  
**Fora desta PR:** `/admin/funcionarios`, análise de RH, escala, documentos, benefícios, treinamentos, folha e desligamento. Essas rotas/subfluxos existem e alguns já receberam auditoria própria; não se declara UX-PRO-05 concluída por esta fatia.

## Antes

- O componente de ponto estava montado no portal, mas os quatro tipos de marcação usavam estilos herdados com aparência igual de ação disponível/indisponível.
- Comprovante apresentava horário, localização, texto de endereço, ID e hash no mesmo bloco, sem distinção entre resumo que a pessoa precisa conferir e metadados técnicos.
- O texto genérico de endereço poderia ser interpretado como falha única, sem deixar claros os estados “não configurado”, “não consultado”, “indisponível” e “sem resultado”.
- Falha ao carregar o ponto limpava os dados e mostrava mensagem, mas os botões permaneciam montados e pareciam ações utilizáveis.
- O gate de portal exercitava sessão, isolamento, tema, teclado e responsividade, mas não criava ponto/ajuste para avaliar a tela real de comprovante.

## Depois

- A seção indica a próxima marcação; ações têm visual próprio, hover/foco e diferenciação para controles indisponíveis.
- O comprovante prioriza tipo/horário de servidor, localização/precisão e resultado da consulta opcional ao HERE. Endereço continua condicional e cada ausência tem estado explícito.
- ID e hash SHA-256 ficam em `<details>` recolhido, sem perder acesso por teclado.
- Pedidos de ajuste mostram estado, data de envio, motivo que o funcionário informou e eventual motivo de rejeição do RH, separando pedido de registro original e ajuste aprovado.
- Falha de leitura agora é alerta explícito com repetição; controles de marcação não aparecem sem resposta de dados. A marcação continua registrada apenas pelo servidor.
- O novo gate cria ponto e pedido de teste pela API de sessão do funcionário com dados inteiramente sintéticos; Chromium valida o componente montado.

## Preservações e escopo técnico

Nenhuma rota, payload, método, cabeçalho, sessão, papel, permissão, escopo, consentimento, idempotência, trilha de auditoria, dado canônico ou fila local foi alterada. O funcionário continua limitado aos próprios registros; RH conserva aprovação nos endpoints já existentes. Nenhuma migração foi criada. Os estados de endereço são apenas apresentação do status já devolvido pela API.

## Verificações e evidência

- **Inspeção estática:** rota, aba e componente montado conferidos em `EmployeePortal.tsx`; RH, jornada, ponto e permissões reconciliados com as rotas/API existentes. Inventário executado por `node scripts/ux-pro-00-inventory.mjs`: 100 rotas distintas, 54 com gate, 20 com captura visual; CSV e matriz atuais gerados em `docs/UX-PRO-00-*-2026-10-13.csv`.
- **Automatizado focal:** `node --test tests/employee-time-clock.focal.test.mjs tests/ux-portal-vocabulary.test.mjs` — 20/20; inclui fluxo SQL descartável, isolamento, idempotência, consentimento HERE, pedido/aprovação e estados de erro.
- **Automatizado de navegador:** `node scripts/qa-ux-portal-postgres.mjs` — 14/14 com migrações 001–180 em PostgreSQL descartável e Chromium real. Inclui componente `Jornada`, comprovante com hash recolhível, pedido de ajuste, falha de rede, foco, tema e viewport.
- **Automatizado geral:** `npm run typecheck` e `npm run build` aprovados; `git diff --check` aprovado. O build listou `/funcionario` entre as 105 páginas geradas.
- O gate registra capturas quando `UX_PORTAL_EVIDENCE_DIR` está definido. Esta execução não gravou PNGs versionados; as verificações de viewport/tema/foco foram asserts do DOM e CSS calculado no Chromium, não revisão humana das capturas.

## Limitações

- Não foi testada geolocalização física, permissão real do sistema operacional, HTTPS hospedado, disponibilidade externa do HERE ou recebimento de endereço via provedor; o banco de QA não configura credencial HERE. Os estados de indisponibilidade/resultado não comprovam operação externa.
- O navegador Chromium foi executado automatizado com massa sintética; isso não é validação manual por pessoa nem aceite de Marcelo, Andreia, RH ou funcionário.
- Esta PR cobre a apresentação da Jornada do funcionário, não a revisão ponta a ponta de todos os processos de RH listados no plano mestre. Os fluxos não visitados permanecem pendentes.
