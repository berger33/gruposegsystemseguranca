# Cronograma completo — o que falta (UX-PRO-07 a 10, sistema além de UX e homologação)

**Data:** 15/10/2026 · **Base conferida:** `main`/`origin/main` = `12fe34e` (merge da PR #233, UX-PRO-07E-2), árvore limpa.
**Regra do plano mestre:** 1 fatia pequena = 1 sessão = 1 PR; merge só com todos os checks verdes. Nada aqui é aceite humano nem declara conformidade WCAG.

---

## 1. UX-PRO-07 — Operação, contratos, finanças e conformidade (EM ANDAMENTO)

### 1.1 Já entregue e mergeado (não refazer)

| Subfatia | Rota | PRs |
|---|---|---|
| 07A | `/admin/patrimonio` — leitura honesta das 6 abas | #222 |
| 07B-1 + 07B-2 (+follow-up B16/B17) | `/admin/emergencial` — leitura + 5 escritas canônicas EXT-15 | #223, #224, #225 |
| 07C-1 + 07C-2 | `/admin/fornecedores` — leituras + escritas | #226, #227 |
| 07D-1 + 07D-2 | `/admin/operacao` — leitura canônica + ciência de escala | #229, #231 |
| 07E-1 + 07E-2 | `/admin/financeiro` — 2xx sem lista canônica (5 + 8 superfícies) | #232, #233 |

### 1.2 O que falta da UX-PRO-07 (ordem do mapa fatiado de 14/10)

| # | Subfatia | Rota | Escopo previsível (padrão 07A–07E) | Sessões/PRs estimadas |
|---|---|---|---|---|
| 1 | **07F** (próxima) | `/admin/frota` (1.274 linhas) | Auditoria "antes" + estados honestos de leitura (ainda não lido/carregando/vazio concluído/falha inicial/401-403 fail-closed/2xx inválido ≠ vazio/dado preservado com hora), teclado, dia/noite, 320/390/768/1440, gate focal novo (PostgreSQL+HTTP+Chromium), preservação do gate `ux-fleet` e EXT-01 | 1–2 (leitura; escrita só se defeito demonstrado) |
| 2 | **07G** | `/admin/terceiros` (1.277 linhas) | Idem; preservar EXT-02 (janela/escopo de acesso, grants) e declaração de fronteira "sem ator externo autenticado" | 1–2 |
| 3 | **07H** | `/admin/licitacoes` (979 linhas) | Idem; preservar EXT-03 e a condição `market_relevance: indicada_nao_confirmada` | 1–2 |
| 4 | **07I** | `/admin/qualidade` (1.363 linhas) | Idem; preservar EXT-05 (incl. escopo por conta da migração 172) | 1–2 |
| 5 | **07J** | `/admin/satisfacao` (1.067 linhas) | Idem; preservar EXT-06 e o portal do cliente já tratado à parte | 1–2 |
| 6 | **07K** | `/admin/compliance` (1.609 linhas; inclui documentos/obrigações) | Idem; preservar EXT-07 (agendador 3600s, planos de ação migração 168) | 1–2 |
| 7 | **07L** | `/admin/continuidade` | Idem; preservar EXT-10 (isolamento `client_account_id`) e não misturar `/cliente/app/continuidade` | 1–2 |
| 8 | **07M** | `/admin/contratos` + `/admin/contratos/[id]` | **Só auditoria de preservação primeiro** (rotas já tratadas na UX-PRO-06, PRs #216/#217); só abrir PR de código se lacuna UX-PRO-07 for reproduzida | 0–1 |
| 9 | **Resíduos transversais E2–E9** (exigem decisão explícita do proprietário, por item) | `/admin/operacao`, `/admin/financeiro`, compartilhados | E2 legado avançado (`OpsAdvanced2/3Client`: `prompt()/confirm`, sem rótulos); E3 datas/horas `timestamptz` fatiadas sem fuso (7 ocorrências, fixadas por teste L06); E5 rolagem interna de tabela sem região focável (390/320px); E6 `<main>` aninhado transversal — 19 rotas (`AdminGate.tsx:115`); E8 contraste noturno 1,95:1 da aba ativa (`.tabActive`/`.actions .primary` compartilhados); E9 quebra de palavra em cabeçalhos a 768px (`UiWorkspace.module.css:11`) | 3–5 (1 PR por item/grupo) |
| 10 | **C11 + resíduos registrados** | financeiro | C11 fora de escopo (só por ordem expressa); alvo de toque de 29px do botão de repetir legado (observação 07E-2); 2 hits auditados e não corrigidos com justificativa (`FiscalWorkspace.tsx:80`, `ExpenseWorkspace.tsx:176`) | sob decisão |
| 11 | **Limpeza de governança** | GitHub | PR **#230 aberta em CONFLICTING** — duplicata da 07D-1 já mergeada na #229: fechar como duplicada ou reaproveitar; nunca mergear como está | 1 ação |

**Subtotal UX-PRO-07 restante: ~12–19 sessões/PRs** (depende de cada rota precisar ou não de subfatia de escrita, como ocorreu em 07B/07C/07D).

---

## 2. UX-PRO-08 — Conhecimento, assistentes e aparência (RECONCILIADA EM 15/10)

Esta atualização é limitada à família 08; os demais status/estimativas deste documento são históricos e exigem reconciliação na main antes de agir.

| Subfatia | Estado conferido / escopo |
|---|---|
| 08A | MERGED #244 (`ab39b6dc`): leitura honesta de `/admin/conhecimento`; não refazer. |
| 08B | MERGED #245 (`5a02f0e`): assistentes Marcelo/RH/cliente e fontes do RagWidget; contagem histórica corrigida de 13 para 12 PNGs, com lista no resumo. |
| 08C | MERGED #246 (`8dfbd7e451787dcf6f56e93b81d8e4edb26ceda5`): aparência/prévias, faixa/noindex/selo; não refazer nem publicar. |
| 08D | Medição/documentação entregue nesta branch, sujeita aos checks/merge da PR: 64 PNGs novos, 320/390/768/1440, claro/escuro, 64 traços de teclado (54 creditados pelo detector conservador). Gates preservados; sem alteração de produto. Ver fechamento para o estado e os limites. |

**Fechamento de medição, não aceite de UX sem defeitos:** [relatório da família](UX-PRO-08-FECHAMENTO-2026-10-15.md), com resíduos D1–D12. D7 (legibilidade noturna RAG) exige PR própria; D8 permanece vinculado ao E8 e depende de autorização. D9/D10 são limites de medição, não defeitos de produto demonstrados. E2–E9/C11, homologação e produção permanecem fora do escopo/NO-GO. Próxima subfatia da fila: [UX-PRO-09A — entradas](UX-PRO-09A-PROMPT-PROXIMA-SUBFATIA-2026-10-15.md), após conferir a PR 08D na main.

---

## 5. Tudo o que existe no sistema ALÉM de UX (por categoria)

Estado geral: **o código dos módulos abaixo existe e foi entregue localmente em fatias com gates automatizados** (PostgreSQL descartável + HTTP real + Chromium). Isso é diferente de "homologado" (ver §6).

| Categoria | O que existe hoje |
|---|---|
| **Site público/marketing** | Home, serviços (6 do catálogo único), segmentos, contato, FAQ, conteúdos, pacotes, orçamento, simulador em 4 etapas, proposta/aceite por token, privacidade; formulários gravam lead no PostgreSQL; `noindex` ativo na prévia; layouts 01–10 preservados como prévias (06 é o padrão) |
| **Autenticação e identidade** | 3 famílias de sessão (staff, cliente, funcionário); login individual, papéis/grants RBAC, MFA, troca de e-mail, recuperação, revogação, auditoria de acesso; ponto do funcionário com geolocalização/endereço (migrações 176–179) |
| **Portal do cliente** (15 rotas) | Agenda, chamados, cobranças, contratos, documentos, continuidade, relatórios, renovação, satisfação, segurança da conta, solicitações, reclamação sobre colaborador (canal restrito CLI-15), assistente; isolamento conta A×B provado em gates CLI-01..15/L08 |
| **Funcionário e RH** | Portal do funcionário (ponto, comprovante/hash, solicitações, jornada); RH: pessoas, admissão, jornada/ponto/ajustes, escala, documentos, benefícios, treinamento, afastamentos, folha, desligamento, recrutamento; jornadas UX-PRO-05 entregues |
| **Gestão (Marcelo)** | Painel/decisões, pendências, analytics/experimentos A/B (EXT-11), relatórios (EXT-13), inteligência (EXT-14), expansão/cenários (EXT-09) |
| **CRM/comercial** | Leads/pedidos, prospecções, empresas/contatos, oportunidades/funil, atividades, calendário, orçamento/proposta comercial, carteira, comissões; fluxo lead→implantação (F03) |
| **Contratos** | Ciclo comercial→contrato, detalhe, aditivos, encerramento, fiscal, obrigações documentais, alertas, diário de gestão |
| **Operação** | Escalas, ciência de escala, ordens/operações, pendências internas com notificação (migração 170), emergencial/apoio (EXT-15) |
| **Patrimônio/almoxarifado** | Produtos/estoque, reservas, ativos serializados, ordens de serviço, inventários, requisições (AST/L06) |
| **Financeiro** | Contas a pagar/receber, baixa, fiscal/obrigações, despesas, relatórios financeiros (FIN/L07, F03 contas→baixa→relatório) |
| **Módulos EXT operacionais** | Frota (EXT-01), terceiros (EXT-02), licitações (EXT-03), fornecedores (EXT-04), qualidade (EXT-05), satisfação (EXT-06), compliance (EXT-07+fiscal+planos de ação), conhecimento (EXT-08), expansão (EXT-09), continuidade (EXT-10 + portal cliente migração 169), analytics (EXT-11), editor visual/aparência (EXT-12, migração 177), relatórios (EXT-13), inteligência (EXT-14), emergencial (EXT-15) |
| **TI/administração** | Console TI, RBAC/governança, catálogo de equipamentos, orçamentos técnicos, SEO, backup (catálogo), auditoria, observabilidade/health, registros de integração, notificações, privacidade/LGPD, aparência do site, verificações manuais |
| **IA/RAG e assistentes** | Widget RAG com escopos por área/papel (público, cliente, RH, Marcelo), guardrails, filas/estados honestos, fontes citáveis, fontes por diretório (migração 175), Ollama opcional (`qwen3:1.7b`), modos sem_ia/com_ia/beta |
| **Plataforma/dados** | 100 páginas (rotas), **180 migrações** PostgreSQL (001–180), 134 módulos de API em `src/server/`, `server.mjs` (~6.200 linhas), PostgreSQL 17 real ou PGlite (demo local), idempotência, auditoria transacional, triggers de imutabilidade |
| **Qualidade/CI** | 157 arquivos de teste, 84 scripts de QA, **42 workflows** GitHub (gates L02–L08, EXT, UX por rota, backup/restore, CI), inventário UX reproduzível, demo local persistente e pacote QA para Windows (.bat/.sh) |
| **Documentação** | 235 documentos em `docs/` (planos, relatórios por fatia, evidências com capturas, runbooks, gates) |

**Sendo implementado agora:** apenas o programa **UX-PRO** (07 em andamento; 08–10 aguardando). Nenhuma frente funcional nova está em implementação nesta sessão — as frentes funcionais (L, CLI, EXT, F) foram entregues localmente e estão em fase de profissionalização visual + homologação.

---

## 6. O que falta para considerar o sistema 100% funcional, entregue e homologado

### 6.1 Código/UX (nesta fila de trabalho)
1. Fechar UX-PRO-07 restante (§1.2), UX-PRO-08, 09 e 10 (§2–4).
2. Resolver a PR #230 (duplicata conflitante).
3. Decidir e executar (ou registrar como fora de escopo) os resíduos E2–E9/C11.

### 6.2 Homologação humana e UAT (nunca feita pelo código sozinho)
4. Aceite humano por perfil: Marcelo (gestão), Andreia, funcionários, clientes — hoje **só existe aceite registrado no L07**; nenhuma fatia UX declara aceite.
5. Homologação RAG beta com 5 perfis (cliente, RH, Marcelo, público, modos do bot) com checklist assinado (`docs/homologacao-rag-beta.md`).
6. UAT em **Windows** na máquina do operador (instalação persistente, reinício, dados permanecendo) e aplicação do runbook em **banco de destino real** (`docs/APLICACAO-BANCO-DESTINO.md`) — ensaios até aqui foram em clusters descartáveis Linux.
7. Revisão jurídica/contábil: LGPD (bases legais, retenção, política publicada aprovada), CLT/convenções/Portaria 671/eSocial e regras fiscais com contador/advogado — não inferir de teste sintético.

### 6.3 Produção (gate `docs/PRODUCAO-GATE.md` — hoje **NO-GO**)
8. **Backup real: BLOQUEADOR.** A API de backup/restore devolve 503 de propósito; falta executor real, inventário de todos os arquivos privados, armazenamento externo imutável/criptografado, custódia de chaves/KMS, âncora de assinatura, PITR e restore medido (RPO/RTO) em ambiente autorizado.
9. Provedores e integrações reais (não verificados): **SMTP** real, WhatsApp, emissor fiscal (NF-e/NFS-e), gateway de pagamento, eSocial/relógio de ponto homologado, CFTV/biometria, Ollama em hardware real. Sem provedor, a fila fica `not_configured` — honesto, mas não é envio real.
10. Atores externos que **não existem**: login próprio de terceiro e de fornecedor (hoje só staff opera; a fronteira é declarada nas telas/APIs).
11. Virada de produção: `is_beta_mode=false`, remoção do `noindex`, segredos de produção (banco, sessão, criptografia, bootstrap), hospedagem dimensionada (teto R$ 200/mês de referência), CNPJ/logotipo/política de privacidade aprovados e publicados, observabilidade/alertas em produção.
12. Acesso remoto ao cliente (decisão histórica: Tailscale Funnel) — só ativar após gates de segurança/persistência e autorização específica; PC precisa permanecer ligado.
13. **Autorização explícita e por escrito do proprietário para publicar** + CI remoto integralmente verde na release (build compilar ≠ funcionar).

### 6.4 Ressalvas de evidência
- O controle histórico de **222 requisitos** (28/09) registrava 201 como "implementado não verificado": as fatias posteriores (L/CLI/EXT/F/UX) verificaram muito disso com gates, mas **não existe uma re-auditoria integral dos 222 IDs** no estado atual — ela é, na prática, parte da UX-PRO-10 + UAT.
- Contraste WCAG, desempenho e compatibilidade ampla de navegadores nunca foram declarados conformes; as medições são por amostragem automatizada.

**Critério de "100% entregue e homologado":** §6.1 + §6.2 + §6.3 completos, com evidência por item. Até lá, o estado honesto é: *sistema funcional em ambiente local/demo com dados fictícios, em profissionalização de UX, não liberado para produção nem dados reais.*

---

## 7. Ordem sugerida de execução

1. Limpeza: destino da PR #230 (1 ação).
2. UX-PRO-07F → 07G → 07H → 07I → 07J → 07K → 07L → 07M (1 PR por subfatia, decisões E2–E9/C11 intercaladas quando o proprietário decidir).
3. UX-PRO-08 (08A→08C) → UX-PRO-09 (09A→09C) → UX-PRO-10 (10A→10C).
4. Em paralelo (fora do Arena/código): homologação humana, pareceres, provedores, backup real e gate de produção.
