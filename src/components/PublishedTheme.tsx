"use client";
import {useEffect} from 'react';
import {THEMES} from '@/lib/themes.mjs';
export default function PublishedTheme(){
 useEffect(()=>{
  let active=true;
  fetch('/api/public/themes').then(r=>r.ok?r.json():null).then(b=>{if(active&&THEMES.some(t=>t.id===b?.theme_key))document.documentElement.dataset.theme=b.theme_key;}).catch(()=>{});
  const apply=()=>{try{const mode=localStorage.getItem('seg-color-mode')||'sistema';document.documentElement.dataset.colorMode=['claro','escuro','sistema'].includes(mode)?mode:'sistema';}catch{}};
  apply();window.addEventListener('seg-theme-change',apply);window.addEventListener('storage',apply);
  return()=>{active=false;window.removeEventListener('seg-theme-change',apply);window.removeEventListener('storage',apply);};
 },[]);
 return null;
}
