# Plano de expansão da Academia — v2 (decisões incorporadas)

Base: `docs/academia/MAPA-DE-FLUXOS.md` (158 fluxos marcados), rotas reais do branch `arena/6ff33805-gruposegsystemseguranca` e o catálogo de serviços (`src/lib/service-catalog.mjs`).
Situação atual: 9 trilhas e 28 aulas publicadas no módulo `academia/`.
Proposta v2: **25 trilhas e 172 aulas**.

---

## 0. Decisões já confirmadas

| # | Decisão | Como entrou no plano |
|---|---|---|
| 1 | Incluir todas as áreas | Operação, contratos, financeiro e compliance entram, além de RH, Marcelo, ADM, TI, funcionário, cliente e comercial |
| 2 | Contrato a partir da proposta aceita fica na trilha comercial | Última aula da T07 |
| 3 | Conciliação, cobrança e pagamentos ficam na trilha de financeiro | Agrupadas na T16, com rótulo de demonstração |
| 4 | Níveis 0 / 300 / 900 / 1.800 | Ajuste de níveis na seção 6 |
| 5 | Férias e holerite ficam na trilha de RH | T10 e T11, com rótulo de demonstração conceitual |
| 6 | Marcelo vê todas as trilhas, libera trilhas para setores e para pessoas, e tem uma área visual de permissões | Seção 5 |
| 7 | Novas trilhas: porteiros, auxiliares de serviços gerais, instaladores de segurança eletrônica, supervisores de posto e controladores de acesso | T21 a T25 |

---

## 1. Princípios

1. **Trilha = uma função de trabalho.** Quem executa a mesma tarefa aprende na mesma trilha.
2. **Aula = uma tarefa com um objetivo.** Formato atual: objetivo, 3 a 5 passos e uma pergunta de verificação. Cerca de 3 minutos.
3. **Ordem dentro da trilha = ordem do trabalho.**
4. **Só o que funciona.** Tela ✅ entra. Tela ⚠️ entra só com rótulo de demonstração, quando indicado, ou fica para depois. Tela ❌ não entra.
5. **Origem de cada aula.** Cada aula das trilhas de campo leva uma etiqueta:
   - **[S] Sistema:** a rotina tem tela no sistema. Conferir na tela real.
   - **[P] Procedimento:** a rotina existe na operação, mas não tem tela no sistema hoje. Validar com a operação ou com SST antes de publicar.
   - **[T] Conteúdo técnico:** exige conteúdo da equipe técnica da SEG. Fica bloqueada até ser fornecida.
   - **[D] Demonstração:** a tela existe, mas com dados sintéticos ou sandbox. Leva o rótulo visível na aula.
6. **Sem vídeo por enquanto.** Regra vigente da Academia.
7. **Mesma rotina, mesma aula.** Quando uma rotina serve a dois cargos, a aula existe numa trilha de gestão e a trilha de campo aponta para ela, sem duplicar o texto.

---

## 2. Trilhas e público

Setores (ids de sistema, a confirmar na seção 7): `funcionario`, `cliente`, `comercial`, `rh`, `financeiro`, `supervisor` (equipe de operação), `marcelo`, `ti`, `admin`, e os novos `porteiro`, `controlador_acesso`, `servicos_gerais`, `instalador`, `supervisor_posto`.

