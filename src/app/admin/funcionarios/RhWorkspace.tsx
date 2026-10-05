'use client';

// UX-04 — RH: as tarefas da Andreia.
//
// O que esta fatia MUDA: estado honesto de leitura, vocabulário em português,
// rótulos visíveis e associados nos formulários, abas acessíveis de verdade,
// confirmação explícita do desligamento com resumo do efeito e trava de duplo
// envio.
//
// O que esta fatia NÃO MUDA: nenhuma URL, método, corpo, cabeçalho,
// `Idempotency-Key`, papel do `AdminGate`, concessão, escopo ou trilha de
// auditoria. Nenhum campo novo de dado pessoal passou a ser exibido — pelo
// contrário, remuneração continua fora da listagem de equipe e depende das
// concessões próprias decididas no servidor.
//
// O defeito central corrigido aqui: a versão anterior fazia
// `overview?.indicators || {total:0,...}`, então uma sessão SEM a concessão
// `employees.read` via "0 cadastros, 0 ativos, 0 em admissão" — falha de fonte
// virava indicador zero, exatamente o que o plano mestre proíbe. Agora a
// negativa é dita com todas as letras e nenhum número é inventado.

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import HrClient from '../ti/HrClient';
import HrRecruitmentClient from '../ti/HrRecruitmentClient';
import HrTerminationClient from '../ti/HrTerminationClient';
import HrAbsenceClient from '../ti/HrAbsenceClient';
import HrBenefitsClient from '../ti/HrBenefitsClient';
import HrTrainingClient from '../ti/HrTrainingClient';
import HrAdvancedClient from '../ti/HrAdvancedClient';
import UiState from '../../../components/ui/UiState';
import UiBadge from '../../../components/ui/UiBadge';
import { hrRequest, type HrErrorDescriptor } from '../../../lib/hr-request';
import {
  SELF_REQUEST_TYPES,
  TERMINATION_TYPES,
  documentKindLabel,
  documentStatusLabel,
  documentStatusTone,
  employeeStatusHint,
  employeeStatusLabel,
  hrErrorVariant,
  isTerminable,
  selfRequestStatusLabel,
  selfRequestStatusTone,
  selfRequestTypeLabel,
} from '../../../lib/hr-vocabulary.mjs';
import styles from '../../../components/ui/UiWorkspace.module.css';

type Employee = { id: string; display_name: string; matricula: string; status: string; cargo: string; lotacao?: string };
type Indicators = { total: number; active: number; unavailable: number; admissions: number };
type Overview = { employees: Employee[]; indicators: Indicators; scopes: unknown[] };
type Doc = {
  id: string; employee_id: string; employee_name: string; title: string;
  document_kind: string; competence?: string; status: string; source_authorized: boolean;
};
type Followup = { status: string; message: string; created_at: string };
type SelfRequest = {
  id: string; protocol: string; employee_id: string; employee_name: string; matricula: string;
  request_type: string; title: string; description: string; status: string;
  notes?: string; rejection_reason?: string; followups?: Followup[];
};

type ReadState = 'loading' | 'ready' | 'failed';

// Abas nomeadas pela TAREFA, não pela tabela. "Processos HR-01..24" perdeu o
// código no rótulo visível: o jargão interno fica na descrição do painel.
const TABS = [
  { id: 'equipe', label: 'Equipe' },
  { id: 'admissao', label: 'Admissão e acesso' },
  { id: 'escala', label: 'Escala' },
  { id: 'solicitacoes', label: 'Solicitações' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'folha', label: 'Fechamento e holerite' },
  { id: 'desligamento', label: 'Desligamento' },
  { id: 'processos', label: 'Demais processos de RH' },
] as const;
type TabId = (typeof TABS)[number]['id'];

type RunTask = (task: () => Promise<unknown>, success: string) => Promise<unknown>;

/** Envia o arquivo como base64, exatamente como a versão anterior fazia. */
async function encoded(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { filename: file.name, contentType: file.type || 'application/octet-stream', contentBase64: btoa(bin) };
}

/**
 * Mesma assinatura de antes para as telas filhas, mas lança um erro já
 * DESCRITO em português, em vez do código canônico cru.
 */
async function api(path: string, init: RequestInit = {}) {
  const result = await hrRequest(path, init);
  if (!result.ok) {
    const failure = new Error(result.error.title) as Error & { descriptor?: HrErrorDescriptor };
    failure.descriptor = result.error;
    throw failure;
  }
  return result.data as any;
}

function describeThrown(error: unknown): HrErrorDescriptor | null {
  const descriptor = (error as { descriptor?: HrErrorDescriptor })?.descriptor;
  return descriptor || null;
}

