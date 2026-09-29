# 1. Estudo do sistema — públicos, tipos de clientes e funcionários

> Levantamento feito em 29/09/2026 diretamente do código e da documentação do repositório
> (README.md, docs/, src/, db/, server.mjs). Nenhum dado real de cliente ou funcionário
> foi consultado nem inventado: o sistema está em beta, sem base populada, e as pendências
> de negócio (SMTP, CNPJ, logotipo oficial, política aprovada) continuam valendo.
> Este documento é a base para o [plano de comunicação visual por e-mail](02-plano-mestre-200-imagens.md).

## 2. A empresa

**Grupo SEG System Segurança Integrada** — empresa de segurança integrada sediada em
Guarulhos/SP (Av. Armando Bei, 305 — Sala 01, Vila Nova Bonsucesso), telefone (11) 3437-2217,
e-mail contato@gruposegsystemseguranca.com.br.

**Serviços publicados (6, validados):**

1. Segurança Desarmada
2. Monitoramento 24 Horas
3. Câmeras e CFTV
4. Portaria e Controle de Acesso
5. Limpeza e Conservação
6. Supervisão e Ronda

**Mensagens de marca:** "Segurança que faz a diferença" e "Proteção • Tecnologia • Confiança".
**Identidade visual observável:** escudo azul com "GRUPO / SEG SYSTEM / SEGURANÇA INTEGRADA"
e viatura branca/azul "SUPERVISÃO" (arquivos atuais em `public/brand/`, licenças a confirmar).
Cores: azul forte/azul escuro, branco e neutros escuros.

## 3. Visão geral do sistema

- **Stack:** Next.js 16 (App Router) + servidor Node monolítico (`server.mjs`) + PostgreSQL
  (beta roda em PGlite embutido) + nodemailer para SMTP. Migrações idempotentes 001–096.
- **Quatro ambientes:** público, equipe (staff), Marcelo (administrador de negócio) e
  administração de TI. 222 requisitos rastreados em `docs/CONTROLE-IMPLEMENTACAO.md`
  (fases F0–F10+1 implementadas, homologação e produção pendentes).
- **Princípio central:** permissão por papel + módulo + ação + escopo, negação por padrão,
  verificação no servidor e trilha de auditoria. O portal nunca confia em identificadores
  vindos do navegador.
- **E-mail hoje:** transacional em **texto puro** (`sendAuthEmail` em
  `src/server/client-access-api.mjs`), assuntos já padronizados
  ("Confirme seu e-mail — Grupo SEG System", "Convite de acesso ao portal do cliente — Grupo SEG System").
  SMTP real ainda não configurado/verificado (`MAIL_*` no `.env.example`); sem SMTP, convites
  retornam `inviteUrl` para entrega manual. Tabela `crm_notification_templates`
  (template_key, channel, subject, body, is_medical_safe, status) já existe no modelo para
  templates versionados com fluxo rascunho → em_revisão → aprovado.

## 4. Tipos de clientes

### 4.1 No funil público (site / simulador)

| Tipo | Onde aparece | Observações |
| --- | --- | --- |
| Visitante anônimo | Site `/`, `/simulador`, `/orcamento`, FAQ assistida | Sem dado interno; bot começa com FAQ validada + transferência humana |
| Lead (prospect) | `public_leads` — pedido de orçamento ou visita | Origem nos 6 serviços; status solicitada → em_agendamento → confirmada → realizada/cancelada; visita sempre confirmada por pessoa |

**Tipos de imóvel do lead** (`src/lib/service-catalog.mjs`): **Condomínio, Empresa ou comércio,
Indústria, Instituição, Outro**. Segmentos citados no site atual: condomínios residenciais e
comerciais, empresas, indústrias, comércios, instituições e órgãos públicos.

### 4.2 Clientes contratantes (cadastro central)

| Conceito | Modelo no sistema |
| --- | --- |
| Conta de cliente | `client_accounts` (display_name, document_ref, status active/suspended/closed), com `parent_account_id` preparado para **filiais/unidades futuras** |
| Contratos | `client_contracts` por serviço (planned/active/suspended/ended) + módulo CON (postos, SLA, aditivos, obrigações, implantação, encerramento) |
| CRM | `crm_companies`/`crm_contacts`/`crm_opportunities` — funil, propostas, renovações, comissões |
| Cobrança/financeiro | Módulos CLI/FIN (faturas, cobranças, satisfação, renovação) |

### 4.3 Usuários do portal do cliente (quem recebe e-mail hoje)

| Aspecto | Regra atual |
| --- | --- |
| Identidade | `auth_identities` kind='client' — um e-mail por tipo de identidade |
| Modos de cadastro | **Convite** (padrão; 7 dias, uso único, revogável), solicitação com aprovação, autocadastro (sem acesso automático a documentos) |
| Vínculo com a conta | `client_access_grants` — concedido por Marcelo/TI com motivo obrigatório; sem grant, nada é visível |
| E-mails já existentes | Convite de acesso, confirmação de e-mail (7 dias, até 5 reenvios/24h), recuperação de senha (link de 1h, resposta genérica), troca de e-mail e alertas "Não fui eu" |
| Área logada | `/cliente/app`: visão geral, contratos, documentos, chamados; MFA opcional |

