# Mapa de fluxos do sistema — base para a academia de conhecimento

Levantamento feito a partir do código do branch `arena/6ff33805-gruposegsystemseguranca` (commit `e5e197c`), em 2026-10-09.
Objetivo: listar **todos os fluxos**, por categoria, para planejar os vídeos. Não é um teste de aceitação.

## Como ler este mapa

**Status (evidência estática: rota + API + inventário):**

| Marca | Significado |
|---|---|
| ✅ | Tela ligada a rota e a API no servidor. Pode virar vídeo de fluxo real. |
| ⚠️ | Funciona, mas usa dado **sintético** ou **sandbox**, ou tem pendência declarada no repositório. Grave com rótulo de demonstração. |
| ❌ | Protótipo **sem rota** (componente existente, não renderizado). **Não gravar como fluxo.** |

**Antes de gravar qualquer fluxo:** rode o caminho na tela real, com dados fictícios, e confirme cada passo. A marca ✅ indica que o caminho existe no código, não que foi testado na interface.

**Papéis de equipe** (definidos em `src/server/staff-session.mjs`): `admin`, `ti`, `rh`, `marcelo`, `supervisor`, `comercial`, `financeiro`.
Página inicial por papel (`src/lib/admin-entry.mjs`): Marcelo → `/admin/marcelo`; RH → `/admin/funcionarios`; Comercial → `/admin/crm`; Financeiro → `/admin/financeiro`; Supervisor → `/admin/operacao`; Admin e TI → `/admin`.
Os grupos do menu **não concedem acesso**; a autorização é decidida no servidor em cada API.

---

## 0. Cadeia de ponta a ponta (o fio condutor)

Um mesmo registro atravessa os módulos. Esta é a espinha dorsal para o vídeo de visão geral:

1. **Site público** → pedido de orçamento, contato ou simulador → `/api/leads` ✅
2. **CRM** → lead convertido em empresa e oportunidade ✅
3. **Proposta** → criada no CRM, enviada por link de aceite → `/proposta/aceite/[token]` ✅
4. **Contrato** → criado a partir da proposta aceita ✅
5. **Operação** → postos, escala, ponto, ocorrências ✅
6. **Financeiro** → cobrança e competência (parte em sandbox) ⚠️
7. **Painel do Marcelo** → pendências e decisões de todos os módulos ✅

---

## 1. Site público e captação

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| Pedir orçamento | Seção "Solicitar proposta" → formulário → `/api/leads` | ✅ | Microvídeo (45–90 s) |
| Falar com a empresa | `/contato` → formulário → `/api/leads` | ✅ | Microvídeo |
| Simulador | `/simulador` → cálculo → envio como lead | ✅ | Microvídeo |
| Conhecer serviços | `/servicos` e `/servicos/[id]` | ✅ | Trailer |
| Conhecer segmentos | `/segmentos` e `/segmentos/[key]` | ✅ | Trailer (variante) |
| Pacotes | `/pacotes` | ✅ | Microvídeo |
| Conteúdos e FAQ | `/conteudos`, `/conteudos/[slug]`, `/faq` | ✅ | Microvídeo |
| Assistente de dúvidas (FAQ) | Pergunta no site → resposta assistida ou encaminhamento | ⚠️ | Só gravar após confirmar a resposta no ambiente (ver §11) |
| Privacidade e LGPD | `/privacidade` e solicitação de titular (`/api/lgpd/requests`) | ✅ | Microvídeo |
| Galeria de layouts | `/layout-01` a `/layout-10` | ⚠️ | Não é fluxo de cliente; só marketing/administração |

---

## 2. Comercial e relacionamento (CRM)

