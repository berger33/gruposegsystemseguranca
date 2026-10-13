'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import UiState from '@/components/ui/UiState';
import styles from './PrivacyClient.module.css';

type InventoryItem = {
  id: string; data_category: string; data_field: string; description: string; purpose: string;
  legal_basis: string; legal_basis_detail: string | null; retention_days: number | null;
  retention_description: string | null; recipients: string[] | null; is_sensitive: boolean;
  is_required: boolean; source: string | null;
};
type Policy = {
  id: string; version: number; status: string; title: string; content: string;
  created_at: string; contact_email: string | null; dpo_name: string | null; dpo_contact: string | null;
  retention_summary: string | null; rights_description: string | null; recipients_description: string | null;
  approved_by: string | null; approved_at: string | null; rejection_reason: string | null; is_published: boolean;
};
type Feedback = { variant: 'success' | 'error' | 'denied'; title: string; detail: string };
type InventoryForm = {
  data_category: string; data_field: string; description: string; purpose: string; legal_basis: string;
  legal_basis_detail: string; retention_days: string; retention_description: string; recipients: string;
  is_sensitive: boolean; is_required: boolean; source: string;
};
type PolicyForm = {
  title: string; content: string; contact_email: string; dpo_name: string; dpo_contact: string;
  retention_summary: string; rights_description: string; recipients_description: string;
};

const initialInventory: InventoryForm = {
  data_category: 'identificacao', data_field: '', description: '', purpose: '', legal_basis: 'consentimento',
  legal_basis_detail: '', retention_days: '365', retention_description: '', recipients: '',
  is_sensitive: false, is_required: true, source: '',
};
const initialPolicy: PolicyForm = {
  title: '', content: '', contact_email: 'contato@gruposegsystemseguranca.com.br',
  dpo_name: 'Encarregado a definir (D-11)', dpo_contact: 'contato@gruposegsystemseguranca.com.br',
  retention_summary: '', rights_description: '', recipients_description: '',
};
const categories = [
  ['identificacao', 'Identificação'], ['contato', 'Contato'], ['localizacao', 'Localização'],
  ['profissional', 'Profissional'], ['financeiro', 'Financeiro'], ['tecnico', 'Técnico'],
  ['comportamental', 'Comportamental'], ['sensivel', 'Sensível'], ['outro', 'Outro'],
];
const legalBases = [
  ['consentimento', 'Consentimento'], ['execucao_contrato', 'Execução de contrato'],
  ['cumprimento_legal', 'Cumprimento de obrigação legal'], ['legitimo_interesse', 'Legítimo interesse'],
  ['protecao_vida', 'Proteção da vida'], ['tutela_saude', 'Tutela da saúde'],
  ['exercicio_direitos', 'Exercício regular de direitos'], ['protecao_credito', 'Proteção do crédito'], ['outro', 'Outra base'],
];
const policyStatuses: Record<string, string> = {
  rascunho: 'Rascunho', em_revisao: 'Em revisão', aprovado: 'Aprovado', publicado: 'Publicado',
  arquivado: 'Arquivado', rejeitado: 'Rejeitado',
};

function date(value: string | null | undefined) {
  if (!value) return 'Não informado';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Data indisponível' : parsed.toLocaleDateString('pt-BR');
}

