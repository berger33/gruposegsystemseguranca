# Fatia CRM-02 — superfície dedicada e manutenção de contatos

Data da decisão: 2026-09-30. Base confirmada antes desta política: `HEAD`
`42086989943b5af8b2baec0bb19a700ea6b6cfc1` (merge do PR #29), árvore limpa.
Esta é a **única fatia vertical** desta continuação: Opção A, completar CRM-02.
CRM-01 unidades, CRM-03 deduplicação revisável, CRM-04 resolução automática,
PUB-02/05/06/07/09, CRM-10 e L05 ficam fora.

## Decisão de autorização

- A superfície é `/admin/crm`, mas a autorização é do servidor, não da
  existência da página. As rotas de contato exigem sessão individual, origem
  igual à do servidor e método explícito.
- A família autorizada é `comercial`, `admin`, `marcelo` e `ti`. Ausência de
  sessão responde 401; papel autenticado fora da família (inclusive `rh`)
  responde 403; origem diferente responde 403; método não permitido responde
  405 com `Allow` correto. Não há token compartilhado, bypass por `admin`,
  cookie forjado ou SQL que substitua a API.
- `company_id` é obrigatório na criação e não pode ser trocado na edição.
  O servidor verifica a empresa na mesma transação da criação e nunca aceita
  um contato órfão. Leituras por lista exigem `companyId`; o detalhe só
  retorna contato que ainda tenha empresa. A rota não expõe contatos globais
  sem escopo de empresa.
- A identidade é usada para autorizar a família de papel e registrar o ator;
  contatos são cadastro central compartilhado entre identidades comerciais
  autorizadas, não uma carteira pessoal. O escopo da leitura é sempre a
  empresa solicitada. Unidades não têm `unit_id` em `crm_contacts` na política
  atual: contato é da empresa inteira, não de uma unidade; nenhuma leitura de
  oportunidade, valor, nota ou unidade é adicionada por esta fatia.

## Campos, limites e validações

- `display_name`: obrigatório, 1–200 caracteres.
- `email`: opcional, no máximo 254 e formato de e-mail quando informado.
- `phone`: opcional, no máximo 30 caracteres.
- `role` e `buying_role`: quando informados, somente `decisor`,
  `influenciador`, `usuario`, `financeiro` ou `outro`.
- `preferences`: objeto pequeno e explícito, com `channels` (até quatro entre
  `email`, `phone`, `whatsapp`, `meeting`, `other`) e `best_time` opcional de
  até 100 caracteres. O servidor rejeita tipos, canais e chaves desconhecidos;
  nunca recebe HTML ou um objeto arbitrário de preferências.
- `restrictions`: opcional, trim e máximo de 500 caracteres; a UI deixa claro
  que são restrições de abordagem, não instruções de envio automático.
- `origin`: opcional para preservar registros legados e conversões server-side;
  quando informado pela superfície, deve ser uma origem controlada
  (`manual`, `consentimento_formulario`, `indicacao`, `evento`, `importacao`,
  `lead_publico`, `site`, `contato`, `outro`). Conversão de lead permanece
  server-managed e não recebe origem fabricada pelo navegador.
- `status`: somente `active` ou `inactive`; inativar não apaga histórico e
  respeita os gatilhos de cadência/opt-out já existentes.
- `is_primary`: booleano, sem permitir que a UI invente empresa ou unidade.

A compatibilidade com registros anteriores permite campos opcionais ausentes
na API legada; a nova tela sempre oferece função, preferências, restrições,
origem e estado ativo/inativo. Não se altera a coluna legada `company_id` para
`NOT NULL` nesta fatia, pois já há histórico aplicado; toda nova criação e toda
edição pela superfície, contudo, falham fechadamente sem empresa.

## Política de auditoria transacional

Criação e edição executam:

```text
BEGIN;
mutação de crm_contacts;
auditoria em auth_access_audit;
COMMIT;
```

Ações desta superfície: `crm_contact_create` (já reautorizada e provada na
migração 113) e `crm_contact_update` (a ser reautorizada somente na migração
aditiva 114). A auditoria usa o `actor_kind` da sessão e `actor_id` da
identidade. Qualquer falha, inclusive trigger de teste ou CHECK do banco,
executa ROLLBACK e responde HTTP 503; nenhum `try/catch` engole a falha da
mutação. `crm_cadence_block`, quando um gatilho existente for acionado, fica na
mesma transação.

Antes da migração, o disco confirmou `001–113`, `latestMigration = 113`, o
manifesto até `113` e nenhuma branch remota contém uma migração 114. A
migração 114 será aditiva e preservará a definição anterior do CHECK: falhará
se `auth_access_audit_action_check` sumir e falhará se o `actor_kind` necessário
`comercial` sumir; acrescentará apenas `crm_contact_update`. Migrações 001–113
permanecem imutáveis.

## UI e escopo navegável

`ContactManager.tsx` será conectado dentro de `/admin/crm`, sem componente
órfão reaproveitado. A pessoa escolhe uma empresa autorizada, carrega somente
os contatos daquela empresa, cria um contato com os campos controlados e edita
um contato por vez. A UI não permite digitar `company_id`, trocar a empresa de
um contato ou editar dados de outra empresa fora da seleção. Erros de API são
visíveis; não há criação silenciosa nem atualização otimista sem confirmação.

## Componentes descartados e fronteiras externas

Não foi encontrado componente órfão de contatos a conectar. Nenhum componente
em `src/app/admin/ti/*Client.tsx` será usado. `company_id`, identidade criadora
e histórico de auditoria são server-managed. Não há integração externa, envio
de mensagens, SMTP, calendário ou sincronização de contatos nesta fatia.

## Portão obrigatório

Adicionar um cenário próprio a `tests/l04-delivery.integration.test.mjs`
com PostgreSQL descartável, servidor HTTP real e Chromium real sem
`--disable-web-security`, usando `page.waitForResponse` e não espera fixa. O
cenário provará:

1. 401 anônimo; 403 para RH e para origem diferente; 405 para método não
   permitido; empresa ausente, empresa inexistente, função/preferência/origem
   inválidas e contato de outra empresa recusados.
2. criação HTTP com todos os campos, leitura escopada, edição controlada de
   função/preferências/restrições/origem e ativo/inativo; empresa do contato
   não pode ser alterada.
3. auditoria da criação/edição e rollback de criação e de edição quando um
   trigger injeta falha em `auth_access_audit`, com o valor anterior preservado
   na edição.
4. jornada Chromium dentro de `/admin/crm`: seleção de empresa, carregamento
   de contatos por resposta real, criação e edição por respostas reais, sem
   rolagem horizontal, sem erro de console e sem HTTP 5xx inesperado.

O gate confere o banco somente como efeito interno da rota e não usa SQL para
substituir qualquer mutação da API.