Módulo: `/admin/crm` (papel comercial). Recursos principais: empresas, contatos, funil, leads, cadências, tarefas, visitas, comissões, descontos, propostas, orçamentos, campanhas e importação por CSV.

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| Converter pedido recebido | Lead do site → "Converter pedido recebido" → empresa e oportunidade | ✅ | Jornada (2,5–4 min) |
| Movimentar oportunidade no funil | Funil → mover etapa → registrar histórico | ✅ | Microvídeo |
| Registrar interação e nota | Detalhe da oportunidade → histórico, notas internas | ✅ | Microvídeo |
| Tarefas e delegação | Criar tarefa → delegar a outro comercial → aceitar delegação | ✅ | Microvídeo |
| Agenda de visitas e reuniões | Agendar visita → conflito de agenda → confirmar | ✅ | Microvídeo |
| Cadências manuais | Modelo de cadência → aplicar à oportunidade → tarefas criadas | ✅ | Microvídeo |
| Importar empresas por CSV | Escolher conteúdo → revisar prévia → decidir duplicatas → confirmar | ✅ | Microvídeo (dados fictícios) |
| Descontos | Pedido de desconto → política → aprovação | ✅ | Microvídeo (confirmar quem aprova) |
| Comissões | Regra de comissão → provisão | ✅ | Só para o comercial/financeiro |
| Criar proposta | Oportunidade → proposta → link de aceite | ✅ | Jornada (parte da cadeia) |
| Orçamento de mão de obra e técnico | Orçamento de mão de obra / técnico vinculado à proposta | ✅ | Só para quem precisa |
| Carteira | `/admin/carteira` | ✅ | Microvídeo |
| Leads (lista) | `/admin/leads` | ✅ | Parte do fluxo de conversão |
| Inteligência comercial | `/admin/inteligencia` | ⚠️ | Não gravar sem fonte e data-base confirmadas |
| Expansão e novas unidades | `/admin/expansao` | ⚠️ | Confirmar dados antes de gravar |
| Satisfação | `/admin/satisfacao` | ✅ | Microvídeo |

---

## 3. Propostas, aceite e contratos

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| Entrega da proposta | Proposta → entrega (link de aceite) → registro de envio | ✅ | Jornada |
| Aceite do cliente | Link `/proposta/aceite/[token]` → aceitar a versão → registro do aceite | ✅ | **Destaque 1 da cadeia** (microvídeo) |
| Comparação de propostas | Comparar versões da proposta | ✅ | Só se o comercial pedir |
| Criar contrato a partir da proposta aceita | `/admin/contratos` → "Criar a partir de proposta aceita" | ✅ | Jornada |
| Cadastro manual de contrato | Contrato manual identificado | ✅ | Microvídeo |
| Implantação do contrato | Contratos e implantação → etapas | ✅ | Jornada |
| Escopo e vigência | Itens do contrato, escopo, vigência | ✅ | Microvídeo |
| Aditivo | Criar aditivo → registrar alteração | ✅ | Microvídeo |
| Alertas de vencimento | Alertas de contrato (vencimento) | ✅ | Microvídeo |
| Diário de gestão do contrato | Diário de gestão (CON-11) | ✅ | Microvídeo |
| Obrigações documentais | Obrigações documentais (CON-06) | ✅ | Microvídeo |
| Encerramento de contrato | Encerramento → fechamento | ✅ | Microvídeo |
| Versões comerciais | Vistoria, orçamento, proposta e contrato → histórico de versões | ✅ | Só para comercial |

---

## 4. Operação e entrega de serviço

