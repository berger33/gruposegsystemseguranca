-- 026-crm22-acceptance-link: CRM-22 aceite por link seguro expirável vinculado à versão, decisão jurídica registrada, não chamar clique simples de assinatura qualificada
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_acceptance_link_status') THEN
    CREATE TYPE crm_acceptance_link_status AS ENUM ('ativo','usado','expirado','revogado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_proposal_acceptance_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES crm_proposals(id) ON DELETE CASCADE,
  proposal_version INT NOT NULL CHECK (proposal_version >= 1),
  token_hash TEXT NOT NULL CHECK (char_length(token_hash) BETWEEN 10 AND 500),
  token_prefix TEXT NOT NULL CHECK (char_length(token_prefix) BETWEEN 4 AND 20),
  recipient_email TEXT NOT NULL CHECK (char_length(recipient_email) BETWEEN 5 AND 320),
  recipient_name TEXT CHECK (char_length(recipient_name) BETWEEN 1 AND 200),
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  used_ip_hash TEXT CHECK (char_length(used_ip_hash) BETWEEN 1 AND 200),
  used_user_agent TEXT CHECK (char_length(used_user_agent) BETWEEN 1 AND 500),
  status crm_acceptance_link_status NOT NULL DEFAULT 'ativo',
  legal_value_note TEXT CHECK (char_length(legal_value_note) BETWEEN 1 AND 2000),
  legal_decision_by TEXT CHECK (char_length(legal_decision_by) BETWEEN 1 AND 100),
  legal_decision_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  legal_decision_at TIMESTAMPTZ,
  is_qualified_signature BOOLEAN NOT NULL DEFAULT false,
  is_simple_click BOOLEAN NOT NULL DEFAULT true,
  acceptance_note TEXT CHECK (char_length(acceptance_note) BETWEEN 1 AND 2000),
  created_by TEXT CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_not_qualified_for_simple_click CHECK (
    is_simple_click = false OR is_qualified_signature = false
  ),
  CONSTRAINT chk_expires_future CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_acceptance_links_token_hash ON crm_proposal_acceptance_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_crm_acceptance_links_proposal ON crm_proposal_acceptance_links(proposal_id);
CREATE INDEX IF NOT EXISTS idx_crm_acceptance_links_proposal_version ON crm_proposal_acceptance_links(proposal_id, proposal_version);
CREATE INDEX IF NOT EXISTS idx_crm_acceptance_links_recipient ON crm_proposal_acceptance_links(recipient_email);
CREATE INDEX IF NOT EXISTS idx_crm_acceptance_links_status ON crm_proposal_acceptance_links(status);
CREATE INDEX IF NOT EXISTS idx_crm_acceptance_links_expires ON crm_proposal_acceptance_links(expires_at);

DROP TRIGGER IF EXISTS trg_crm_acceptance_links_updated ON crm_proposal_acceptance_links;
CREATE TRIGGER trg_crm_acceptance_links_updated BEFORE UPDATE ON crm_proposal_acceptance_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();
