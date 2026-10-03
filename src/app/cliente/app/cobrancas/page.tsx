"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useClientSpace } from "../ClientSpaceProvider";
import ClientAppNavigation from "../ClientAppNavigation";
import styles from "../ClientApp.module.css";

type Charge = { id:string; client_account_id:string; protocol:string; charge_type:string; status:string; amount_cents:number; due_date:string; is_fiscal:boolean; fiscal_document_url:string|null; comprovante_url:string|null };
export default function CobrancasPage() {
  const { activeAccount, loading: spaceLoading } = useClientSpace();
  const [items,setItems]=useState<Charge[]>([]); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  const load=useCallback(async()=>{ if(!activeAccount)return; setLoading(true); setError(""); try { const r=await fetch("/api/client/charges-v2"); const d=await r.json(); if(!r.ok) throw new Error(d.error||"Falha ao carregar cobranças"); setItems((d.charges||[]).filter((x:Charge)=>x.client_account_id===activeAccount.id)); } catch(e) { setError(e instanceof Error?e.message:"Falha ao carregar cobranças"); } finally {setLoading(false);} },[activeAccount]);
  useEffect(()=>{void load()},[load]);
  return <div className={styles.shell}><ClientAppNavigation/><main className={styles.content}><div className={styles.breadcrumb}><Link href="/cliente/app">Área do cliente</Link> / Cobranças</div><h1>Cobranças e comprovantes</h1><p>Somente documentos financeiros provenientes de integração ativa e vinculados à conta selecionada.</p>{spaceLoading||loading?<p>Carregando…</p>:error?<div role="alert" className={styles.notice}>{error} <button type="button" onClick={()=>void load()}>Tentar novamente</button></div>:items.length===0?<p>Nenhuma cobrança integrada disponível.</p>:<ul>{items.map(c=><li key={c.id}><strong>{c.protocol}</strong> · {c.charge_type} · R$ {(Number(c.amount_cents)/100).toFixed(2)} · vencimento {new Date(c.due_date).toLocaleDateString("pt-BR")} · {c.status}{c.fiscal_document_url&&<a href={c.fiscal_document_url}> Documento fiscal</a>}{c.comprovante_url&&<a href={c.comprovante_url}> Comprovante</a>}</li>)}</ul>}</main></div>;
}