function errorText(code?: string, detail?: string) {
  const messages: Record<string, string> = {
    same_origin_required: 'A origem desta solicitação não foi aceita. Recarregue a tela e tente novamente.',
    admin_session_required: 'Sua sessão administrativa expirou. Entre novamente para acessar esta área.',
    privacy_inventory_restricted_admin_ti: 'Seu perfil não pode alterar o inventário de privacidade.',
    privacy_policy_restricted_admin_ti: 'Seu perfil não pode criar políticas nesta área.',
    privacy_policy_restricted: 'Seu perfil não pode alterar o estado desta política.',
    approval_requires_admin: 'A aprovação e a publicação são restritas ao papel Administração.',
    inventory_unavailable: 'O inventário não pôde ser consultado neste momento.',
    policies_unavailable: 'As políticas não puderam ser consultadas neste momento.',
    inventory_update_failed: 'Não foi possível salvar o item do inventário.',
    policy_create_failed: 'Não foi possível criar o rascunho da política.',
    policy_update_failed: 'Não foi possível atualizar esta política.',
    invalid_json: 'Os dados enviados não puderam ser lidos. Confira os campos e tente novamente.',
    invalid_data_category: 'Selecione uma categoria de dados disponível.',
    invalid_data_field: 'Informe um nome de campo com até 100 caracteres.',
    invalid_description: 'Informe uma descrição com até 1.000 caracteres.',
    invalid_purpose: 'Informe a finalidade com até 1.000 caracteres.',
    invalid_legal_basis: 'Selecione uma base legal disponível.',
    invalid_retention_days: 'O prazo deve ser de 1 a 3.650 dias.',
    invalid_title: 'Informe um título com até 200 caracteres.',
    invalid_content: 'Informe o conteúdo com até 20.000 caracteres.',
    invalid_status: 'Este estado não é reconhecido pelo sistema.',
    invalid_policy_id: 'O identificador da política é inválido.',
    must_be_approved_before_publish: 'A política precisa estar aprovada pela Administração antes da publicação.',
    rejection_reason_required: 'A recusa exige um motivo registrado.',
    no_fields: 'Nenhum campo foi informado para atualização.',
    not_found: 'A política não foi encontrada.',
  };
  return detail || messages[code || ''] || 'A operação não foi concluída. Verifique a conexão e tente novamente.';
}