Módulo: `/admin/operacao` (papel supervisor). Recursos: postos, alocações, escala, cobertura, ocorrências, passagem de plantão, checklists.

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| Cadastro de postos | Postos físicos e cargos/funções | ✅ | Jornada |
| Habilitação e documentação | Documentação exigida por função | ✅ | Microvídeo |
| Necessidade por turno | Definir necessidade por turno e faixa | ✅ | Microvídeo |
| Alocação de pessoas | Alocações → confronto com o planejado | ✅ | Jornada (escala) |
| Escala versionada | Versões de escala → publicar → ciência da escala | ✅ | Jornada |
| Regras de jornada e descanso | Regras de jornada/descanso | ✅ | Só para supervisão |
| Solicitação de cobertura e substituição | Solicitar cobertura → aprovar → comunicar | ✅ | Jornada |
| Lacunas de cobertura | Lacunas → plano de cobertura | ✅ | Microvídeo |
| Livro de ocorrências | Registrar ocorrência → gravidade, local, categoria → ações → evidências | ✅ | **Vídeo do funcionário (já publicado)** |
| Passagem de plantão | Registro de passagem entre turnos | ✅ | Microvídeo |
| Checklists de posto | Modelo → instância → execução | ✅ | Microvídeo |
| Rondas e leituras de ronda | Pontos de ronda → leitura → replay | ✅ | Microvídeo (confirmar em tela real) |
| Monitoramento (eventos) | Conectores e eventos de monitoramento → escalonamento | ⚠️ | Só com conector real; senão, demonstração |
| Pendências operacionais | `/admin/pendencias` e varredura de pendências | ✅ | Parte do painel do Marcelo |
| Limpeza (rotinas e não conformidades) | Rotinas de limpeza → execução → não conformidade | ✅ | Microvídeo |
| Chaves | Movimentação de chaves | ✅ | Microvídeo |
| Dimensionamento | Dimensionamento de posto | ⚠️ | Confirmar cálculo antes de gravar |
| Frota | `/admin/frota` | ✅ | Microvídeo |
| Patrimônio e almoxarifado | `/admin/patrimonio` | ✅ | Microvídeo |
| Terceiros | `/admin/terceiros` | ✅ | Microvídeo |
| Qualidade | `/admin/qualidade` | ✅ | Microvídeo |
| Apoio emergencial | `/admin/emergencial` | ✅ | Microvídeo (importante para operação) |
| Continuidade de negócios | `/admin/continuidade` | ✅ | Microvídeo |

---

## 5. Pessoas e RH

Módulo: `/admin/funcionarios` (papel RH). Abas: Equipe, Admissão e acesso, Escala, Solicitações, Documentos, Fechamento e holerite, Desligamento, Demais processos de RH.

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| **Admissão** | Novo cadastro profissional → matrícula, nome, cargo, lotação, empregador, data → "Criar cadastro e abrir admissão" | ✅ | **Vídeo de RH (já publicado)** |
| **Credenciais** | Criar acesso do funcionário → pessoa → e-mail individual → "Gerar credencial temporária" (exibida uma vez) | ✅ | Parte do vídeo de RH |
| Escala | Publicar escala versionada → ciência da escala | ✅ | Microvídeo |
| Ponto e ajustes | Consultar ponto por funcionário → ajustes solicitados pelo funcionário → decisão | ✅ | Jornada (RH) |
| Solicitações do funcionário | Férias, afastamento, benefício, reembolso → aprovar ou rejeitar | ✅ | **Férias: sem captura real (ver §11)** |
| Documentos privados | Documentos privados do funcionário | ✅ | Microvídeo |
| **Holerite** | Fechamento demonstrativo → publicar holerite (espaço privado do titular) | ✅ | Parte do vídeo de RH |
| Fechamento do período | Fechar período demonstrativo | ✅ | Microvídeo |
| **Desligamento** | Pessoa, tipo, data, motivo → "Revisar antes de concluir" → concluir e revogar acesso | ✅ | Parte do vídeo de RH |
| Treinamento | Processo de treinamento | ✅ | Microvídeo |
| Recrutamento | Processo de recrutamento | ✅ | Microvídeo |
| Benefícios | Processo de benefícios | ✅ | Microvídeo |
| Afastamento | Processo de afastamento | ✅ | Microvídeo |
| Assistente de RH | `/admin/rh/assistente` | ⚠️ | Só após confirmar resposta no ambiente (§11) |

---

