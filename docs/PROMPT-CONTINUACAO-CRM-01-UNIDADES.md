# Fatia CRM-01 — superfície dedicada e manutenção de unidades atendidas

Data da decisão: 2026-09-30. Base confirmada antes desta política: `HEAD`
`186e7dd4c420d577540b6ade8902b678762fac8b` (merge do PR #30), árvore limpa.
Esta é a **única fatia vertical** desta continuação: Opção A, completar CRM-01.
CRM-03 deduplicação revisável, CRM-04 resolução automática, PUB-02/05/06/07/09,
CRM-10 e L05 ficam fora.

## Decisão de autorização

- A superfície é `/admin/crm`, mas a autorização é do servidor, não da
  existência da página. As rotas de unidade exigem sessão individual, origem
  igual à do servidor e método explícito.
- A família autorizada é `comercial`, `admin`, `marcelo` e `ti`. Ausência de
  sessão responde 401; papel autenticado fora da família (inclusive `rh`)
  responde 403; origem diferente responde 403; método não permitido responde
  405 com `Allow` correto (ex.: DELETE). Não há token compartilhado, bypass
  por `admin`, cookie forjado ou SQL que substitua a API.
- `company_id` é obrigatório na criação e não pode ser trocado na edição
  (responde 400 `company_immutable` se enviado no PATCH).
  O servidor verifica a existência da empresa na mesma transação da criação e
  nunca aceita uma unidade órfã. Leituras por lista exigem `companyId`; o detalhe
  só retorna unidade vinculada a empresa existente. A rota não expõe unidades
  globais sem escopo de empresa.
- A identidade é usada para autorizar a família de papel e registrar o ator;
  unidades são cadastro central compartilhado entre identidades comerciais
  autorizadas, não uma carteira pessoal. O escopo da leitura é sempre a
  empresa solicitada.

## Campos, limites e validações

- `display_name`: obrigatório, 1–200 caracteres (trim, `sanitizeText(..., 200)`).
  Rejeita vazio ou ausente com 400 `invalid_display_name`.
- `city`: opcional, máximo 100 caracteres (`sanitizeText(..., 100)`).
- `address`: opcional, máximo 300 caracteres (`sanitizeText(..., 300)`).
- `is_main`: booleano (default `false`). Para evitar duplicidade de unidade
  principal dentro da mesma empresa, quando uma unidade é criada ou atualizada
  com `is_main: true`, qualquer outra unidade anterior da mesma empresa tem
  `is_main` desmarcado (`false`) na mesma transação atômica.
- Campos desconhecidos em criação/edição são rejeitados com 400 `field_not_editable`.

## Política de auditoria transacional

Criação e edição de unidade executam atomicamente:

```text
BEGIN;
mutação de crm_company_units;
auditoria em auth_access_audit;
COMMIT;
```

Ações desta superfície: `crm_unit_create` e `crm_unit_update` (reautorizadas na
migração aditiva 115). A auditoria usa o `actor_kind` da sessão (`session.role`)
e `actor_id` da identidade (`session.identityId`). Qualquer falha, inclusive
trigger de teste ou CHECK do banco, executa ROLLBACK e responde HTTP 503;
nenhum `try/catch` engole a falha da mutação.

Antes da migração, o disco confirmou `001–114`, `latestMigration = 114`, o
manifesto até `114` e nenhuma branch remota contém uma migração 115. A
migração 115 será aditiva e preservará a definição anterior do CHECK: falhará
se `auth_access_audit_action_check` sumir e falhará se o `actor_kind` necessário
`comercial` sumir; acrescentará apenas `crm_unit_create` e `crm_unit_update`.
Migrações 001–114 permanecem imutáveis.

## UI e escopo navegável

`UnitManager.tsx` será conectado dentro de `/admin/crm`, sem componente
órfão reaproveitado. A pessoa usuária escolhe uma empresa autorizada, carrega
somente as unidades daquela empresa, cria uma unidade com os campos controlados
e edita uma unidade por vez. A UI não permite digitar `company_id`, trocar a
empresa de uma unidade ou editar dados de outra empresa fora da seleção.
Erros de API são visíveis; não há criação silenciosa nem atualização otimista
sem confirmação.

## Componentes descartados e fronteiras externas

Nenhum componente em `src/app/admin/ti/*Client.tsx` será usado. `company_id`,
identidade criadora e histórico de auditoria são server-managed. Não há
integração externa, envio de dados a terceiros, mapas ou serviços de
geolocalização externa nesta fatia.

## Portão obrigatório

Adicionar um cenário próprio a `tests/l04-delivery.integration.test.mjs`
com PostgreSQL descartável, servidor HTTP real e Chromium real sem
`--disable-web-security`, usando `page.waitForResponse` e não espera fixa. O
cenário provará:

1. 401 anônimo; 403 para RH e para origem diferente; 405 para método não
   permitido (ex.: DELETE); empresa ausente, empresa inexistente, campos
   inválidos e tentativa de troca de empresa recusados.
2. criação HTTP via API (sem fixtures SQL substitutas) com todos os campos,
   leitura escopada por `companyId`, edição controlada de campos, alternância
   atômica da unidade principal sem duplicidade;
3. auditoria da criação/edição e rollback de criação e de edição quando um
   trigger injeta falha em `auth_access_audit`, com o valor anterior preservado
   na edição.
4. jornada Chromium dentro de `/admin/crm`: seleção de empresa, carregamento
   de unidades por resposta real, criação e edição por respostas reais, sem
   rolagem horizontal, sem erro de console e sem HTTP 5xx inesperado.

O gate confere o banco somente como efeito interno da rota e não usa SQL para
substituir qualquer mutação da API.
