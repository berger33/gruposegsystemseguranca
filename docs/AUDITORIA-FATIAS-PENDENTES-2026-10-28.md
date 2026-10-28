# Auditoria integral — o que falta, o que está pendente e o que está quebrado

**Data:** 28/10/2026 (America/Sao_Paulo)
**Base auditada:** `867ecf418166b6b48136c560731031959d4f5037` — merge da PR #299 (`main`), árvore limpa
**Branch desta sessão:** `arena/4f46cb80-gruposegsystemseguranca`
**Natureza deste documento:** retrato de auditoria desta data. Não substitui
[`STATUS-VIGENTE.md`](STATUS-VIGENTE.md) como fonte única de estado e **não
declara aceite, homologação nem prontidão de produção**.

---

> **Atualização de execução (mesma data, 28/10/2026):** esta lista começou a ser
> trabalhada imediatamente após a auditoria. **E20 foi corrigido** —
> `STATUS-VIGENTE.md` passou a registrar **101 rotas**, **001–181** e próxima
> migração livre **182**, com o gate `test:migrations:pg` **181/181** executado em
> dois passes neste sandbox (581 tabelas, checksum negativo rejeitado).
> **B7 foi entregue** — a UI do detalhe publicado de contrato em
> `/cliente/app/contratos`, com guarda `tests/cli03-contract-published-details-ui.test.mjs`
> **8/8** e relatório `docs/CLI-03-UI-DETALHE-PUBLICADO-2026-10-28.md`; `CLI-03`
> passou de `mencionado_em_gate` para `gate_nomeado` no inventário de 222 IDs
> (23/113/86), **sem** promover aceite (0/222). As fatias A1–A6, B1–B6, B8–B13 e
> as dívidas C1–C8 continuam abertas; a ordem vigente está na seção 8.

---

## 0. Sumário executivo (veredito honesto)

O sistema está **funcional e muito bem testado em ambiente local/descartável com
dados fictícios**, e **não está entregue nem homologado**. Não há regressão de
compilação no HEAD: build, typecheck, gates estáticos e `npm audit` estão
verdes hoje. O que falta é de quatro naturezas:

1. **Completude de produto** — atores externos que nunca existiram (fornecedor,
   terceiro, central 24h, portal de compras), upload real de arquivos, executor
   de jobs durável, IA com modelo real, backup real e Academia integrada.
2. **Cobertura de prova** — 101/101 rotas com gate automatizado, mas
   **0/101 com aceite humano**, 47 sem nenhuma captura visual, 101 sem estados
   exercitados em navegador e 82 com teclado não verificado.
3. **Reauditoria dos 222 requisitos** — **0/222 com aceite humano** e
   **0/222 com reauditoria integral**; 21 IDs seguem sem qualquer menção em gate.
4. **Higiene e dívida técnica** — 40 componentes órfãos no console de TI,
   `server.mjs` monolítico, pacotes ZIP obsoletos versionados e deriva de
   documentação de estado.

**Produção: NO-GO** (checklist de 10 itens em [`PRODUCAO-GATE.md`](PRODUCAO-GATE.md),
nenhum marcado).

### Números verificados nesta auditoria

