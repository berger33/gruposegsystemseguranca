"use client";
import type { CSSProperties, ReactNode } from "react";

export const colors = {
  bg: "#f3f6fa",
  border: "#dce4ee",
  ink: "#17253b",
  muted: "#6b7b90",
  accent: "#0b5fff",
  ok: "#116b3a",
  okBg: "#e7f6ec",
  warn: "#8a5a00",
  warnBg: "#fdf3dc",
  bad: "#9c2222",
  badBg: "#fdecec",
};

export const card: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  background: "#fff",
  padding: 16,
};

export const input: CSSProperties = {
  padding: "7px 9px",
  border: `1px solid #ccd7e4`,
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  color: colors.ink,
  background: "#fff",
};

export const label: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: colors.muted,
};

export const btn: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 6,
  border: `1px solid #ccd7e4`,
  background: "#fff",
  color: colors.ink,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export const btnPrimary: CSSProperties = {
  ...btn,
  background: colors.accent,
  borderColor: colors.accent,
  color: "#fff",
};

export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12.5,
};

export const th: CSSProperties = {
  textAlign: "left",
  padding: "8px 8px",
  borderBottom: `2px solid ${colors.border}`,
  color: colors.muted,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

export const td: CSSProperties = {
  padding: "8px 8px",
  borderBottom: `1px solid ${colors.border}`,
  verticalAlign: "top",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" }) {
  const map = {
    neutral: { background: "#eef2f7", color: colors.muted },
    ok: { background: colors.okBg, color: colors.ok },
    warn: { background: colors.warnBg, color: colors.warn },
    bad: { background: colors.badBg, color: colors.bad },
  } as const;
  return (
    <span style={{ ...map[tone], borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", display: "inline-block" }}>
      {children}
    </span>
  );
}

export function Section({ title, hint, children, actions }: { title: string; hint?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section style={card}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
          {hint ? <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.muted, maxWidth: 760 }}>{hint}</p> : null}
        </div>
        {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

export function Notice({ kind, children }: { kind: "erro" | "ok" | "aviso"; children: ReactNode }) {
  const tone = kind === "erro"
    ? { background: colors.badBg, color: colors.bad, border: `1px solid #f3c9c9` }
    : kind === "ok"
      ? { background: colors.okBg, color: colors.ok, border: `1px solid #bfe3cd` }
      : { background: colors.warnBg, color: colors.warn, border: `1px solid #f0dcae` };
  return (
    <p role={kind === "erro" ? "alert" : "status"} style={{ ...tone, margin: "10px 0 0", padding: "8px 10px", borderRadius: 6, fontSize: 12.5 }}>
      {children}
    </p>
  );
}

// Sessão expirada/ausente: a autenticação de staff vive em /admin/leads.
export function SessionHint({ error }: { error: string }) {
  if (!/admin_session_required|unauthorized/.test(error)) return null;
  return (
    <Notice kind="aviso">
      Sessão de staff necessária. Entre em <a href="/admin/leads">Pedidos recebidos</a> e volte a esta página.
    </Notice>
  );
}

export function fmtDate(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return withTime ? d.toLocaleString("pt-BR") : d.toLocaleDateString("pt-BR");
}

export function fmtMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function apiJson(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || `http_${res.status}`);
    (err as any).status = res.status;
    (err as any).payload = data;
    throw err;
  }
  return data;
}
