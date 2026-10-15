# UX-PRO-08D — escopo antes (15/10/2026)

## Base e reconciliação, antes de código

`git fetch origin main`: HEAD e origin/main = `8dfbd7e451787dcf6f56e93b81d8e4edb26ceda5`; árvore limpa na branch da sessão `arena/d0fb38de-gruposegsystemseguranca`.

GitHub reconfirmado: #244 MERGED (`ab39b6dc8d6e7a4fb85b4d9d18c7330eae23ec5a`, 11 checks SUCCESS), #245 MERGED (`5a02f0e1149b0afa8c5c147849e9a2928ffdc280`, 12 SUCCESS), #246 MERGED (base acima, 41 SUCCESS). Não reabrir. #230 CLOSED; única PR aberta: #234, datas do financeiro, CONFLICTING, 43 checks SUCCESS; não pertence a esta fatia e não será alterada. Os status antigos do cronograma não são o estado vigente.

Lidos AGENTS, README, regra de preservação, plano mestre, cronograma §2 e relatório 08C; também os registros de auditoria e fechamento referenciados pelo plano.

## Cobertura real dos resumo.json e arquivos existentes

| Superfície | 320 | 390 | 768 | 1440 | Dia/noite explícitos | Teclado registrado |
|---|---|---|---|---|---|---|
| Conhecimento: `ux-pro-08-conhecimento-evidencias` | — | — | — | 3 PNGs de estados 08A | não | resumo remete ao gate (390 + setas); não há percurso no JSON |
| Conhecimento histórico: `ux-07-conhecimento-evidencias` | — | 1 PNG | — | 1 PNG | não | primeiro Tab nas duas larguras |
| Assistentes: `ux-pro-08-assistentes-evidencias` | — | cliente/público: 2 PNGs | — | 10 PNGs, estados Marcelo/RH e teclado | não | 1 PNG de foco; JSON não discrimina rota/largura/tema nem percurso |
| Aparência/prévias: `ux-pro-08-aparencia-evidencias` | 4 PNGs | 4 PNGs | 4 PNGs | 4 PNGs | não há campo de tema (não creditar noite por suposição) | primeiro Tab de cada captura, não percurso |

Aparência cobre `/admin/aparencia`, `/layout-preview?visual=03`, `/layout-03`, fallback `?visual=99`; não representa revisão visual integral dos dez layouts. Em 320 o resumo registra ERR_ABORTED do iframe; recursos externos de fonte bloqueados são limitação declarada.

## Lacunas numeradas e destino

- **D1 — matriz conhecimento incompleta:** completar 4 larguras × claro/escuro, com vazio canônico concluído e percurso de teclado; preservar capturas de estados 08A.
- **D2 — matriz assistentes incompleta:** completar Marcelo, RH e cliente nas 4 larguras × claro/escuro; pergunta e estado sem fonte pela API real, sem modelo ou resposta inventada. Público permanece evidência histórica, não alterar site nesta fatia.
- **D3 — contagem 08B incorreta:** texto diz 13 PNGs, diretório contém exatamente 12. Reconciliar explicitamente a contagem histórica e listar arquivos; não inventar um 13º.
- **D4 — tema e teclado aparência não medidos por completo:** complementar as mesmas quatro rotas da 08C nas 4 larguras × claro/escuro com percurso. Não publicar; prévias públicas podem não consumir tema sistêmico, registrar o resultado, não aplicar tema por cosmética.
- **D5 — captura 08C com iframe abortado:** medir novamente e distinguir interrupção de captura de defeito reproduzível; não descartar o registro histórico.
- **D6 — inventário pode não creditar novas capturas:** usar `entries` com route/viewport/screenshot nos resumos por superfície e regenerar pelo gerador existente, sem ampliar seu critério de cobertura.

Cada novo resíduo observado receberá D7 em diante no relatório de fechamento. Esta PR será exclusivamente medição/instrumentação/documentação; defeitos de produto reproduzidos serão pendências com superfície e reprodução para PR própria, não um pacote de correções.

## Contratos e validação

Intocados `/admin/conhecimento`, páginas assistentes, RagWidget, SitePreviewNotice/noindex/selo 08C, publicação de aparência (concessão, motivo, confirmação, expectedVisual, auditoria), AdminGate/papéis, ClientSpaceProvider/vínculos, `/api/ai/answer`, `/api/admin/ai-rag-*`, EXT-08, migrações 001–180 e dados operacionais. Instrumentar apenas scripts de captura e testes da evidência. Sessões reais e dados sintéticos em PostgreSQL descartável; nenhum segredo/cookie/senha em JSON, PNG ou log versionado.

Executar `npm test`, typecheck, `test:ux-knowledge:pg`, `test:ai-rag-widget:pg`, `test:ext08-knowledge:pg`, `test:ext12-visual:pg`, `site-appearance.focal`, inventário UX-PRO-00 e teste de consistência da nova matriz. Abrir uma PR, aguardar checks obrigatórios verdes e só então mergear, confirmando SHA remoto.

Sem homologação/aceite humano/WCAG integral. E2–E9 e C11 fora de escopo. Homologação e produção **NO-GO**.
