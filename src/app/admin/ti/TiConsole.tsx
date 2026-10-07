"use client";
import {useState} from 'react';
import dynamic from 'next/dynamic';
const AiRagClient=dynamic(()=>import('./AiRagClient'));
const DirectorySourcesClient=dynamic(()=>import('./DirectorySourcesClient'));
const AuditClient=dynamic(()=>import('./AuditClient'));
const RbacClient=dynamic(()=>import('./RbacClient'));
const HealthcheckClient=dynamic(()=>import('./HealthcheckClient'));
const BackupClient=dynamic(()=>import('./BackupClient'));
const NotificationsClient=dynamic(()=>import('./NotificationsClient'));
const PrivacyClient=dynamic(()=>import('./PrivacyClient'));
const ThemeClient=dynamic(()=>import('./ThemeClient'));
const ObservabilityClient=dynamic(()=>import('./ObservabilityClient'));
const IncidentClient=dynamic(()=>import('./IncidentClient'));
const IntegrationLogClient=dynamic(()=>import('./IntegrationLogClient'));
import UiTaskWorkspace from '@/components/ui/UiTaskWorkspace';
const tabs=[['bases','Bases dos assistentes'],['pastas','Fontes em pastas'],['saude','Saúde do sistema'],['observacao','Observabilidade'],['incidentes','Incidentes'],['integracoes','Registros de integração'],['acessos','Papéis e permissões'],['auditoria','Auditoria'],['backup','Catálogo de backups'],['avisos','Notificações'],['privacidade','Privacidade'],['visual','Tema e aparência']] as const;
export default function TiConsole(){
 const [active,setActive]=useState<string>('bases');
 return <UiTaskWorkspace id="ti-console"><h1>Sistema e tecnologia</h1><p>Administre conteúdo, acessos e ferramentas existentes. Cada operação continua sujeita à autorização da API. Configuração do Ollama e raízes físicas fica no ambiente do servidor, fora do GitHub.</p>
 <nav aria-label="Ferramentas de sistema" style={{display:'flex',gap:8,flexWrap:'wrap'}}>{tabs.map(([key,label])=><button key={key} type="button" aria-pressed={active===key} onClick={()=>setActive(key)}>{label}</button>)}</nav>
 <section key={active} aria-label={tabs.find(t=>t[0]===active)?.[1]}>
 {active==='bases'&&<AiRagClient/>}{active==='pastas'&&<DirectorySourcesClient/>}{active==='saude'&&<HealthcheckClient/>}{active==='acessos'&&<RbacClient/>}{active==='auditoria'&&<AuditClient/>}{active==='backup'&&<BackupClient/>}{active==='avisos'&&<NotificationsClient/>}{active==='privacidade'&&<PrivacyClient/>}{active==='visual'&&<ThemeClient/>}
 {active==='observacao'&&<ObservabilityClient/>}{active==='incidentes'&&<IncidentClient/>}{active==='integracoes'&&<IntegrationLogClient/>}
 </section></UiTaskWorkspace>;
}
