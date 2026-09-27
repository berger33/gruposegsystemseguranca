# Próximo passo — continuidade do projeto

Documento de passagem de sessão. Registra o estado **verificado** do projeto e traz um
prompt pronto para colar em uma nova conversa.

## Estado verificado em 27/09/2026

A `main` está consolidada: todo o trabalho das sessões anteriores (site com dez
interfaces, captação de pedidos, simulador, painel de leads, autenticação real e dados
reais do cliente) foi mesclado em uma única linhagem. As branches antigas de sessão foram
removidas após a conferência de ancestralidade.

O que está ativo e coberto por teste automatizado:

| Camada | Estado | Onde |
| --- | --- | --- |
| Site público com dez propostas | Ativo (layout 06 é o padrão; `/layout-01`…`/layout-10` preservadas) | `src/app/layout-*` |
| Captação de pedidos → PostgreSQL | Verificado contra banco real | `tests/lead-flow.integration.test.mjs` |
| Painel `/admin/leads` com trilha de auditoria | Ativo | `src/app/admin/leads` |
| Simulador `/simulador` em quatro etapas | Ativo | `src/app/simulador` |
| **Etapa 1** — autenticação real do cliente | Ativa e verificada | `db/migrations/003-client-access.sql`, `src/server/client-access-api.mjs` |
| **Etapa 2** — vínculo verificado + contratos/documentos/chamados | Ativa e verificada | `db/migrations/004-client-space.sql`, `src/server/client-space-api.mjs` |

Comandos de verificação (rode antes e depois de mudar código):

```bash
npm install
npm run db:migrate          # precisa de DATABASE_URL (PostgreSQL real)
npm test                    # 46 testes unitários
npm run test:integration    # 34 asserções em 3 suítes, contra PostgreSQL real
npm run typecheck
npm run build
```

Sem `RUN_DATABASE_INTEGRATION=1` e sem `DATABASE_URL` de loopback, as três suítes de
integração fazem *skip* — nesse caso nada foi provado de ponta a ponta. No sandbox atual
não há Docker; um PostgreSQL 18 local foi provisionado por npm (`embedded-postgres`) e as
migrações `001`–`004` foram aplicadas nele.

Bloqueios que dependem de decisão do dono (não resolvidos): provedor SMTP real, dados
oficiais da empresa (CNPJ, contatos, logotipo, fotos e licenças), política de privacidade
aprovada e definição dos administradores iniciais.

## Prompt para a próxima sessão

Copie o bloco abaixo. Ele já contém o estado verificado, para a nova sessão não
recomeçar do zero nem presumir nada.

```text
Repositório: berger33/gruposegsystemseguranca (Next.js 16 + React 19 + TypeScript,
servidor Node próprio em server.mjs, PostgreSQL, migrações SQL idempotentes em
db/migrations). A main está consolidada e a documentação de referência é
docs/plano-produto.md, docs/portal-acesso-e-seguranca.md, docs/captacao-pedidos.md e
docs/administracao-visual.md.

Estado já verificado (não re-derive, apenas confirme rodando os testes):
- Etapa 1 do portal do cliente pronta: convite administrativo (7 dias, uso único,
  revogável), aceite com senha scrypt (12+ caracteres), confirmação de e-mail, login com
  espera progressiva 1/5/15 min após a 5ª falha, sessões revogáveis no servidor,
  recuperação por link de 1 hora com resposta genérica, auditoria com categorias fechadas.
- Etapa 2 pronta: vínculo verificado no servidor (grant com emissor e motivo, revogação
  idempotente e imediata) e dados reais do cliente — contratos, documentos com download
  auditado e chamados com resposta da equipe.
- Regra de ouro já implementada e testada: o servidor nunca confia em identificadores
  vindos do navegador; cada consulta exige sessão válida + vínculo ativo + cadastro
  ativo, e qualquer desvio responde 403 genérico com linha de auditoria
  authorization_denied.
- Verificação: npm test (46 unitários), npm run test:integration (34 asserções em 3
  suítes contra PostgreSQL real), npm run typecheck e npm run build estavam verdes.
  Rode tudo antes e depois de mexer no código; sem banco real as integrações fazem skip
  e nada fica provado.

Missão desta sessão — Etapa 3 (opção A, recomendada): fechar a espinha de segurança e o
painel administrativo.
1. Escopo de vínculo por contrato e por unidade/filial: hoje o grant vale para o cadastro
   inteiro. Amplie o modelo (migração 005) para permitir vínculo restrito a contratos
   específicos e/ou a uma unidade, mantendo deny-by-default e a checagem por requisição.
   O modelo já prevê unidade futura (client_accounts.parent_account_id) — use, não
   reinvente.
2. MFA opcional do cliente: TOTP implementado com node:crypto (sem dependência nova),
   códigos de recuperação hasheados, ativação e verificação com limite de tentativas,
   tudo auditado. MFA continua opcional para clientes.
3. Troca de e-mail: exige senha atual, confirmação no novo endereço, aviso ao endereço
   antigo e o caminho "Não fui eu" que cancela a troca pendente, invalida o link e gera
   alerta de segurança — exatamente como decidido em docs/portal-acesso-e-seguranca.md.
4. Painel administrativo consolidado: hoje os convites só existem por API. Crie a UI de
   emissão/revogação de convites e uma tela de auditoria consultável por período, ator e
   ação, respeitando a retenção de 12 meses.

Critérios de aceite:
- Migração nova idempotente, aplicada e conferida por teste de integração.
- Teste de integração novo provando: vínculo restrito a um contrato não enxerga os demais
  (403 genérico + auditoria); vínculo por unidade não vaza entre unidades; MFA bloqueia
  login sem código válido; "Não fui eu" cancela a troca e registra alerta.
- npm test, npm run test:integration, npm run typecheck e npm run build verdes.
- Docs atualizados no mesmo commit e README refletindo o que ficou ativo de verdade.

Restrições herdadas (não negocie):
- Nunca invente cliente, contrato, documento, colaborador ou preço; dados de demonstração
  só em ambiente de teste e identificados como tal.
- Auditoria sem segredos (nada de senha, token ou hash na trilha).
- Respostas de erro genéricas em caminhos de autenticação, para não enumerar contas.
- Mantenha robots noindex enquanto o sistema não estiver pronto para produção.

Opção B, se a prioridade for a operação em campo (Fase 3 do plano): substitua a missão
por identidades de equipe (auth_identities.kind = 'staff', cadastro apenas por
administradores autorizados), postos e alocações por cliente, escalas 12x36/6x1/diarista,
registro de ronda com responsável e evidência, e passagem de plantão. Antes disso são
necessárias decisões do dono: regras de escala por posto, se haverá geolocalização
(finalidade, retenção e acesso), quem cadastra colaboradores e se o ponto é por posto ou
por pessoa.

Decisões que só o dono pode tomar (liste como checklist e cobre): provedor SMTP, CNPJ e
contatos oficiais, logotipo/fotos/licenças, política de privacidade aprovada,
administradores iniciais e (na opção B) as regras de escala e ponto.
```
