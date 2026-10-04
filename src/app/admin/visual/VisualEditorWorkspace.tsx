"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Token = {
  id: string;
  token_key: string;
  category: string;
  status: string;
  version: number;
  is_published: boolean;
};

type Layout = {
  id: string;
  layout_key: string;
  status: string;
  version: number;
  is_published: boolean;
  token_id?: string | null;
  token_key?: string | null;
  preview_url?: string | null;
};

const key = (label: string) => `ext12-ui-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function parseJson(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export default function VisualEditorWorkspace() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [tokenKey, setTokenKey] = useState("brand.primary");
  const [category, setCategory] = useState("cores");
  const [tokenValue, setTokenValue] = useState('{"color":"#0f4c81","contrast":"#ffffff"}');
  const [layoutKey, setLayoutKey] = useState("home-institucional");
  const [layoutData, setLayoutData] = useState('{"hero":"Segurança patrimonial","sections":["serviços","contato"]}');
  const [selectedToken, setSelectedToken] = useState("");
  const [selectedLayout, setSelectedLayout] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const latestToken = useMemo(() => tokens[0]?.id || "", [tokens]);

  async function load() {
    const [tokenResponse, layoutResponse] = await Promise.all([
      fetch("/api/ext/visual/tokens", { cache: "no-store" }),
      fetch("/api/ext/visual/layouts", { cache: "no-store" }),
    ]);
    const [tokenData, layoutDataResponse] = await Promise.all([
      tokenResponse.json().catch(() => ({})),
      layoutResponse.json().catch(() => ({})),
    ]);
    if (!tokenResponse.ok) throw new Error(tokenData.error || "Falha ao carregar tokens");
    if (!layoutResponse.ok) throw new Error(layoutDataResponse.error || "Falha ao carregar layouts");
    setTokens(tokenData.items || []);
    setLayouts(layoutDataResponse.items || []);
    if (!selectedToken && tokenData.items?.[0]?.id) setSelectedToken(tokenData.items[0].id);
    if (!selectedLayout && layoutDataResponse.items?.[0]?.id) setSelectedLayout(layoutDataResponse.items[0].id);
  }

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao carregar editor"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsed = parseJson(tokenValue);
    if (!parsed) return setError("Valor JSON do token inválido.");
    const response = await fetch("/api/ext/visual/tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": key("token") },
      body: JSON.stringify({ token_key: tokenKey, category, token_value: parsed, change_summary: "Token criado pela interface EXT-12" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || "Falha ao criar token");
    setMessage(`Token ${data.token.token_key} v${data.token.version} criado em rascunho.`);
    setSelectedToken(data.token.id);
    await load();
  }

  async function createLayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsed = parseJson(layoutData);
    if (!parsed) return setError("Dados JSON do layout inválidos.");
    const response = await fetch("/api/ext/visual/layouts", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": key("layout") },
      body: JSON.stringify({
        layout_key: layoutKey,
        layout_data: parsed,
        token_id: selectedToken || latestToken || null,
        change_summary: "Layout criado pela interface EXT-12",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || "Falha ao criar layout");
    setMessage(`Layout ${data.layout.layout_key} v${data.layout.version} criado em rascunho.`);
    setSelectedLayout(data.layout.id);
    await load();
  }

  async function previewLayout() {
    const id = selectedLayout || layouts[0]?.id;
    if (!id) return setError("Crie ou selecione um layout antes da prévia.");
    setError("");
    setMessage("");
    const response = await fetch(`/api/ext/visual/layouts/${id}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": key("preview") },
      body: JSON.stringify({ preview_note: "Prévia interna solicitada pela interface administrativa." }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || "Falha ao gerar prévia");
    setPreview(data.preview);
    setMessage("Prévia interna gerada. Nada foi publicado no site público.");
    await load();
  }

  return (
    <main style={{ maxWidth: 1180, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <p style={{ color: "#64748b", letterSpacing: 1 }}>EXT-12 · F08</p>
      <h1>Editor visual avançado</h1>
      <p>
        Tokens e layouts versionados com prévia interna e publicação auditada. Esta tela <strong>não usa os handlers legados como cobertura</strong>,
        não publica automaticamente o site público e não envia arquivos a fornecedores externos.
      </p>
      <p style={{ background: "#eff6ff", color: "#1e3a8a", padding: 12, borderRadius: 8 }}>
        Para publicar uma versão é necessário aprovar e registrar a publicação pela API canônica; a prévia abaixo é somente interna.
      </p>

      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {message && <p role="status" style={{ color: "#166534" }}>{message}</p>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 24 }}>
        <form onSubmit={createToken} style={{ display: "grid", gap: 10, border: "1px solid #cbd5e1", padding: 16, borderRadius: 12 }}>
          <h2>Novo token visual</h2>
          <input aria-label="Chave do token" placeholder="Chave do token" minLength={3} required value={tokenKey} onChange={(event) => setTokenKey(event.target.value)} />
          <input aria-label="Categoria" placeholder="Categoria" minLength={3} required value={category} onChange={(event) => setCategory(event.target.value)} />
          <textarea aria-label="Valor JSON do token" placeholder="Valor JSON do token" rows={5} value={tokenValue} onChange={(event) => setTokenValue(event.target.value)} />
          <button type="submit">Criar token</button>
        </form>

        <form onSubmit={createLayout} style={{ display: "grid", gap: 10, border: "1px solid #cbd5e1", padding: 16, borderRadius: 12 }}>
          <h2>Novo layout visual</h2>
          <input aria-label="Chave do layout" placeholder="Chave do layout" minLength={3} required value={layoutKey} onChange={(event) => setLayoutKey(event.target.value)} />
          <label>
            Token associado
            <select value={selectedToken} onChange={(event) => setSelectedToken(event.target.value)}>
              <option value="">Sem token</option>
              {tokens.map((token) => <option key={token.id} value={token.id}>{token.token_key} · v{token.version} · {token.status}</option>)}
            </select>
          </label>
          <textarea aria-label="Dados JSON do layout" placeholder="Dados JSON do layout" rows={5} value={layoutData} onChange={(event) => setLayoutData(event.target.value)} />
          <button type="submit">Criar layout</button>
        </form>
      </section>

      <section style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 24 }}>
        <div style={{ border: "1px solid #cbd5e1", padding: 16, borderRadius: 12 }}>
          <h2>Tokens canônicos</h2>
          {tokens.length === 0 ? <p>Nenhum token canônico registrado.</p> : tokens.map((token) => (
            <article key={token.id} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, marginTop: 10 }}>
              <strong>{token.token_key}</strong> · v{token.version} · {token.status}{token.is_published ? " · publicado" : ""}
              <br /><small>{token.category}</small>
            </article>
          ))}
        </div>

        <div style={{ border: "1px solid #cbd5e1", padding: 16, borderRadius: 12 }}>
          <h2>Layouts canônicos</h2>
          <label>
            Layout para prévia
            <select value={selectedLayout} onChange={(event) => setSelectedLayout(event.target.value)}>
              <option value="">Selecione</option>
              {layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.layout_key} · v{layout.version} · {layout.status}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void previewLayout()} style={{ marginTop: 10 }}>Gerar prévia interna</button>
          {layouts.length === 0 ? <p>Nenhum layout canônico registrado.</p> : layouts.map((layout) => (
            <article key={layout.id} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, marginTop: 10 }}>
              <strong>{layout.layout_key}</strong> · v{layout.version} · {layout.status}{layout.is_published ? " · publicado" : ""}
              <br /><small>Token: {layout.token_key || "não vinculado"}</small>
            </article>
          ))}
        </div>
      </section>

      {preview && (
        <section aria-label="Prévia interna" style={{ marginTop: 28, border: "1px solid #93c5fd", background: "#f8fafc", padding: 16, borderRadius: 12 }}>
          <h2>Prévia interna</h2>
          <p>{preview.boundary}</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>{JSON.stringify(preview, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
