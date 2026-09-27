CREATE TABLE IF NOT EXISTS public_leads (
  id UUID PRIMARY KEY,
  request_kind TEXT NOT NULL CHECK (request_kind IN ('quote', 'visit')),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  city VARCHAR(100) NOT NULL,
  property_type TEXT NOT NULL CHECK (property_type IN ('Condomínio','Empresa ou comércio','Indústria','Instituição','Outro')),
  services TEXT[] NOT NULL DEFAULT '{}',
  visit_preference VARCHAR(120),
  details VARCHAR(1000),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  email_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (email_status IN ('not_configured','sent','failed')),
  consented_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((request_kind = 'visit' AND visit_preference IS NOT NULL) OR request_kind = 'quote')
);

CREATE INDEX IF NOT EXISTS public_leads_created_at_idx ON public_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS public_leads_status_created_at_idx ON public_leads (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public_lead_status_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public_leads(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL CHECK (previous_status IN ('new','contacted','closed')),
  next_status TEXT NOT NULL CHECK (next_status IN ('new','contacted','closed')),
  changed_by TEXT NOT NULL CHECK (changed_by IN ('marcelo','ti')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS public_lead_status_audit_lead_idx ON public_lead_status_audit (lead_id, changed_at DESC);
