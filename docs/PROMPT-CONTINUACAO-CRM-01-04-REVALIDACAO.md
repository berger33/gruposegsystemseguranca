# Fatia CRM-01..04 — revalidação campo a campo

Esta política é registrada antes de qualquer mudança de rota. Base confirmada:
`main @ 5eea847` (2026-09-29), sem alterações locais no início.

## Escopo

Revalidar por HTTP real e Chromium real os quatro requisitos de CRM-01..04:

- CRM-01: empresa central, identificação fiscal, segmento, cidade, unidades,
  canais, responsável e distinção prospect/cliente/parceiro;
- CRM-02: contato vinculado à empresa, função de compra, preferências/restrições,
  origem legítima e contato ativo;
- CRM-03: importação CSV com prévia, mapeamento, validação por linha,
  deduplicação revisável e exportação sem fórmula executável;
- CRM-04: conversão de lead preservando histórico, contato/oportunidade e
  comportamento idempotente.

A fatia não cria CRM-10, automação de mensagens, SMTP, integração externa ou
aceite humano. CRM-02 continua declaradamente parcial quanto a uma tela de
contato dedicada se o gate provar que não há superfície navegável para ela;
não será criado um CRUD órfão apenas para mudar o estado documental.

## Política de autorização e escopo

Todas as rotas exigem sessão individual de staff, mesma origem nas leituras e
mutações e método explícito. Papel errado recebe 403; ausência de sessão 401;
falha de banco nega por padrão. O cadastro central de empresa/contato é
administrativo e não expõe oportunidades de outra identidade. Unidades e
contatos são retornados somente quando pertencem à empresa solicitada.

A conversão é permitida apenas à família comercial já usada no funil; o
`lead_id`, empresa, contato e oportunidade são derivados/validados no servidor.
O corpo não pode fabricar `public_lead_id`, responsável ou histórico.

## Integridade e auditoria

As mutações desta fatia gravam `auth_access_audit` na mesma transação da
mutação. Falha de auditoria faz rollback e responde 503; não há `try/catch`
que engula a falha. A próxima migração livre é 113 (confirmar no disco e no
histórico antes de criar): ela será aditiva e reafirmará a constraint pai,
`actor_kind` necessário e somente as ações exercitadas pela fatia.

## Dados e CSV

Campos são validados no servidor, com limites explícitos. Importação tem
prévia antes do commit, deduplicação por documento e nome para revisão humana,
sem criar duplicata implicitamente. Exportação prefixa valores perigosos com
aspas simples (`=`, `+`, `-`, `@`, tab e CR), e o gate verifica bytes reais.
Nenhum valor de planilha é executado ou interpretado como fórmula.

## Portão obrigatório

Adicionar cenário próprio em `tests/l04-delivery.integration.test.mjs` com
HTTP real, PostgreSQL descartável e Chromium real sem `--disable-web-security`.
O cenário usará `page.waitForResponse` para a jornada de UI e verificará todos
os campos relevantes, controles negativos, 401/403/405, prévia/commit CSV,
exportação segura e conversão idempotente/histórico. Falhas injetadas na
trilha devem reverter a mutação. Cenários preexistentes só serão ajustados se
uma regra mais forte os quebrar, com declaração documental.

## Componentes órfãos

Não conectar componente órfão. Se um componente permitir fabricar dado,
manter o descarte declarado; a ausência de tela dedicada CRM-02 será registrada
honestamente caso permaneça após a revalidação.
