-- L04 (fechamento das lacunas CRM-07) — instante de conclusão de tarefa.
--
-- crm_tasks (migração 014) tem status 'concluida', mas nenhuma coluna para
-- registrar QUANDO a tarefa foi concluída. Sem isso, "concluída" é um estado
-- sem data: não dá para diferenciar a tarefa fechada hoje da fechada há três
-- meses, nem para provar que a reabertura descartou a conclusão anterior.
--
-- O gate de entrega exige que concluir grave o instante e que reabrir o
-- limpe. A coluna é aditiva e anulável: as tarefas concluídas antes desta
-- migração permanecem com NULL, que é a leitura honesta — a data não foi
-- registrada, e inventá-la retroativamente seria fabricar trilha.
--
-- Nenhuma migração já aplicada é alterada; a 104 continua intacta.

ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN crm_tasks.completed_at IS
  'Instante em que a tarefa passou para concluida; reaberta volta a NULL. NULL em tarefas concluídas antes da migração 105.';

-- Conclusões recentes por responsável alimentam a carteira e o acompanhamento
-- de cadência; o índice parcial cobre exatamente esse recorte.
CREATE INDEX IF NOT EXISTS crm_tasks_completed_idx
  ON crm_tasks (responsible_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;