| Nº | Trilha | Aulas | Quem vê |
|---|---|---|---|
| T01 | Fundamentos do sistema | 3 | Todos |
| T02 | Equipe: entrada, papéis e navegação | 3 | Equipe interna (comercial, RH, financeiro, supervisor, Marcelo, TI, admin) |
| T03 | Funcionário: rotina diária | 7 | Funcionário e todos os cargos de campo, admin |
| T04 | Funcionário: pedidos, documentos e atendimento | 7 | Funcionário e cargos de campo, admin |
| T05 | Cliente: acesso e segurança | 6 | Cliente, admin |
| T06 | Cliente: serviços, chamados e documentos | 11 | Cliente, admin |
| T07 | Comercial: do pedido ao contrato | 20 | Comercial, Marcelo, admin |
| T08 | Gestão: painel, pendências e decisões | 6 | Marcelo, admin |
| T09 | RH: admissão e acesso | 3 | RH, admin |
| T10 | RH: vida funcional (inclui férias, demonstração conceitual) | 7 | RH, admin |
| T11 | RH: folha e desligamento (inclui holerite, demonstração) | 3 | RH, admin |
| T12 | Operação: postos e escala | 8 | Supervisão (equipe de operação), Marcelo, admin |
| T13 | Operação: rotinas de posto e ocorrências | 8 | Supervisão, Marcelo, admin |
| T14 | Recursos, terceiros e qualidade | 4 | Supervisão, admin |
| T15 | Contratos: implantação e gestão | 9 | Comercial, financeiro, admin |
| T16 | Financeiro: receber, pagar, competência e conciliação | 10 | Financeiro, Marcelo, admin |
| T17 | Compliance, licitações e fornecedores | 5 | Financeiro, Marcelo, admin |
| T18 | Administração: acessos e portal | 6 | Admin, TI |
| T19 | Administração: sistema, LGPD e auditoria | 6 | Admin |
| T20 | TI: segurança, backup e observabilidade | 4 | TI, admin |
| T21 | Porteiros: portaria e rotina de posto | 8 | Porteiro, supervisor de posto, admin |
| T22 | Controladores de acesso | 7 | Controlador de acesso, supervisor de posto, admin |
| T23 | Auxiliares de serviços gerais: limpeza e conservação | 6 | Auxiliar de serviços gerais, admin |
| T24 | Instaladores de segurança eletrônica | 8 | Instalador, admin |
| T25 | Supervisores de posto (campo) | 7 | Supervisor de posto, admin |

**Total: 172 aulas.** Admin vê todas. Marcelo vê todas (decisão 6).

**Nota de nomes:** o papel de "supervisor" da equipe (`/admin/operacao`) é diferente do "supervisor de posto" de campo (T25). Na interface, use "Supervisão (equipe de operação)" e "Supervisor de posto", para não confundir.

---

## 3. Conteúdo de cada trilha

Itens com ⚠️ ficam fora até a fonte ser confirmada.

### T01 Fundamentos do sistema (3, já publicadas)
Manter: primeiro acesso, o que aparece depois do login, nível e pontos.

### T02 Equipe: entrada, papéis e navegação (3)
1. Entrar e cair na página inicial do seu papel [S]
2. Hub administrativo: os módulos que o seu papel vê [S]
3. Aceitar um convite administrativo [S]

### T03 Funcionário: rotina diária (7)
1. Registrar ponto: entrada, ronda e saída, com consentimento de localização [S]
2. Registrar uma ocorrência: categoria, gravidade, local e evidências [S]
3. Registrar ausência ou falta [S]
4. Solicitar ajuste de ponto [S]
5. Solicitar troca de escala [S]
6. Dar ciência de comunicados e procedimentos [S]
7. Receber a passagem de plantão [S]

### T04 Funcionário: pedidos, documentos e atendimento (7)
1. Fazer um pedido: férias, benefício, afastamento ou reembolso [S]
2. Solicitar uniforme e confirmar o recebimento [S]
3. Ver os seus documentos privados [S]
4. Ver e pedir atualização do seu perfil [S]
5. Enviar comprovante de curso [S]
6. Abrir atendimento confidencial com o RH [S]
7. Registrar uma reclamação [S]
- ⚠️ Uso sem internet (PWA): fora até confirmar a sincronização.

### T05 Cliente: acesso e segurança (6)
1. Receber o convite e aceitar [S]
2. Primeiro acesso e confirmação de e-mail [S]
3. Alterar o e-mail, com verificação [S]
4. Ativar e desativar a verificação em duas etapas (MFA) [S]
5. Ver e encerrar sessões abertas [S]
6. Pedir acesso ao portal [S]
- ⚠️ Recuperar e redefinir senha: fora até a recuperação por e-mail existir de fato.

### T06 Cliente: serviços, chamados e documentos (11)
1. Painel: o que é seu no portal [S]
2. Contratos e itens de serviço [S]
3. Documentos: ver e baixar, com registro de acesso [S]
4. Abrir um chamado e acompanhar o atendimento [S]
5. Pedir um serviço e acompanhar [S]
6. Agenda de visitas e manutenções [S]
7. Relatórios de execução, medição e aceite [S]
8. Pesquisa de satisfação e plano de ação [S]
9. Renovação e continuidade [S]
10. Contatos, escopos e delegados [S]
11. Registrar reclamação sobre um colaborador [S]
- ⚠️ Cobranças: fora até a fonte dos dados financeiros ser confirmada.
- ⚠️ Assistente do portal: fora até a resposta ser confirmada no ambiente.

