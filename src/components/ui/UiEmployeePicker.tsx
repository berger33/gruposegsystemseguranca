"use client";
import {useEffect,useState,type InputHTMLAttributes} from 'react';
import {workspaceResponse} from '@/lib/workspace-response';
type Employee={id:string;display_name?:string;name?:string;nome?:string;full_name?:string};
export default function UiEmployeePicker({value,onChange,required,disabled,className,style}:InputHTMLAttributes<HTMLInputElement>){
 const [items,setItems]=useState<Employee[]>([]),[error,setError]=useState('');
 useEffect(()=>{let mounted=true;fetch('/api/admin/hr/employees',{cache:'no-store'}).then(workspaceResponse).then(d=>{if(mounted)setItems(d.employees||[]);}).catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Lista indisponível.');});return()=>{mounted=false;};},[]);
 return <span><select aria-label="Funcionário" value={String(value||'')} required={required} disabled={disabled} className={className} style={style} onChange={e=>onChange?.(e as unknown as React.ChangeEvent<HTMLInputElement>)}><option value="">Selecione o funcionário</option>{value&&!items.some(p=>p.id===String(value))&&<option value={String(value)}>Registro selecionado · {String(value).slice(0,8)}</option>}{items.map(p=><option key={p.id} value={p.id}>{p.display_name||p.name||p.nome||p.full_name||'Nome não informado'} · {p.id.slice(0,8)}</option>)}</select>{error&&<span role="status">{error}</span>}</span>;
}