## 6. Financeiro e conformidade

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| Contas a receber e a pagar | Contas → baixa | ✅ | Jornada (financeiro) |
| Recorrência | Regra de recorrência → gerar lançamentos | ✅ | Microvídeo |
| Conciliação bancária | Importar extrato → conciliar → confirmar ou marcar divergência | ⚠️ | Extratos sintéticos: rotular |
| Cobrança | Política de cobrança → lembrete → histórico | ⚠️ | Cobrança sintética: rotular |
| Pagamento (boleto, Pix, gateway) | Gateway de pagamento | ⚠️ | **Sandbox**: não gravar como real |
| Aging e fluxo de caixa | Aging de recebíveis → fluxo de caixa | ✅ | Microvídeo |
| Custos e rateio | Alocar custo → centro de custo | ✅ | Microvídeo |
| Orçamento | Criar orçamento → cenários | ✅ | Microvídeo |
| Fechamento e reabertura de competência | Fechar competência → reabrir (com motivo) | ✅ | Jornada (financeiro) |
| Documento fiscal | Documento fiscal | ⚠️ | **Sintético**: não gravar como fiscal real |
| Exportações | Exportação do período | ✅ | Microvídeo |
| Compliance corporativo | Declarar obrigação → referência documental → plano de ação → renovar | ✅ | Jornada (compliance) |
| Avaliação temporal de compliance | Agenda de avaliação → resultado → tarefas por vencimento | ✅ | Microvídeo (já previsto no guia como curinga) |
| Licitações | `/admin/licitacoes` | ✅ | Microvídeo |
| Fornecedores | `/admin/fornecedores` | ✅ | Microvídeo |

---

## 7. Portal do cliente

Área: `/cliente/app` (após login). Acesso por convite.

### 7.1 Acesso e segurança

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| Receber convite e aceitar | Convite → aceitar → confirmar e-mail | ✅ | **Jornada do cliente** (convite até o primeiro acesso) |
| Entrar | Login do cliente | ✅ | Parte da jornada |
| Recuperar e redefinir senha | Recuperar senha → redefinir | ⚠️ | Recuperação local, "sem SMTP" no ambiente |
| Alterar e-mail | Pedido de troca → verificação | ✅ | Microvídeo |
| Segurança: MFA | Ativar, verificar, desativar MFA | ✅ | Microvídeo |
| Segurança: sessões | Ver e encerrar sessões | ✅ | Microvídeo |
| Pedido de acesso ao portal | Solicitação de acesso (portal) | ✅ | Microvídeo |

### 7.2 Dia a dia do cliente

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| Painel | Visão geral do que é do cliente | ✅ | Trailer (cliente) |
| Contratos e serviços | Ver contratos e itens | ✅ | Microvídeo |
| Documentos | Ver, baixar (acesso registrado) | ✅ | Microvídeo |
| Chamados | Abrir chamado → acompanhar → aceitar atendimento e encerrar | ✅ | **Destaque 3 (portal)** — microvídeo |
| Solicitações de serviço | Pedido de serviço → acompanhamento | ✅ | Microvídeo |
| Cobranças | Ver cobranças | ⚠️ | Dados financeiros: confirmar fonte antes de gravar |
| Agenda de visitas | Visitas e manutenções | ✅ | Microvídeo |
| Relatórios | Relatórios de execução, medição e aceite | ✅ | Microvídeo |
| Satisfação | Pesquisa de satisfação → plano de ação | ✅ | Microvídeo |
| Renovação | Comunicação de renovação | ✅ | Microvídeo |
| Continuidade | Planos de continuidade | ✅ | Microvídeo |
| Reclamação de colaborador | Registrar reclamação sobre colaborador | ✅ | Microvídeo |
| Assistente | `/cliente/app/assistente` | ⚠️ | Só após confirmar resposta (§11) |
| Portal e contatos | Contatos com escopos e delegados | ✅ | Microvídeo |

---

## 8. Portal do funcionário