### T07 Comercial: do pedido ao contrato (20)
Uma trilha só, com quatro blocos. Cada bloco termina com uma verificação.

**Bloco A. Entrada de pedidos (site e captação), 4**
1. Pedido de orçamento pelo site [S]
2. Contato e simulador [S]
3. Conteúdos, FAQ e privacidade, com solicitação de titular [S]
4. Lista de leads: o que entra e como acompanhar [S]

**Bloco B. Funil e relacionamento, 7**
5. Converter um pedido recebido em empresa e oportunidade [S]
6. Movimentar a oportunidade no funil [S]
7. Registrar interações e notas internas [S]
8. Criar tarefas e delegar [S]
9. Agenda de visitas e reuniões, com conflito de agenda [S]
10. Cadências manuais [S]
11. Importar empresas por CSV, revisando prévia e duplicatas [S]

**Bloco C. Condições e carteira, 4**
12. Pedido de desconto e aprovação [S]
13. Regras de comissão [S]
14. Carteira de clientes [S]
15. Satisfação do cliente [S]

**Bloco D. Proposta e aceite, 5**
16. Criar a proposta, com orçamento de mão de obra e técnico quando houver [S]
17. Entregar a proposta por link de aceite [S]
18. Comparar versões da proposta [S]
19. Acompanhar o aceite do cliente [S]
20. Criar o contrato a partir da proposta aceita [S]

- ⚠️ Inteligência comercial e expansão: fora até fonte e data-base serem confirmadas.

### T08 Gestão: painel, pendências e decisões (6)
1. Painel de pendências do período [S]
2. Aprovação unificada de pedidos de todos os módulos [S]
3. Diário de decisões, com registro canônico [S]
4. Indicadores: meta x realizado [S]
5. Relatórios gerados com trilha de auditoria [S]
6. Análises e relatórios gerenciais [S]
- ⚠️ Assistente do Marcelo: fora até a resposta ser confirmada.

### T09 RH: admissão e acesso (3)
1. Novo cadastro profissional e abertura da admissão (matrícula, cargo, lotação, data) [S]
2. Credencial temporária do funcionário, exibida uma vez [S]
3. Documentos privados do funcionário [S]

### T10 RH: vida funcional (7)
1. Publicar a escala versionada e registrar a ciência [S]
2. Consultar ponto e decidir ajustes pedidos pelo funcionário [S]
3. Decidir as solicitações: férias, afastamento, benefício e reembolso [S]
4. Férias: aprovação e registro, **demonstração conceitual** (não há captura real da tela) [D]
5. Processo de afastamento [S]
6. Processo de benefícios [S]
7. Processo de treinamento e recrutamento [S]

### T11 RH: folha e desligamento (3)
1. Fechar o período demonstrativo [D]
2. Publicar o holerite no espaço privado do titular [D]
3. Desligamento: revisar antes de concluir e revogar o acesso [S]

### T12 Operação: postos e escala (8)
1. Cadastro de postos e de cargos e funções [S]
2. Habilitação e documentação exigida por função [S]
3. Necessidade por turno e faixa de horário [S]
4. Alocação de pessoas e confronto com o planejado [S]
5. Escala versionada: publicar e registrar a ciência [S]
6. Regras de jornada e descanso [S]
7. Solicitar cobertura e substituição [S]
8. Lacunas de cobertura e plano de cobertura [S]

### T13 Operação: rotinas de posto e ocorrências (8)
1. Livro de ocorrências: análise e ações da supervisão [S]
2. Passagem de plantão entre turnos [S]
3. Checklists de posto: modelo, instância e execução [S]
4. Rondas e leituras de ronda [S]
5. Rotinas de limpeza e não conformidades [S]
6. Movimentação de chaves [S]
7. Apoio emergencial [S]
8. Continuidade de negócios [S]
- ⚠️ Monitoramento (eventos): fora até haver conector real.
- ⚠️ Dimensionamento de posto: fora até o cálculo ser confirmado.

### T14 Recursos, terceiros e qualidade (4)
1. Frota [S]
2. Patrimônio e almoxarifado [S]
3. Terceiros [S]
4. Qualidade [S]

