# Plano de expansão da Academia — todas as rotinas, em trilhas que fazem sentido

Base: `docs/academia/MAPA-DE-FLUXOS.md` (158 fluxos marcados) e as rotas reais do branch `arena/6ff33805-gruposegsystemseguranca`.
Situação atual: 9 trilhas e 28 aulas publicadas no módulo `academia/`.
Proposta: **21 trilhas e 136 aulas**, cada rotina do mapa em uma aula (algumas rotinas pequenas são agrupadas).

---

## 1. Princípios de organização

1. **Trilha = uma função de trabalho.** Quem executa a mesma tarefa aprende na mesma trilha. Ex.: "RH: admissão e acesso" reúne admissão, credencial e documentos, porque o RH faz esse ciclo junto.
2. **Aula = uma tarefa com um objetivo.** Formato já existente: objetivo, 3 a 5 passos e uma pergunta de verificação. Cerca de 3 minutos.
3. **Ordem dentro da trilha = ordem do trabalho.** Ex.: admissão antes de credencial, credencial antes de holerite.
4. **Só o que funciona.** Tela ✅ entra. Tela ⚠️ entra só com rótulo de demonstração (quando o próprio plano diz) ou fica para depois. Tela ❌ não entra.
5. **Sem vídeo por enquanto.** Regra vigente da Academia. As aulas são texto, passos e verificação.
6. **Conferir na tela real antes de publicar.** Cada aula é checada no caminho real, com dados fictícios, como pede a §11 do mapa.

---

## 2. Trilhas por público

Setores (ids usados no sistema): `funcionario`, `cliente`, `comercial`, `rh`, `financeiro`, `supervisor`, `marcelo`, `ti`, `admin`.

| Nº | Trilha | Aulas | Quem vê |
|---|---|---|---|
| T01 | Fundamentos do sistema | 3 | Todos |
| T02 | Equipe: entrada, papéis e navegação | 3 | Toda a equipe (comercial, RH, financeiro, supervisor, Marcelo, TI, admin) |
| T03 | Funcionário: rotina diária | 7 | Funcionário, admin |
| T04 | Funcionário: pedidos, documentos e atendimento | 7 | Funcionário, admin |
| T05 | Cliente: acesso e segurança | 6 | Cliente, admin |
| T06 | Cliente: serviços, chamados e documentos | 11 | Cliente, admin |
| T07 | Comercial: do pedido ao contrato | 20 | Comercial, Marcelo, admin |
| T08 | Gestão: painel, pendências e decisões | 6 | Marcelo, admin |
| T09 | RH: admissão e acesso | 3 | RH, admin |
| T10 | RH: vida funcional | 7 | RH, admin |
| T11 | RH: folha e desligamento | 3 | RH, admin |
| T12 | Operação: postos e escala | 8 | Supervisor, admin |
| T13 | Operação: rotinas de posto e ocorrências | 8 | Supervisor, admin |
| T14 | Recursos, terceiros e qualidade | 4 | Supervisor, admin |
| T15 | Contratos: implantação e gestão | 9 | Comercial, financeiro, admin |
| T16 | Financeiro: receber, pagar e competência | 7 | Financeiro, Marcelo, admin |
| T17 | Financeiro: conciliação, cobrança e pagamentos (demonstração) | 3 | Financeiro, admin |
| T18 | Compliance, licitações e fornecedores | 5 | Financeiro, Marcelo, admin |
| T19 | Administração: acessos e portal | 6 | Admin, TI |
| T20 | Administração: sistema, LGPD e auditoria | 6 | Admin |
| T21 | TI: segurança, backup e observabilidade | 4 | TI, admin |

Total: **136 aulas**. Admin continua vendo todas as trilhas, como já está implementado.

---

## 3. Conteúdo de cada trilha

Os títulos abaixo são os de cada aula. Um item marcado com ⚠️ só entra se a decisão da seção 6 for aprovada.

### T01 Fundamentos do sistema (3 aulas, já publicadas)
Manter as aulas atuais: primeiro acesso, o que aparece depois do login, nível e pontos.

### T02 Equipe: entrada, papéis e navegação (3)
1. Entrar e cair na página inicial do seu papel
2. Hub administrativo: os módulos que o seu papel vê
3. Aceitar um convite administrativo

