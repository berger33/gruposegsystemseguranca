"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import styles from "../../../components/ui/UiWorkspace.module.css";
import { intelErrorFootnote, intelStatusLabel, intelStatusTone, intelTypeLabel, honestDate, count, type IntelErrorDescriptor } from "../../../lib/intel-vocabulary.mjs";
import { intelRequest } from "../../../lib/intel-request";

// Mutations preserve the canonical Idempotency-Key contract; contact remains registro interno autorizado.

type Suggestion = { id: string; protocol: string; title: string; intel_type: string; status: string; history_start: string; history_end: string; evidence?: Record<string, unknown> | null; evidence_built_at?: string | null; is_human_approved?: boolean; approved_at?: string | null; contact_registered_at?: string | null };
type Detail = { intel: Suggestion & Record<string, unknown>; events: Array<Record<string, unknown>> };
const TABS = ['nova', 'ciclo', 'lista'] as const;
const TYPES = ['indicacao', 'reativacao', 'upsell', 'cross_sell', 'risco', 'oportunidade'];
const key = (label: string) => `ext14-ui-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function IntelWorkspace() {
  const [active, setActive] = useState<typeof TABS[number]>('nova');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [title, setTitle] = useState('Reativação de clientes com histórico recente');
  const [intelType, setIntelType] = useState('indicacao');
  const [description, setDescription] = useState('');
  const [justification, setJustification] = useState('');
  const [historyStart, setHistoryStart] = useState('');
  const [historyEnd, setHistoryEnd] = useState('');
  const [error, setError] = useState<IntelErrorDescriptor | null>(null);
  const [message, setMessage] = useState('');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const load = async () => { const result = await intelRequest<{ items: Suggestion[] }>('/api/ext/intel/suggestions'); if (!result.ok) return setError(result.error); setSuggestions(result.data.items || []); if (!selected && result.data.items?.[0]?.id) setSelected(result.data.items[0].id); };
  useEffect(() => { void load(); /* leitura inicial independente */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const showDetail = async (id: string) => { setSelected(id); const result = await intelRequest<Detail>(`/api/ext/intel/suggestions/${id}`); if (!result.ok) return setError(result.error); setDetail(result.data); };
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(null); setMessage(''); const result = await intelRequest<{ intel: Suggestion }>('/api/ext/intel/suggestions', { method: 'POST', headers: { 'Idempotency-Key': key('create') }, body: JSON.stringify({ title, intel_type: intelType, description, justification, history_start: historyStart, history_end: historyEnd, source_module: 'historico_interno' }) }); if (!result.ok) return setError(result.error); setMessage(`Sugestão ${result.data.intel.protocol} registrada como sugerida.`); setSelected(result.data.intel.id); await load(); setActive('ciclo'); await showDetail(result.data.intel.id); };
  const act = async (path: string, body: Record<string, unknown>, label: string) => { const id = selected || suggestions[0]?.id; if (!id) return setMessage('Crie ou selecione uma sugestão antes.'); setError(null); setMessage(''); const result = await intelRequest<{ intel: Suggestion; note?: string }>(`/api/ext/intel/suggestions/${id}${path}`, { method: 'POST', headers: { 'Idempotency-Key': key(label) }, body: JSON.stringify(body) }); if (!result.ok) return setError(result.error); setMessage(result.data.note || `Ação ${label} registrada.`); await load(); await showDetail(id); };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => { const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1; if (next >= 0) { event.preventDefault(); setActive(TABS[next]); tabRefs.current[next]?.focus(); } };
  const errorState = error && <UiState variant="error" title={error.title} detail={`${error.detail} ${intelErrorFootnote(error)}`} onRetry={error.canRetry ? () => { setError(null); void load(); } : undefined} />;
  return <main className={styles.workspace}>
    <nav aria-label="Trilha" className={styles.breadcrumbNav}><a href="/admin">Início</a> · <span aria-current="page">Inteligência comercial</span></nav>
    <p className={styles.kicker}>EXT-14 · F10</p><h1>Inteligência comercial</h1>
    <p className={styles.lede}>Sugestões explicadas com evidência contada de tabelas internas reais dentro de uma janela declarada; esta jornada não usa os handlers legados como cobertura. Aprovação humana e contato interno autorizado são etapas separadas; nenhuma mensagem externa é disparada.</p>
    {message && <UiState variant="success" title={message} />}
    <div className={styles.tabs} role="tablist" aria-label="Jornada de inteligência comercial">
      {[['nova', 'Nova sugestão'], ['ciclo', 'Ciclo de vida'], ['lista', 'Sugestões canônicas']].map(([id, label], index) => <button key={id} ref={node => { tabRefs.current[index] = node; }} className={active === id ? styles.tabActive : styles.tab} role="tab" aria-selected={active === id} aria-controls={`intel-panel-${id}`} tabIndex={active === id ? 0 : -1} onClick={() => setActive(id as typeof active)} onKeyDown={event => onTabKey(event, index)}>{label}</button>)}
    </div>
    <div className={styles.tabPanel}>
      {active === 'nova' && <section id="intel-panel-nova" role="tabpanel" tabIndex={0} className={styles.panel} aria-labelledby="nova-tab"><h2 className={styles.panelTitle}>Nova sugestão explicada</h2><form className={styles.stackWide} onSubmit={submit}>
        <div className={styles.fieldRow}><div className={styles.field}><label htmlFor="intel-title">Título</label><input id="intel-title" minLength={5} required value={title} onChange={event => setTitle(event.target.value)} /></div><div className={styles.field}><label htmlFor="intel-type">Tipo</label><select id="intel-type" value={intelType} onChange={event => setIntelType(event.target.value)}>{TYPES.map(item => <option key={item} value={item}>{intelTypeLabel(item)}</option>)}</select></div></div>
        <div className={styles.fieldRow}><div className={styles.field}><label htmlFor="intel-description">Descrição</label><textarea id="intel-description" minLength={10} required value={description} onChange={event => setDescription(event.target.value)} /></div><div className={styles.field}><label htmlFor="intel-justification">Justificativa baseada no histórico</label><textarea id="intel-justification" minLength={10} required value={justification} onChange={event => setJustification(event.target.value)} /></div></div>
        <div className={styles.fieldRow}><div className={styles.field}><label htmlFor="intel-start">Início da janela</label><input id="intel-start" type="date" required value={historyStart} onChange={event => setHistoryStart(event.target.value)} /></div><div className={styles.field}><label htmlFor="intel-end">Fim da janela</label><input id="intel-end" type="date" required value={historyEnd} onChange={event => setHistoryEnd(event.target.value)} /></div></div>
        <div className={styles.actions}><button className="primary" type="submit">Registrar sugestão</button></div>
      </form></section>}
      {active === 'ciclo' && <section id="intel-panel-ciclo" role="tabpanel" tabIndex={0} className={styles.panel} aria-labelledby="ciclo-tab"><h2 className={styles.panelTitle}>Ciclo de vida</h2>{errorState}<div className={styles.field}><label htmlFor="intel-selected">Sugestão selecionada</label><select id="intel-selected" value={selected} onChange={event => void showDetail(event.target.value)}><option value="">Selecione</option>{suggestions.map(item => <option key={item.id} value={item.id}>{item.protocol} · {intelStatusLabel(item.status)}</option>)}</select></div><div className={styles.actions}><button type="button" onClick={() => void act('/transition', { status: 'em_analise' }, 'analise')}>Enviar para análise</button><button type="button" onClick={() => void act('/evidence', { evidence_note: 'Evidência contada do histórico interno pela interface EXT-14.' }, 'evidencia')}>Contar evidência</button><button type="button" onClick={() => void act('/transition', { status: 'aprovada', decision_note: 'Aprovação humana registrada pela interface EXT-14.' }, 'aprovacao')}>Registrar aprovação humana</button><button type="button" onClick={() => void act('/transition', { status: 'rejeitada', decision_note: 'Rejeição humana registrada pela interface EXT-14.' }, 'rejeicao')}>Recusar</button><button type="button" onClick={() => void act('/contact', { contact_note: 'Contato registrado internamente pela interface EXT-14; nenhuma mensagem externa disparada.' }, 'contato')}>Registrar contato interno</button></div>{detail && <section className={styles.notice}><h3 className={styles.cardTitle}>Detalhe e trilha</h3><p className={styles.hint}>Estado: <strong>{intelStatusLabel(detail.intel.status)}</strong> · janela {honestDate(detail.intel.history_start)} a {honestDate(detail.intel.history_end)} · eventos {count(detail.events?.length)}</p><pre className={styles.codeBlock}>{JSON.stringify(detail, null, 2)}</pre></section>}</section>}
      {active === 'lista' && <section id="intel-panel-lista" role="tabpanel" tabIndex={0} className={styles.panel} aria-labelledby="lista-tab"><h2 className={styles.panelTitle}>Sugestões canônicas</h2>{errorState || (!suggestions.length ? <UiState variant="empty" title="Nenhuma sugestão canônica registrada." detail="Sem histórico interno não há recomendação; nada é inventado." /> : <div className={styles.cards}>{suggestions.map(item => <article className={styles.card} key={item.id} data-alert={item.status === 'rejeitada'}><h3 className={styles.cardTitle}>{item.protocol} · {item.title}</h3><p className={styles.hint}>{intelTypeLabel(item.intel_type)} · <span className={styles.tone} data-tone={intelStatusTone(item.status)}>{intelStatusLabel(item.status)}</span></p><p className={styles.hint}>Janela {honestDate(item.history_start)} a {honestDate(item.history_end)} · evidência {item.evidence_built_at ? 'contada' : 'pendente'} · aprovação humana {item.is_human_approved ? 'registrada' : 'pendente'} · contato {item.contact_registered_at ? 'registrado internamente' : 'não registrado'}</p><div className={styles.actions}><button type="button" onClick={() => { setActive('ciclo'); void showDetail(item.id); }}>Abrir ciclo</button></div></article>)}</div>)}</section>}
    </div>
  </main>;
}
