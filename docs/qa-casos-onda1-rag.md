# Fase 2 — Onda 1: RAG-SEG-001 (autorização de escopos e fontes)

Data: 2026-09-28. Plano aprovado em [Plano Mestre](plano-mestre-testes.md). Bloco `CONTINUAR` seguinte à [Onda 0](qa-casos-onda0.md). Branch fixa `arena/01a0e96a-gruposegsystemseguranca` @ base `5b4b200`. Massa **sintética**, sem banco externo, SMTP, Ollama, túnel público, push ou deploy.

| Campo | Especificação / decisão |
|---|---|
| ID, módulo, risco e prioridade | `RAG-SEG-001` / AI RAG e bot / fuga de fontes e histórico entre perfis / **P0**; defeito `RAG-DEF-001`. |
| Pré-condições | Checkout íntegro (`PLT-SMK-001` local passou), `npm ci`, build beta local, PGlite **novo em `/tmp` por execução**, `QA_PGLITE_ONLY=true`, `OLLAMA_ENABLED=false`, token/sessão TI exclusivamente sintéticos. Nenhuma API externa. |
| Dados | Perguntas genéricas sem PII; chaves `cliente`, `rh`, `marcelo`, `publico`; documento de rascunho com marcador QA inventado; protocolo público real da execução e protocolo RH sintético. |
| Aceite mínimo | Público `POST /api/ai/rag` e `POST /api/ai/bot` aceitam **somente `publico`**; os 3 escopos privados são negados (403) antes de consultar DB; GET público de histórico não expõe perguntas/sessões; alias de admin exige sessão e papel admin/ti; cliente nega **até TI** sem vínculo tenant; índice/documento não aprovado/publicado não entra nas fontes; feedback não associa protocolo inventado ou RH ao público; público continua operando. |
| Limites | Diagnóstico RH/Marcelo por TI **não prova** autorização para usuário RH/Marcelo. Não existe índice com `tenant_id`/vínculo de cliente validado. PGlite não equivale a PostgreSQL; Ollama desativado; histórico de bases beta antigas não revisado. Caso **não homologado integralmente** antes dos testes com usuários/tenants reais em E2 isolado. |

## Passos e rastreio

1. `RAG-SEG-001.A`: com mock de pool que acusa qualquer acesso, testar GET público em 3 aliases RAG e 3 aliases bot; POST com cada escopo privado em cada alias. Esperado 403 e **0 chamadas ao pool**. Testar aliases de histórico administrativo sem sessão (401) e papel RH não autorizado (401). Ferramenta: `node --test tests/ai-rag-public-scope.test.mjs`.
2. `RAG-SEG-001.B`: no servidor local, repetir POST anônimos RAG/bot para os três escopos, GET das listagens; depois fazer login TI QA com token QA sintético e comprovar que cliente também recebe 403 no caminho admin. Diagnósticos RH/Marcelo só nas rotas administrativas com sessão TI (201). Ferramenta: `npm run test:rag` e fetch loopback.
3. `RAG-SEG-001.C`: criar via API TI um documento `publico` de rascunho com palavra marcadora sintética, verificar `is_approved=false`, `is_published=false`, perguntar a RAG e bot públicos pela palavra; resposta e `sources` não a contêm. Verificar feedback: protocolo público válido 201; inventado e RH disfarçado de público 404; RH direto em rota pública 403. Ferramenta: mesmo script RAG.
4. `RAG-SEG-001.D`: UI: em páginas dos três assistentes privados renderizar aviso "indisponível nesta versão", sem campo de envio; noindex no beta. TI usa endpoint admin para diagnóstico de RH/Marcelo, cliente continua bloqueado. Typecheck, build, smoke HTTP loopback. Não chamar páginas privadas "homologadas".
5. `RAG-SEG-001.E` (futuro **BLOQUEADO**): autenticar conta cliente A/B contra cadastro e grant no PostgreSQL QA, negar IDOR, revogação e erro de DB (`TENANT-SEG-001/002`); validar RBAC real RH/Marcelo, aprovação auditada, conteúdo de legados beta, PG, Ollama e homologação humana. Somente ambiente controlado autorizado.

## Execução desta onda

| Item | Resultado / evidência | Estado |
|---|---|---|
| Antes do patch, `RAG-SEG-001.A` | `node --test ...`: **1/27 pass; 26/27 fail** (incluiu tentativas de consultar banco antes de negar). A Onda 0 registrara HTTP 201 nos três escopos sem sessão. | **FALHOU** histórico, `RAG-DEF-001` confirmado. |
| Após reparo, `RAG-SEG-001.A` | `npm test`: **75 pass, 0 fail, 0 skip**, incluindo **29 contratos** de autorização/escopo (contagem total unitária antes: 46). | **PASSOU local**. |
| `RAG-SEG-001.B/C` | `npm run test:rag`: exit 0; 6 POST privados 403, GET histórico 403/401, cliente TI 403, TI RH/Marcelo 201, rascunho não divulgado nas duas respostas, feedback restrito; 14/14 entradas custo no servidor QA, `real_count=0`. | **PASSOU em PGlite sintético**, não PG/roles finais. |
| `RAG-SEG-001.D` | `npm run typecheck` exit 0, build beta exit 0 **66/66** páginas; smoke local três páginas assistente HTTP 200 com aviso + noindex e 6 POST privados/3 GET histórico negados. Processo encerrado. `node scripts/qa-wave0-static.mjs` 5/5; `npm audit --audit-level=high` 0 vulnerabilidades reportadas; `git diff --check` limpo. | **PASSOU no recorte local**. |
| `RAG-SEG-001.E` | Não houve contas A/B reais, PG QA, Ollama, revisão de acervo legado, teste de papel final nem aprovação humana. | **BLOQUEADO**; caso geral **PARCIAL**, release **NO-GO**. |

### Reparo e efeito colateral conhecido

- Em `src/server/ai-rag-api.mjs`, aliases públicos agora são listas exatas (não `startsWith`), GET público de históricos negado, POST privado negado, cliente negado inclusive admin/ti sem tenant. Alias admin usa sessão/role, e feedback valida protocolo/escopo antes de inserir. Fontes de RAG/bot exigem `d.is_approved=true AND d.is_published=true` **inclusive no JOIN de chunks** e índice aprovado/publicado.
- Em `db/beta-pglite-init.sql`, defaults de **novos** índices/documentos deixam de ser aprovados/publicados; a API fixa `false,false` explicitamente ao criar para proteger inclusive bancos beta antigos com default inseguro. Seeds de QA têm publicação explícita. **Não houve alteração de dados existentes**; documentos legados marcados como publicados inadvertidamente requerem revisão segura antes de qualquer exposição pública.
- `src/components/*Widget.tsx` exibe bloqueio para uso privado; páginas privadas passam a chamar seus critérios de pendentes. Diagnóstico TI agora usa os aliases administrativos. O cliente perde temporariamente o chatbot privado, **intencionalmente**, até implementação de vínculo tenant no servidor; não existe substituição por simulação declarada real.

**Defeito `RAG-DEF-001`:** exposição anônima e GET de históricos mitigados localmente; **não encerrar** sem revalidação em E2/CI e revisão de conteúdo legado. Encaminhamento `TENANT-SEG-002` foi [executado com mocks e documentado](qa-casos-onda2-tenant.md); próximo teste A/B `TENANT-SEG-001` continua dependente de PostgreSQL QA isolado. Sem release/push/merge/produção.