### T15 Contratos: implantação e gestão (9)
1. Cadastro manual de contrato [S]
2. Escopo e vigência dos itens [S]
3. Implantação do contrato, por etapas [S]
4. Aditivo: registrar a alteração [S]
5. Alertas de vencimento [S]
6. Diário de gestão do contrato [S]
7. Obrigações documentais [S]
8. Encerramento e fechamento [S]
9. Versões comerciais: histórico de vistoria, orçamento, proposta e contrato [S]

### T16 Financeiro: receber, pagar, competência e conciliação (10)
1. Contas a receber e a pagar: baixa [S]
2. Recorrência: regra e geração de lançamentos [S]
3. Aging e fluxo de caixa [S]
4. Custos e rateio por centro de custo [S]
5. Orçamento e cenários [S]
6. Fechamento e reabertura de competência, com motivo [S]
7. Exportações do período [S]
8. Conciliação bancária: importar extrato, conciliar e marcar divergência [D]
9. Cobrança e histórico de lembretes [D]
10. Pagamentos e documento fiscal: gateway em sandbox e documento sintético, **não é fiscal real** [D]

### T17 Compliance, licitações e fornecedores (5)
1. Declarar obrigação, referência documental e plano de ação [S]
2. Avaliação temporal de compliance: agenda, resultado e tarefas por vencimento [S]
3. Renovar uma obrigação [S]
4. Licitações [S]
5. Fornecedores [S]

### T18 Administração: acessos e portal (6)
1. Convites do portal: prévia, aceite e auditoria [S]
2. Permissões: conceder, revogar, suspender, desativar e reativar [S]
3. Solicitações de acesso e autocadastro (autocadastro não dá acesso automático) [S]
4. Alertas de acesso e trocas de e-mail sinalizadas [S]
5. Cadastro central de clientes e vínculos de acesso verificados [S]
6. Contratos, documentos, chamados e visitas do cliente no cadastro central [S]

### T19 Administração: sistema, LGPD e auditoria (6)
1. Trilha de auditoria: ação, autor, data e motivo [S]
2. Permissões por papel (RBAC) e o motivo de cada concessão [S]
3. Publicação do site [S]
4. LGPD: solicitações de titular, retenção e descarte [S]
5. Aparência, tema e visual [S]
6. Fila de notificações e preferências [S]
- ⚠️ Integrações e log: fora até haver conector real.

### T20 TI: segurança, backup e observabilidade (4)
1. Backup e restauração [S]
2. Observabilidade e healthcheck [S]
3. Verificação manual pelo time técnico [S]
4. Limites declarados do sistema: RAG privado, e-mail e sandbox financeiro [S]

### T21 Porteiros: portaria e rotina de posto (8)
1. Recepção de quem chega: identificação e orientação [P]
2. Controle de visitantes e veículos: registro de entrada e saída [P] — **não há módulo de visitantes no sistema hoje**
3. Livro de ocorrências: como registrar o que aconteceu [S]
4. Chaves: retirada, devolução e conferência [S]
5. Checklist de posto de portaria [S]
6. Rondas e leituras de ronda [S]
7. Passagem de plantão [S]
8. Acionar emergência e apoio [S]

### T22 Controladores de acesso (7)
1. Conferir credenciais e autorização de acesso [P]
2. Acesso fora do padrão: registrar como ocorrência [S]
3. Controle de chaves e de áreas restritas [S]
4. Rondas e checklist do controle de acesso [S]
5. Alarme disparado: o que fazer [P] — monitoramento em tempo real fica fora (⚠️)
6. Passagem de plantão com pendências de acesso [S]
7. Emergência e evacuação: acionar o apoio [S]

### T23 Auxiliares de serviços gerais: limpeza e conservação (6)
1. Ponto, escala e troca de turno (com a T03) [S]
2. Rotina de limpeza: execução e checklist [S]
3. Não conformidade de limpeza: registrar e tratar [S]
4. Materiais, almoxarifado e patrimônio [S]
5. Segurança no trabalho e uso de EPI [P] — validar com SST
6. Ocorrências e comunicação com o posto [S]

### T24 Instaladores de segurança eletrônica (8)
1. Agenda de visitas e ordem de serviço do cliente [S]
2. Frota e veículo de instalação [S]
3. Patrimônio e equipamentos em uso: inventário [S]
4. Checklist de instalação por tipo de sistema [P] — checklist técnico a fornecer pela equipe técnica
5. Registro de execução: fotos, medição e relatório de aceite [S]
6. Ocorrência durante a instalação [S]
7. Segurança na instalação: altura, eletricidade e EPI [P] — normas a validar com SST e técnico
8. Equipamentos: câmeras, sensores, alarmes, central e cerca elétrica [T] — **bloqueada até o conteúdo técnico ser fornecido**