**Resumo dos tipos de cliente para comunicação:** condomínios, empresas/comércio, indústrias,
instituições/órgãos públicos — cada um com contatos que acessam o portal por convite. Os e-mails
desses públicos formam um kit futuro separado; **este plano trata dos funcionários** (item 5).

## 5. Funcionários (público-alvo dos 200 e-mails)

### 5.1 Identidades e papéis administrativos

`auth_identities` kind='staff' com `auth_staff_profiles` — papéis fechados:
**admin, ti, rh** (+ sessão "marcelo" de negócio). Cadastro apenas por convite de administrador
autorizado; **sem autocadastro**. Login individual com senha scrypt; MFA e 2FA obrigatório para TI
na produção. Ambientes de trabalho: `/admin/*` (Marcelo, TI, RH).

### 5.2 Quadro de campo (Opção B / Fase 3 — operação)

| Conceito | Modelo |
| --- | --- |
| Postos/funções | `staff_posts` — exemplos do sistema: **vigilante, supervisor, gerente de operações** (+ funções operacionais dos serviços: portaria, central de monitoramento, limpeza e conservação, ronda) |
| Alocação | `staff_assignments` — vínculo de trabalho staff ↔ conta de cliente (+ posto), com início/fim/status |
| Escalas | `staff_scale_rules` — **12x36, 6x1, diarista** (regras por posto ainda em decisão) |
| Ponto/ronda | `staff_time_entries` (start/end/ronda/break/handover, geolocalização opcional, evidência) |
| Passagem de plantão | `staff_shift_handover` entre alocações |
| Cobertura | OPS — ausência abre pendência de cobertura com decisão humana e comunicação registrada |

### 5.3 Cadastro profissional (RH — HR-01..24)

`hr_employees`: **matrícula** (única), **cargo**, **empregador/filial/lotação**, **gestor**,
**birth_date (data de aniversário)**, **admission_date**, status
(em_admissao/ativo/afastado/suspenso/desligado/arquivado), **employment_type**
(clt/terceirizado/temporario/estagio/pj/outro), remuneração (campo sensível, mascarado).
Histórico versionado por data de efeito. Recrutamento, desligamento, férias, afastamentos,
ponto/banco de horas, benefícios, saúde ocupacional, treinamentos, uniformes, holerites,
avaliações, indicadores — tudo com fluxos próprios e dados sensíveis protegidos.

### 5.4 Portal do funcionário (EMP-01..19)

Perfil próprio (dados sensíveis mascarados + solicitação de atualização revisada pelo RH),
**próximo plantão** (local, horário, função, contato do supervisor, orientações, itens
necessários), jornada/ausências/trocas, ocorrências, procedimentos, documentos, holerites,
solicitações, uniformes, **cursos com certificados e alerta de vencimento (30 dias)**,
**comunicados com confirmação de leitura**, **central de notificações**, atendimento RH
(protocolo, categorias), canal confidencial (denúncia), **PWA instalável com fila offline**,
FAQ interna acessível e de baixo consumo de dados.

### 5.5 Comunicação interna que já existe no modelo

- `communications` (título, conteúdo, categoria, **target_type individual/grupo/todos/cargo/lotação**,
  is_directed) + `communication_reads` (confirmação de leitura) + `notifications_center`.
- Comunicações de cobertura, renovação e incidentes com canal registrado (email/whatsapp/sistema).
- E-mails transacionais de equipe previstos na auditoria: `staff_invite`, `staff_login`,
  `staff_role_change`, `staff_session_revoke`.

## 6. O que isso significa para a comunicação visual por e-mail

1. **Públicos internos distintos** que precisam de tom e conteúdo diferentes: campo (vigilante,
   portaria, ronda, limpeza — majoritariamente mobile, escalas rotativas), supervisão/gerência,
   sede (RH/administrativo), TI/Marcelo.
2. **Gatilhos reais já mapeados no sistema**: convite/criação de conta, confirmação de e-mail,
   recuperação de senha, MFA, troca de e-mail, suspensão/reativação, aniversário
   (`hr_employees.birth_date`), tempo de casa (`admission_date`), cursos vencendo, holerite
   disponível, escala publicada, comunicados — todos podem disparar e-mail padronizado.
3. **Personalização fica no HTML, nunca na imagem**: o nome do colaborador, posto, escala e
   unidade entram como merge tags no corpo do e-mail; a imagem é padronizada por categoria
   (reuso total, sem dado pessoal queimado no PNG — melhor para LGPD e para peso do arquivo).
4. **Restrições herdadas do sistema**: sem dados reais em ambiente de teste; sem salário/CPF/saúde
   em imagem; sem promessas de benefícios não confirmados; sem fotos reais de pessoas sem
   autorização; logotipo oficial e licenças ainda pendentes; SMTP ainda não escolhido.
5. **Base de aprovação já prevista**: templates versionados com status
   rascunho → em_revisão → aprovado (`crm_notification_templates`), comunicados com
   publicação por RH/Marcelo — o fluxo de governança do plano reutiliza esse desenho.
