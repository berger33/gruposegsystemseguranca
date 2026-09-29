"use client";
import { useEffect, useState } from "react";

type SnapshotItem = {
  type: string;
  description: string;
  quantity: string | number;
  unit: string;
  unit_price: string | number;
  total_price: string | number;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; error: string; status: number }
  | {
      kind: "ready";
      proposal_version: number;
      link: { recipient_name: string | null; recipient_email: string; expires_at: string; legal_value_note: string | null };
      snapshot: { proposal: Record<string, any>; items: SnapshotItem[]; version: number };
    }
  | { kind: "accepted"; contract?: { id: string; isNew: boolean } | null };

function explainError(status: number, error: string) {
  if (status === 404) return "Link não encontrado. Confira se copiou o endereço completo enviado pelo comercial.";
  if (status === 410 && error === "link_expired") return "Este link expirou. Peça ao comercial para gerar um novo aceite.";
  if (error === "link_already_used_or_inactive" || error === "link_not_active") return "Este link já foi usado ou não está mais ativo. Se você já aceitou, não é preciso repetir — o aceite foi registrado uma única vez.";
  if (error === "version_mismatch_link_bound_to_version") return "Este link está vinculado a uma versão da proposta que não é mais a atual. Peça um novo link para a versão vigente.";
  if (error === "proposal_not_in_acceptable_state") return "Esta proposta não está mais em um estado que permite aceite (pode já ter sido aceita, recusada ou substituída).";
  return "Não foi possível carregar este aceite agora.";
}

export default function AcceptanceClient({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/proposals/accept/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", error: data.error || "unknown", status: res.status });
          return;
        }
        setState({ kind: "ready", proposal_version: data.proposal_version, link: data.link, snapshot: data.snapshot });
      })
      .catch(() => { if (!cancelled) setState({ kind: "error", error: "network", status: 0 }); });
    return () => { cancelled = true; };
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    const target = e.currentTarget as HTMLFormElement;
    if (!confirmChecked) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/crm/proposals/accept/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, signer_name: signerName || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", error: data.error || "unknown", status: res.status });
        return;
      }
      target?.reset?.();
      setState({ kind: "accepted", contract: data.contract });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 32, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 26 }}>Aceite de proposta comercial</h1>
      <p style={{ opacity: 0.75, fontSize: 13 }}>
        Link seguro, expirável e vinculado a uma versão específica da proposta (CRM-22). O aceite por este link é um{" "}
        <strong>clique simples</strong>, não uma assinatura eletrônica qualificada.
      </p>

      {state.kind === "loading" && <p>Carregando proposta…</p>}

      {state.kind === "error" && (
        <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b" }}>
          {explainError(state.status, state.error)}
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <section style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>{state.snapshot.proposal?.title || "Proposta"} — versão {state.proposal_version}</h2>
            <p style={{ fontSize: 13 }}>Destinatário: {state.link.recipient_name || state.link.recipient_email}</p>
            <p style={{ fontSize: 13 }}>Válido até: {new Date(state.link.expires_at).toLocaleString("pt-BR")}</p>
            {state.snapshot.proposal?.scope_description && (
              <p style={{ fontSize: 13 }}><strong>Escopo:</strong> {state.snapshot.proposal.scope_description}</p>
            )}
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 12 }}>
              <thead><tr><th style={{ textAlign: "left" }}>Item</th><th>Qtd</th><th>Unid.</th><th>Preço unit.</th><th>Total</th></tr></thead>
              <tbody>
                {(state.snapshot.items || []).map((item, index) => (
                  <tr key={index} style={{ borderTop: "1px solid #eee" }}>
                    <td>{item.description}</td>
                    <td style={{ textAlign: "center" }}>{item.quantity}</td>
                    <td style={{ textAlign: "center" }}>{item.unit}</td>
                    <td style={{ textAlign: "right" }}>R$ {item.unit_price}</td>
                    <td style={{ textAlign: "right" }}>R$ {item.total_price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 12, fontWeight: 700 }}>Total: R$ {state.snapshot.proposal?.total_price ?? "-"}</p>
            {state.link.legal_value_note && (
              <p style={{ fontSize: 12, background: "#eff6ff", padding: 8, borderRadius: 6 }}>{state.link.legal_value_note}</p>
            )}
          </section>

          <form onSubmit={accept} style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
            <h2 style={{ fontSize: 16 }}>Confirmar aceite</h2>
            <label style={{ display: "block", fontSize: 13, marginBottom: 8 }}>
              Nome de quem está aceitando (opcional)
              <input value={signerName} onChange={e => setSignerName(e.target.value)} maxLength={200} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12 }}>
              <input type="checkbox" checked={confirmChecked} onChange={e => setConfirmChecked(e.target.checked)} required />
              Li a proposta acima e concordo com o conteúdo desta versão. Estou ciente de que este é um aceite simples por link
              seguro, não uma assinatura eletrônica qualificada.
            </label>
            <button type="submit" disabled={!confirmChecked || submitting} style={{ marginTop: 12, padding: "10px 16px", background: "#0b5fff", color: "#fff", border: "none", borderRadius: 6 }}>
              {submitting ? "Enviando…" : "Aceitar esta versão da proposta"}
            </button>
          </form>
        </>
      )}

      {state.kind === "accepted" && (
        <div style={{ padding: 16, background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, color: "#065f46" }}>
          <strong>Aceite registrado.</strong> Obrigado — nossa equipe comercial dará sequência ao contrato.
          {state.contract?.id && <p style={{ fontSize: 12, marginTop: 8 }}>Referência de implantação: {state.contract.id.slice(0, 8)} ({state.contract.isNew ? "criada agora" : "já existente, sem duplicar"}).</p>}
        </div>
      )}
    </main>
  );
}
