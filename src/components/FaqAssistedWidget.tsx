"use client";
import {useState} from 'react';
export default function FaqAssistedWidget(){
  const [question,setQuestion]=useState(''),[result,setResult]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function ask(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setResult(null);
    try{const r=await fetch('/api/faq-assisted',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});const b=await r.json();if(!r.ok)throw Error(b.error);setResult(b);}catch{setError('Não foi possível consultar a FAQ. Você pode usar o formulário de contato.');}finally{setBusy(false);}
  }
  return <section aria-label="Ajuda com perguntas" style={{marginTop:24,padding:20,border:'1px solid #94a3b8',borderRadius:8}}>
    <h2>Pergunte à nossa base de respostas</h2><p>Respostas revisadas pela equipe. Valores, cobertura e prazos dependem de avaliação humana.</p>
    <form onSubmit={ask}><label>Sua pergunta<textarea value={question} onChange={e=>setQuestion(e.target.value)} minLength={5} maxLength={1000} required style={{display:'block',width:'100%',minHeight:80}}/></label><button disabled={busy}>{busy?'Consultando…':'Consultar FAQ'}</button></form>
    {error&&<p role="alert">{error} <a href="/contato">Falar com a equipe</a></p>}
    {result&&<div aria-live="polite"><p style={{whiteSpace:'pre-wrap'}}>{result.answer}</p>{result.source&&<a href={result.source}>Ler a resposta publicada</a>}<p><a href={result.handoff_url} onClick={()=>{try{sessionStorage.setItem("seg-faq-question",question);}catch{}}}>Solicitar atendimento humano</a></p><small>{result.note}</small></div>}
  </section>;
}
