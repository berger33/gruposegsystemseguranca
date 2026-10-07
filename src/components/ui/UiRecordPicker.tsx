import type {InputHTMLAttributes} from 'react';
type Props=InputHTMLAttributes<HTMLInputElement>&{items:readonly {id:string;[key:string]:unknown}[]};
export default function UiRecordPicker({items,value,onChange,required,disabled,className,style}:Props){
 return <select value={String(value||'')} required={required} disabled={disabled} className={className} style={style} onChange={e=>onChange?.(e as unknown as React.ChangeEvent<HTMLInputElement>)}><option value="">Selecione o registro</option>{value&&!items.some(i=>i.id===value)&&<option value={String(value)}>Registro selecionado · {String(value).slice(0,8)}</option>}{items.map(i=><option key={i.id} value={i.id}>{String(i.display_name||i.title||i.name||i.period_start||i.aquisitivo_start||i.id)} · {i.id.slice(0,8)}</option>)}</select>;
}