### T03 Funcionário: rotina diária (7)
1. Registrar ponto: entrada, ronda e saída (com consentimento de localização)
2. Registrar uma ocorrência: categoria, gravidade, local e evidências
3. Registrar ausência ou falta
4. Solicitar ajuste de ponto
5. Solicitar troca de escala
6. Dar ciência de comunicados e procedimentos
7. Receber a passagem de plantão

### T04 Funcionário: pedidos, documentos e atendimento (7)
1. Fazer um pedido: férias, benefício, afastamento ou reembolso
2. Solicitar uniforme e confirmar o recebimento
3. Ver os seus documentos privados
4. Ver e pedir atualização do seu perfil
5. Enviar comprovante de curso
6. Abrir atendimento confidencial com o RH
7. Registrar uma reclamação
- ⚠️ Uso sem internet (PWA): fora até confirmar a sincronização.

### T05 Cliente: acesso e segurança (6)
1. Receber o convite e aceitar
2. Primeiro acesso e confirmação de e-mail
3. Alterar o e-mail (com verificação)
4. Ativar e desativar a verificação em duas etapas (MFA)
5. Ver e encerrar sessões abertas
6. Pedir acesso ao portal
- ⚠️ Recuperar e redefinir senha: fora até a recuperação por e-mail existir de fato.

### T06 Cliente: serviços, chamados e documentos (11)
1. Painel: o que é seu no portal
2. Contratos e itens de serviço
3. Documentos: ver e baixar (o acesso fica registrado)
4. Abrir um chamado e acompanhar o atendimento
5. Pedir um serviço e acompanhar
6. Agenda de visitas e manutenções
7. Relatórios de execução, medição e aceite
8. Pesquisa de satisfação e plano de ação
9. Renovação e continuidade
10. Contatos, escopos e delegados
11. Registrar reclamação sobre um colaborador
- ⚠️ Cobranças: fora até a fonte dos dados financeiros ser confirmada.
- ⚠️ Assistente do portal: fora até a resposta ser confirmada no ambiente.

### T07 Comercial: do pedido ao contrato (20)
Uma trilha só, com quatro blocos. Cada bloco termina com uma verificação própria.

**Bloco A. Entrada de pedidos (site e captação) — 4**
1. Pedido de orçamento pelo site
2. Contato e simulador
3. Conteúdos, FAQ e privacidade (inclui solicitação de titular)
4. Lista de leads: o que entra e como acompanhar

**Bloco B. Funil e relacionamento — 7**
5. Converter um pedido recebido em empresa e oportunidade
6. Movimentar a oportunidade no funil
7. Registrar interações e notas internas
8. Criar tarefas e delegar
9. Agenda de visitas e reuniões (com conflito de agenda)
10. Cadências manuais
11. Importar empresas por CSV (revisar prévia e duplicatas)

**Bloco C. Condições e carteira — 4**
12. Pedido de desconto e aprovação
13. Regras de comissão
14. Carteira de clientes
15. Satisfação do cliente

**Bloco D. Proposta e aceite — 5**
16. Criar a proposta, com orçamento de mão de obra e técnico quando houver
17. Entregar a proposta por link de aceite
18. Comparar versões da proposta
19. Acompanhar o aceite do cliente
20. Criar o contrato a partir da proposta aceita

- ⚠️ Inteligência comercial e expansão: fora até fonte e data-base serem confirmadas.

### T08 Gestão: painel, pendências e decisões (6)
1. Painel de pendências do período
2. Aprovação unificada de pedidos de todos os módulos
3. Diário de decisões (registro canônico)
4. Indicadores: meta x realizado
5. Relatórios gerados com trilha de auditoria
6. Análises e relatórios gerenciais
- ⚠️ Assistente do Marcelo: fora até a resposta ser confirmada.

### T09 RH: admissão e acesso (3)
1. Novo cadastro profissional e abertura da admissão (matrícula, cargo, lotação, data)
2. Credencial temporária do funcionário (exibida uma vez)
3. Documentos privados do funcionário