export default function RhWorkspace() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [requests, setRequests] = useState<SelfRequest[]>([]);
  const [readState, setReadState] = useState<ReadState>('loading');
  const [readError, setReadError] = useState<HrErrorDescriptor | null>(null);

  const [tab, setTab] = useState<TabId>('equipe');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState<HrErrorDescriptor | null>(null);
  const [credential, setCredential] = useState<{ email: string; temporaryPassword: string } | null>(null);

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const refresh = useCallback(async (mode: 'initial' | 'silent' = 'initial') => {
    if (mode === 'initial') setReadState('loading');
    const [o, d, r] = await Promise.all([
      hrRequest<Overview>('/api/admin/hr/l03/overview'),
      hrRequest<{ documents?: Doc[] }>('/api/admin/hr/l03/documents'),
      hrRequest<{ requests?: SelfRequest[] }>('/api/admin/hr/l03/self-requests'),
    ]);
    // A visão geral manda no estado da página: sem ela não há número honesto
    // para mostrar. Documentos e solicitações podem ter concessões próprias e
    // falhar isoladamente; cada aba diz isso no seu lugar.
    if (!o.ok) {
      setOverview(null);
      setReadError(o.error);
      setReadState('failed');
      return;
    }
    setOverview(o.data);
    setDocs(d.ok ? d.data.documents || [] : []);
    setRequests(r.ok ? r.data.requests || [] : []);
    setReadError(null);
    setReadState('ready');
  }, []);

  useEffect(() => { void refresh('initial'); }, [refresh]);

  const run = useCallback<RunTask>(async (task, success) => {
    setActionError(null);
    setMessage('');
    try {
      const data = await task();
      setMessage(success);
      await refresh('silent');
      return data;
    } catch (error) {
      setActionError(describeThrown(error) || {
        kind: 'retry', title: 'A ação não pôde ser concluída',
        detail: 'O servidor não confirmou a gravação. Nada foi dado como feito.',
        code: null, status: 0, canRetry: true,
      });
      return null;
    }
  }, [refresh]);

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex(item => item.id === tab);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const target = TABS[next].id;
    setTab(target);
    tabRefs.current[target]?.focus();
  }

  const employees = overview?.employees || [];
  const indicators = overview?.indicators || null;
  const activeTab = TABS.find(item => item.id === tab)!;

  return (
    <main className={styles.workspace}>
      <nav className={styles.breadcrumbNav} aria-label="Trilha de navegação">
        <a href="/admin">Início</a> · <span aria-current="page">Pessoas e RH</span>
      </nav>

      <h1>Pessoas e jornada do funcionário</h1>
      <p className={styles.lede}>
        Admissão, acesso individual, escala, documentos privados, solicitações, fechamento demonstrativo e
        desligamento. Cada ação usa a sua sessão individual de equipe. Remuneração e saúde dependem de
        concessões separadas, verificadas no servidor a cada chamada.
      </p>

      {message ? (
        <p className={styles.notice} role="status" aria-live="polite">{message}</p>
      ) : null}

      {actionError ? (
        <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
          <strong>{actionError.title}</strong>
          <p className={styles.hint}>{actionError.detail}</p>
          <p className={styles.hint}>
            Resposta do servidor: {actionError.status ? `HTTP ${actionError.status}` : 'sem resposta'}
            {actionError.code ? ` (${actionError.code})` : ''}. Nada foi gravado por esta tentativa.
          </p>
        </div>
      ) : null}

      {credential ? (
        <div className={styles.credential} role="alert">
          <strong>Credencial temporária — exibida uma única vez</strong>
          <p className={styles.hint}>Conta: {credential.email}</p>
          <code>{credential.temporaryPassword}</code>
          <p className={styles.hint}>
            Entregue por canal local controlado. A pessoa deverá trocar a senha no primeiro acesso. Não há
            envio por e-mail: SMTP não faz parte desta entrega.
          </p>
          <div className={styles.actions}>
            <button type="button" onClick={() => setCredential(null)}>Já registrei em local seguro</button>
          </div>
        </div>
      ) : null}

      {/* Indicadores: só existem quando a leitura terminou de verdade. */}
      {readState === 'loading' ? (
        <UiState
          variant="loading"
          title="Consultando os cadastros no seu escopo…"
          detail="Ainda não sabemos quantas pessoas existem. Nenhum número é exibido antes da resposta do servidor."
        />
      ) : null}

      {readState === 'failed' && readError ? (
        <UiState
          variant={hrErrorVariant(readError)}
          title={readError.title}
          detail={`${readError.detail} Nenhum indicador é exibido: isto é uma falha de leitura, não "zero cadastros". Resposta do servidor: ${readError.status ? `HTTP ${readError.status}` : 'sem resposta'}${readError.code ? ` (${readError.code})` : ''}.`}
          retryLabel={readError.canRetry ? 'Tentar carregar novamente' : undefined}
          onRetry={readError.canRetry ? () => { void refresh('initial'); } : undefined}
        />
      ) : null}

      {readState === 'ready' && indicators ? (
        <ul className={styles.metrics}>
          <li className={styles.metric}>
            <span className={styles.metricValue}>{indicators.total}</span>
            <span className={styles.metricLabel}>cadastros alcançados pelas suas concessões</span>
          </li>
          <li className={styles.metric}>
            <span className={styles.metricValue}>{indicators.active}</span>
            <span className={styles.metricLabel}>pessoas ativas</span>
          </li>
          <li className={styles.metric}>
            <span className={styles.metricValue}>{indicators.admissions}</span>
            <span className={styles.metricLabel}>em admissão</span>
          </li>
          <li className={styles.metric}>
            <span className={styles.metricValue}>{indicators.unavailable}</span>
            <span className={styles.metricLabel}>afastadas ou suspensas</span>
          </li>
        </ul>
      ) : null}

      {readState === 'ready' ? (
        <>
          <div className={styles.tabs} role="tablist" aria-label="Frentes de trabalho do RH">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`rh-aba-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`rh-painel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                ref={element => { tabRefs.current[item.id] = element; }}
                className={tab === item.id ? styles.tabActive : styles.tab}
                onClick={() => setTab(item.id)}
                onKeyDown={onTabKeyDown}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            className={styles.tabPanel}
            role="tabpanel"
            id={`rh-painel-${tab}`}
            aria-labelledby={`rh-aba-${tab}`}
            tabIndex={-1}
          >
            <h2 className={styles.visuallyHidden} ref={panelHeadingRef}>{activeTab.label}</h2>
            {tab === 'equipe' ? <Team employees={employees} /> : null}
            {tab === 'admissao' ? <Admission employees={employees} run={run} onCredential={setCredential} /> : null}
            {tab === 'escala' ? <Schedule employees={employees} run={run} /> : null}
            {tab === 'solicitacoes' ? <RequestReviews requests={requests} run={run} /> : null}
            {tab === 'documentos' ? <Documents docs={docs} run={run} /> : null}
            {tab === 'folha' ? <Payroll employees={employees} docs={docs} run={run} /> : null}
            {tab === 'desligamento' ? <Termination employees={employees} run={run} /> : null}
            {tab === 'processos' ? <HrProcesses /> : null}
          </div>
        </>
      ) : null}
    </main>
  );
}

