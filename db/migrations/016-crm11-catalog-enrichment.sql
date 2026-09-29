-- CRM-11: separar serviços recorrentes/avulsos, instalação, manutenção, venda, locação/comodato quando praticados. Campos: unidade de cobrança, escopo, exclusões, recursos, custo, preço, vigência e aprovação.

ALTER TABLE service_catalog
  ADD COLUMN IF NOT EXISTS service_type TEXT CHECK (service_type IN ('recorrente','avulso','instalacao','manutencao','venda','locacao','comodato','outro')) DEFAULT 'recorrente',
  ADD COLUMN IF NOT EXISTS billing_unit TEXT CHECK (billing_unit IS NULL OR char_length(billing_unit) <= 100),
  ADD COLUMN IF NOT EXISTS scope_description TEXT CHECK (scope_description IS NULL OR char_length(scope_description) <= 2000),
  ADD COLUMN IF NOT EXISTS exclusions TEXT CHECK (exclusions IS NULL OR char_length(exclusions) <= 2000),
  ADD COLUMN IF NOT EXISTS resources TEXT CHECK (resources IS NULL OR char_length(resources) <= 2000),
  ADD COLUMN IF NOT EXISTS resources_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2) CHECK (cost IS NULL OR cost >= 0),
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) CHECK (price IS NULL OR price >= 0),
  ADD COLUMN IF NOT EXISTS validity_days INT CHECK (validity_days IS NULL OR validity_days BETWEEN 1 AND 365),
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'aprovado' CHECK (approval_status IN ('rascunho','em_revisao','aprovado','arquivado')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS approved_by_role TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL')),
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS service_catalog_type_idx ON service_catalog (service_type, is_published, approval_status);
CREATE INDEX IF NOT EXISTS service_catalog_approval_idx ON service_catalog (approval_status, updated_at DESC);

-- Atualizar os 6 serviços existentes com classificação CRM-11
UPDATE service_catalog SET
  service_type = CASE id
    WHEN 'seg_desarmada' THEN 'recorrente'
    WHEN 'monitoramento_24h' THEN 'recorrente'
    WHEN 'cftv' THEN 'instalacao'
    WHEN 'portaria' THEN 'recorrente'
    WHEN 'limpeza' THEN 'recorrente'
    WHEN 'supervisao' THEN 'recorrente'
    ELSE 'outro'
  END,
  billing_unit = CASE id
    WHEN 'seg_desarmada' THEN 'por_posto_mensal'
    WHEN 'monitoramento_24h' THEN 'mensal'
    WHEN 'cftv' THEN 'por_projeto'
    WHEN 'portaria' THEN 'por_posto_mensal'
    WHEN 'limpeza' THEN 'por_area_mensal'
    WHEN 'supervisao' THEN 'mensal'
    ELSE 'mensal'
  END,
  scope_description = CASE id
    WHEN 'seg_desarmada' THEN 'Presença preventiva, rondas programadas, controle de acesso básico, apoio em ocorrências, conforme escopo contratado e legislação. Não inclui segurança armada.'
    WHEN 'monitoramento_24h' THEN 'Acompanhamento remoto 24h, acionamento equipe local/supervisão, registro ocorrências, SLA definido.'
    WHEN 'cftv' THEN 'Projeto, dimensionamento, venda, instalação, configuração, treinamento básico. Escopo definido após vistoria.'
    WHEN 'portaria' THEN 'Rotinas entrada/saída, identificação visitantes, encomendas, atendimento conforme procedimentos cliente.'
    WHEN 'limpeza' THEN 'Limpeza e conservação por área/frequência, materiais e equipamentos conforme contrato, supervisão periódica.'
    WHEN 'supervisao' THEN 'Visitas programadas, verificação procedimentos, apoio equipes, registro ocorrências.'
    ELSE full_description
  END,
  exclusions = CASE id
    WHEN 'seg_desarmada' THEN 'Não inclui segurança armada, escolta, transporte de valores, atividades privativas de vigilância armada sem autorização.'
    WHEN 'monitoramento_24h' THEN 'Não inclui intervenção física garantida sem equipe local, não substitui central de alarme certificada se exigida.'
    WHEN 'cftv' THEN 'Não inclui obra civil pesada, infraestrutura elétrica principal, licenças, garantia estendida sem contrato manutenção.'
    WHEN 'portaria' THEN 'Não inclui segurança patrimonial armada, limpeza, manutenção predial.'
    WHEN 'limpeza' THEN 'Não inclui limpeza em altura sem EPI específico, tratamento especializado de pisos, segurança patrimonial.'
    WHEN 'supervisao' THEN 'Não inclui cobertura de posto, substituição automática sem aprovação.'
    ELSE 'A definir conforme contrato.'
  END,
  resources = CASE id
    WHEN 'seg_desarmada' THEN 'Profissional de segurança desarmada, uniforme, rádio quando contratado, livro de ocorrências.'
    WHEN 'monitoramento_24h' THEN 'Central de monitoramento, software de registro, equipe de acionamento.'
    WHEN 'cftv' THEN 'Câmeras, DVR/NVR, cabeamento, fontes, mão de obra instalação, configuração.'
    WHEN 'portaria' THEN 'Porteiro, uniforme, livro de ocorrências, rádio quando contratado.'
    WHEN 'limpeza' THEN 'Auxiliar de limpeza, materiais básicos, equipamentos, supervisão.'
    WHEN 'supervisao' THEN 'Supervisor, veículo quando contratado, checklist, relatório.'
    ELSE 'A definir'
  END,
  validity_days = 30,
  approval_status = 'aprovado',
  is_recurring = CASE id WHEN 'cftv' THEN false ELSE true END,
  version = 1
WHERE id IN ('seg_desarmada','monitoramento_24h','cftv','portaria','limpeza','supervisao');

-- Inserir exemplos de outros tipos para demonstrar separação (não publicados por padrão, aguardam validação comercial)
INSERT INTO service_catalog (id, name, short_description, full_description, target_audience, qualification_questions, is_published, is_validated, service_type, billing_unit, scope_description, exclusions, resources, validity_days, approval_status, is_recurring, version, validation_note)
VALUES
  ('cftv_manutencao', 'Manutenção CFTV', 'Manutenção preventiva e corretiva de sistemas de CFTV existentes.',
   'Serviço avulso ou recorrente de manutenção preventiva/corretiva de CFTV: limpeza, ajustes, troca de componentes, verificação de gravação. Não inclui novos pontos sem proposta.',
   'Clientes com CFTV já instalado que precisam de manutenção.',
   '["Seu sistema atual apresenta falhas de gravação ou imagem?", "Qual a periodicidade desejada para preventiva?"]'::jsonb,
   false, false, 'manutencao', 'por_visita', 'Manutenção preventiva/corretiva, checklist, relatório.', 'Não inclui novos equipamentos sem aprovação, não inclui obra civil.', 'Técnico, ferramentas, peças conforme contrato.', 30, 'rascunho', false, 1, 'Exemplo CRM-11 - aguarda validação comercial'),
  ('controle_acesso_locacao', 'Locação Controle de Acesso', 'Locação de equipamentos de controle de acesso por período.',
   'Locação/comodato de equipamentos de controle de acesso (catracas, leitores) com instalação e suporte. Propriedade permanece da prestadora.',
   'Condomínios e empresas que preferem locação a compra.',
   '["Você prefere compra ou locação?", "Qual o período mínimo?"]'::jsonb,
   false, false, 'locacao', 'mensal', 'Locação equipamentos, instalação, suporte.', 'Não inclui obra civil pesada, não transfere propriedade.', 'Equipamentos, instalação, suporte.', 30, 'rascunho', true, 1, 'Exemplo CRM-11 - aguarda validação comercial')
ON CONFLICT (id) DO NOTHING;
