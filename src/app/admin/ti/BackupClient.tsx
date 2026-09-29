"use client";
import { useState } from "react";

/** Catálogo histórico PLT-08. Não executa, promete ou certifica backups. */
export default function BackupClient() {
  const [backups, setBackups] = useState<any[]>([]);
  const [restores, setRestores] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  async function loadAll() {
    setMsg("Consultando registros históricos...");
    try {
      const responses = await Promise.all([
        fetch('/api/admin/backups'),
        fetch('/api/admin/backups/restores'),
        fetch('/api/admin/backups/retention'),
      ]);
      if (responses.some(r => !r.ok)) throw new Error("consulta indisponível");
      const [b, r, p] = await Promise.all(responses.map(response => response.json()));
      setBackups(b.backups || []);
      setRestores(r.restores || []);
      setPolicies(p.policies || []);
      setMsg("Registros legados carregados; status e flags históricos não são comprovantes de arquivos ou restaurações.");
    } catch {
      setMsg("Não foi possível consultar o catálogo de backup. Nenhuma operação de backup foi executada.");
    }
  }

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>PLT-08 — Catálogo histórico de backup (não verificado)</h3>
      <p style={{ fontSize: 12, color: '#991b1b' }}>
        Esta tela não executa backup ou restore. Registros legados com status “success”, checksum,
        criptografia ou flag “is_restore_tested” podem ter sido gerados por simulação; não comprovam
        existência de arquivo, proteção de dados ou restauração. Não usar para autorizar produção.
      </p>
      <button onClick={loadAll} style={{ padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12 }}>Consultar registros</button>
      {msg && <div role="status" style={{ background: '#f3f4f6', padding: 8, borderRadius: 8, fontSize: 11, marginTop: 8 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600 }}>Jobs legados ({backups.length})</h4>
          {backups.map(b => (
            <div key={b.id} style={{ padding: 6, border: '1px solid #fca5a5', borderRadius: 6, fontSize: 11, marginBottom: 4 }}>
              <strong>{b.backup_type} • status histórico: {b.recorded_status} • estado atual: NÃO VERIFICADO</strong>
              <div>Localização declarada: {b.storage_location || '—'} • checksum declarado: {b.checksum || '—'}</div>
              <div>Flag de restore histórica: {String(b.recorded_is_restore_tested)} • não é prova de restauração.</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600 }}>Restores legados ({restores.length})</h4>
          {restores.map(r => (
            <div key={r.id} style={{ padding: 6, border: '1px solid #fca5a5', borderRadius: 6, fontSize: 11, marginBottom: 4 }}>
              <strong>{r.restore_type} • status histórico: {r.recorded_status} • estado atual: NÃO VERIFICADO</strong>
              <div>Alvo declarado: {r.target_env} • isolamento declarado: {String(r.is_isolated)}</div>
            </div>
          ))}
          <h4 style={{ fontSize: 13, fontWeight: 600, marginTop: 12 }}>Políticas declarativas ({policies.length})</h4>
          <p style={{ fontSize: 11 }}>Prazos cadastrados não comprovam retenção nem descarte físico.</p>
          {policies.map(p => <div key={p.id} style={{ fontSize: 11 }}>{p.category} • {p.retention_days} dias declarados</div>)}
        </div>
      </div>
    </section>
  );
}
