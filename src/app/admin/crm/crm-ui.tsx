"use client";
import type { CSSProperties, ReactNode } from "react";

export const colors = {
  border: "#dce4ee",
  accent: "#0b5fff",
  text: "#17253b",
  muted: "#6b7b90",
  bg: "#f3f6fa",
};

export const card: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  background: "#fff",
  padding: 16,
};

export const input: CSSProperties = {
  border: `1px solid #ccd7e4`,
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
  color: colors.text,
  background: "#fff",
  maxWidth: "100%",
};

export const label: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: colors.muted,
};

export const btn: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: `1px solid #ccd7e4`,
  background: "#fff",
  color: colors.text,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

export const btnPrimary: CSSProperties = {
  ...btn,
  border: `1px solid ${colors.accent}`,
  background: colors.accent,
  color: "#fff",
};

export const th: CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: colors.muted,
  padding: 8,
  borderBottom: `1px solid ${colors.border}`,
};

export const td: CSSProperties = { padding: 8, fontSize: 13, borderBottom: "1px solid #eef2f7" };

const toneColor: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: "#eef2f7", fg: "#43536b" },
  ok: { bg: "#e6f6ec", fg: "#1c6b3a" },
  warn: { bg: "#fdf2dc", fg: "#8a5a08" },
  bad: { bg: "#fdecec", fg: "#98211f" },
  info: { bg: "#eff6ff", fg: "#13458f" },
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof toneColor | string; children: ReactNode }) {
  const c = toneColor[tone] || toneColor.neutral;
  return (
    <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function ErrorBox({ error }: { error: string }) {
  if (!error) return null;
  const isSession = error.includes("admin_session_required") || error.includes("unauthorized");
  return (
    <p role="alert" style={{ margin: "8px 0", fontSize: 13, color: "#98211f", background: "#fdecec", border: "1px solid #f3c9c7", borderRadius: 6, padding: "8px 10px" }}>
      {isSession ? (
        <>
          Sessão de staff necessária. Entre em <a href="/admin/leads">Pedidos recebidos</a> e volte para esta tela.
        </>
      ) : (
        <>O envio falhou: {error}</>
      )}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p style={{ margin: "8px 0", fontSize: 13, color: "#1c6b3a", background: "#e6f6ec", border: "1px solid #bfe3ce", borderRadius: 6, padding: "8px 10px" }}>
      {children}
    </p>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
      {hint ? <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.muted }}>{hint}</p> : null}
    </div>
  );
}

export async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error(data?.error || `http_${res.status}`);
  return data;
}

export function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function fmtDay(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}