### T10 RH: vida funcional (7)
1. Publicar a escala versionada e registrar a ciência
2. Consultar ponto e decidir ajustes pedidos pelo funcionário
3. Decidir as solicitações: férias, afastamento, benefício e reembolso
4. Processo de afastamento
5. Processo de benefícios
6. Processo de treinamento
7. Processo de recrutamento
- Férias: a aula é **demonstração conceitual**, porque não há captura real da tela de férias (§11 do mapa).

### T11 RH: folha e desligamento (3)
1. Fechar o período demonstrativo
2. Publicar o holerite no espaço privado do titular
3. Desligamento: revisar antes de concluir e revogar o acesso
- Aula 1 e 2 em demonstração, com dados fictícios.

### T12 Operação: postos e escala (8)
1. Cadastro de postos e de cargos e funções
2. Habilitação e documentação exigida por função
3. Necessidade por turno e faixa de horário
4. Alocação de pessoas e confronto com o planejado
5. Escala versionada: publicar e registrar a ciência
6. Regras de jornada e descanso
7. Solicitar cobertura e substituição
8. Lacunas de cobertura e plano de cobertura

### T13 Operação: rotinas de posto e ocorrências (8)
1. Livro de ocorrências: análise e ações da supervisão
2. Passagem de plantão entre turnos
3. Checklists de posto: modelo, instância e execução
4. Rondas e leituras de ronda
5. Rotinas de limpeza e não conformidades
6. Movimentação de chaves
7. Apoio emergencial
8. Continuidade de negócios
- ⚠️ Monitoramento (eventos): fora até haver conector real.
- ⚠️ Dimensionamento de posto: fora até o cálculo ser confirmado.

### T14 Recursos, terceiros e qualidade (4)
1. Frota
2. Patrimônio e almoxarifado
3. Terceiros
4. Qualidade

### T15 Contratos: implantação e gestão (9)
1. Cadastro manual de contrato
2. Escopo e vigência dos itens
3. Implantação do contrato, por etapas
4. Aditivo: registrar a alteração
5. Alertas de vencimento
6. Diário de gestão do contrato
7. Obrigações documentais
8. Encerramento e fechamento
9. Versões comerciais: histórico de vistoria, orçamento, proposta e contrato

### T16 Financeiro: receber, pagar e competência (7)
1. Contas a receber e a pagar: baixa
2. Recorrência: regra e geração de lançamentos
3. Aging e fluxo de caixa
4. Custos e rateio por centro de custo
5. Orçamento e cenários
6. Fechamento e reabertura de competência (com motivo)
7. Exportações do período

### T17 Financeiro: conciliação, cobrança e pagamentos (3) — **demonstração**
1. Conciliação bancária (extratos sintéticos, com rótulo)
2. Cobrança e histórico de lembretes (dados sintéticos, com rótulo)
3. Pagamentos e documento fiscal (sandbox e sintético, com rótulo; não é fiscal real)

### T18 Compliance, licitações e fornecedores (5)
1. Declarar obrigação, referência documental e plano de ação
2. Avaliação temporal de compliance: agenda, resultado e tarefas por vencimento
3. Renovar uma obrigação
4. Licitações
5. Fornecedores

### T19 Administração: acessos e portal (6)
1. Convites do portal: prévia, aceite e auditoria
2. Permissões: conceder, revogar, suspender, desativar e reativar
3. Solicitações de acesso e autocadastro (autocadastro não dá acesso automático)
4. Alertas de acesso e trocas de e-mail sinalizadas
5. Cadastro central de clientes e vínculos de acesso verificados
6. Contratos, documentos, chamados e visitas do cliente no cadastro central

### T20 Administração: sistema, LGPD e auditoria (6)
1. Trilha de auditoria: ação, autor, data e motivo
2. Permissões por papel (RBAC) e o motivo de cada concessão
3. Publicação do site
4. LGPD: solicitações de titular, retenção e descarte
5. Aparência, tema e visual
6. Fila de notificações e preferências
- ⚠️ Integrações e log: fora até haver conector real.

### T21 TI: segurança, backup e observabilidade (4)
1. Backup e restauração
2. Observabilidade e healthcheck
3. Verificação manual pelo time técnico
4. Limites declarados do sistema (RAG privado, e-mail, sandbox financeiro)

---

## 4. Rotinas que ficam de fora (por enquanto)

