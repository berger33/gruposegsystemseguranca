-- PUB-08 (SEO técnico): autoriza a ação de auditoria do cadastro de redirect.
-- Migrações 001–111 permanecem imutáveis. Esta migração é apenas aditiva.
--
-- Política desta fatia (decidida antes da rota — ver
-- docs/PROMPT-CONTINUACAO-PUB08-SEO-TECNICO.md):
--   * O cadastro de redirect grava a trilha em `auth_access_audit` DENTRO da
--     mesma transação da escrita. Falha de trilha reverte a mutação e devolve
--     503 — nunca grava o redirect sem trilha, nunca "engole" o erro.
--   * Por isso a trilha desta fatia NÃO usa o `auditLog` de `createSeoApi`, que
--     escreve em `audit_log` com `catch {}` (perda silenciosa de trilha).
--
-- ACHADO QUE OBRIGOU ESTA MIGRAÇÃO (registrado honestamente, não contornado):
--   A migração 090 já havia autorizado 'seo_redirect_create'. As migrações 099,
--   100 e 103 **redigitaram a lista inteira** do CHECK em vez de ampliá-la e,
--   com isso, apagaram 148 valores que existiam na lista da 093 — entre eles
--   todas as ações de SEO, CMS, temas, pacotes, origem/conversão e reclamação
--   (`seo_config_create`, `seo_config_update`, `seo_redirect_create`,
--   `seo_redirect_update`, `seo_sitemap_update`, `domain_verification_create`,
--   `domain_verification_verify`, `cms_content_*`, `theme_*`, `package_*`,
--   `origin_metric_*`, `ab_test_*`, `cli_complaint_*`, entre outras). O
--   comentário daquelas migrações afirma "mantém todas as anteriores"; a lista
--   digitada não mantém. O defeito só aparece quando alguém tenta gravar a
--   trilha SEM engolir o erro, que é exatamente o que esta fatia faz.
--
--   Esta migração NÃO restaura os 148 valores. Restaura apenas os dois que esta
--   fatia de fato escreve e prova por portão: 'seo_redirect_create' (cadastro) e
--   'seo_redirect_update' (ativar/desativar o desvio). Os demais continuam fora
--   da lista e permanecem como achado aberto, declarado em
--   docs/EVIDENCIAS-ENTREGA-LOCAL.md: reautorizar em bloco seria "autorizar"
--   trilha de caminhos que nenhum portão desta entrega exercita.

DO $$
DECLARE
  current_definition text;
  actor_kind_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_definition
  FROM pg_constraint
  WHERE conrelid = 'auth_access_audit'::regclass
    AND conname = 'auth_access_audit_action_check'
    AND contype = 'c';
  IF current_definition IS NULL OR left(current_definition, 6) <> 'CHECK ' THEN
    RAISE EXCEPTION 'audit_action_constraint_missing';
  END IF;

  -- A trilha desta fatia grava actor_kind = papel da sessão ('ti'), ampliado
  -- pela migração 103. Se alguma migração futura estreitar esse CHECK, esta
  -- migração falha em vez de deixar a fatia gravar trilha inválida.
  SELECT pg_get_constraintdef(oid) INTO actor_kind_definition
  FROM pg_constraint
  WHERE conrelid = 'auth_access_audit'::regclass
    AND conname = 'auth_access_audit_actor_kind_check'
    AND contype = 'c';
  IF actor_kind_definition IS NULL OR actor_kind_definition NOT LIKE '%''ti''%' THEN
    RAISE EXCEPTION 'audit_actor_kind_ti_missing';
  END IF;

  IF current_definition LIKE '%seo_redirect_create%'
     AND current_definition LIKE '%seo_redirect_update%' THEN
    RETURN;
  END IF;

  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''seo_redirect_create'',''seo_redirect_update''))',
    substring(current_definition FROM 7)
  );
END $$;