Área: `/funcionario`. Sessão individual, sem acesso a dados de equipe ou RH.

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| Entrar e início | Login → início (escala, comunicados, atalhos do dia) | ✅ | **Vídeo do funcionário (já publicado)** |
| Registrar ponto | Entrada, ronda, saída. Localização com consentimento | ✅ | Microvídeo (confirmar consentimento na tela) |
| Ocorrência | Categoria, gravidade, local, descrição → segue para análise | ✅ | **Vídeo do funcionário (já publicado)** |
| Ausência / falta | Registrar ausência | ✅ | Microvídeo |
| Pedido | Pedido (férias, benefício, afastamento, reembolso) → aguarda RH | ✅ | Microvídeo |
| Troca de escala | Solicitar troca de turno | ✅ | Microvídeo |
| Ajuste de ponto | Solicitar correção de ponto | ✅ | Microvídeo |
| Uniforme | Solicitação e confirmação de recebimento | ✅ | Microvídeo |
| Documentos | Ver documentos privados | ✅ | Microvídeo |
| Perfil | Ver e solicitar atualização de dados | ✅ | Microvídeo |
| Comunicados e procedimentos | Ciência de comunicado e de procedimento | ✅ | Microvídeo |
| Comprovante de curso | Enviar comprovante | ✅ | Microvídeo |
| Atendimento privado com RH | Abrir protocolo confidencial | ✅ | Microvídeo |
| Reclamação | Registrar reclamação | ✅ | Microvídeo |
| Passagem de plantão | Recebimento de passagem | ✅ | Microvídeo |
| Uso sem internet (PWA) | Registro offline e sincronização | ⚠️ | Confirmar sincronização antes de gravar |
| Acessibilidade e FAQ | Preferências e perguntas frequentes | ✅ | Microvídeo |

---

## 9. Painel do Marcelo (visão de gestão)

Módulo: `/admin/marcelo`. Papel: Marcelo.

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| Painel de pendências | O que exige decisão no período | ✅ | **Vídeo do Marcelo (já publicado)** |
| Aprovação unificada | Aprovar pedidos de todos os módulos em um só lugar | ✅ | Parte do vídeo do Marcelo |
| Decisões registradas | Diário de decisões → registro canônico | ✅ | Microvídeo |
| Indicadores: meta x realizado | Período dos indicadores → meta estimada x realizado | ✅ | Parte do vídeo do Marcelo |
| Relatórios limitados e auditados | Relatórios gerados com trilha | ✅ | Microvídeo |
| Assistente Marcelo | `/admin/marcelo/assistente` | ⚠️ | Só após confirmar resposta (§11) |
| Análises e analytics | `/admin/analytics`, `/admin/relatorios` | ✅ | Microvídeo |

---

## 10. Administração, acessos e sistema

| Fluxo | Passos principais | Status | Vídeo sugerido |
|---|---|---|---|
| Entrada da equipe | `/admin/entrar` → login → página inicial por papel | ✅ | Microvídeo (**"cada papel vê o que pode ver"**) |
| Hub administrativo | `/admin` → grupos e módulos visíveis ao papel | ✅ | Trailer ou microvídeo |
| Convite administrativo | `/admin/convite` → aceitar | ✅ | Microvídeo |
| Portal: convites | `/admin/portal/convites` → prévia → aceite → auditoria | ✅ | Jornada (administração) |
| Portal: permissões | Conceder ou revogar; suspender, desativar, reativar | ✅ | Microvídeo |
| Portal: solicitações e autocadastro | Solicitações de acesso; "autocadastro não significa acesso automático" | ✅ | Microvídeo |
| Portal: alertas | Alertas de acesso e trocas de e-mail sinalizadas | ✅ | Microvídeo |
| Clientes (cadastro central) | Cadastro, vínculos de acesso verificados, contratos, documentos, chamados, visitas, relatórios | ✅ | Jornada (administração) |
| Base de conhecimento | `/admin/conhecimento` | ⚠️ | Só com RAG real (§11) |
| Aparência e tema | `/admin/aparencia`, `/admin/tema`, `/admin/visual` | ✅ | Microvídeo |
| Publicação do site | `/admin/publicacao` | ✅ | Microvídeo |
| Verificação manual | `/admin/verificacao-manual` | ✅ | Só para o time técnico |
| Auditoria | Trilha de auditoria (ação, autor, data, motivo) | ✅ | **Destaque 4** — microvídeo |
| Permissões (RBAC) | Papéis e permissões concedidas com motivo | ✅ | Só para o time técnico |
| Backup e restauração | Backups e restaurações (CRM) | ✅ | Só para TI |
| LGPD: solicitações e retenção | Solicitações de titular, política de retenção, descarte | ✅ | Microvídeo |
| Integrações | Integrações e log | ⚠️ | Só com conector real |
| Notificações | Fila de notificações e preferências | ✅ | Microvídeo |
| Observabilidade e healthcheck | Estado do sistema | ✅ | Só para TI |

