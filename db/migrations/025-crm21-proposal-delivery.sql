-- 025-crm21-proposal-delivery: CRM-21 envio rastreado com estados realistas (fila, enviado pelo provedor, falhou; entrega/leitura só quando comprovadas), aceite e assinatura por integração
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_proposal_delivery_status') THEN
    CREATE TYPE crm_proposal_delivery_status AS ENUM ('fila','enviado_pelo_provedor','falhou','entregue_comprovada','leitura_comprovada','aceito','recusado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_proposal_delivery_channel') THEN
    CREATE TYPE crm_proposal_delivery_channel AS ENUM ('email','whatsapp','outro');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_proposal_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES crm_proposals(id) ON DELETE CASCADE,
  proposal_version INT NOT NULL CHECK (proposal_version >= 1),
  recipient_email TEXT NOT NULL CHECK (char_length(recipient_email) BETWEEN 5 AND 320),
  recipient_name TEXT CHECK (char_length(recipient_name) BETWEEN 1 AND 200),
  channel crm_proposal_delivery_channel NOT NULL DEFAULT 'email',
  status crm_proposal_delivery_status NOT NULL DEFAULT 'fila',
  provider TEXT CHECK (char_length(provider) BETWEEN 1 AND 50),
  provider_message_id TEXT CHECK (char_length(provider_message_id) BETWEEN 1 AND 500),
  last_error_sanitized TEXT CHECK (char_length(last_error_sanitized) BETWEEN 1 AND 1000),
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INT NOT NULL DEFAULT 5 CHECK (max_attempts >= 1 AND max_attempts <= 20),
  next_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  refused_at TIMESTAMPTZ,
  webhook_payload JSONB,
  created_by TEXT CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_proposal_deliveries_proposal ON crm_proposal_deliveries(proposal_id);
CREATE INDEX IF NOT EXISTS idx_crm_proposal_deliveries_proposal_version ON crm_proposal_deliveries(proposal_id, proposal_version);
CREATE INDEX IF NOT EXISTS idx_crm_proposal_deliveries_status ON crm_proposal_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_crm_proposal_deliveries_recipient ON crm_proposal_deliveries(recipient_email);
CREATE INDEX IF NOT EXISTS idx_crm_proposal_deliveries_next_attempt ON crm_proposal_deliveries(next_attempt_at) WHERE status = 'fila';

DROP TRIGGER IF EXISTS trg_crm_proposal_deliveries_updated ON crm_proposal_deliveries;
CREATE TRIGGER trg_crm_proposal_deliveries_updated BEFORE UPDATE ON crm_proposal_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabela para aceite e assinatura por integração (rastreio)
CREATE TABLE IF NOT EXISTS crm_proposal_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES crm_proposals(id) ON DELETE CASCADE,
  proposal_version INT NOT NULL CHECK (proposal_version >= 1),
  delivery_id UUID REFERENCES crm_proposal_deliveries(id) ON DELETE SET NULL,
  signer_email TEXT NOT NULL CHECK (char_length(signer_email) BETWEEN 5 AND 320),
  signer_name TEXT CHECK (char_length(signer_name) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK (char_length(status) BETWEEN 1 AND 50),
  provider TEXT CHECK (char_length(provider) BETWEEN 1 AND 50),
  provider_envelope_id TEXT CHECK (char_length(provider_envelope_id) BETWEEN 1 AND 500),
  signed_at TIMESTAMPTZ,
  webhook_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_proposal_signatures_proposal ON crm_proposal_signatures(proposal_id);
CREATE INDEX IF NOT EXISTS idx_crm_proposal_signatures_delivery ON crm_proposal_signatures(delivery_id);

DROP TRIGGER IF EXISTS trg_crm_proposal_signatures_updated ON crm_proposal_signatures;
CREATE TRIGGER trg_crm_proposal_signatures_updated BEFORE UPDATE ON crm_proposal_signatures FOR EACH ROW EXECUTE FUNCTION set_updated_at();
