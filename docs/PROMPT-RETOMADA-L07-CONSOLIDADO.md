# Retomada focada — L07 / correção aditiva de FIN-13

Trabalhe no repositório berger33/gruposegsystemseguranca usando GitHub e o ambiente remoto Arena. Não use a cópia desatualizada do computador do usuário. SMTP, hospedagem pública e transações externas reais continuam excluídos.

## Base obrigatória
1. Consulte main, PRs abertos e checks atuais. A auditoria usou fa893d6 (PR #64); o PR #65 estabiliza os gates e precisa estar integrado à base de trabalho. Não trate um SHA histórico como HEAD.
2. Leia README, instruções AGENTS se existirem, EXECUCAO-ENTREGA-LOCAL, CHECKLIST-ENTREGA-LOCAL, ESTADO-EXECUCAO-LOCAL e CONSOLIDACAO-L07-PRS-PENDENTES, todos sob docs quando aplicável.
3. Não refaça L04–L06. Preserve os cinco checks do PR #65. Confirme o baseline antes de alterar negócio.
4. Crie branch própria a partir da base atual. Não faça merge em massa de #47/#53/#59/#60/#62: são alternativas com colisão de migrações e contratos de API.

## Uma fatia: FIN-13
Reproduza por HTTP real + PostgreSQL descartável:
- orçamento aprovado alterado em premissas/números sem revogar aprovação;
- percentual de margem incompatível com receita/custo aceito em cenário;
- retry de criação sem chave própria;
- falha de leitura apresentada como lista vazia na UI.

Leia os handlers atuais e o schema completo antes de classificar o defeito. Se alguma condição já estiver corrigida em main, preserve-a e demonstre por teste. Use #62 e #60 como referência de jornadas e garantias, não como arquivos a sobrescrever. Regras adicionais de #59 (aprovação por pessoa distinta, mínimo de dois cenários) não estão automaticamente aprovadas como política empresarial.

## Implementação
- Mantenha uma rota canônica e um modelo de orçamento; hoje estão em fin-budget-api.mjs.
- Proteja orçamento aprovado: edição ordinária recusada; revisão explícita com motivo, autor e incremento de versão retira a aprovação e exige nova revisão/aprovação.
- Nenhum número/premissa de revisão pode continuar com aprovação antiga.
- Margem percentual calculada no servidor/banco a partir de receita e custo; com base insuficiente, valor ausente e motivo visível. Defina tratamento de receita zero sem inventar 0% ou infinito.
- Preserve valores já informados, mesmo em cenário incompleto; não apague receita conhecida porque falta custo.
- Histórico imutável de criação, revisão e decisão, com snapshots, ator real e motivo. Não preencher autoria antiga por suposição.
- Idempotência de criação por chave gerada no cliente e validada no servidor; retry concorrente não duplica. Reuso de chave com outro conteúdo deve ser recusado.
- UI com seleção por nome/protocolo, moeda adequada, revisão/aprovação/histórico navegáveis, erro explícito e confirmação somente após persistência.
- API decide papel/escopo; TI somente leitura onde essa é a regra existente. Toda escrita sensível + histórico + auditoria na mesma transação, com rollback em falha.
- Nenhuma aprovação gerencial cria conta a pagar, cobrança ou compromisso real.
- Não substituir 132 nem nenhuma migração 001–133. Confirme o próximo número livre (134 era candidato na auditoria). A migration nova deve tratar linhas antigas explicitamente, sem inventar evidência ou apagar dados.

## Verificação e entrega
Amplie o gate L07 com as negativas acima, revisão→nova aprovação, histórico intacto, cálculo conferido e jornada de navegador. Inclua erro de leitura e retry concorrente, além de anonimato, papel indevido e rollback de auditoria.
Execute typecheck, testes unitários, build, migrações com replay/checksum e L07 real. Preserve regressões L04/L05/L06 no CI, sem skips, aumento cego de timeout ou remoção de asserções.

Atualize os mesmos arquivos de controle e evidência, com commit e links dos checks. FIN-13 só recebe pronto_local quando todos os critérios forem demonstrados. Não marque L07 inteiro pronto.
Entregue PR revisável e próximo passo explícito. Não feche PRs de referência até registrar que as melhorias relevantes foram portadas ou rejeitadas com motivo.

Depois desta fatia, a sequência é: resíduos úteis de FIN-05/FIN-10; jornadas FIN-14..16 e integração financeira; ADM-01..12; fechamento L07. L08–L10 continuam pendentes.
