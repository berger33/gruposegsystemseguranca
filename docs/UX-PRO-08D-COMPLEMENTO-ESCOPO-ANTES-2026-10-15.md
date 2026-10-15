# UX-PRO-08D — escopo antes do complemento após merge concorrente #247

## Reconciliação obrigatória, antes de reduzir a implementação

A sessão iniciou com árvore limpa, HEAD/origin/main `8dfbd7e451787dcf6f56e93b81d8e4edb26ceda5`; 08A/B/C estavam MERGED. Durante a coleta independente, outra sessão entregou a 08D: no fetch anterior à abertura de PR, a main avançou para **`3d807a420db6c63c3f754ae02144053e29da1469`**, merge da **#247**, confirmada MERGED, 6 checks SUCCESS. Nenhuma PR desta sessão havia sido aberta. Não reabrir #247 nem repetir seu trabalho.

A branch fixa desta sessão incorpora origin/main, preservando o escopo/relatório originais da #247, todos os seus testes e evidências. Os conflitos de resumos/inventário são resolvidos tomando a main como base, acrescentando só a medição faltante. O primeiro levantamento desta sessão permanece no histórico do commit `0beb1fc`; seu escopo foi escrito antes de código. Este documento registra o novo recorte antes de adaptar o coletor/teste ao complemento.

## Base real agora (resumo.json da #247)

| Pasta | PNGs/entradas | Dia | Noite | Teclado |
|---|---:|---|---|---|
| Conhecimento | 9 | 320/390/768/1440 + estados 08A | 768 staff | 390 |
| Assistentes | 29 | 320/390/768/1440 nas 3 rotas privadas + estados históricos/público | 768 Marcelo/RH | 390 nas 3 rotas |
| Aparência | 20 | 320/390/768/1440 no painel e recorte 08C | 768 staff | 390 no painel e prévias |

O registro 13 PNGs × 12 já foi reconciliado pela #247; não refazer. `/layout-preview` já foi normalizado no resumo, com `requestedRoute`; não reverter. Inventário agora credita 32 rotas (não as 27 da base inicial).

## Lacunas do complemento (namespace C, sem renumerar D1–D8 da #247)

- **08D-C1:** faltam capturas explícitas NOTURNAS em **320/390/1440** para `/admin/conhecimento`, `/admin/marcelo/assistente`, `/admin/rh/assistente`, `/admin/aparencia`. Acrescentar exatamente **12 PNGs**, mais traços de teclado e tema computado nas três pastas próprias. Não duplicar capturas dia ou noite768.
- **08D-C2:** detector novo desta sessão mede foco no próprio elemento e visibilidade integral; conservar limites de painel maior que viewport e foco no ancestral, sem declarar falso defeito de produto nem crédito indevido. A #247 já registra os percursos 390 por seu próprio critério; não apagar nem descreditar tais evidências.
- **08D-C3:** manter os resíduos já identificados pela #247 (D5 RAG, D6 aparência, D7 inline/público, D8 E6/E8/limites de prévias), apenas cruzar evidências adicionais; nenhuma correção de produto nesta PR de medição.

O cliente/prévias não recebem tema staff; cobertura existente é preservada. As 64 capturas independentes desta sessão foram feitas sobre 8dfbd7e; não houve alteração em `src/`, `server.mjs` ou migrações na #247, portanto o código de produto capturado é idêntico. Reutilizar só as 12 capturas do recorte, registrando a proveniência real (base de captura 8dfbd7e, reconciliação 3d807a4), não fingir que foram capturadas depois do merge. As demais capturas não serão publicadas na PR duplicando a entrega concorrente.

## Ritual e limites

Uma única PR desta sessão, de **complemento de matriz 08D**, não reabertura da #247; medir primeiro, código de produto intocado. Revalidar unitários/typecheck e gates `ux-knowledge`, `ai-rag-widget`, `ext08`, `ext12-visual`, `site-appearance` na main incorporada; preservar o inventário e regenerar se necessário. Adaptar só contagens dos testes de evidência da #247, sem reduzir suas asserções. Checks remotos verdes antes do merge, sem bypass; confirmar SHA final na main.

APIs, papéis/grants, dados, sessão, publicação, auditoria, contratos e 001–180 preservados. E2–E9/C11 fora de escopo. Sem credenciais em arquivos/logs/capturas. Homologação/produção **NO-GO**, sem aceite humano.