| Item | Motivo | Quando reavaliar |
|---|---|---|
| ❌ Componentes de `/admin/ti` sem rota (80 arquivos) | Protótipos sem rota nem teste. `docs/INVENTARIO-ADMIN-TI.md` decide promover só com prova. | Quando cada área for promovida |
| Assistentes (site, cliente, RH, Marcelo, conhecimento) | RAG privado depende de Ollama real, pendente (§11.2) | Depois de confirmar a resposta no ambiente |
| Base de conhecimento (`/admin/conhecimento`) | Mesmo motivo | Idem |
| Galeria de layouts (`/layout-01` a `/layout-10`, `/layout-preview`) | Marketing, não é fluxo de usuário | Não entra na academia |
| `/qa/modulos` | Uso interno de QA | Não entra na academia |
| Recuperar senha (cliente), cobranças (cliente), PWA, monitoramento, dimensionamento, integrações, inteligência, expansão | ⚠️ com fonte, conector ou cálculo não confirmados | Quando a fonte estiver confirmada |

---

## 5. Cobertura do mapa

Cada seção do mapa tem destino:

| Seção do mapa | Trilhas |
|---|---|
| §0 Cadeia ponta a ponta | T01 (visão), T07 blocos A e D |
| §1 Site público e captação | T07 bloco A |
| §2 Comercial e CRM | T07 blocos B e C |
| §3 Propostas, aceite e contratos | T07 bloco D, T15 |
| §4 Operação | T12, T13, T14 |
| §5 Pessoas e RH | T09, T10, T11 |
| §6 Financeiro e conformidade | T16, T17, T18 |
| §7 Portal do cliente | T05, T06 |
| §8 Portal do funcionário | T03, T04 |
| §9 Painel do Marcelo | T08 |
| §10 Administração, acessos e sistema | T02, T19, T20 |
| TI (inventário) | T21 (sem os componentes sem rota) |

---

## 6. Decisões que dependem de você

1. **Áreas fora da sua lista.** Incluí Operação, Contratos, Financeiro e Compliance porque o mapa as cobre e você pediu todas as áreas. Confirme se entram.
2. **Comercial em uma trilha só.** Coloquei a criação de contrato a partir da proposta aceita como última aula da T07. A gestão do contrato fica em T15. Confirme se prefere tudo dentro da T07.
3. **Aulas ⚠️ com rótulo.** A T17 entra como demonstração, com dados sintéticos. Confirme se aceita esse rótulo ou se prefere deixar a T17 para depois.
4. **Níveis e pontos.** Com 136 aulas, o total de pontos possível fica perto de 2.700 (136 aulas × 10, mais acertos no quiz e 21 trilhas × 30). Os níveis atuais (0 / 80 / 200 / 400) seriam atingidos em poucas aulas. Proponho revisar para algo como 0 / 300 / 900 / 1.800. Confirme o valor.
5. **Aulas de férias e holerite.** Entram como demonstração conceitual, com o mesmo rótulo do vídeo de RH. Confirme.
6. **Visibilidade do Marcelo.** A matriz da seção 2 é proposta. Confirme quais trilhas ele deve ver além da gestão.

---

## 7. Ordem de execução (3 fases)

**Fase 1 — essencial (46 aulas):** T01, T02, T03, T04, T05, T07 (blocos A e B), T08, T09.
Cobre o início de todos os públicos e a rotina do comercial e do RH.

**Fase 2 — operação, pessoas e contratos (59 aulas):** T06, T07 (blocos C e D), T10, T11, T12, T13, T14, T15.

**Fase 3 — financeiro, administração e TI (31 aulas):** T16, T17, T18, T19, T20, T21.

Antes de cada fase: conferir cada aula na tela real com dados fictícios, e revisar o quiz com quem executa a rotina. Depois de cada fase, reajustar os níveis se necessário.

---

## 8. Critérios de aceite de cada aula

- O caminho descrito existe na tela real, com o papel indicado na trilha.
- O texto usa os nomes exatos dos botões e campos.
- Não há dado real: só dados fictícios, com o rótulo "demonstração · dados fictícios" quando for o caso.
- O quiz tem uma resposta certa, e a explicação aponta a tela ou o passo.
- Aulas ⚠️ e as de demonstração conceitual trazem o rótulo visível na própria aula.
- A aula cabe em cerca de 3 minutos de leitura.