/** Botão de envio com trava de duplo envio e estado anunciado. */
function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.actions}>
      <button type="submit" className={styles.primary} disabled={busy} aria-busy={busy}>
        {busy ? 'Enviando…' : children}
      </button>
    </div>
  );
}

/** Hook mínimo de envio: impede o segundo clique antes da resposta. */
function useSubmitLock() {
  const [busy, setBusy] = useState(false);
  const guard = useCallback(async (task: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await task(); } finally { setBusy(false); }
  }, [busy]);
  return { busy, guard };
}

function Team({ employees }: { employees: Employee[] }) {
  if (!employees.length) {
    return (
      <UiState
        variant="empty"
        title="Nenhum cadastro alcançado pelas suas concessões"
        detail="A consulta foi respondida pelo servidor e não encontrou pessoas no seu escopo. Isto é diferente de falha de leitura."
      />
    );
  }
  return (
    <section className={styles.panel} aria-labelledby="rh-equipe-titulo">
      <h3 id="rh-equipe-titulo" className={styles.panelTitle}>
        Equipe alcançada pelas suas concessões ({employees.length})
      </h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>
            Remuneração não integra esta listagem. A leitura salarial exige a concessão
            employees.compensation.read, verificada no servidor.
          </caption>
          <thead>
            <tr>
              <th scope="col">Matrícula</th>
              <th scope="col">Nome</th>
              <th scope="col">Cargo</th>
              <th scope="col">Lotação</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(person => (
              <tr key={person.id}>
                <td>{person.matricula}</td>
                <td>{person.display_name}</td>
                <td>{person.cargo}</td>
                <td>{person.lotacao || '—'}</td>
                <td>
                  <UiBadge srPrefix="Situação">{employeeStatusLabel(person.status)}</UiBadge>
                  {employeeStatusHint(person.status)
                    ? <p className={styles.hint}>{employeeStatusHint(person.status)}</p>
                    : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmployeeSelect({ employees, id }: { employees: Employee[]; id: string }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>Pessoa</label>
      <select id={id} name="employeeId" required>
        <option value="">Selecione a pessoa</option>
        {employees.map(person => (
          <option key={person.id} value={person.id}>
            {person.display_name} — {person.matricula} — {employeeStatusLabel(person.status)}
          </option>
        ))}
      </select>
      <p className={styles.requiredNote}>Obrigatório</p>
    </div>
  );
}

function Admission({
  employees, run, onCredential,
}: { employees: Employee[]; run: RunTask; onCredential: (value: { email: string; temporaryPassword: string }) => void }) {
  const base = useId();
  const create = useSubmitLock();
  const provision = useSubmitLock();

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    await create.guard(async () => {
      // Mesmas duas chamadas, mesma ordem e mesmos campos de antes.
      await run(async () => {
        const made = await api('/api/hr/employees', {
          method: 'POST',
          body: JSON.stringify({ ...values, status: 'em_admissao', employment_type: 'clt' }),
        });
        await api('/api/hr/admissions', {
          method: 'POST',
          body: JSON.stringify({
            employee_id: made.employee.id,
            cargo: String(values.cargo || '').toLowerCase(),
            responsible_name: 'RH via SEG System',
            notes: 'Admissão iniciada pela interface L03',
          }),
        });
        return made;
      }, 'Cadastro profissional criado e processo de admissão aberto.');
    });
  }

  async function onProvision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await provision.guard(async () => {
      const out = await run(
        () => api(`/api/admin/hr/employees/${values.employeeId}/access`, {
          method: 'POST',
          body: JSON.stringify({ email: values.email }),
        }),
        'Acesso individual criado. A credencial temporária aparece acima, uma única vez.',
      );
      if (out) onCredential(out as { email: string; temporaryPassword: string });
    });
  }

  return (
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="rh-cadastro-titulo">
        <h3 id="rh-cadastro-titulo" className={styles.panelTitle}>Novo cadastro profissional</h3>
        <p className={styles.hint}>
          Cria a ficha da pessoa e abre o processo de admissão. O cadastro profissional é separado do login:
          criar a ficha não concede acesso a sistema algum.
        </p>
        <form onSubmit={onCreate} noValidate={false}>
          <fieldset className={styles.fieldset}>
            <legend>Identificação</legend>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor={`${base}-matricula`}>Matrícula</label>
                <input id={`${base}-matricula`} name="matricula" required />
                <p className={styles.requiredNote}>Obrigatório</p>
              </div>
              <div className={styles.field}>
                <label htmlFor={`${base}-nome`}>Nome completo</label>
                <input id={`${base}-nome`} name="display_name" minLength={3} required />
                <p className={styles.requiredNote}>Obrigatório</p>
              </div>
            </div>
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend>Vínculo</legend>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor={`${base}-cargo`}>Cargo</label>
                <input id={`${base}-cargo`} name="cargo" required />
                <p className={styles.requiredNote}>Obrigatório</p>
              </div>
              <div className={styles.field}>
                <label htmlFor={`${base}-lotacao`}>Lotação</label>
                <input id={`${base}-lotacao`} name="lotacao" />
                <p className={styles.hint}>Posto ou unidade onde a pessoa trabalhará.</p>
              </div>
              <div className={styles.field}>
                <label htmlFor={`${base}-empregador`}>Empregador</label>
                <input id={`${base}-empregador`} name="empregador" />
              </div>
              <div className={styles.field}>
                <label htmlFor={`${base}-admissao`}>Data de admissão</label>
                <input id={`${base}-admissao`} name="admission_date" type="date" />
              </div>
            </div>
          </fieldset>
          <SubmitButton busy={create.busy}>Criar cadastro e abrir admissão</SubmitButton>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="rh-acesso-titulo">
        <h3 id="rh-acesso-titulo" className={styles.panelTitle}>Criar acesso do funcionário</h3>
        <p className={styles.hint}>
          Gera o login individual do portal do funcionário. A pessoa nunca recebe sessão de equipe nem de RH,
          e o vínculo é um para um.
        </p>
        <form onSubmit={onProvision}>
          <fieldset className={styles.fieldset}>
            <legend>Conta individual</legend>
            <div className={styles.fieldRow}>
              <EmployeeSelect
                id={`${base}-acesso-pessoa`}
                employees={employees.filter(person => ['ativo', 'em_admissao'].includes(person.status))}
              />
              <div className={styles.field}>
                <label htmlFor={`${base}-email`}>E-mail individual</label>
                <input id={`${base}-email`} name="email" type="email" required />
                <p className={styles.requiredNote}>Obrigatório</p>
              </div>
            </div>
          </fieldset>
          <SubmitButton busy={provision.busy}>Gerar credencial temporária</SubmitButton>
        </form>
      </section>
    </div>
  );
}

function Schedule({ employees, run }: { employees: Employee[]; run: RunTask }) {
  const base = useId();
  const { busy, guard } = useSubmitLock();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await guard(async () => {
      // Sequência preservada: versão → turno → plantão → publicação.
      await run(async () => {
        const version = await api('/api/hr/schedule-versions', {
          method: 'POST',
          body: JSON.stringify({ title: values.title, period_start: values.periodStart, period_end: values.periodEnd }),
        });
        await api('/api/hr/schedule-entries', {
          method: 'POST',
          body: JSON.stringify({
            version_id: version.version.id, employee_id: values.employeeId, entry_date: values.entryDate,
            start_time: values.startTime, end_time: values.endTime, location: values.location,
          }),
        });
        await api('/api/hr/shift-assignments', {
          method: 'POST',
          body: JSON.stringify({
            employee_id: values.employeeId, shift_date: values.entryDate, start_time: values.startTime,
            end_time: values.endTime, location: values.location, function_name: 'Plantão publicado',
            orientations: 'Consulte a versão de escala e confirme ciência',
            required_items: ['Documento funcional'], status: 'publicado', is_next_shift: true,
          }),
        });
        return api('/api/hr/schedule-versions', {
          method: 'PATCH',
          body: JSON.stringify({ id: version.version.id, status: 'publicado' }),
        });
      }, 'Escala versionada e publicada. A ciência da pessoa continua pendente no portal dela.');
    });
  }

  return (
    <section className={styles.panel} aria-labelledby="rh-escala-titulo">
      <h3 id="rh-escala-titulo" className={styles.panelTitle}>Publicar escala versionada</h3>
      <p className={styles.hint}>
        Um envio cria a versão do período, inclui o turno da pessoa, publica o plantão e marca a versão como
        publicada. A pessoa precisa confirmar ciência no portal dela; publicar não confirma por ela.
      </p>
      <form onSubmit={onSubmit}>
        <fieldset className={styles.fieldset}>
          <legend>Período da versão</legend>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor={`${base}-titulo`}>Título da versão</label>
              <input id={`${base}-titulo`} name="title" required />
              <p className={styles.requiredNote}>Obrigatório</p>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${base}-inicio`}>Início do período</label>
              <input id={`${base}-inicio`} name="periodStart" type="date" required />
              <p className={styles.requiredNote}>Obrigatório</p>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${base}-fim`}>Fim do período</label>
              <input id={`${base}-fim`} name="periodEnd" type="date" required />
              <p className={styles.requiredNote}>Obrigatório</p>
            </div>
          </div>
        </fieldset>
        <fieldset className={styles.fieldset}>
          <legend>Turno a incluir</legend>
          <div className={styles.fieldRow}>
            <EmployeeSelect id={`${base}-pessoa`} employees={employees} />
            <div className={styles.field}>
              <label htmlFor={`${base}-local`}>Posto ou local</label>
              <input id={`${base}-local`} name="location" required />
              <p className={styles.requiredNote}>Obrigatório</p>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${base}-data`}>Data do turno</label>
              <input id={`${base}-data`} name="entryDate" type="date" required />
              <p className={styles.requiredNote}>Obrigatório</p>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${base}-entrada`}>Hora de entrada</label>
              <input id={`${base}-entrada`} name="startTime" type="time" required />
              <p className={styles.requiredNote}>Obrigatório</p>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${base}-saida`}>Hora de saída</label>
              <input id={`${base}-saida`} name="endTime" type="time" required />
              <p className={styles.requiredNote}>Obrigatório</p>
            </div>
          </div>
        </fieldset>
        <SubmitButton busy={busy}>Criar versão, incluir turno e publicar</SubmitButton>
      </form>
    </section>
  );
}

function RequestReviews({ requests, run }: { requests: SelfRequest[]; run: RunTask }) {
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function review(item: SelfRequest, action: 'em_analise' | 'aprovar' | 'rejeitar') {
    const text = (messages[item.id] || '').trim();
    if (text.length < 5) {
      // Erro ligado ao campo, não uma faixa solta no topo da página.
      setFieldError(current => ({
        ...current,
        [item.id]: 'Escreva um retorno com ao menos 5 caracteres. Ele fica registrado e é o que a pessoa vai ler.',
      }));
      document.getElementById(`retorno-${item.id}`)?.focus();
      return;
    }
    if (busyId) return;
    setBusyId(item.id);
    try {
      const result = await run(
        () => api('/api/admin/hr/l03/self-requests', {
          method: 'PATCH',
          headers: { 'Idempotency-Key': `rh-request-${crypto.randomUUID()}` },
          body: JSON.stringify({ id: item.id, action, message: text }),
        }),
        action === 'em_analise'
          ? 'Análise iniciada. A pessoa já vê que a solicitação está sendo tratada.'
          : action === 'aprovar'
            ? 'Solicitação aprovada e o retorno foi publicado para a pessoa.'
            : 'Solicitação rejeitada e o motivo foi publicado para a pessoa.',
      );
      if (result) {
        setMessages(current => ({ ...current, [item.id]: '' }));
        setFieldError(current => ({ ...current, [item.id]: '' }));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (!requests.length) {
    return (
      <UiState
        variant="empty"
        title="Nenhuma solicitação no seu escopo"
        detail="Não há pedidos de férias, afastamento, benefício ou reembolso aguardando você neste momento."
      />
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="rh-solicitacoes-titulo">
      <h3 id="rh-solicitacoes-titulo" className={styles.panelTitle}>
        Solicitações do funcionário ({requests.length})
      </h3>
      <p className={styles.hint}>
        A análise segue a ordem aguardando análise → em análise → decisão, exige uma mensagem explícita e o
        retorno aparece apenas no portal da pessoa titular. Não há envio por e-mail.
      </p>
      <div className={styles.cards}>
        {requests.map(item => {
          const open = ['solicitado', 'em_analise'].includes(item.status);
          const error = fieldError[item.id];
          return (
            <article className={styles.card} key={item.id} aria-labelledby={`solicitacao-${item.id}`}>
              <h4 id={`solicitacao-${item.id}`} className={styles.cardTitle}>{item.title}</h4>
              <dl className={styles.facts}>
                <div><dt>Protocolo</dt><dd>{item.protocol}</dd></div>
                <div><dt>Pessoa</dt><dd>{item.employee_name} — {item.matricula}</dd></div>
                <div><dt>Assunto</dt><dd>{selfRequestTypeLabel(item.request_type)}</dd></div>
                <div>
                  <dt>Situação</dt>
                  <dd>
                    <UiBadge tone={selfRequestStatusTone(item.status)} srPrefix="Situação">
                      {selfRequestStatusLabel(item.status)}
                    </UiBadge>
                  </dd>
                </div>
              </dl>
              <p>{item.description}</p>

              {Array.isArray(item.followups) && item.followups.length ? (
                <>
                  <h5 className={styles.panelTitle}>Histórico do RH</h5>
                  <ul>
                    {item.followups.map((follow, index) => (
                      <li key={`${item.id}-${index}`}>
                        {follow.message} — {selfRequestStatusLabel(follow.status)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {open ? (
                <>
                  <div className={styles.field}>
                    <label htmlFor={`retorno-${item.id}`}>
                      Retorno para a pessoa (protocolo {item.protocol})
                    </label>
                    <textarea
                      id={`retorno-${item.id}`}
                      rows={3}
                      minLength={5}
                      value={messages[item.id] || ''}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `retorno-erro-${item.id}` : `retorno-dica-${item.id}`}
                      onChange={event => setMessages(current => ({ ...current, [item.id]: event.target.value }))}
                    />
                    <p className={styles.requiredNote}>Obrigatório, mínimo de 5 caracteres</p>
                    {error ? (
                      <p className={styles.hint} id={`retorno-erro-${item.id}`} role="alert">{error}</p>
                    ) : (
                      <p className={styles.hint} id={`retorno-dica-${item.id}`}>
                        {item.status === 'solicitado'
                          ? 'Descreva o que será verificado nesta análise.'
                          : 'Descreva a decisão e o motivo dela.'}
                      </p>
                    )}
                  </div>
                  <div className={styles.actions}>
                    {item.status === 'solicitado' ? (
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={busyId === item.id}
                        aria-busy={busyId === item.id}
                        onClick={() => review(item, 'em_analise')}
                      >
                        Iniciar análise
                      </button>
                    ) : null}
                    {item.status === 'em_analise' ? (
                      <>
                        <button
                          type="button"
                          className={styles.primary}
                          disabled={busyId === item.id}
                          aria-busy={busyId === item.id}
                          onClick={() => review(item, 'aprovar')}
                        >
                          Aprovar solicitação
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          aria-busy={busyId === item.id}
                          onClick={() => review(item, 'rejeitar')}
                        >
                          Rejeitar solicitação
                        </button>
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Documents({ docs, run }: { docs: Doc[]; run: RunTask }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!docs.length) {
    return (
      <UiState
        variant="empty"
        title="Nenhum documento no seu escopo"
        detail="Não há envios privados aguardando revisão. Documentos de remuneração só aparecem com a concessão employees.compensation.read."
      />
    );
  }

  async function approve(doc: Doc) {
    if (busyId) return;
    setBusyId(doc.id);
    try {
      await run(
        () => api('/api/admin/hr/l03/documents', {
          method: 'PATCH',
          body: JSON.stringify({ id: doc.id, status: 'approved' }),
        }),
        `Documento "${doc.title}" aprovado após revisão.`,
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="rh-documentos-titulo">
      <h3 id="rh-documentos-titulo" className={styles.panelTitle}>Documentos privados ({docs.length})</h3>
      <p className={styles.hint}>
        Aprovar registra a revisão. Publicar ao titular é um passo distinto e exige fonte autorizada. O
        download é auditado e o arquivo não tem endereço público.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Pessoa</th>
              <th scope="col">Documento</th>
              <th scope="col">Natureza</th>
              <th scope="col">Situação</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(doc => (
              <tr key={doc.id}>
                <td>{doc.employee_name}</td>
                <td>{doc.title}</td>
                <td>{documentKindLabel(doc.document_kind)}</td>
                <td>
                  <UiBadge tone={documentStatusTone(doc.status)} srPrefix="Situação">
                    {documentStatusLabel(doc.status)}
                  </UiBadge>
                </td>
                <td>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      disabled={busyId === doc.id}
                      aria-busy={busyId === doc.id}
                      onClick={() => approve(doc)}
                    >
                      Aprovar
                      <span className={styles.visuallyHidden}> o documento {doc.title}</span>
                    </button>
                    <a className={styles.button} href={`/api/admin/hr/l03/documents/${doc.id}/download`}>
                      Baixar
                      <span className={styles.visuallyHidden}> o documento {doc.title}</span>
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Payroll({ employees, docs, run }: { employees: Employee[]; docs: Doc[]; run: RunTask }) {
  const base = useId();
  const closure = useSubmitLock();
  const upload = useSubmitLock();
  const payrollDocs = docs.filter(doc => doc.document_kind === 'payroll');

  async function onClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await closure.guard(() => run(
      () => api('/api/hr/dp-closures', {
        method: 'POST',
        body: JSON.stringify({
          competence: values.competence, action: 'fechar',
          notes: 'Fechamento demonstrativo confirmado pela interface',
        }),
      }),
      'Competência demonstrativa fechada. Isto é um fechamento interno de conferência, não um pagamento.',
    ));
  }

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file') as File;
    await upload.guard(async () => {
      const payload = await encoded(file);
      const done = await run(async () => {
        const made = await api('/api/admin/hr/l03/documents', {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            employeeId: data.get('employeeId'),
            documentKind: 'payroll',
            category: 'folha',
            title: `Holerite ${data.get('competence')}`,
            competence: data.get('competence'),
            sourceAuthorized: true,
            sourceLabel: 'Fonte de folha autorizada pelo operador',
          }),
        });
        return api('/api/admin/hr/l03/documents', {
          method: 'PATCH',
          body: JSON.stringify({ id: made.document.id, status: 'published' }),
        });
      }, 'Holerite publicado no espaço privado da pessoa titular.');
      if (done) form.reset();
    });
  }

  return (
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="rh-fechamento-titulo">
        <h3 id="rh-fechamento-titulo" className={styles.panelTitle}>Fechar período demonstrativo</h3>
        <p className={styles.hint}>
          Valida divergências e fecha a competência para conferência interna. Nenhum pagamento é executado
          por esta tela.
        </p>
        <form onSubmit={onClose}>
          <div className={styles.field}>
            <label htmlFor={`${base}-competencia`}>Competência</label>
            <input
              id={`${base}-competencia`}
              name="competence"
              pattern="\d{4}-\d{2}"
              placeholder="2026-10"
              required
              aria-describedby={`${base}-competencia-dica`}
            />
            <p className={styles.requiredNote}>Obrigatório</p>
            <p className={styles.hint} id={`${base}-competencia-dica`}>Formato ano-mês, por exemplo 2026-10.</p>
          </div>
          <SubmitButton busy={closure.busy}>Validar divergências e fechar</SubmitButton>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="rh-holerite-titulo">
        <h3 id="rh-holerite-titulo" className={styles.panelTitle}>Publicar holerite</h3>
        <p className={styles.hint}>
          Exige a concessão employees.compensation.write, separada do acesso geral de RH. Se você não a
          tiver, o servidor recusa e esta tela dirá isso em vez de fingir sucesso.
        </p>
        <form onSubmit={onUpload}>
          <fieldset className={styles.fieldset}>
            <legend>Documento de folha</legend>
            <div className={styles.fieldRow}>
              <EmployeeSelect id={`${base}-pessoa`} employees={employees} />
              <div className={styles.field}>
                <label htmlFor={`${base}-holerite-competencia`}>Competência</label>
                <input id={`${base}-holerite-competencia`} name="competence" pattern="\d{4}-\d{2}" placeholder="2026-10" required />
                <p className={styles.requiredNote}>Obrigatório</p>
              </div>
              <div className={styles.field}>
                <label htmlFor={`${base}-arquivo`}>Arquivo</label>
                <input id={`${base}-arquivo`} name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required />
                <p className={styles.requiredNote}>Obrigatório</p>
                <p className={styles.hint}>PDF, imagem ou texto. O arquivo fica privado e sem endereço público.</p>
              </div>
            </div>
          </fieldset>
          <SubmitButton busy={upload.busy}>Enviar de fonte autorizada e publicar</SubmitButton>
        </form>
      </section>

      <section className={`${styles.panel} ${styles.full}`} aria-labelledby="rh-publicacoes-titulo">
        <h3 id="rh-publicacoes-titulo" className={styles.panelTitle}>Publicações de folha já registradas</h3>
        {payrollDocs.length ? (
          <div className={styles.badgeRow}>
            {payrollDocs.map(doc => (
              <UiBadge key={doc.id} tone={documentStatusTone(doc.status)} srPrefix="Publicação">
                {doc.employee_name} — {doc.competence || 'sem competência'} — {documentStatusLabel(doc.status)}
              </UiBadge>
            ))}
          </div>
        ) : (
          <p className={styles.hint}>
            Nenhuma publicação de folha visível para a sua sessão. Isto pode significar que não há nenhuma ou
            que a sua conta não tem a concessão de leitura de remuneração.
          </p>
        )}
      </section>
    </div>
  );
}

function Termination({ employees, run }: { employees: Employee[]; run: RunTask }) {
  const base = useId();
  const { busy, guard } = useSubmitLock();
  // Confirmação explícita no lugar de `window.confirm`: a pessoa lê o resumo
  // do efeito irreversível antes de confirmar, e o foco vai para o resumo.
  const [pending, setPending] = useState<null | { employeeId: string; type: string; date: string; reason: string }>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { if (pending) summaryRef.current?.focus(); }, [pending]);

  const candidates = employees.filter(person => isTerminable(person.status));
  const chosen = pending ? employees.find(person => person.id === pending.employeeId) : null;

  function onReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setPending({
      employeeId: String(values.employeeId),
      type: String(values.type),
      date: String(values.date),
      reason: String(values.reason),
    });
  }

  async function onConfirm() {
    if (!pending) return;
    await guard(async () => {
      // Mesmas duas chamadas de antes: cria e conclui.
      const done = await run(async () => {
        const made = await api('/api/hr/terminations', {
          method: 'POST',
          body: JSON.stringify({
            employee_id: pending.employeeId, type: pending.type, termination_date: pending.date,
            reason: pending.reason, responsible_name: 'RH via SEG System',
          }),
        });
        return api('/api/hr/terminations', {
          method: 'PATCH',
          body: JSON.stringify({ id: made.termination.id, status: 'concluido' }),
        });
      }, 'Desligamento concluído. As sessões existentes da pessoa foram revogadas.');
      if (done) setPending(null);
    });
  }

  if (!candidates.length) {
    return (
      <UiState
        variant="empty"
        title="Nenhuma pessoa elegível a desligamento"
        detail="Todos os cadastros no seu escopo já estão desligados, ou não há cadastros alcançados pelas suas concessões."
      />
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="rh-desligamento-titulo">
      <h3 id="rh-desligamento-titulo" className={styles.panelTitle}>Desligamento com revogação de acesso</h3>
      <p className={styles.hint}>
        Esta ação é irreversível por esta tela. Você revisa um resumo antes de confirmar.
      </p>

      <form onSubmit={onReview}>
        <fieldset className={styles.fieldset}>
          <legend>Dados do desligamento</legend>
          <div className={styles.fieldRow}>
            <EmployeeSelect id={`${base}-pessoa`} employees={candidates} />
            <div className={styles.field}>
              <label htmlFor={`${base}-tipo`}>Tipo de desligamento</label>
              <select id={`${base}-tipo`} name="type" required defaultValue="termino_contrato">
                {TERMINATION_TYPES.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className={styles.requiredNote}>Obrigatório</p>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${base}-data`}>Data do desligamento</label>
              <input id={`${base}-data`} name="date" type="date" required />
              <p className={styles.requiredNote}>Obrigatório</p>
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor={`${base}-motivo`}>Motivo documentado</label>
            <textarea id={`${base}-motivo`} name="reason" rows={3} minLength={10} required />
            <p className={styles.requiredNote}>Obrigatório, mínimo de 10 caracteres</p>
            <p className={styles.hint}>Fica registrado na trilha de auditoria junto com a sua identidade.</p>
          </div>
        </fieldset>
        <div className={styles.actions}>
          <button type="submit">Revisar antes de concluir</button>
        </div>
      </form>

      {pending ? (
        <div
          className={`${styles.notice} ${styles.noticeError}`}
          role="alertdialog"
          aria-labelledby={`${base}-confirmar-titulo`}
          tabIndex={-1}
          ref={summaryRef}
        >
          <h4 id={`${base}-confirmar-titulo`} className={styles.panelTitle}>Confirmar o desligamento</h4>
          <p>Ao confirmar, e somente então, o sistema vai:</p>
          <ul>
            <li>registrar o desligamento de <strong>{chosen?.display_name || 'pessoa selecionada'}</strong> ({chosen?.matricula});</li>
            <li>marcar o cadastro como desligado;</li>
            <li><strong>revogar imediatamente</strong> as sessões ativas do portal dessa pessoa;</li>
            <li>gravar o motivo e a sua identidade na trilha de auditoria.</li>
          </ul>
          <dl className={styles.facts}>
            <div><dt>Tipo</dt><dd>{TERMINATION_TYPES.find(item => item.value === pending.type)?.label || pending.type}</dd></div>
            <div><dt>Data</dt><dd>{pending.date.split('-').reverse().join('/')}</dd></div>
            <div><dt>Motivo</dt><dd>{pending.reason}</dd></div>
          </dl>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={busy} aria-busy={busy} onClick={onConfirm}>
              {busy ? 'Concluindo…' : 'Concluir desligamento e revogar acesso'}
            </button>
            <button type="button" disabled={busy} onClick={() => setPending(null)}>
              Cancelar e voltar ao formulário
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function HrProcesses() {
  const [group, setGroup] = useState('cadastro');
  const groupRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // O código interno (HR-01..24) sai do rótulo visível e vira descrição: o
  // plano mestre pede que status técnico não ocupe o título da tarefa.
  const groups: { id: string; label: string; codes: string }[] = [
    { id: 'cadastro', label: 'Cadastro, histórico e admissão', codes: 'HR-01, HR-02 e HR-05' },
    { id: 'recrutamento', label: 'Recrutamento, talentos e dossiê', codes: 'HR-03, HR-04 e HR-06' },
    { id: 'desligamento', label: 'Desligamento, situação e férias', codes: 'HR-07 a HR-09' },
    { id: 'jornada', label: 'Afastamento, ponto e banco de horas', codes: 'HR-10 a HR-12' },
    { id: 'beneficios', label: 'Benefícios, reembolsos e saúde', codes: 'HR-13 a HR-16' },
    { id: 'desenvolvimento', label: 'Treinamento, competências e uniformes', codes: 'HR-17 a HR-20' },
    { id: 'gestao', label: 'Folha, avaliações e indicadores', codes: 'HR-21 a HR-24' },
  ];

  // Pendência herdada da UX-04: este tablist interno era um tablist apenas no
  // nome — sem roving tabindex, sem teclado e sem tabpanel. O conteúdo legado
  // ficava órfão de dono acessível. Aqui ele passa a seguir o mesmo padrão das
  // abas externas, sem tocar nos componentes legados em si.
  function onGroupKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = groups.findIndex(item => item.id === group);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % groups.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + groups.length) % groups.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = groups.length - 1;
    else return;
    event.preventDefault();
    const target = groups[next].id;
    setGroup(target);
    groupRefs.current[target]?.focus();
  }

  const activeGroup = groups.find(item => item.id === group)!;

  return (
    <section className={styles.panel} aria-labelledby="rh-processos-titulo">
      <h3 id="rh-processos-titulo" className={styles.panelTitle}>Demais processos de RH</h3>
      <p className={styles.hint}>
        Estas frentes ainda usam as telas antigas, com densidade e vocabulário próprios. Elas continuam
        funcionando e usando as mesmas permissões; a revisão visual delas não faz parte desta fatia e está
        registrada como pendente. Saúde e remuneração exigem concessões próprias.
      </p>
      <div className={styles.tabs} role="tablist" aria-label="Grupos de processos de RH">
        {groups.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`rh-legado-aba-${item.id}`}
            aria-selected={group === item.id}
            aria-controls={`rh-legado-painel-${item.id}`}
            tabIndex={group === item.id ? 0 : -1}
            ref={element => { groupRefs.current[item.id] = element; }}
            className={group === item.id ? styles.tabActive : styles.tab}
            onClick={() => setGroup(item.id)}
            onKeyDown={onGroupKeyDown}
          >
            {item.label}
            <span className={styles.visuallyHidden}> (processos {item.codes})</span>
          </button>
        ))}
      </div>
      <div
        className={styles.legacy}
        role="tabpanel"
        id={`rh-legado-painel-${group}`}
        aria-labelledby={`rh-legado-aba-${group}`}
        tabIndex={-1}
      >
        <h4 className={styles.visuallyHidden}>{activeGroup.label} — tela legada</h4>
        <p className={styles.hint} data-ux-legacy="true">
          Tela legada, exibida como está: {activeGroup.label} (processos {activeGroup.codes}). O
          vocabulário e os estados desta área ainda não foram revisados. As permissões e a auditoria
          são as mesmas do restante do RH.
        </p>
        {group === 'cadastro' ? <HrClient /> : null}
        {group === 'recrutamento' ? <HrRecruitmentClient /> : null}
        {group === 'desligamento' ? <HrTerminationClient /> : null}
        {group === 'jornada' ? <HrAbsenceClient /> : null}
        {group === 'beneficios' ? <HrBenefitsClient /> : null}
        {group === 'desenvolvimento' ? <HrTrainingClient /> : null}
        {group === 'gestao' ? <HrAdvancedClient /> : null}
      </div>
    </section>
  );
}

// Reexportado para o gate de vocabulário conferir que a tela oferece
// exatamente os tipos de solicitação que o servidor aceita.
export { SELF_REQUEST_TYPES as RH_SELF_REQUEST_TYPES };
