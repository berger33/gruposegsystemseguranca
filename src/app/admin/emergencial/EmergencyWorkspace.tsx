"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import { useEffect, useState, type FormEvent } from "react";

type Channel={id:string;name:string;channel_type:string;recipient_name:string;status:string;is_tested:boolean;activated_at?:string|null};
const idem=(label:string)=>`ext15-ui-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export default function EmergencyWorkspace(){
 const [items,setItems]=useState<Channel[]>([]),[selected,setSelected]=useState(""),[detail,setDetail]=useState<any>(null),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [form,setForm]=useState({name:"Plantão interno de apoio",channel_type:"telefone",recipient_name:"Supervisor de plantão",recipient_contact:"contato-interno-declarado",availability:"Disponibilidade declarada 24 horas por dia, sujeita a conferência humana.",purpose:"Apoio interno em ocorrências operacionais que exijam escalonamento humano.",escalation_responsible:"Gestor de plantão",escalation_contact:"contato-interno-escalacao"});
 async function load(){const r=await fetch("/api/ext/emergency/channels",{cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Falha ao carregar canais");setItems(d.items||[]);if(!selected&&d.items?.[0]?.id)setSelected(d.items[0].id);}
 useEffect(()=>{load().catch(e=>setError(e.message));/* eslint-disable-next-line react-hooks/exhaustive-deps */},[]);
 async function create(e:FormEvent){e.preventDefault();setError("");const r=await fetch("/api/ext/emergency/channels",{method:"POST",headers:{"content-type":"application/json","Idempotency-Key":idem("create")},body:JSON.stringify({...form,escalation_steps:[{responsible:form.escalation_responsible,contact:form.escalation_contact,wait_minutes:5}]})}),d=await r.json().catch(()=>({}));if(!r.ok)return setError(d.error||"Falha ao configurar canal");setMessage(d.note);setSelected(d.channel.id);await load();}
 async function act(path:string,body:Record<string,unknown>,label:string){const id=selected||items[0]?.id;if(!id)return setError("Selecione um canal.");setError("");const r=await fetch(`/api/ext/emergency/channels/${id}${path}`,{method:"POST",headers:{"content-type":"application/json","Idempotency-Key":idem(label)},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));if(!r.ok)return setError(d.error||`Falha em ${label}`);setMessage(d.note);await load();await show(id);}
 async function show(id=selected){if(!id)return;const r=await fetch(`/api/ext/emergency/channels/${id}`,{cache:"no-store"}),d=await r.json().catch(()=>({}));if(r.ok)setDetail(d);}
 const field=(name:keyof typeof form,label:string)=><label>{label}<input required value={form[name]} onChange={e=>setForm({...form,[name]:e.target.value})}/></label>;
 return <UiTaskWorkspace style={{maxWidth:1180,margin:"40px auto",padding:24,fontFamily:"system-ui"}}>
  <p style={{color:"#64748b",letterSpacing:1}}>EXT-15 · F11</p><h1>Apoio emergencial</h1>
  <p>Configure destinatário, disponibilidade e escalonamento; depois registre separadamente testes de recebimento e atendimento. Esta tela <strong>não usa handlers legados como cobertura</strong> e não envia telefonema, WhatsApp, mensagem ou alerta externo.</p>
  <p style={{background:"#fff7ed",padding:12,borderRadius:8}}><strong>Limite da prova:</strong> cada teste é um registro interno declarado por uma pessoa. Não comprova entrega de fornecedor nem central 24h. A ativação exige os dois registros bem-sucedidos e decisão humana.</p>
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}{message&&<p role="status" style={{color:"#166534"}}>{message}</p>}
  <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:24}}>
   <form onSubmit={create} style={{display:"grid",gap:9,border:"1px solid #cbd5e1",padding:16}}><h2>Configurar canal interno</h2>{field("name","Nome")}
    <label>Tipo<select value={form.channel_type} onChange={e=>setForm({...form,channel_type:e.target.value})}>{["telefone","whatsapp","app","botao","outro"].map(x=><option key={x}>{x}</option>)}</select></label>
    {field("recipient_name","Destinatário responsável")}{field("recipient_contact","Contato declarado")}{field("availability","Disponibilidade declarada")}{field("purpose","Finalidade")}{field("escalation_responsible","Responsável pelo escalonamento")}{field("escalation_contact","Contato de escalonamento")}<button>Registrar rascunho</button>
   </form>
   <div style={{display:"grid",gap:9,border:"1px solid #cbd5e1",padding:16,alignContent:"start"}}><h2>Teste e ativação</h2><select aria-label="Canal selecionado" value={selected} onChange={e=>{setSelected(e.target.value);void show(e.target.value)}}><option value="">Selecione</option>{items.map(x=><option key={x.id} value={x.id}>{x.name} · {x.status}</option>)}</select>
    <button onClick={()=>void act("/transition",{status:"em_teste"},"testing")}>Iniciar ciclo de testes</button>
    <button onClick={()=>void act("/tests",{test_kind:"recebimento",result:"Recebimento declarado como conferido pelo operador interno.",evidence_note:"Conferência manual declarada na interface EXT-15, sem envio automatizado.",tested_by_name:"Operador interno",is_success:true},"receipt")}>Registrar teste de recebimento bem-sucedido</button>
    <button onClick={()=>void act("/tests",{test_kind:"atendimento",result:"Atendimento declarado como conferido pelo operador interno.",evidence_note:"Conferência manual declarada na interface EXT-15, sem central externa.",tested_by_name:"Operador interno",is_success:true},"attendance")}>Registrar teste de atendimento bem-sucedido</button>
    <button onClick={()=>void act("/transition",{status:"ativo",note:"Ativação humana após conferência dos dois registros internos de teste."},"activate")}>Marcar ativo (decisão humana)</button>
   </div>
  </section>
  <section style={{marginTop:24}}><h2>Canais canônicos</h2>{items.length===0?<p>Nenhum canal canônico configurado.</p>:items.map(x=><article key={x.id} style={{borderTop:"1px solid #ddd",padding:10}}><strong>{x.name}</strong> · {x.channel_type} · {x.status}<br/><small>Destinatário: {x.recipient_name} · testes completos: {x.is_tested?"sim":"não"} · ativação humana: {x.activated_at?"registrada":"pendente"}</small></article>)}</section>
  {detail&&<section aria-label="Detalhe do canal" style={{marginTop:24,background:"#f8fafc",padding:16}}><h2>Trilha interna</h2><pre style={{whiteSpace:"pre-wrap",overflowX:"auto"}}>{JSON.stringify(detail,null,2)}</pre></section>}
 </UiTaskWorkspace>;
}