### T25 Supervisores de posto (campo) (7)
1. Escala do posto e cobertura diária [S]
2. Acompanhar rondas e checklists da equipe [S]
3. Receber e encaminhar ocorrências da equipe [S]
4. Passagem de plantão supervisionada [S]
5. Solicitar substituição e cobertura [S]
6. Registrar lacunas de cobertura [S]
7. Comunicar emergência e acompanhar a resposta [S]

---

## 4. Rotinas que ficam de fora

| Item | Motivo | Quando reavaliar |
|---|---|---|
| ❌ 80 componentes de `/admin/ti` sem rota | Protótipos sem rota nem teste. O inventário pede prova antes de promover cada um. | Quando cada área for promovida |
| Assistentes (site, cliente, RH, Marcelo, conhecimento) e base de conhecimento | RAG privado depende de Ollama real, pendente | Depois de confirmar no ambiente |
| Galeria de layouts (`/layout-01` a `/layout-10`, `/layout-preview`) e `/qa/modulos` | Marketing e QA, não são fluxo de usuário | Não entram na academia |
| Recuperar senha (cliente), cobranças (cliente), PWA, monitoramento em tempo real, dimensionamento, integrações, inteligência comercial, expansão | Fonte, conector ou cálculo não confirmados | Quando a fonte estiver confirmada |
| Visitantes e veículos (portaria) | Não há módulo no sistema. Ficam como [P] até existir | Quando o módulo for criado |
| Instalação técnica por equipamento | Depende de conteúdo da equipe técnica | Quando o conteúdo for entregue |

---

## 5. Área de permissões do Marcelo

Pedido: Marcelo vê todas as trilhas e consegue liberar trilhas para setores ou pessoas (por exemplo, liberar uma trilha de supervisão para um funcionário). A área precisa ser organizada e visualmente clara.

**Modelo de acesso (efetivo) de uma pessoa, em ordem:**
1. Papel de gestão (Marcelo, admin): vê todas.
2. Padrão do setor: as trilhas da matriz da seção 2.
3. **Liberação individual:** trilha adicionada para uma pessoa, mesmo fora do setor.
4. **Bloqueio individual:** trilha retirada de uma pessoa, mesmo dentro do setor.

Efetivo = (padrão do setor + liberações) − bloqueios. Quem altera é o Marcelo. Todo ato fica registrado (quem, quando, o que, motivo), como nas demais trilhas de auditoria do sistema.

**Tela proposta: "Acessos às trilhas"** (acesso restrito ao Marcelo; admin apenas visualiza)
- **Matriz visual:** linhas são pessoas (avatar com iniciais, setor colorido e foto de perfil quando houver), colunas são trilhas agrupadas por público. Cada célula mostra um estado: padrão do setor, liberada individualmente, bloqueada individualmente, ou sem acesso. Cores e ícones diferentes para cada estado, e legenda fixa.
- **Filtros e busca:** por setor, por pessoa, por trilha, e "só alterados".
- **Ação em lote:** selecionar várias pessoas de um setor e liberar ou bloquear uma trilha.
- **Painel lateral da pessoa:** resumo do progresso por trilha, o que está liberado e por que (padrão, liberação ou bloqueio) e o histórico de alterações.
- **Alterar o padrão do setor:** tela separada, com confirmação explícita, porque afeta todas as pessoas do setor.
- **Auditoria:** lista de todas as liberações e bloqueios, filtrável, com exportação.

Pontos de atenção:
- A regra precisa ser aplicada no servidor, não só na tela. A versão de demonstração estática não tem essa garantia, e isso deve ficar explícito.
- Como a Academia roda isolada, a área deve morar dentro dela, com um papel de gestão próprio para o Marcelo. Ligar com as contas do sistema principal fica para depois da liberação. Ver a decisão 2 na seção 10.

---

## 6. Ajustes de pontuação e níveis (decisão 4 confirmada)

- Níveis: **0 / 300 / 900 / 1.800** (Inicial, Em desenvolvimento, Proficiente, Referência).
- Com 172 aulas, o total possível fica perto de 3.300 pontos (172 × 10, mais os acertos no quiz e 25 trilhas × 30).
- Regra de pontos por aula (10 + 5 por acerto na primeira tentativa) e por trilha (30) fica igual.

