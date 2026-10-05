-- Migração aditiva 171: F15 — recuperação de acesso do cliente sem SMTP.
-- Preserva 001–170 imutáveis. O pedido público nunca revela se a conta existe.
-- Somente TI individual com permissão explícita pode autorizar e obter, uma única vez,
-- o link local de redefinição. O banco guarda apenas hashes; não há envio externo.

CREATE TABLE IF NOT EXISTS client_access_recovery_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  requested_email_hash CHAR(64) NOT NULL,
  origin_hash CHAR(64),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','autorizada','consumida','expirada','revogada')),
  authorized_by_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT,
  authorization_method TEXT CHECK (authorization_method IN ('presencial','retorno_contato_conhecido')),
  authorization_reason TEXT CHECK (authorization_reason IS NULL OR char_length(authorization_reason) BETWEEN 30 AND 500),
  token_id UUID REFERENCES auth_email_tokens(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  authorized_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status <> 'autorizada') OR (authorized_by_identity IS NOT NULL AND authorization_method IS NOT NULL AND authorization_reason IS NOT NULL AND token_id IS NOT NULL AND authorized_at IS NOT NULL AND expires_at IS NOT NULL)),
  CHECK ((status <> 'consumida') OR consumed_at IS NOT NULL),
  CHECK ((status <> 'revogada') OR revoked_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS client_access_recovery_pending_idx
  ON client_access_recovery_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS client_access_recovery_identity_idx
  ON client_access_recovery_requests(identity_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS client_access_recovery_one_live
  ON client_access_recovery_requests(identity_id) WHERE status IN ('pendente','autorizada');

CREATE OR REPLACE FUNCTION client_access_recovery_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'access recovery requests cannot be deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pendente' OR NEW.authorized_by_identity IS NOT NULL OR NEW.token_id IS NOT NULL THEN
      RAISE EXCEPTION 'access recovery request must be born pending';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.identity_id IS DISTINCT FROM OLD.identity_id
     OR NEW.requested_email_hash IS DISTINCT FROM OLD.requested_email_hash
     OR NEW.origin_hash IS DISTINCT FROM OLD.origin_hash
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at THEN
    RAISE EXCEPTION 'access recovery request core is immutable';
  END IF;
  IF OLD.status IN ('consumida','expirada','revogada') THEN
    RAISE EXCEPTION 'terminal access recovery request is immutable';
  END IF;
  IF OLD.status = 'pendente' AND NEW.status NOT IN ('autorizada','revogada','expirada') THEN
    RAISE EXCEPTION 'invalid access recovery transition';
  END IF;
  IF OLD.status = 'autorizada' AND NEW.status NOT IN ('consumida','revogada','expirada') THEN
    RAISE EXCEPTION 'invalid access recovery transition';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS client_access_recovery_guard_trg ON client_access_recovery_requests;
CREATE TRIGGER client_access_recovery_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON client_access_recovery_requests
FOR EACH ROW EXECUTE FUNCTION client_access_recovery_guard();

INSERT INTO auth_permissions (identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT i.id, 'client_recovery.manage', 'global', NULL, i.id, 'ti', 'F15 autorização local de recuperação sem SMTP'
FROM auth_identities i JOIN auth_staff_profiles p ON p.identity_id=i.id
WHERE i.kind='staff' AND i.status='active' AND p.role='ti'
ON CONFLICT DO NOTHING;

DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
 SELECT pg_get_expr(conbin, conrelid) INTO previous_check FROM pg_constraint
 WHERE conrelid='auth_access_audit'::regclass AND conname='auth_access_audit_action_check' AND contype='c';
 IF previous_check IS NOT NULL THEN
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format('ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L)) NOT VALID', previous_check,
    'client_recovery_request','client_recovery_authorize','client_recovery_revoke');
 END IF;
END $audit_actions$;

COMMENT ON TABLE client_access_recovery_requests IS 'F15: pedido e autorização humana auditada para recuperação local de cliente sem SMTP; tokens brutos nunca persistem.';
