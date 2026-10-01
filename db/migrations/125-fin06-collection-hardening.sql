-- FIN-06 hardening: política de cobrança precisa de tipo de lembrete, dias
-- antes do vencimento e nível de escalonamento como dados estruturados e
-- validáveis (não apenas texto livre dentro de `rules`), seguindo o mesmo
-- padrão já usado em alertas de contrato (036) e escalonamento operacional
-- (071/073). O histórico de cobrança nunca pode registrar um bloqueio
-- automático de portal: a coluna é fixada em false por CHECK, no mesmo
-- padrão de `is_real_message` já usado nos lembretes (migration 078).

ALTER TABLE fin_collection_policies
  ADD COLUMN IF NOT EXISTS reminder_type fin_reminder_type NOT NULL DEFAULT 'notificacao_portal',
  ADD COLUMN IF NOT EXISTS days_before INT NOT NULL DEFAULT 3 CHECK (days_before BETWEEN 0 AND 365),
  ADD COLUMN IF NOT EXISTS escalation_level INT NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 5);

-- Histórico de cobrança: nenhuma ação registrada aqui pode bloquear o
-- portal do cliente automaticamente. O valor é fixo e não pode ser
-- sobrescrito por nenhuma chamada de API, mesmo que tente enviar true.
ALTER TABLE fin_collection_history
  ADD COLUMN IF NOT EXISTS is_blocking_action BOOLEAN NOT NULL DEFAULT false CHECK (is_blocking_action = false);