export default function PrivacyClient() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Feedback | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<InventoryForm>(initialInventory);
  const [pForm, setPForm] = useState<PolicyForm>(initialPolicy);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const [inventoryResponse, policyResponse] = await Promise.all([
        fetch('/api/admin/privacy/inventory', { cache: 'no-store' }),
        fetch('/api/admin/privacy/policies', { cache: 'no-store' }),
      ]);
      const [inventoryData, policyData] = await Promise.all([inventoryResponse.json(), policyResponse.json()]);
      if (!inventoryResponse.ok) {
        const denied = inventoryResponse.status === 401 || inventoryResponse.status === 403;
        throw { denied, message: errorText(inventoryData.error, inventoryData.detail) };
      }
      if (!policyResponse.ok) {
        const denied = policyResponse.status === 401 || policyResponse.status === 403;
        throw { denied, message: errorText(policyData.error, policyData.detail) };
      }
      setInventory(Array.isArray(inventoryData.inventory) ? inventoryData.inventory : []);
      setPolicies(Array.isArray(policyData.policies) ? policyData.policies : []);
    } catch (error) {
      const denied = typeof error === 'object' && error !== null && 'denied' in error && error.denied === true;
      const detail = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'Não foi possível conectar ao serviço. Os dados não foram atualizados.';
      setLoadError({ variant: denied ? 'denied' : 'error', title: denied ? 'Acesso necessário' : 'Consulta não concluída', detail });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFeedback(null); setBusy(true);
    const body = {
      ...form,
      retention_days: form.retention_days || null,
      recipients: form.recipients ? form.recipients.split(',').map((item) => item.trim()).filter(Boolean) : [],
    };
    try {
      const response = await fetch('/api/admin/privacy/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        const denied = response.status === 401 || response.status === 403;
        setFeedback({ variant: denied ? 'denied' : 'error', title: denied ? 'Acesso necessário' : 'Inventário não salvo', detail: errorText(data.error, data.detail) });
        return;
      }
      setFeedback({ variant: 'success', title: 'Item do inventário salvo', detail: 'O registro foi criado ou atualizado no inventário interno.' });
      await load();
    } catch { setFeedback({ variant: 'error', title: 'Falha de conexão', detail: 'O servidor não confirmou o salvamento. Consulte novamente antes de repetir.' }); }
    finally { setBusy(false); }
  }

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFeedback(null); setBusy(true);
    try {
      const response = await fetch('/api/admin/privacy/policies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pForm),
      });
      const data = await response.json();
      if (!response.ok) {
        const denied = response.status === 401 || response.status === 403;
        setFeedback({ variant: denied ? 'denied' : 'error', title: denied ? 'Acesso necessário' : 'Rascunho não criado', detail: errorText(data.error, data.detail) });
        return;
      }
      setPForm(initialPolicy);
      setFeedback({ variant: 'success', title: `Rascunho v${data.policy?.version} criado`, detail: 'A política não foi publicada. Ela precisa de revisão competente; a publicação continua sujeita à aprovação exigida pelo servidor.' });
      await load();
    } catch { setFeedback({ variant: 'error', title: 'Falha de conexão', detail: 'O servidor não confirmou a criação. Consulte a lista antes de repetir.' }); }
    finally { setBusy(false); }
  }

  async function updatePolicyStatus(policy: Policy, status: string) {
    setFeedback(null); setBusy(true);
    const body: { status: string; rejection_reason?: string } = { status };
    if (status === 'rejeitado') body.rejection_reason = 'Revisão competente pendente';
    try {
      const response = await fetch(`/api/admin/privacy/policies/${policy.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        const denied = response.status === 401 || response.status === 403;
        setFeedback({ variant: denied ? 'denied' : 'error', title: denied ? 'Acesso necessário' : 'Estado não alterado', detail: errorText(data.error, data.detail) });
        return;
      }
      setFeedback({ variant: 'success', title: `Estado atualizado: ${policyStatuses[data.policy?.status] || data.policy?.status}`, detail: data.note || 'O servidor confirmou a atualização.' });
      await load();
    } catch { setFeedback({ variant: 'error', title: 'Falha de conexão', detail: 'O servidor não confirmou a mudança de estado. Consulte a política antes de repetir.' }); }
    finally { setBusy(false); }
  }

  return (
    <section className={styles.workspace} aria-labelledby="privacy-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Governança de dados</p>
          <h2 id="privacy-title">Privacidade</h2>
          <p>Organize o inventário de dados e os rascunhos de política. Os registros desta tela não substituem a avaliação jurídica nem a revisão competente.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy}>{loading ? 'Atualizando…' : 'Atualizar dados'}</button>
      </header>

      <aside className={styles.notice}>
        <strong>Limite operacional</strong>
        <p>Esta tela registra informações internas. Criar um rascunho não o publica. A aprovação e a publicação seguem as permissões e condições aplicadas pela API; confirme conteúdo, responsável, contatos e retenção antes de qualquer publicação.</p>
      </aside>

      {feedback && <UiState variant={feedback.variant} title={feedback.title} detail={feedback.detail} />}
      {loading && <UiState variant="loading" title="Consultando inventário e políticas" detail="Os registros serão exibidos quando a consulta terminar." />}
      {!loading && loadError && <UiState variant={loadError.variant} title={loadError.title} detail={loadError.detail} onRetry={() => void load()} retryLabel="Tentar novamente" />}

      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="inventory-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="inventory-title">Inventário de dados</h3><p>Categoria, campo, finalidade, base declarada, retenção e destinatários.</p></div>
            <span className={styles.count}>{inventory.length} {inventory.length === 1 ? 'registro' : 'registros'}</span>
          </div>
          {!loading && !loadError && inventory.length === 0 && <UiState variant="empty" title="Nenhum item cadastrado" detail="Inclua um registro somente quando a categoria, finalidade e informações de retenção estiverem revisadas." />}
          {!loadError && inventory.length > 0 && <div className={styles.recordList}>
            {inventory.map((item) => (
              <article className={styles.record} key={item.id}>
                <div className={styles.recordHeading}>
                  <div><span className={styles.badge}>{categories.find(([key]) => key === item.data_category)?.[1] || item.data_category}</span><h4>{item.data_field}</h4></div>
                  <span className={item.is_sensitive ? `${styles.badge} ${styles.warningBadge}` : styles.badge}>{item.is_sensitive ? 'Sensível' : 'Não marcado como sensível'}</span>
                </div>
                <p>{item.description}</p>
                <dl className={styles.details}>
                  <div><dt>Finalidade</dt><dd>{item.purpose}</dd></div>
                  <div><dt>Base declarada</dt><dd>{legalBases.find(([key]) => key === item.legal_basis)?.[1] || item.legal_basis}{item.legal_basis_detail ? ` — ${item.legal_basis_detail}` : ''}</dd></div>
                  <div><dt>Retenção declarada</dt><dd>{item.retention_days ? `${item.retention_days} dias` : 'Prazo não informado'}{item.retention_description ? ` — ${item.retention_description}` : ''}</dd></div>
                  <div><dt>Destinatários declarados</dt><dd>{item.recipients?.length ? item.recipients.join(', ') : 'Não informados'}</dd></div>
                  <div><dt>Uso obrigatório</dt><dd>{item.is_required ? 'Marcado como obrigatório' : 'Marcado como opcional'}</dd></div>
                  {item.source && <div><dt>Fonte declarada</dt><dd>{item.source}</dd></div>}
                </dl>
              </article>
            ))}
          </div>}

          <form className={styles.form} onSubmit={saveInventory}>
            <div className={styles.sectionHeading}><div><h4>Novo item do inventário</h4><p>Campos com asterisco são exigidos pelo serviço.</p></div></div>
            <div className={styles.fields}>
              <label className={styles.field}>Categoria de dados *<select value={form.data_category} onChange={(event) => setForm({ ...form, data_category: event.target.value })}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className={styles.field}>Base legal declarada *<select value={form.legal_basis} onChange={(event) => setForm({ ...form, legal_basis: event.target.value })}>{legalBases.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className={styles.field}>Campo de dados *<input value={form.data_field} onChange={(event) => setForm({ ...form, data_field: event.target.value })} maxLength={100} required placeholder="Ex.: nome" /></label>
              <label className={styles.field}>Prazo de retenção (dias)<input type="number" min={1} max={3650} value={form.retention_days} onChange={(event) => setForm({ ...form, retention_days: event.target.value })} /><span className={styles.hint}>De 1 a 3.650 dias; deixe vazio se não houver prazo declarado.</span></label>
              <label className={`${styles.field} ${styles.wide}`}>Descrição do dado *<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={1000} rows={3} required /></label>
              <label className={`${styles.field} ${styles.wide}`}>Finalidade declarada *<textarea value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} maxLength={1000} rows={3} required /></label>
              <label className={styles.field}>Detalhe da base legal<input value={form.legal_basis_detail} onChange={(event) => setForm({ ...form, legal_basis_detail: event.target.value })} maxLength={1000} /><span className={styles.hint}>Complemento interno; o sistema não valida a adequação jurídica.</span></label>
              <label className={styles.field}>Descrição do prazo<input value={form.retention_description} onChange={(event) => setForm({ ...form, retention_description: event.target.value })} maxLength={1000} /></label>
              <label className={styles.field}>Destinatários declarados<input value={form.recipients} onChange={(event) => setForm({ ...form, recipients: event.target.value })} placeholder="Separe vários destinatários por vírgula" /></label>
              <label className={styles.field}>Fonte declarada<input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} maxLength={200} /></label>
            </div>
            <div className={styles.checks}>
              <label><input type="checkbox" checked={form.is_sensitive} onChange={(event) => setForm({ ...form, is_sensitive: event.target.checked })} /> Marcar como dado sensível</label>
              <label><input type="checkbox" checked={form.is_required} onChange={(event) => setForm({ ...form, is_required: event.target.checked })} /> Marcar como obrigatório</label>
            </div>
            <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy || loading}>{busy ? 'Salvando…' : 'Salvar item'}</button></div>
          </form>
        </section>

        <section className={styles.panel} aria-labelledby="policies-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="policies-title">Políticas de privacidade</h3><p>Versões, estados e informações declaradas. A lista da API é limitada às 50 versões mais recentes.</p></div>
            <span className={styles.count}>{policies.length} {policies.length === 1 ? 'versão' : 'versões'}</span>
          </div>
          {!loading && !loadError && policies.length === 0 && <UiState variant="empty" title="Nenhuma política cadastrada" detail="Você pode preparar um rascunho. Ele continuará sem publicação até passar pela revisão e aprovação exigidas." />}
          {!loadError && policies.length > 0 && <div className={styles.recordList}>
            {policies.map((policy) => (
              <article className={styles.record} key={policy.id}>
                <div className={styles.recordHeading}>
                  <div><span className={styles.badge}>Versão {policy.version}</span><h4>{policy.title}</h4></div>
                  <span className={`${styles.badge} ${policy.is_published ? styles.published : policy.status === 'aprovado' ? styles.approved : ''}`}>{policy.is_published ? 'Publicada' : policyStatuses[policy.status] || policy.status}</span>
                </div>
                <p className={styles.meta}>Criada em {date(policy.created_at)}{policy.approved_by ? ` · Aprovada por ${policy.approved_by} em ${date(policy.approved_at)}` : ''}</p>
                <details className={styles.policyDetails}>
                  <summary>Ver conteúdo e informações declaradas</summary>
                  <div className={styles.policyContent}>{policy.content}</div>
                  <dl className={styles.details}>
                    <div><dt>Contato</dt><dd>{policy.contact_email || 'Não informado'}</dd></div>
                    <div><dt>Encarregado informado</dt><dd>{policy.dpo_name || 'Não informado'}{policy.dpo_contact ? ` · ${policy.dpo_contact}` : ''}</dd></div>
                    <div><dt>Retenção</dt><dd>{policy.retention_summary || 'Não informada'}</dd></div>
                    <div><dt>Direitos</dt><dd>{policy.rights_description || 'Não informados'}</dd></div>
                    <div><dt>Destinatários</dt><dd>{policy.recipients_description || 'Não informados'}</dd></div>
                    {policy.rejection_reason && <div><dt>Motivo de rejeição registrado</dt><dd>{policy.rejection_reason}</dd></div>}
                  </dl>
                </details>
                <div className={styles.statusActions} aria-label={`Ações de estado da política ${policy.title}`}>
                  {(['em_revisao', 'aprovado', 'publicado', 'arquivado', 'rejeitado'] as const).map((status) => (
                    <button key={status} type="button" aria-pressed={policy.status === status} onClick={() => void updatePolicyStatus(policy, status)} disabled={busy || loading}>
                      {status === 'em_revisao' ? 'Enviar para revisão' : status === 'aprovado' ? 'Aprovar' : status === 'publicado' ? 'Publicar' : status === 'arquivado' ? 'Arquivar' : 'Registrar rejeição'}
                    </button>
                  ))}
                </div>
                {policy.status === 'rascunho' && <p className={styles.hint}>A rejeição mantém o motivo padrão já adotado pelo sistema. Aprovação e publicação continuam sujeitas às regras da API.</p>}
              </article>
            ))}
          </div>}

          <form className={styles.form} onSubmit={createPolicy}>
            <div className={styles.sectionHeading}><div><h4>Preparar rascunho</h4><p>O conteúdo e os campos declarados serão gravados em nova versão de rascunho.</p></div></div>
            <div className={styles.fields}>
              <label className={`${styles.field} ${styles.wide}`}>Título *<input value={pForm.title} onChange={(event) => setPForm({ ...pForm, title: event.target.value })} maxLength={200} required /></label>
              <label className={`${styles.field} ${styles.wide}`}>Conteúdo da política *<textarea value={pForm.content} onChange={(event) => setPForm({ ...pForm, content: event.target.value })} maxLength={20000} rows={8} required /><span className={styles.hint}>Até 20.000 caracteres. Não publique texto não revisado.</span></label>
              <label className={styles.field}>E-mail de contato<input type="email" value={pForm.contact_email} onChange={(event) => setPForm({ ...pForm, contact_email: event.target.value })} /></label>
              <label className={styles.field}>Nome do encarregado informado<input value={pForm.dpo_name} onChange={(event) => setPForm({ ...pForm, dpo_name: event.target.value })} maxLength={200} /><span className={styles.hint}>Confirme a pessoa responsável antes de enviar para publicação.</span></label>
              <label className={styles.field}>Contato do encarregado<input value={pForm.dpo_contact} onChange={(event) => setPForm({ ...pForm, dpo_contact: event.target.value })} maxLength={500} /></label>
              <label className={styles.field}>Resumo de retenção<textarea value={pForm.retention_summary} onChange={(event) => setPForm({ ...pForm, retention_summary: event.target.value })} maxLength={2000} rows={3} /></label>
              <label className={styles.field}>Direitos dos titulares<textarea value={pForm.rights_description} onChange={(event) => setPForm({ ...pForm, rights_description: event.target.value })} maxLength={2000} rows={3} /></label>
              <label className={styles.field}>Destinatários<textarea value={pForm.recipients_description} onChange={(event) => setPForm({ ...pForm, recipients_description: event.target.value })} maxLength={2000} rows={3} /></label>
            </div>
            <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy || loading}>{busy ? 'Criando…' : 'Criar rascunho'}</button></div>
          </form>
        </section>
      </div>
    </section>
  );
}
