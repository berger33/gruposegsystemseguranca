"use client";
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import styles from './UiTaskWorkspace.module.css';
type Props={children:ReactNode;style?:CSSProperties;className?:string;title?:string;[key:string]:unknown};
export default function UiTaskWorkspace({children,style,className='',title,...rest}:Props){
 const root=useRef<HTMLDivElement>(null);
 const instance=useId().replace(/[^a-zA-Z0-9]/g,'');
 const [sections,setSections]=useState<{id:string;label:string}[]>([]);
 useEffect(()=>{
  const headings=Array.from(root.current?.querySelectorAll('h2,h3')||[]).filter(e=>!e.closest('details:not([open])'));
  const prefix=root.current?.id||`workspace-${instance}`;
  setSections(headings.slice(0,16).map((h,i)=>{if(!h.id)h.id=`${prefix}-task-${i}`;(h as HTMLElement).tabIndex=-1;return{id:h.id,label:(h.textContent||'').replace(/\s*\([^)]*(?:CRM|RH|ADM|EXT|FIN)-[^)]*\)/g,'').slice(0,90)};}));
 },[children,instance]);
 return <div {...rest} ref={root} className={`${styles.workspace} ${className}`} style={{...style,color:'var(--ux-color-text)',background:'var(--ux-color-surface)',minWidth:0,maxWidth:'100%'}}>
 {title&&<h2>{title}</h2>}{sections.length>1&&<nav className={styles.tasks} aria-label="Tarefas desta área">{sections.map(s=><a key={s.id} href={`#${s.id}`} onClick={()=>document.getElementById(s.id)?.focus()}>{s.label}</a>)}</nav>}{children}</div>;
}