| Métrica | Valor medido hoje |
|---|---|
| Rotas (`page.tsx`) | **101** (14 públicas, 44 staff, 14 entrada do cliente, 16 portal do cliente, 1 portal do funcionário, 11 prévias, 1 homologação) |
| Rotas com gate automatizado | **101/101** |
| Rotas com captura visual (parcial, por viewport) | **54/101** |
| Rotas com aceite humano | **0/101** |
| Rotas com estados exercitados em navegador | **0/101** (101 declaram “estados não exercitados”) |
| Migrações | **001–181** imutáveis; próxima livre **182** |
| Módulos de API (`src/server/`) | **134** |
| `server.mjs` | **6.208 linhas** (~350 KB, despacho manual) |
| Arquivos de teste | **214**; **151** no `npm test`; **0** órfãos sem workflow/script |
| Asserções do `npm test` | **1.168** (1.166 passam; 2 falham por falta de biblioteca do Chromium neste sandbox) |
| Workflows | **49** |
| Documentos em `docs/` | **385** `.md` |
| Componentes TI | 83 → **18 abas**, 25 em workspaces, **40 órfãos** |
| Matriz de 222 IDs | 222 únicos; **46 `a_revalidar`** declarados; **21 sem gate**; **0 aceite** |
| Dependências | `next` 16.4.2 · `nodemailer` 10.2.1 · `npm audit --audit-level=moderate` = **0** |
| PRs / issues abertas | **0 / 0** (última: #299, `MERGED`) |

---

## 1. Mapa do sistema (o que é, em uma página)

Aplicação **Next.js 16 + React 19** servida por um **servidor Node customizado**
(`server.mjs`) com **PostgreSQL 17** (PGlite apenas para demo). A API é
despachada por `server.mjs` para 134 módulos em `src/server/`. Autorização
decidida no servidor: sessões staff/cliente/funcionário, RBAC por permissão,
grants por conta/unidade/contrato, same-origin, idempotência, auditoria
transacional e falha fechada.

**Frentes funcionais existentes e provadas localmente:**

- **SEC/PLT** — identidade staff individual, MFA TOTP + recuperação, troca de
  e-mail com caixa local, revogação de sessão, RBAC granular, auditoria,
  CSRF/same-origin, observabilidade, healthcheck, privacidade/LGPD declarativa,
  incidentes, catálogo de backups (só metadados), ambientes, migrações com
  checksum, dependências, documentação de manutenção, orçamento/uso, retenção e
  configurações/rollout (as seis últimas promovidas ao console em 27/10).
- **PUB** — site público (layout 06 padrão), 6 serviços, segmentos, FAQ, casos,
  conteúdos, orçamento, simulador em 4 etapas, proposta/aceite por token,
  pacotes, SEO técnico, privacidade, `noindex` ativo.
- **CRM/CON** — leads, empresas/contatos/unidades, oportunidades/funil, tarefas,
  cadências, visitas/agenda, catálogo/equipamentos, vistoria, orçamentos (mão de
  obra, técnico, custos, cenários, descontos), propostas, aceite, contrato,
  aditivos, alertas, obrigações documentais, implantação, encerramento e diário
  de gestão.
- **HR/EMP/OPS** — cadastro profissional, recrutamento, desligamento, férias,
  afastamentos, ponto/banco de horas, benefícios, treinamento, competências,
  uniformes, fechamento de DP, holerites, avaliações, escalas, plantão,
  passagem de turno, ocorrências, procedimentos, PWA, solicitações, cursos,
  comunicados, dimensionamento, supervisão, ronda, chaves e relatórios.
- **CLI (portal do cliente)** — acesso/MFA, 10 páginas de leitura isoladas por
  conta ativa, chamados, visitas, relatórios com aceite, cobranças,
  solicitações, satisfação, renovação, reclamação de colaborador (canal
  restrito), delegação de contatos (CLI-02) e detalhe publicado de contrato
  (CLI-03).
- **FIN** — contas a receber/pagar, recorrência, conciliação, cobrança, fluxo de
  caixa, custo, resultado, despesas, fiscal, gateway (declarativo), orçamento,
  export, fechamento e comissão.
- **AST/ADM/EXT/AI** — estoque, ativos, entrega, requisição, inventário, OS,
  manutenção, CFTV, limpeza; painel de aprovação, busca, relatórios, config,
  metas, diário e expansão; EXT-01..15 com gate próprio; RAG em 4 escopos com
  curadoria e custo/token.
- **Academia** — subsistema **isolado** (Node puro + JSON, porta 3100), 24
  trilhas, gamificação, certificados; **não integrado** ao sistema principal.

---

## 2. O que já foi feito (cronologia resumida)

| Período | Entrega |
|---|---|
| Set/2026 | Fundação: segurança, RBAC/MFA, site público, captação de leads, CRM→contrato→implantação, RH/ponto, portal, financeiro, painel Marcelo |
| 02–04/10 | Ondas L02–L08 e F00–F16 (parciais); F01 entrada/navegação por papel; F03 três jornadas ponta a ponta; EXT-08..15 canônicas; QA de backup/restore com bytes sintéticos (ondas 8–21) |
| 05–10/10 | UX-PRO-00..09 (inventário de rotas, evidências, estados honestos), identidade visual, demo local persistente, pacotes QA/Windows |
| 13–21/10 | UX-PRO-06/07/08/09/10 (contratos, CRM, carteira, prévias, PU4/PU5/PU6), EXT-16/17 apenas como tabelas |
| 22–23/10 | UX-PRO-04 (pendências, relatórios, analytics, Marcelo) e UX-PRO-05 (solicitações, documentos, ponto, fechamento/holerite) |
| 26/10 | ID3 completo (8 páginas do portal), E1/E2/E5/E10/E11/E12/E13 corrigidos, `STATUS-VIGENTE.md` criado |
| 27/10 | Reauditoria do `TiConsole` + **6 promoções com prova** (PLT-11..18), E17 (8 regexes de UUID), E18 (contraste 708→0), E19 (65 runners protegidos), E3/E4 (13 aliases IA → 410), gates das rotas públicas (100 à época), inventário dos 222 IDs, E9 (3 de 4 frentes) |
| 28/10 | Reauditoria técnica SEC (15 IDs, 35 âncoras, 5 gates), CLI-02 (delegação + UI de contatos, migração 181, gate L08 **54/54**), CLI-03 (rota de detalhe publicado, **53/53**), CLI-06..08 (prova focal do lado cliente, **52/52** na fatia) |

**Não reimplementar** (já integrado e reconciliado): os resíduos **E2/E2-C1, E3/E3-R1, E5,
E6/E6-C1 e E8 da série UX-PRO** (PRs #262–#283 — não confundir com os códigos E1–E24 desta
auditoria), C11 de fornecedores, UX-PRO-07F–07M, 07E-2 alvo de toque, 09E-PU5, 10B/10C
(parte automatizável), ID3 (10 páginas), promoções PLT-11..18, E17, E18, E19 e as
18 abas do console de TI.

---

## 3. Verificação independente executada nesta auditoria

| Comando / prova | Resultado |
|---|---|
| `npm ci` | OK |
| `npm test` | **1.166/1.168** — 2 falhas **ambientais** (`libnspr4.so` ausente no Chromium do sandbox), ver **E22** |
| `npm run typecheck` | exit **0** |
| `npm run build` | exit **0** (árvore limpa depois) |
| `node scripts/qa-wave0-static.mjs` | **5/5** — migrações 001–181 contínuas e no migrador |
| `ux-pro-00-inventory --check` | OK — **101** rotas, **101** com gate, **54** com captura |
| `ux-pro-03-ti-inventory --check` | OK — 18 abas, **40 órfãos** |
| `requisitos-222-inventory --check` | OK — **21** `a_revalidar` sem gate |
| `ux-pro-10b-contrast-inventory --check` | OK |
| `requisitos-sec-reaudit --check` | OK — 15 IDs SEC mapeados |
| `npm audit --audit-level=moderate` | **0 vulnerabilidades** |
| `git status` | limpo antes; `npm test` cria `dist/LEIA-ME.md` **não versionado** (**E21**) |
| Testes órfãos (sem script/workflow) | **0** |
| Gates PostgreSQL/Chromium | **não executáveis aqui**: sem `postgres`/`pg_dump` (E8) e sem bibliotecas do Chromium. Números desses gates vêm dos relatórios datados |

---

## 4. LISTA A — Fatias que faltam (fila de trabalho)

Legenda de prioridade: **[P0]** bloqueia entrega/homologação · **[P1]** fila de
desenvolvimento · **[P2]** dívida/polish · **[P3]** só com autorização.
Regra vigente: **1 fatia = 1 PR**, com teste focal RED→GREEN, evidências e checks verdes.

### 4.1 P0 — bloqueios de engenharia e conformidade

| # | Fatia | O que falta exatamente | Evidência do estado |
|---|---|---|---|
| A1 | **Backup e restauração reais** | Inventário fechado de **todos** os bytes privados (12 famílias, chaves/versões/órfãos); snapshot DB+FS consistente; storage externo imutável e criptografado; KMS e âncora de assinatura fora do pacote; PITR/WAL; GC que preserve pontos; restore autorizado em ambiente isolado com **RPO/RTO medidos** | `src/server/backup-api.mjs` devolve **503** em POST/restore e marca registros legados como `unverified`; `PRODUCAO-GATE.md` item 8 **BLOQUEADO** |
| A2 | **F02 — Windows/EPERM e instalação persistente** | Três casos de symlink sem `EPERM`, restart com dados preservados, `start/stop/status`, isolamento QA×ambiente, backup/restore em instância separada | Depende da máquina do operador; só E10 (symlinks em teste) foi corrigido |
| A3 | **Matriz completa de autorização** | Conta/unidade/contrato em **todos** os handlers e downloads, com reteste HTTP A/B; hoje os gates amostram | Auditoria de 26/10 §4.2; achado de 28/10: `cli_contact_scopes.role` **não** participa da autorização |
| A4 | **Segurança e privacidade** | Bases legais, retenção/exclusão **efetiva** (hoje declarativa), incidentes, política publicada/aprovada, parecer CLT/Portaria 671/eSocial/fiscal, segredos por ambiente, SAST, plano de rollback | `CLIENT_MFA_ENCRYPTION_KEY` vazio por padrão ⇒ MFA cliente 503 fail-closed |
| A5 | **Banco de destino com 001–181** | Aplicação no servidor real e ensaio de clone; ensaios até hoje em clusters descartáveis | `docs/APLICACAO-BANCO-DESTINO.md` |
| A6 | **F16 — aceite final** | Matriz de aceite por papel (Marcelo, Andreia, funcionário, clientes A/B), relatório de riscos, runbook Windows, homologação RAG beta com 5 perfis e checklist assinado | `PRODUCAO-GATE.md`: **0/10** itens |

### 4.2 P1 — código e cobertura (uma PR por item)

| # | Fatia | O que falta exatamente | Estado |
|---|---|---|---|
| B1 | **UX-PRO-03 — 40 componentes órfãos** | Promover por área **com prova** (papel, origem, fonte, drill-down, autorização) ou mover para `legacy/` documentado; nunca ligar em massa. Órfãos: `AdmClient`, `AdmAdvancedClient`, `AstClient`, `AstAdvancedClient`, `CliClient`, `CliAdvancedClient`, `CliFinanceClient`, `CmsClient`, `ContractAlert/Amendment/Closure/Details/DocObligation/Fiscal/Implantation/ManagementDiary/StatusClient`, `EmpAdvanced2/EmpOps/EmpPortal/EmpProfile/EmpPwa/EmpSelf/EmployeeComplaintClient`, `ExtClient`, `ExtAdvancedClient`, `ExtReportingClient`, `FinClient`, `FinAdvancedClient`, `FinBudgetClient`, `FinManagementClient`, `IntegrationsClient`, `LgpdRequestClient`, `NotificationPreferencesClient`, `OpsClient`, `OpsAdvancedClient`, `OriginMetricsClient`, `PackageClient`, `PubFaqAssistedClient`, `SeoClient` | 18/18 abas com prova; **40 órfãos** no inventário `--check` |
| B2 | **PLT-03 `IntegrationsClient` — decisão de gate de papel** | O módulo aceita **qualquer sessão staff**; antes de montar é preciso decidir o RBAC e provar 401/403 | Bloqueia a promoção de `IntegrationsClient` |
| B3 | **UX-PRO-04 (restante)** | Superfícies de CRM, comercial, carteira, expansão, contratos e financeiro no perfil Marcelo, uma PR por superfície; já entregues pendências, relatórios, analytics e detalhamento | Nenhuma PR #284–#299 tratou o restante |
| B4 | **UX-PRO-05 (restante)** | Jornada do titular completa, comprovante/hash/endereço HERE, estados offline/rede, comunicados, cursos, escala e abas RH não reauditadas | Entregues: solicitações, documentos, ponto/ajustes, fechamento/holerite |
| B5 | **UX-PRO-06** | Reconciliar CRM/comercial/clientes/contratos/carteira/funil/contas admin/fila de pedidos **antes** de escolher complementos; depois tratar lacunas por tela | Não iniciado como família |
| B6 | **UX-PRO-ID3 — resíduo de UI** | As 10 páginas estão isoladas por conta, mas **não têm aceite humano** nem captura “antes”; `/cliente/app/assistente`, `continuidade`, `seguranca` e `portal` não estavam na família | Relatórios de 26/10 |
| B7 | **CLI-03 — UI do detalhe publicado** | A rota `GET /api/client/contracts/:id/published-details` existe e é testada, mas **nenhuma tela a consome**; falta também download dos documentos `cli_client_documents_v2` | `grep published-details` → só `server.mjs` + teste |
| B8 | **CLI-02 — enforcement de papéis** | `cli_contact_scopes.role` é metadado; autorização efetiva usa `client_access_grants`. Falta a proposta **papel × ação × escopo** e a compatibilidade com os grants atuais | `docs/CLI-02-DECISAO-MATRIZ-PAPEIS-2026-10-28.md` |
| B9 | **CLI-05..08 — partes staff/UI** | A prova de 28/10 cobre só o lado cliente (visita, reagendamento, relatório, ciência). Ciclo administrativo (criar, revisar, aprovar, publicar) e UI por papel seguem sem gate | Gate L08 54/54 cobre apenas o recorte declarado |
| B10 | **Reauditoria dos 222 IDs por família** | 21 IDs sem qualquer gate: **PLT-01/02/03/06/07/09/10/12/15**, **EXT-16/17**, **AI-01..10**. Começar pelo núcleo duro, uma família por PR, sem inventar aceite | `docs/REQUISITOS-222-INVENTARIO-2026-10-27.json` |
| B11 | **UX-PRO-10B/10C + 09E-8 (manual)** | Revisão WCAG manual, medição por pixel das **196** amostras `complex_background`, reclassificação dos **108** `<option>`, leitor de tela e UAT | Automatizável entregue; 0 sinais < 4.5:1 após Opção A |
| B12 | **Gates das rotas: estados e teclado** | 101/101 rotas têm gate de jornada, mas **101** declaram “estados não exercitados em navegador”, **82** têm teclado não verificado e **47** não têm captura visual | `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` |
| B13 | **Academia — integração e conteúdo** | Login único com o sistema, banco/multi-instância, e-mails, upload/player de vídeo, 137 das 165 aulas em construção, 24 de 25 trilhas, níveis 0/80/200/400 → decisão 0/300/900/1800, link no menu | `academia/` isolada na porta 3100 |

### 4.3 P2 — dívida e polish

| # | Item | Estado |
|---|---|---|
| C1 | **D7** — inline dinâmico do Layout 09 e foco do atalho público | **Bloqueado** por decisão do proprietário |
| C2 | **C11** — escopo financeiro + 2 hits de dados (`FiscalWorkspace.tsx:80`, `ExpenseWorkspace.tsx:176`) | **Bloqueado** por decisão do proprietário |
| C3 | **E15** — `server.mjs` monolítico (6.208 linhas, despacho manual em dois lugares) | Aberto; proposta: tabela canônica de rotas + teste de paridade |
| C4 | **E16** — worker/scheduler durável | Aberto: só EXT-07 in-process opt-in; cadências CRM manuais; notificações dependem de chamada |
| C5 | **E21** — pacotes obsoletos: **13 ZIPs** entre 16 arquivos versionados em `downloads/`+`dist/` (~171 MB) | Parcial: avisos existem, arquivos continuam versionados |
| C6 | **E7** — demo PGlite com 27 tabelas vs 581 do PostgreSQL | Aberto (`db/beta-pglite-init.sql`) |
| C7 | **E20/E23** — deriva de documentação de estado e de números | Novos, ver §6 |
| C8 | **E22** — `npm test` não é hermético (2 testes exigem Chromium do sistema) | Novo, ver §6 |

### 4.4 P3 — produção (somente com autorização expressa)

`is_beta_mode=false`, remoção do `noindex`, secrets reais, SMTP real, CNPJ/logo/
política aprovada, hospedagem dimensionada, observabilidade e alertas,
`npm audit`/CI verdes, backup medido e **autorização por escrito**.
**Proibido transformar ZIP de prévia em produção.**

---

## 5. LISTA B — Implementações pendentes (fora de telas/APIs)

### 5.1 Backup

- `POST /api/admin/backups`, `PATCH/DELETE /api/admin/backups/:id` e
  `POST /api/admin/backups/restore` retornam **503 de propósito**
  (`src/server/backup-api.mjs`); o GET devolve registros **`unverified`**.
- `is_restore_tested`, `status=success` e as notas da migração 046 são
  **declarações legadas**, não evidência de bytes.
- Ensaios QA (ondas 8–21) usam bytes sintéticos em clusters descartáveis e
  **não** são executor de produção.

### 5.2 Provedores e integrações (nenhum ativo)

SMTP (fila fica `not_configured` → `local_outbox`, nunca `sent`), WhatsApp/API,
emissor fiscal NF-e/NFS-e, gateway de pagamento, eSocial/relógio homologado,
CFTV/biometria, calendário, storage remoto, **Ollama em hardware real**
(`OLLAMA_ENABLED=false` em `.env.example` ⇒ fallback, nunca inferência) e
**HERE** (`HERE_API_KEY` + consentimento individual do funcionário).
Sem provedor: **não enviar e-mail, não emitir nota, não movimentar dinheiro,
não alegar monitoramento**.

### 5.3 Atores externos que não existem

Login/sessão/grant/canal/upload/aceite de **fornecedor** e de **terceiro**;
portal público de compras (ComprasNet/BEC-SP/PNCP) para licitações; **central
24h** e envio real de alertas (EXT-15 registra apenas testes internos
declarados); notificações de continuidade e relatórios EXT-13 são **registros
internos**, não envio. A API declara a fronteira (`external_actor_boundary`) em
vez de simular o ator.

### 5.4 Upload real de arquivos

**Não existe nenhum handler de upload** (nenhum `multipart`/`formData` em
`src/server/` ou `server.mjs`). Documentos são **referência declarada**;
`CLIENT_DOCS_DIR` serve downloads de arquivos já presentes. Download existe
(auditoria, documentos do cliente, propostas, funcionário, folha), upload não.

### 5.5 Jobs e notificações

- Sem executor durável: `notification_queue` tem reivindicação atômica, backoff
  e `local_outbox`, mas o processamento depende de acionamento manual.
- EXT-07 é o único agendador (`EXT07_EVALUATE_INTERVAL_SECONDS` +
  `EXT07_EVALUATE_IDENTITY`), **in-process** e desligado por padrão.
- «Jobs vs reinício» continua pendente no plano F15.

### 5.6 IA / RAG

- Escopo `cliente` do RAG **não implementado**: responde
  **403 `tenant_scope_not_implemented`** em `src/server/ai-rag-api.mjs` (3 pontos).
- **AI-01..10** sem jornada entregue: falta Ollama real, corpus aprovado por
  área, custo/token medido com modelo real, avaliação de qualidade e automações
  determinísticas. Nenhum dos 10 IDs foi promovido.

### 5.7 Academia (subsistema isolado)

JSON single-instance, porta 3100, **não linkada** no menu principal e **não
servida** por `server.mjs`. Falta: SSO com o login principal, banco/múltiplas
instâncias, e-mail de convite/recuperação, upload/player/transcodificação de
vídeo, 137 aulas em construção, trilha T25 “supervisores” (depende do nome do
papel) e revisão mobile/teclado.

### 5.8 Homologação e operação

Aceite humano por perfil (só existe aceite registrado em L07, 02/10);
homologação RAG beta com 5 perfis; UAT em **Windows real**; migrações no **banco
de destino**; checklist de produção (10 itens, nenhum marcado).

---

## 6. LISTA C — Erros e defeitos (com estado atual)

### 6.1 Corrigidos (não reabrir)

| # | Defeito | Correção |
|---|---|---|
| E1 | `nodemailer@10.0.10` com 3 GHSA moderadas; CI só bloqueava high | `10.2.1`; `npm audit --audit-level=moderate` = **0** hoje |
| E2 | `next-env.d.ts` versionado com distDir de teste | Alinhado ao distDir padrão + guarda de higiene |
| E3/E4 | Widget órfão chamando `/api/ai/bot` (410) e aliases legados | 13 aliases aposentados com 410 + `canonical`; widget e botão migrados para `/api/ai/answer`; guarda no `test:unit` |
| E5 | 9 testes fora do CI e `client-security.integration` quebrado | Incluídos em `test:unit`/`test:integration`; **0 testes órfãos hoje** |
| E6 | Rotas públicas sem gate | **101/101** com gate (grupos 1/2/3) |
| E10 | `EPERM` de symlink no Windows | Junction/entrada insegura equivalente, sem pular teste |
| E11 | Índice `/qa/modulos` obsoleto | Reconciliado com o HEAD |
| E17 | 8 regexes de UUID `8-4-4-12` quebradas em 7 módulos | 8 substituições + guarda + cenário HTTP |
| E18 | 708 amostras de contraste < 4.5:1 nas prévias | Opção A aplicada: **0** sinais < 4.5:1 no gate 10B |
| E19 | 65 runners de QA sujavam `next-env.d.ts`/`tsconfig.json` | Guarda de saída síncrona; **67/67** runners protegidos |

### 6.2 Abertos ou parciais

| # | Defeito | Evidência | Impacto | Correção sugerida | Estado |
|---|---|---|---|---|---|
| **E3-R2** | Run de CI sem logs, causa não atribuída | Registro de 21/10 | Pode confundir regressão com ruído | Só reabrir com logs completos do caso 07D-1 | Encerrado como observação histórica |
| **E7** | Demo padrão (`npm run dev` sem `DATABASE_URL`) usa PGlite com **27** tabelas vs **581** do PostgreSQL (medido na auditoria de 26/10) | `grep -c 'CREATE TABLE' db/beta-pglite-init.sql` = 27; `/api/health/ready` nasce `degraded` | Primeira impressão de “sistema meio funcionando” | Requerer `DATABASE_URL` para além do site público, ou alinhar/declarar o subconjunto suportado | **Aberto** |
| **E8** | `test:backup-restore:pg` não roda localmente sem `postgresql-client-17` | `command -v pg_dump` → **AUSENTE** (também neste sandbox) | Bateria local incompleta | Documentar/instalar no ambiente do operador | **Aberto** |
| **E9** | Flakiness de gates | `l04` 20/20, `ext14` 18/18, `demo-local` exit 0; helper de leitura estável | Falso vermelho | 3 de 4 frentes fechadas | **Parcial** |
| **E12** | Documentação de estado sem fonte única: `STATUS-VIGENTE.md` foi criado em 26/10, mas os demais `STATUS-*`/`CONTROLE-*`/`RELATORIO-PENDENCIAS-*`/`CRONOGRAMA-*`/`GAP-*` seguem como fotografias antigas | Seção “Estado vigente” do README e banners datados | Próxima sessão pode seguir fila morta ou reimplementar fatia | Manter o ledger atualizado (ver **E20**) e datar cada documento histórico | **Parcial** |
| **E13** | **13 ZIPs** versionados entre 16 arquivos em `downloads/`+`dist/` (~171 MB), com ~96 migrações | `git ls-files downloads dist` = 16 | Instalação de versão obsoleta; clone inchado | Regenerar ou mover para release externo | **Parcial** |
| **E14** | 40 componentes TI órfãos + `AiBotWidget`, `ExtClient`, `UiPanel`, `Academia` fora do servidor | Inventário `--check` | Código sem rota, teste ou autorização exercida | Promover com prova, uma família por PR | **Parcial** |
| **E15** | `server.mjs` monolítico (6.208 linhas, 134 módulos, despacho manual) | `server.mjs` + `route-dispatch-guard` | Cada fatia exige editar dois lugares | Tabela canônica de rotas com paridade testada | **Aberto** |
| **E16** | Sem worker/scheduler durável | `src/server/ext-compliance-scheduler.mjs`; `.env.example` | Automações não sobrevivem a restart | Executor com ledger/idempotência e prova de retomada | **Aberto** |
| **E18 residual** | 196 amostras indeterminadas (`complex_background`) e 108 `<option>` não medidos; sem revisão WCAG manual | Gate 10B | Não é aprovação de acessibilidade | Medição por pixel, reclassificação e revisão manual | **Parcial** |

### 6.3 Novos achados desta auditoria (28/10)

| # | Achado | Prova | Impacto | Correção sugerida |
|---|---|---|---|---|
| **E20** | `STATUS-VIGENTE.md` §1 está **uma fatia atrás**: diz “100 rotas” (hoje **101**, `/cliente/app/contatos`) e “migrações 001–180, próxima 181” (a **181** já existe e o wave0 valida 001–181; próxima livre é **182**) | `node scripts/ux-pro-00-inventory.mjs --check` → 101; `qa-wave0-static` → 001–181 | Agente novo pode reimplementar ou numerar migração errada | Atualizar o ledger no início da próxima fatia |
| **E21** | `dist/LEIA-ME.md` **não é versionado**: `tests/package-artifacts.test.mjs` o materializa num `before()` a cada `npm test`, deixando `?? dist/LEIA-ME.md` na árvore; os documentos (E13/README) afirmam que o aviso está “versionado” em `dist/`. O aviso também cita **100 rotas** quando existem **101**, e a guarda só confere a contagem de migrações | `git ls-files dist` → só `seg-system-beta.zip`; `git status` após a suíte | Árvore suja a cada execução e aviso levemente desatualizado; o clone limpo não contém o aviso em `dist/` | Versionar o aviso (`git add -f dist/LEIA-ME.md`) ou incluí-lo no `.gitignore` com aviso apenas em `downloads/`; estender a guarda à contagem de rotas |
| **E22** | `npm test` **não é hermético**: `tests/ux-pro-09e-pu4.test.mjs` lança o Chromium do sistema dentro do `test:unit`; sem `libnspr4` do SO, a suíte fica **1.166/1.168** | Log: `/tmp/chromium: error while loading shared libraries: libnspr4.so` | “Unitário vermelho” em ambiente sem navegador — indistinguível de regressão | Detectar a indisponibilidade e falhar com mensagem explícita, ou mover PU4 para um gate próprio de navegador |
| **E25** | O mapa SEC ancora **arquivo:linha**: inserir qualquer linha acima de uma âncora quebra `npm run reaudit:sec` (o passo de CI `SEC technical re-audit map`). Aconteceu nesta fatia — uma linha nova em `scripts/requisitos-222-inventory.mjs` levou a âncora de 206 para 207 e reprovou o job `static-and-smoke` | CI do PR #300 | Falso vermelho sempre que o código muda; o `--check` exige regenerar o JSON/MD a cada edição, sem provar nada novo | Trocar a âncora por **conteúdo** (padrão + hash do trecho) em vez de número de linha | **Aberto (novo)** |
| **E23** | `docs/REQUISITOS-222-REAUDITORIA-INVENTARIO-2026-10-27.md` §3 mantém contagens antigas (109 `mencionado`, 92 `somente_documento`, 27 sem gate) enquanto o JSON vigente diz **114 / 86 / 21** | Comparação relatório × JSON | Números divergentes na mesma família de documentos | Regerar a seção a partir do JSON |
| **E24** | Nenhuma rota tem **estados exercitados em navegador**: 101/101 declaram a lacuna, e 47 não têm sequer captura visual | `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` | “101/101 com gate” é verdade para *carregar a rota*, não para vazio/erro/negado | Tratar por família (UX-PRO-04/05/06) em vez de varrer as 101 rotas |

---

## 7. Decisões do proprietário que travam fatias

Sem decisão registrada, a fatia correspondente **não abre**:

1. Nome do papel **“supervisor”** (trilha T25 e aulas de supervisão).
2. Conteúdo técnico da aula 8 de T24; validação dos procedimentos [P];
   visitantes/veículos (T21 aula 2).
3. Relevância de mercado (EXT-03) e volume (EXT-04).
4. Escopo de **C11** financeiro, os 2 hits de dados e autorização do **D7**.
5. Dono do **inventário de bytes** e do **executor de backup**.
6. Provedores: SMTP, WhatsApp, fiscal, pagamento, eSocial/relógio,
   CFTV/biometria, HERE, Ollama, storage/KMS.
7. **RPO/RTO**, teto de hospedagem (referência R$ 200/mês), domínio, CNPJ,
   logotipo, política de privacidade aprovada, textos e FAQ.
8. Modo de acesso remoto (historicamente **Tailscale Funnel**, opção B) —
   **não ativar** sem autorização específica.
9. **Matriz papel × ação × escopo** do CLI-02 (para ligar `cli_contact_scopes`
   à autorização efetiva sem inferir permissão por nome de papel).
10. Autorização **explícita e por escrito** para publicar em produção.

---

## 8. Ordem de execução recomendada

**Agora (P0, destrava o resto):**

1. **E20** — reconciliar o ledger (`STATUS-VIGENTE.md`) com o HEAD: 101 rotas,
   001–181, próxima **182**.
2. **Backup real** (A1) — depende de decisão 5 (dono/inventário) e 6 (storage/KMS).
3. **Segurança/privacidade** (A3/A4) — matriz de autorização, retenção efetiva,
   parecer jurídico, segredos por ambiente.
4. **F02** (A2) e **banco de destino** (A5) — exigem máquina do operador.

**Depois (P1, uma PR por item):**

5. **CLI-03 UI** (B7) — consumir o detalhe publicado; é a menor fatia com lacuna
   comprovada e contrato já provado.
6. **CLI-02 decisão de papéis** (B8) → só então enforcement.
7. **UX-PRO-03** — próximas famílias de órfãos **com prova** (uma por PR),
   decidindo primeiro o gate de papel do `IntegrationsClient` (B2).
8. **UX-PRO-05 → UX-PRO-04 → UX-PRO-06** (B3/B4/B5), nessa ordem de menor risco.
9. **Reauditoria 222 por família** (B10), começando por **EXT-16/17** (após
   privacidade) e **AI-01..10** (após decisão de provedor).
10. **F14** (IA real) e **F15** (atores externos, upload, jobs) — só com
    provedores e privacidade aprovados.

**Dívida (P2), em paralelo quando o CI estiver folgado:**
**E22** (hermeticidade da suíte) → **E23** → **E21** → **E7** → **E16** → **E15**.

**Produção (P3):** somente depois de A1–A6 e das 10 decisões acima.

### Próxima fatia sugerida (menor risco, maior valor)

**B7 — UI do detalhe publicado de contrato no portal do cliente**, com teste
focal RED→GREEN, cenário A/B em PostgreSQL 17 + Chromium, preservação da última
leitura em falha de releitura e nenhum campo novo exposto (`file_url` e
`storage_key` continuam fora da projeção). Ela fecha o último contrato já
provado que ainda não tem tela e não depende de nenhuma decisão do proprietário.

---

## 9. Limites desta auditoria

- Foram executados **somente** `npm ci`, `npm test`, `typecheck`, `build`, wave0,
  cinco inventários `--check` e `npm audit`, em Linux/Node 22.
- **Não** foram executados os gates PostgreSQL/Chromium (dos 75 scripts `test:*`): faltam
  `postgres`/`pg_dump` e as bibliotecas do Chromium no sandbox. Os números
  desses gates vêm dos relatórios datados e **devem ser reconferidos** antes de
  qualquer declaração.
- Não houve validação em **Windows**, teste com **leitor de tela**, revisão
  **WCAG** manual, análise de segurança ofensiva, parecer jurídico/contábil,
  **aceite humano** ou UAT.
- Este documento **não** promove nenhum requisito, **não** marca item de
  produção e **não** substitui `STATUS-VIGENTE.md`.
