export class TimeClockError extends Error {
 constructor(code,status=400){super(code);this.status=status;}
}
export function nextPunchKinds(last){
 if(!last||last==='saida')return ['entrada'];
 if(last==='entrada'||last==='retorno_intervalo')return ['saida_intervalo','saida'];
 if(last==='saida_intervalo')return ['retorno_intervalo','saida'];
 return [];
}
export function validatePosition(value,now){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new TimeClockError('location_required');
 const {latitude,longitude,accuracy,positionAt}=value;
 if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>100000)throw new TimeClockError('invalid_location');
 const captured=new Date(positionAt);
 if(typeof positionAt!=='string'||!Number.isFinite(captured.getTime())||Math.abs(now.getTime()-captured.getTime())>120000)throw new TimeClockError('location_expired');
 return {latitude,longitude,accuracy,positionAt:captured.toISOString()};
}
export function normalizeTimeChanges(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new TimeClockError('invalid_time_changes');
 const result={};
 for(const [key,v] of Object.entries(value)){
  if(!['clock_in','clock_out','hours_worked','justification'].includes(key))throw new TimeClockError('invalid_time_changes');
  if(v===''||v===null||v===undefined)continue;
  if(key==='clock_in'||key==='clock_out'){
   if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v))throw new TimeClockError('invalid_time_changes');
   result[key]=v.length===5?`${v}:00`:v;
  }else if(key==='hours_worked'){
   if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>24)throw new TimeClockError('invalid_time_changes');result[key]=v;
  }else{
   if(typeof v!=='string'||!v.trim()||v.length>1000)throw new TimeClockError('invalid_time_changes');result[key]=v.trim();
  }
 }
 if(!Object.keys(result).length)throw new TimeClockError('invalid_time_changes');
 return result;
}
export function workedHours(punches){
 let start=null,total=0;
 for(const punch of punches){
  const at=new Date(punch.recorded_at).getTime();
  if(!Number.isFinite(at))throw new TimeClockError('invalid_punch_history',409);
  if(punch.kind==='entrada'||punch.kind==='retorno_intervalo')start=at;
  else if(start!==null){total+=Math.max(0,at-start);start=null;}
 }
 return Math.round(total/3600000*100)/100;
}
export function timeSnapshot(entry){
 return JSON.stringify([entry.clock_in,entry.clock_out,entry.hours_worked===null?null:Number(entry.hours_worked),entry.justification||null]);
}