---

## 11. Pendências declaradas e cuidados (não gravar como pronto)

Estes pontos estão no próprio repositório. Eles limitam o que pode ser gravado:

1. **Painel de TI (`/admin/ti`) é um protótipo.** Segundo `docs/INVENTARIO-ADMIN-TI.md`, 80 componentes (cerca de 13,5 mil linhas) não são renderizados por nenhuma rota. **Não gravar esses fluxos como funcionais.** Exceção documentada: o painel do Marcelo reimplementou parte do conteúdo de ADM.
2. **Assistentes e RAG privado.** O guia de vídeo registra que o RAG privado depende de Ollama real e que isso segue pendente. Assistentes (site, cliente, RH, Marcelo, conhecimento) só entram no vídeo depois de confirmar a resposta no ambiente.
3. **Sandbox e dados sintéticos no financeiro.** Gateway de pagamento, cobrança, extratos e documento fiscal são sintéticos ou sandbox. Grave com rótulo claro.
4. **Férias.** Há o pedido e a aprovação pelo RH, mas **não há captura real da tela de férias**. O vídeo de RH mostra esse fluxo como demonstração conceitual.
5. **E-mail.** A recuperação de acesso do cliente aparece como "local, sem SMTP" no próprio sistema. Não prometer envio de e-mail real sem confirmar.
6. **Auditoria de interface.** `docs/AUDITORIA-INTERFACE-ROTAS-2026-10-08.md` diz que nem todas as 100 rotas foram verificadas por papel, estado vazio, erro, teclado e mobile. Antes de gravar uma área, faça essa passagem para ela.
7. **Dados.** Todas as capturas devem usar dados fictícios, com o rótulo "demonstração · dados fictícios".

---

## 12. Séries sugeridas para a academia

Pela regra do guia (um objetivo por vídeo, público por série):

| Série | Público | Conteúdo (fluxos deste mapa) | Formato |
|---|---|---|---|
| **A. Visão geral** | Todos | Cadeia de ponta a ponta (§0), papéis, trailer | 90 s a 3 min |
| **B. Gestão (Marcelo)** | Dono e gestão | Painel, pendências, aprovações, indicadores, decisões (§9) | 3–5 min |
| **C. Comercial** | Comercial | Lead → CRM → proposta → aceite → contrato (§1, §2, §3) | Jornadas + microvídeos |
| **D. Operação** | Supervisão | Postos, escala, cobertura, ocorrências, passagem, checklists (§4) | Jornadas + microvídeos |
| **E. RH** | RH | Admissão, credenciais, escala, ajustes, holerite, desligamento (§5) | Jornadas (2–4 min) |
| **F. Financeiro** | Financeiro | Receber, cobrar, conciliar, competência (§6) — com rótulo sandbox | Jornadas |
| **G. Cliente** | Clientes | Convite, acesso, chamados, documentos, cobranças, satisfação (§7) | 60–90 s e microvídeos |
| **H. Funcionário** | Funcionários | Ponto, ocorrência, ausência, pedido, troca, documentos (§8) | Microvídeos (2–4 min por tarefa) |
| **I. Técnico** | Time técnico | Papéis, auditoria, LGPD, limites declarados (§11) | 6–10 min, interno |

### Ordem recomendada (segue o guia, §2)

1. Trailer de visão geral (série A).
2. Painel do Marcelo (série B) — é quem aprova.
3. Funcionário e RH (séries H e E) — são os que mais assistem de novo.
4. Cliente (série G) e comercial (série C).
5. Operação e financeiro (séries D e F).

---

## Resumo numérico

- **Categorias:** 9 (site, comercial, propostas e contratos, operação, pessoas, financeiro e conformidade, portal do cliente, portal do funcionário, gestão e administração).
- **Papéis de equipe:** 7.
- **Fluxos listados:** ver as tabelas. Os de ❌ ficam de fora dos vídeos até virarem telas reais.
- **Já gravados:** vídeo do Marcelo, vídeo do funcionário, vídeo de RH (com férias como demonstração conceitual).