---

## 7. Cobertura do mapa

| Seção do mapa | Trilhas |
|---|---|
| §0 Cadeia ponta a ponta | T01 (visão), T07 blocos A e D |
| §1 Site público e captação | T07 bloco A |
| §2 Comercial e CRM | T07 blocos B e C |
| §3 Propostas, aceite e contratos | T07 bloco D, T15 |
| §4 Operação | T12, T13, T14, T21 a T25 (visões de cargo) |
| §5 Pessoas e RH | T09, T10, T11 |
| §6 Financeiro e conformidade | T16, T17 |
| §7 Portal do cliente | T05, T06 |
| §8 Portal do funcionário | T03, T04 |
| §9 Painel do Marcelo | T08 |
| §10 Administração, acessos e sistema | T02, T18, T19 |
| TI (inventário) | T20 (sem os componentes sem rota) |
| Catálogo de serviços: portaria e controle de acesso, limpeza, câmeras e CFTV, supervisão e ronda | T21, T22, T23, T24, T25 |

---

## 8. Ordem de execução

**Fase 1, essencial (46 aulas):** T01, T02, T03, T04, T05, T07 (blocos A e B), T08, T09.

**Fase 2, operação, pessoas e campo (95 aulas):** T06, T07 (blocos C e D), T10, T11, T12, T13, T14, T15, e as trilhas de campo T21 a T25.

**Fase 3, financeiro, administração e TI (31 aulas):** T16, T17, T18, T19, T20.

A área de permissões do Marcelo (seção 5) entra junto com a Fase 1, porque sem ela não há como liberar trilhas por pessoa.

Antes de cada fase: conferir cada aula [S] na tela real com dados fictícios. Aulas [P] são validadas com a operação ou com SST. Aulas [T] só entram depois do conteúdo técnico. Depois de cada fase, reajustar os níveis se preciso.

---

## 9. Critérios de aceite de cada aula

- Aula [S]: o caminho existe na tela real, com o papel indicado na trilha, e os nomes dos botões e campos são os exatos.
- Aula [P]: o procedimento foi validado por quem executa a rotina (operação ou SST) e consta a data da validação.
- Aula [T]: não publicada até o conteúdo técnico ser recebido e revisado.
- Aula [D]: dados fictícios, com o rótulo "demonstração · dados fictícios" visível na própria aula.
- Quiz com uma resposta certa, e a explicação aponta a tela ou o passo.
- A aula cabe em cerca de 3 minutos de leitura.

---

## 10. Respostas e status (rodada de confirmação)

| # | Pergunta | Resposta | Status |
|---|---|---|---|
| 1 | Nome do papel "supervisor" | Deixar pendente. Você confirma com o Marcelo como ele quer | **Pendente (Marcelo)** |
| 2 | Onde morar a área de permissões | Dentro da Academia | Confirmada |
| 3 | Quem altera permissões | Marcelo, RH e admin | Confirmada. Detalhe a definir: se o RH altera qualquer trilha ou só as trilhas de RH |
| 4 | Conteúdo técnico da instalação (T24, aula 8) | Em construção, até confirmar com o Marcelo | **Em construção** |
| 5 | Validação dos procedimentos [P] de portaria, controle de acesso e serviços gerais | Em construção, até confirmar com o Marcelo | **Em construção** |
| 6 | Visitantes e veículos | Em construção, até confirmar com o Marcelo | **Em construção** |

### Efeitos no plano
- **Papel supervisor (T25 e a trilha de supervisão T12/T13):** o nome e o público ficam pendentes. Até a resposta, a T25 e as aulas de supervisão não são publicadas com um papel definido. As aulas de supervisão da equipe continuam no plano, sem alteração de conteúdo.
- **Aulas [P] e [T]:** ficam marcadas como "em construção" na Academia, sem publicação até a validação.
- **Visitantes e veículos (T21, aula 2):** em construção.
- **Área de permissões:** dentro da Academia, com acesso para Marcelo, RH e admin.

---

## 11. Próximo passo

A Fase 1 pode começar com o que não depende das pendências: trilhas T01 a T09 (exceto o que depender do papel supervisor), a área de permissões dentro da Academia e os setores novos que não usam o nome pendente (porteiro, controlador de acesso, serviços gerais e instalador). O conteúdo de cada aula é conferido na tela real antes de publicar.
