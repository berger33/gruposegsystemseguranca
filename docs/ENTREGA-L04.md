# Entrega L04 — site e comercial

Base da auditoria: main `0cbac7608a69cec15bfc3671ab9196efabf58a2e` (PR #32).
Entrega: PR #33, branch `codex/l04-completion`.
Fonte exclusiva: GitHub. Nenhum checkout, instalação, banco ou execução no computador do usuário.

## Situação e validação

Código validado no commit `1ecac2852e9a0eb2e6af3d2ea73116ad7942006b` por GitHub Actions:

- [QA baseline aprovado](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36662350769): 196 testes unitários, typecheck, build e verificações de regressão.
- [Gate L04 aprovado](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36662350715): 20 testes integrados, 20 aprovados, zero falhas e zero skips, com HTTP, PostgreSQL e Chromium.
- Migrações: 117/117 com checksums, reaplicação idempotente e restauração de clone descartável verificadas; alteração de checksum rejeitada intencionalmente no teste negativo.

Após essa validação, foram publicados os documentos e ajustada a sincronização do teste de navegação semanal (aguardar resposta e renderização antes de avançar). Uma rodada intermediária revelou esse timeout; não foi ignorado. Consulte os checks do PR #33 para o resultado do HEAD mais recente.

A conclusão deste documento é do escopo técnico local L04 (PUB-01..10 e CRM-01..27), não da entrega integral L00–L10 nem de uma operação comercial pública homologada.
SMTP e hospedagem pública permanecem excluídos. L05 não foi implementado nesta entrega.

## Lacunas encontradas e resolvidas

| Área | Antes | Entrega |
|---|---|---|
| PUB-05 | FAQ legada com leitura pública de sessões/mensagens e encaminhamento desconectado | Consulta determinística sobre FAQ publicada no CMS; pergunta sensível vai ao formulário de contato. Protocolo somente após persistir lead com consentimento. Sessões antigas protegidas. Sem LLM neste lote. |
| PUB-06 | Componente órfão; rotas públicas confundidas com administrativas; publicação/versionamento inseguros | /admin/publicacao: páginas, FAQ, cases, blog e vagas em texto simples. Rascunho → revisão → aprovação → publicação; versões, histórico e restauração como novo rascunho. Consumidor público em /conteudos e /conteudos/[slug]. |
| PUB-07 | /admin/tema alterava somente um atributo no navegador | Versões persistidas de temas, prévia isolada, publicação autorizada, restauração de tema já publicado e preferência dia/noite separada. Tokens consumidos pelas superfícies editoriais. Os dez layouts existentes continuam separados em /admin/visual. |
| PUB-09 | Montador/comparador órfão; preço recebido do navegador podia ser tratado como aprovado | Pacotes compostos por serviços validados e regras aprovadas; revisão e publicação; comparação pública e administrativa. Valores ausentes continuam “sob consulta”, nunca zero. Recolhimento após revogação de regra. |
| CRM-08 | Calendário somente de leitura e lembretes pendentes | Editor autorizado reutilizado dentro da visão semanal; próximos compromissos em 24h ao abrir/atualizar a agenda, sem envio externo. |
| CRM-10 | Sem área de carteira | /admin/carteira: grupos/unidades, filtros sem próxima ação, vencidas, ganhas/perdidas; renovação, ampliação, serviço adicional, recuperação e indicação criam oportunidade vinculada e próxima ação. Retry por chave não duplica. |
| CRM-24 | Relatórios agregavam oportunidades de todos os usuários | Consultas agregam a carteira do usuário autenticado, antes dos cálculos. Conferência de totais e previsão ponderada como estimativa. Fim de período inclui o dia completo na conversão. Pipeline por cenário usa registros reais de preço vinculados, não agrupamento por serviço. |
| CRM-25 | Histórico insuficiente, validação de pagamento e permissões incompletas | Gestão de metas/regras/comissões; histórico imutável de versões e snapshot da regra no cálculo. Edição da regra retira aprovação. Sem pagamento automático; marcação manual exige aprovação e nota. |
| CRM-26 | Aprovação podia sobreviver à edição; campanhas aceitavam material não aprovado | Gestão restrita, edição recolhe material para rascunho, campanha exige material aprovado e é pausada após revogação. URLs de material restritas a HTTPS ou caminho interno. |
| CRM-27 | Métrica com período quebrava por parâmetros inconsistentes | Filtros de período corrigidos, leitura comercial restrita aos seus registros; ações da carteira reaproveitam renovações/indicações e trazem resultados derivados do funil. |
| PUB-01 | API pública devolvia informações internas de custo e aceitava consulta de catálogo não publicado | Projeção pública sem custo/preço interno e sem itens não publicados/não validados. Consulta administrativa mantém detalhes autorizados. |

## Decisões de negócio e permissões

- Publicação editorial, regras de pacote, temas, metas, comissões, biblioteca e administração de parcerias: papéis admin, marcelo e ti. Comercial consulta registros permitidos e usa a carteira/CRM para executar acompanhamento.
- A carteira e os relatórios de funil são pessoais para a família comercial, conforme a política já adotada nas fatias anteriores. O resumo de origens PUB-10 continua com suas permissões próprias.
- Comercial não aprova sua própria remuneração nem muda material publicado pela gestão. RH, cliente e funcionário não ganham acesso comercial por ter uma sessão.
- O histórico comercial da gestão pode ser consultado em /admin/comercial, na seção Relatórios & comissões.
- Case sem confirmação de autorização não publica. O código não certifica uma autorização real: a declaração é responsabilidade do revisor.
- Conteúdo CMS é texto simples, renderizado pelo React. Não há execução de HTML nem novo upload público.
- A busca FAQ não é RAG nem LLM. Perguntas sobre preço/cobertura/licença/prazo/garantia pedem avaliação humana. A pergunta é preservada no navegador durante o encaminhamento, não na URL.
- Não há mensagens externas: o atendimento humano entra pela fila de leads existente.
- Pacotes não calculam preço comercial sem processo de custeio/proposta. Compatibilidade de equipamentos e SLA exigem avaliação técnica. Não há promessa de pacote “pronto para instalar”.
- Novo tema não refaz os dez layouts ou a identidade dos portais internos. Publicação persiste a paleta das superfícies que usam os tokens; /admin/visual continua controlando a composição dos layouts.
- Histórico antigo de comissão não recebe uma regra fictícia retroativa: rule_snapshot fica nulo quando não havia evidência.

## Dados e integridade

Migração 117 aditiva:
- crm_portfolio_actions: origem, oportunidade gerada, tipo, autor, chave de idempotência.
- crm_commercial_versions: snapshots imutáveis de metas, regras, comissões e biblioteca, incluindo estado existente.
- Snapshot da regra de comissão e pausa de campanha quando o material perde aprovação.
- Ampliação delimitada da constraint de ações de auditoria, preservando a expressão anterior.
- Migrações 001–116 não alteradas.

CMS, temas, pacotes e ações de carteira usam transações com trilha; CMS/pacotes/temas serializam publicação relevante com lock transacional. O teste injeta falha de auditoria em CMS/carteira e confere que não sobra efeito parcial.

## Evidência e limites

- O gate L04 preserva os 15 cenários anteriores: lead até contrato idempotente, tarefas, interações/anexos, agenda, cadências, delegação, notas, calendário, métricas, SEO, cadastro, contatos, unidades e deduplicação.
- Os cenários 16–20 exercitam publicação/reversão e FAQ com lead real, tema/rollback e reload, pacote/comparação/revogação, carteira/isolamento/idempotência/relatórios e gestão comercial.
- Chromium verifica as novas superfícies em viewport móvel. Isso não representa certificação WCAG, ensaio de carga ou aceite visual formal do cliente.
- Aprovação de textos comerciais, cases, regras reais e identidade visual cabe aos responsáveis antes de uso real.
- Domínio/DNS, indexação de produção, SMTP e provedores externos não são comprovados por testes locais.
- A/B continua condicionado a hipótese, volume e finalidade legítima; não são fabricados resultados ou métricas.
- Integração contratual completa pertence a L05; estoque/operação a L06; apuração financeira integrada a L07; IA/RAG a L09; ensaio no computador do usuário e homologação a L10.
- As versões anteriores de documentos de continuação são histórico. A próxima orientação é docs/PROMPT-CONTINUACAO-L05-CONTRATOS.md, somente após integrar o PR #33 com checks aprovados.
