# ERP do Grupo SEG × Omie — o que o sistema é e o que falta para substituir a Omie

**Data:** 30/10/2026 (America/Sao_Paulo)
**Base:** `a646339` (`main`, merge da PR #309) · branch `arena/2db4a2bb-gruposegsystemseguranca`
**Natureza deste documento:** levantamento de produto e de lacunas para apresentação ao proprietário.
Não declara homologação, aceite humano, conformidade legal nem prontidão de produção.
A fonte única de estado continua sendo [`STATUS-VIGENTE.md`](STATUS-VIGENTE.md).
**Apresentação que acompanha este documento:** [`APRESENTACAO-ERP-SEG-SYSTEM-2026-10-30.html`](APRESENTACAO-ERP-SEG-SYSTEM-2026-10-30.html)

---

## 0. Sumário executivo

| Pergunta | Resposta curta |
|---|---|
| O sistema existe? | Sim. 101 telas, 134 módulos de API, 581 tabelas, 181 migrações, 1.215 verificações automáticas verdes. |
| Ele se parece com um ERP? | Sim, e em várias frentes é mais profundo que a Omie — porque conhece posto, escala, plantão, ronda, patrimônio e portal do cliente. |
| Substitui a Omie hoje? | **Não.** Faltam cinco famílias: nota fiscal, cobrança registrada, conciliação automática, camada contábil e operação de produção. |
| Quantas dessas são "meses de tela"? | **Uma** (operação de produção). As outras quatro são integração com fornecedor: prefeitura, banco, contador e infraestrutura. |
| Quanto custa manter a Omie? | R$ 895/mês = **R$ 10.740/ano** (valor informado pelo proprietário). |
| O que o sistema já economiza ao existir? | Custo marginal zero por usuário; operação, escala, ponto, portal e patrimônio no mesmo lugar, sem assinatura adicional. |
| Recomendação | Não cancelar a Omie hoje. Cancelar no fim da **fase 3**, com data marcada, após produção segura + nota + cobrança + contábil. |

---

## 1. Como este levantamento foi feito

1. Leitura do código vigente: `src/app` (101 `page.tsx`), `src/server` (134 módulos `.mjs`), `db/migrations` (181 arquivos), `server.mjs` (6.216 linhas de despacho).
2. Leitura do plano mestre (`docs/PLANO-MESTRE-IMPLEMENTACAO.md`, 222 requisitos rastreados) e da auditoria de 28/10 (`docs/AUDITORIA-FATIAS-PENDENTES-2026-10-28.md`).
3. Leitura do gate de produção (`docs/PRODUCAO-GATE.md`) e do `STATUS-VIGENTE.md`.
4. Contagem executada nesta data (rotas, migrações, módulos, testes, workflows, `CREATE TABLE`).
5. Comparação com material público da Omie (módulos declarados e faixa de preço) — **não** com a fatura do proprietário, que não foi vista.

> **Limite declarado:** a comparação por família é correta; a comparação *item a item com a fatura dele* só será exata quando soubermos quais módulos ele realmente paga. Essa é a decisão nº 1 da lista final.

---

## 2. O que o sistema é, frente por frente

Referência de código entre parênteses. "Existe" significa: banco + servidor + tela + autorização no servidor. **Não** significa aceite do dono.

### 2.1 Site, conteúdo e captação — PUB

Site institucional com 10 layouts alternativos (layout 06 é o padrão), SEO técnico, páginas de serviço e segmento, FAQ, casos, conteúdos, orçamento e simulador em 4 etapas, proposta/aceite por token, `noindex` ativo em ambiente não produtivo.
(`src/app/page.tsx`, `src/components/Layout06.tsx`, `src/server/seo-api.mjs`, `seo-technical-api.mjs`, `proposal-acceptance-api.mjs`)

### 2.2 Comercial — CRM

Empresas, contatos com papel no processo de compra, unidades atendidas, oportunidades com funil e motivo de perda obrigatório, tarefas, cadências, visitas/agenda, notas, interações, catálogo, equipamentos, vistoria, orçamento de mão de obra e técnico, parâmetros de custo/tributo versionados, cenários de preço, desconto com alçada, proposta versionada, aceite por link expirável, comissão e metas.
(`crm-api`, `crm-interaction`, `crm-task`, `crm-cadence`, `crm-visit`, `crm-note`, `budget-api`, `labor-budget-api`, `technical-budget-api`, `price-scenario-api`, `cost-parameter-api`, `discount-api`, `proposal-api`, `commission-api`)

### 2.3 Contratos e implantação — CON

Rascunho → revisão → assinatura → ativo → suspenso → encerrado; itens recorrentes e avulsos; aditivo e reajuste com histórico; alertas de renovação; obrigações documentais com responsável e comprovante; implantação com checklist e bloqueio; encerramento com desmobilização e revogação; dossiê de fiscalização; diário de decisões.
(`contract-api`, `contract-amendment-api`, `contract-alert-api`, `contract-doc-obligation-api`, `contract-implantation-api`, `contract-closure-api`, `contract-status-api`, `contract-details-api`, `contract-management-diary-api`, `contract-fiscal-api`)

### 2.4 Operação — OPS

Cliente → unidade → posto → necessidade por turno → alocação; cargo como entidade separada; dimensionamento; escala versionada com ciência; validação de conflito e habilitação; pendência de cobertura; passagem de plantão com aceite; livro de ocorrências; checklist de posto; ronda; supervisão e inspeção; limpeza; monitoramento sintético.
(`ops-api`, `ops-advanced-api`, `ops-advanced2-api`, `ops-advanced3-api`, `ops-pendency-api`, `inspection-api`)

### 2.5 Pessoas — HR / EMP

Cadastro profissional separado do login; histórico de cargo/lotação/remuneração; recrutamento e banco de talentos; admissão com checklist; férias; afastamentos; ponto com geolocalização e comprovante; banco de horas e correções; benefícios; treinamento com validade; desligamento com revogação; importação de holerite com revisão, versão e correção; avaliações; atendimento interno; reclamação confidencial; PWA do funcionário com fila offline.
(`employee-api`, `hr-api`, `hr-advanced-api`, `hr-absence-api`, `hr-benefits-api`, `hr-recruitment-api`, `hr-termination-api`, `hr-training-api`, `employee-time-clock-api`, `time-clock-core`, `emp-*-api`, `emp-pwa-api`)

### 2.6 Portal do cliente — CLI

Acesso com MFA, convite/autocadastro com aprovação, recuperação, sessão e troca de e-mail; 10 telas de leitura isoladas por conta ativa (cobranças, contratos, agenda, solicitações, chamados, reclamações, documentos, satisfação, renovação, relatórios); chamados com SLA e pausa; visitas com reagendamento; relatórios com aceite; delegação de contatos; detalhe publicado de contrato.
(`client-access-api`, `client-space-api`, `client-security-api`, `cli-api`, `cli-advanced-api`, `cli-finance-api`, `client-employee-complaint-api`)

### 2.7 Financeiro — FIN

Contas a receber e a pagar; recorrência idempotente por contrato/competência; baixa parcial, estorno e renegociação; conciliação com sugestão; cobrança com responsável e histórico; fluxo de caixa e aging; custo e rateio; resultado gerencial por contrato; despesas e compras com alçada; fiscal declarativo; gateway declarativo; orçamento e cenário; exportação; fechamento de competência; comissão.
(`fin-api`, `fin-advanced-api`, `fin-management-api`, `fin-budget-api`, `f03-finance-api`)

### 2.8 Patrimônio, estoque, compras e manutenção — AST

Ativo serializado por cliente/posto/colaborador com termo de guarda; entrega e devolução; manutenção preventiva e corretiva; ordem de serviço com checklist e aceite; CFTV com dossiê técnico; SKU, movimentos e saldo derivado; requisição → cotação → pedido → recebimento vinculado ao contas a pagar; inventário físico com divergência.
(`ast-api`, `ast-advanced-api`, `equipment-api`, `maintenance-doc-api`)

### 2.9 Gestão e aprovação — ADM

Painel "Meu dia" com pendências reais; aprovação unificada de desconto/compra/despesa/exceção com alçada; indicadores com fonte e período; metas e cenário; relatórios gerados e enviados com auditoria; configurações de negócio versionadas; diário de decisões; analytics e expansão.
(`adm-api`, `adm-advanced-api`, `adm-panel-api`, `admin-audit-api`, `admin-notifications-api`)

### 2.10 Governança, TI e privacidade — SEC / PLT

Identidade staff individual, MFA TOTP com recuperação, RBAC granular, sessão revogável, mesma origem, idempotência, auditoria transacional com rollback; console de TI com 23 abas; integrações com status honesto; observabilidade e healthcheck; LGPD declarativa com pedido de titular; retenção; incidente; configuração e ambiente; catálogo de backup (somente metadados — execução recusa com 503).
(`rbac`, `staff-session`, `admin-rbac-api`, `admin-audit-api`, `backup-api`, `observability-api`, `healthcheck-api`, `privacy-api`, `retention-api`, `lgpd-request-api`, `incident-api`, `integrations-api`, `config-api`)

### 2.11 Expansões — EXT-01..17 e IA

Frota, terceiros, licitações, fornecedores, qualidade, satisfação, compliance, conhecimento, expansão, continuidade, analytics, editor visual, relatórios, inteligência comercial, apoio emergencial; central/vídeo e biometria existem apenas como estrutura de tabela, sem coleta; IA/RAG em 4 escopos privados com curadoria, custo/token e revisão.

### 2.12 Isolado

**Academia** (24 trilhas, gamificação, certificados) roda separada, porta 3100, sem login único e sem integração — não faz parte do ERP hoje.

---

## 3. Paridade com a Omie, família por família

Legenda: **igual** = cobre o uso típico; **parcial** = estrutura pronta, falta execução externa; **falta** = não existe.

| # | Família | Omie | SEG System | Lacuna principal |
|---|---|---|---|---|
| 1 | Contas a pagar/receber | completo | **igual** | — |
| 2 | Recorrência e contrato | completo | **igual** | — |
| 3 | Baixa, estorno, renegociação | completo | **igual** | — |
| 4 | Fluxo de caixa e aging | completo | **igual** | — |
| 5 | Resultado/margem por contrato | DRE contábil | **igual (gerencial)** | DRE contábil formal (§4.4) |
| 6 | Conciliação bancária | automática (banco/OFX) | **parcial** | Leitura de extrato (§4.3) |
| 7 | Boleto/Pix/cobrança | Omie.Cash | **falta** | Gateway + conta (§4.2) |
| 8 | NFS-e / NF-e | emissão nativa | **falta** | Provedor fiscal (§4.1) |
| 9 | Integração contábil / SPED | painel do contador | **falta** | Plano de contas + exportação (§4.4) |
| 10 | CRM, funil e tarefa | básico | **melhor** | Envio real (e-mail/WhatsApp) |
| 11 | Proposta e contrato | básico | **melhor** | Assinatura eletrônica |
| 12 | OS e serviços | completo | **igual** | Upload de evidência |
| 13 | Estoque e compras | completo | **parcial** | XML de compra, custo médio, curva ABC |
| 14 | Patrimônio / comodato | não tem | **melhor** | — |
| 15 | Escala, ponto, plantão, ronda | não tem | **melhor** | — |
| 16 | Portal do cliente/funcionário | não tem | **melhor** | — |
| 17 | App mobile | app maduro | **parcial** | PWA → app dedicado |
| 18 | Relatórios e BI | vários nativos | **parcial** | Exportação e painel analítico |
| 19 | Usuários e permissões | por usuário pago | **melhor** | — |
| 20 | Multiempresa/filial | sim | **falta** | Uma organização apenas |
| 21 | API pública/integração | API + marketplace | **falta** | Chave, webhook e documentação |
| 22 | Backup, disponibilidade, suporte | gerido | **falta** | §5 |
| 23 | Atualização fiscal contínua | inclusa | **falta** | §6 (processo, não código) |

---

## 4. Lacunas de produto e integração

Cada item traz **o que falta**, **critério de aceite** e **o que trava**. IDs referenciam o catálogo de 222 requisitos já existente, para não criar um segundo catálogo.

### 4.1 NFS-e / NF-e — `FIN-11` · prioridade P1 · fase 2
- **Falta:** emissão, cancelamento, consulta, XML/PDF, regra por atividade e município, guarda do documento e reprocessamento de rejeição.
- **Hoje:** `fin-management-api` registra regra de atividade, obrigação, provedor e documento **declarado**; nenhuma nota é emitida. Não existe certificado, não existe chamada a prefeitura.
- **Aceite:** emitir uma NFS-e em homologação municipal, cancelar, guardar XML/PDF, reprocessar rejeição e recuperar por protocolo.
- **Trava:** escolha do provedor, certificado A1, regime tributário, lista de municípios, parecer do contador.

### 4.2 Cobrança registrada (boleto, Pix, link) — `FIN-12` · P1 · fase 2
- **Falta:** registro de boleto, Pix de cobrança, link de pagamento, webhook assinado com validação de replay, baixa automática e comprovante no portal do cliente.
- **Hoje:** `GatewayWorkspace` e `fin-management-api` declaram o provedor e o movimento; nada movimenta dinheiro.
- **Aceite:** gerar cobrança de teste em sandbox, receber webhook, baixar o título uma única vez (idempotência), refletir no extrato do cliente.
- **Trava:** banco ou gateway, taxa por boleto, conta de destino, política de inadimplência.

### 4.3 Conciliação automática — `FIN-05` · P1 · fase 2
- **Falta:** importação real de OFX/CNAB ou API bancária, casamento por valor/data/documento e regra de sugestão; hoje o extrato é registrado manualmente.
- **Aceite:** importar extrato de 30 dias, conciliar 90% das linhas sem digitação, tratar divergência com motivo.
- **Trava:** quais bancos e contas entram.

### 4.4 Camada contábil — `FIN-11`, `FIN-14`, `FIN-15` · P1 · fase 3
- **Falta:** plano de contas, centro de custo contábil, lançamento derivado, DRE contábil e exportação no formato do contador (inclusive SPED quando aplicável).
- **Aceite:** o contador importa o período sem retrabalho e confirma por escrito.
- **Trava:** reunião com o contador; formato e responsabilidade.

### 4.5 Estoque avançado — `AST-06` · P2 · fase 3
- **Falta:** importação do XML da nota de compra, custo médio, curva ABC, inventário cíclico.
- **Trava:** só vale se o proprietário controla estoque de verdade hoje.

### 4.6 API pública e webhook — `PLT-15` · P2 · fase 3
- **Falta:** chave por cliente, escopo, rate limit, webhook assinado e documentação.
- **Trava:** quem consome (contador, banco, parceiro) — sem consumidor, não priorizar.

### 4.7 Multiempresa / filial · P2 · sem fase definida
- **Falta:** hoje é **uma organização**. O módulo de expansão apenas planeja filial; não há segregação de CNPJ por operação.
- **Trava:** decisão de negócio. Se houver segundo CNPJ no horizonte, isso muda a arquitetura e precisa entrar antes da fase 2.

### 4.8 App dedicado, notificação e IA real — `EMP-18`, `PLT-05`, `AI-01..10` · P2 · fase 3+
- **Falta:** app nativo (hoje PWA), push real, fila durável de notificação, e modelo de IA ligado (hoje `OLLAMA_ENABLED=false`, fallback).
- **Aceite:** notificação entregue com tentativa/reprocessamento; IA respondendo apenas com fonte autorizada.

### 4.9 Atores externos — `EXT-02`, `EXT-04`, `EXT-15`, `EXT-16/17` · P3
- **Falta:** login, grant, canal e upload de **fornecedor** e **terceiro**; integração com portal público de compras; central 24h; biometria/vídeo.
- **Hoje:** a API declara a fronteira (`external_actor_boundary`) em vez de simular o ator. **Não é lacuna para substituir a Omie** — é escopo futuro condicional.

---

## 5. Bloqueios de engenharia e operação (impedem qualquer produção)

| # | Bloqueio | Estado medido | Aceite |
|---|---|---|---|
| 5.1 | **Backup e restauração reais** | `backup-api` devolve **503**; catálogo só tem metadados `unverified` | Snapshot banco+arquivos, storage externo criptografado, restauração medida com RPO/RTO |
| 5.2 | **Produção / deploy** | Só ambiente local com dado fictício; `PRODUCAO-GATE` com **0/10** itens | Domínio, HTTPS, banco de destino com 181 migrações, segredos por ambiente, monitoramento |
| 5.3 | **Upload real de arquivo** | Nenhum handler `multipart`/`formData` em `src/server` | Documento, foto de ronda, evidência de OS e nota fiscal recebidos com checksum, tipo e limite |
| 5.4 | **Executor de rotinas** | Só job in-process opcional; reinício perde agendamento (`E16`) | Fila durável com retomada, idempotência e prova de reinício |
| 5.5 | **Matriz de autorização completa** | Gates amostram; matriz conta/unidade/contrato não cobre todos os handlers e downloads | Reteste A/B em todo handler e download sensível |
| 5.6 | **Windows / instalação** | Depende da máquina do operador (`F02`) | Instalação persistente, reinício com dados, separação QA × produção |
| 5.7 | **LGPD efetiva** | Inventário, política e pedido de titular existem; retenção/exclusão são declarativas | Exclusão executada por job verificável, com prova |
| 5.8 | **Aceite humano / UAT** | **0/101** telas com aceite; 101 declaram estados não exercitados em navegador | Roteiro por papel assinado por Marcelo, Andreia, comercial, financeiro |

---

## 6. Sustentação — o que a assinatura pagava e passa a ser nosso

| Item | Por que importa | Dono necessário |
|---|---|---|
| Suporte com prazo | Escala não pode falhar às 6h de domingo | Proprietário define canal e SLA |
| Atualização fiscal | Layout municipal, regra e obrigação mudam sem aviso | Rotina mensal com provedor |
| Monitoramento e alerta | Falha silenciosa é pior que falha visível | TI/dev + alerta |
| Treinamento por papel | Sistema bom sem uso vira custo | Andreia / comercial / financeiro |
| Documentação de operação | Troca de programador não pode parar a empresa | Já existe base (393 documentos) |
| Revisão trimestral de acesso e backup | Governança e LGPD | Proprietário + TI |

**Consequência:** a economia de R$ 695/mês não é líquida enquanto não houver custo de sustentação definido. É a decisão nº 2 da lista.

---

## 7. O que **não** vamos replicar (e por quê)

| Recurso da Omie | Decisão | Motivo |
|---|---|---|
| Marketplace de apps | fora de escopo | Produto e ecossistema próprios; nenhum ganho para o grupo |
| PDV / multivarejo / e-commerce | fora de escopo | Não é o negócio; risco e custo altos |
| Motor próprio de folha e eSocial | fora de escopo | Responsabilidade trabalhista; hoje o holerite vem do contador — mesmo caminho da Omie no ERP padrão |
| Emissor fiscal caseiro | fora de escopo | Usar provedor especializado; emissor próprio exige homologação e manutenção municipal |
| Central 24h de monitoramento | fora de escopo | Exige operação humana e contrato de serviço; o sistema registra, não monitora |
| Conta digital própria | fora de escopo | Usar banco/gateway licenciado |

---

## 8. Roteiro em fases (com ordem não negociável)

| Fase | Entrega | Estimativa* | O que destrava |
|---|---|---|---|
| **1 · Produção segura** | Backup real com restauração medida, deploy, banco de destino, upload, executor, autorização completa, Windows | 4–6 semanas | Sistema pode receber **dado real** |
| **2 · Dinheiro e nota** | Boleto/Pix/link, webhook e baixa, extrato e conciliação, provedor fiscal e NFS-e, fechamento com o contador | 4–6 semanas | Financeiro deixa de depender da Omie |
| **3 · Paridade e corte** | Plano de contas e exportação contábil, importação de histórico, app, aceite por papel, migração assistida | 3–4 semanas | **Cancelamento da Omie** |
| **4 · Sustentação** | Suporte, atualização fiscal, treinamento, revisão de acesso e backup | contínuo | Operação estável |

\* Estimativa de engenharia para uma frente de trabalho, condicionada às decisões da §9. Não é compromisso de data.

---

## 9. Dez decisões do proprietário

1. Quais módulos da Omie estão na fatura hoje? (fecha a paridade item a item)
2. Quem responde por infraestrutura, backup e suporte?
3. Boleto/conta digital: Omie, banco ou gateway?
4. Qual provedor fiscal e qual certificado A1?
5. Teto mensal de infraestrutura e de provedores?
6. O contador aceita qual formato de exportação?
7. Existe filial ou segundo CNPJ no horizonte?
8. Licitação e frota entram no escopo real?
9. Quem homologa cada papel (Marcelo, Andreia, comercial, financeiro)?
10. Autorização por escrito para publicar em produção.

---

## 10. Economia

| Linha | Mensal | Anual |
|---|---|---|
| Omie (informado) | R$ 895 | R$ 10.740 |
| Infraestrutura do sistema próprio (teto previsto no plano) | ≈ R$ 200 | ≈ R$ 2.400 |
| Provedor fiscal / boleto / e-mail | por uso | por uso |
| **Economia bruta potencial** | **≈ R$ 695** | **≈ R$ 8.340** |

A economia não cobre o custo de conclusão (§8) nem de sustentação (§6). O ganho adicional — operação, escala, ponto, portal, patrimônio e governança no mesmo sistema — não tem preço de assinatura equivalente no mercado.

---

## 11. Limites deste documento

- Baseado em código e documentos desta data; não houve uso real com o proprietário, UAT, teste em Windows, leitor de tela, revisão WCAG manual nem parecer jurídico/contábil.
- A comparação com a Omie usa material público de módulos e preço, **não** a fatura do proprietário.
- Prazos são estimativas; nenhuma fase deve ser anunciada como concluída sem teste e aceite registrados.
- Este documento **não** promove requisito, **não** fecha item do gate de produção e **não** substitui `STATUS-VIGENTE.md`.

---

## 12. Próximos 30 dias (proposta)

1. Reunião de decisões (§9) com registro escrito.
2. Levantar a fatura da Omie e fechar a matriz de paridade item a item.
3. Três cotações de provedor fiscal e três de cobrança.
4. Iniciar fase 1 pelo backup real e pelo ambiente de produção.
5. Definir roteiro de homologação por papel (Marcelo, Andreia, comercial, financeiro).

---

## Anexo A — De onde vêm as 581 tabelas (conferência do número)

Pergunta legítima do proprietário: "581 tabelas, como assim?". A conferência, feita em 30/10/2026:

| Medida | Valor | Como foi medido |
|---|---|---|
| Arquivos de migração | 181 | `ls db/migrations/*.sql` |
| Comandos `CREATE TABLE` escritos | 580 | busca textual nas 181 migrações |
| Nomes de tabela **únicos** | 579 | 1 nome aparece duas vezes (`data_retention_policies`, recriada na migração 049) |
| Tabelas físicas no PostgreSQL | **581** | `SELECT count(*) FROM pg_tables WHERE schemaname='public'` no gate `test:migrations:pg` |

A diferença entre 579 nomes e 581 tabelas físicas tem duas causas legítimas:

1. `data_retention_policies` foi **renomeada** para `data_retention_policies_legacy` e recriada com o tipo novo (migração 049) — dois objetos físicos, um nome na contagem textual;
2. `__migrations` é a **tabela de controle do migrador** (checksum das 181 migrações), criada pelo próprio migrador e não por uma migração.

### Por que um ERP de serviço chega nesse volume

Cada requisito não vira "uma tabela". Vira um conjunto: entidade principal + itens + versão/histórico + evento + vínculo + evidência + regra de alerta. Exemplos reais do repositório:

- **Contrato:** 24 tabelas (`crm_contracts`, `..._items`, `..._amendments`, `..._amendment_history`, `..._status_history`, `..._posts`, `..._units`, `..._sla`, `..._obligations`, `..._documents`, `..._private_documents`, `..._implantations`, `..._closures`, `..._alerts`, `..._alert_rules`, `..._alert_runs`, `..._service_measurements`, `..._quality_evidences`, `..._schedule`, `..._scope_revocations`, `..._portal_links`, `..._fiscal_dossiers`, `..._exclusions`, `..._responsibles`).
- **Operação:** 52 tabelas (`ops_*`), incluindo alocação, escala assistida com conflito, cobertura, passagem de plantão, checklist, ronda, chaves, limpeza, métricas e monitoramento.
- **Pessoas:** 115 tabelas (`hr_*` 71 + `emp_*` 44) — cadastro, documento, férias, ponto, benefício, treinamento, desligamento, holerite, avaliação, atendimento e app do funcionário.

Distribuição por família (nomes únicos):

| Família | Tabelas | Família | Tabelas |
|---|---|---|---|
| `crm_*` comercial e contrato | 84 | `pub_*` site e conteúdo | 21 |
| `ext_*` expansões | 72 | `ast_*` patrimônio, estoque e OS | 21 |
| `hr_*` RH e DP | 71 | `adm_*` gestão e aprovação | 19 |
| `ops_*` operação | 52 | `auth_*` identidade e sessão | 16 |
| `emp_*` funcionário | 44 | `client_*` portal do cliente | 15 |
| `fin_*` financeiro | 42 | `ai_*` IA e RAG | 15 |
| `cli_*` atendimento ao cliente | 40 | demais 35 famílias (observabilidade, staff legado, incidente, dependência, backup, SEO, CMS, LGPD, privacidade, ambiente…) | 67 |
| **Total** | | | **579 nomes** |

### O que esse número **não** significa

- **Não** significa 581 tabelas em uso com dado real: o ambiente atual é local/descartável, com dado fictício.
- **Não** significa 581 telas: são 101 rotas.
- **568 dos 579 nomes** aparecem em algum módulo de código (`src/server`, `server.mjs` ou `scripts`). Os **11 restantes** não são tocados por nenhum módulo hoje — são estrutura de ondas anteriores, principalmente o antigo schema `staff_*` (`staff_posts`, `staff_assignments`, `staff_scale_rules`, `staff_time_entries`, `staff_shift_handover`), além de `crm_report_snapshots`, `observability_metrics`, `emp_confidential_attachments`, `ext_central_events`, `pub_theme_previews` e `client_access_grant_contracts`. Isso deve ser declarado como dívida de limpeza, não como funcionalidade.
- Volume de tabela **não é** medida de qualidade. O que justifica o volume é a exigência de histórico, versão, evidência e auditoria em cada regra — exatamente o que separa um ERP de uma planilha.
