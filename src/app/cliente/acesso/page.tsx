"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import styles from "./ClientAccess.module.css";

type Mode = "solicitacao_aprovacao" | "autocadastro";
type Reply = { request?: { protocol?: string; status?: string }; error?: string };

function newKey() { return `cli13-${crypto.randomUUID()}`; }

export default function ClientAccessPage() {
  const [mode,setMode]=useState<Mode>("solicitacao_aprovacao");
  const [account,setAccount]=useState(""); const [documentRef,setDocumentRef]=useState("");
  const [name,setName]=useState(""); const [email,setEmail]=useState("");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  const retryKey=useRef("");

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); retryKey.current ||= newKey();
    try {
      const response=await fetch("/api/public/portal-access-requests",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":retryKey.current},
        body:JSON.stringify({mode,client_account_id:account,document_ref:documentRef,requested_name:name,requested_email:email})});
      const data=await response.json() as Reply;
      if (response.ok) { setMessage(`Pedido ${data.request?.protocol} registrado como pendente. A equipe fará a revisão; nenhum acesso ou contrato foi liberado.`); retryKey.current=""; return; }
      const labels:Record<string,string>={mode_inactive:"Este modo de entrada está inativo.",link_not_verified:"Não foi possível confirmar o vínculo entre a conta e o documento informados.",idempotency_key_reused:"Os dados mudaram durante uma tentativa. Recarregue a página e tente novamente."};
      setMessage(labels[data.error||""]||"Não foi possível registrar o pedido. Confira os campos e tente novamente.");
    } catch { setMessage("Falha de comunicação. Tente novamente; a mesma chave será reutilizada sem duplicar o pedido."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/cliente" className={styles.back}><ArrowLeft size={15}/> Área do Cliente</Link><span className={styles.brand}><ShieldCheck size={15}/> GRUPO SEG SYSTEM</span></header>
    <section className={styles.content}>
      <span className={styles.eyebrow}>PORTAL DO CLIENTE · SOLICITAÇÃO REAL</span>
      <h1>Solicite acesso<br/><em>com vínculo conferido.</em></h1>
      <div className={styles.notice}><CircleAlert size={18}/><p>Todo pedido fica <strong>pendente</strong>. Autocadastro não cria identidade, sessão, permissão ou acesso a contratos. Se você recebeu um convite, use o link individual enviado pela equipe.</p></div>
      <form className={styles.card} onSubmit={submit}>
        <label>Modo de entrada</label><select value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="solicitacao_aprovacao">Solicitação com aprovação</option><option value="autocadastro">Autocadastro sujeito a revisão</option></select>
        <label>Identificador da conta (UUID)</label><input required value={account} onChange={e=>setAccount(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000"/>
        <label>Documento cadastrado da conta</label><input required minLength={5} maxLength={32} value={documentRef} onChange={e=>setDocumentRef(e.target.value)}/>
        <label>Seu nome</label><input required minLength={2} maxLength={200} value={name} onChange={e=>setName(e.target.value)}/>
        <label>E-mail para o convite, se aprovado</label><input required type="email" maxLength={200} value={email} onChange={e=>setEmail(e.target.value)}/>
        <button type="submit" disabled={busy}>{busy?"Registrando…":"Registrar pedido pendente"}</button>
        {message&&<p className={styles.feedback} role="status">{message}</p>}
      </form>
      <p className={styles.footer}><Link href="/cliente/entrar">Já tenho acesso</Link></p>
    </section>
  </main>;
}
