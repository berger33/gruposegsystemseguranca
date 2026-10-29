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
const DependencyClient=dynamic(()=>import('./DependencyClient'));
const MaintenanceDocClient=dynamic(()=>import('./MaintenanceDocClient'));
const BudgetClient=dynamic(()=>import('./BudgetClient'));
const EnvClient=dynamic(()=>import('./EnvClient'));
const RetentionClient=dynamic(()=>import('./RetentionClient'));
const ConfigClient=dynamic(()=>import('./ConfigClient'));
const CliAdvancedClient=dynamic(()=>import('./CliAdvancedClient'));
const FinRegistryClient=dynamic(()=>import('./FinRegistryClient'));
const LgpdRequestClient=dynamic(()=>import('./LgpdRequestClient'));
const ExtReportingClient=dynamic(()=>import('./ExtReportingClient'));
import UiTaskWorkspace from '@/components/ui/UiTaskWorkspace';
import styles from './TiConsole.module.css';
const tabs=[['bases','Bases dos assistentes'],['pastas','Fontes em pastas'],['saude','Saúde do sistema'],['observacao','Observabilidade'],['incidentes','Incidentes'],['integracoes','Registros de integração'],['dependencias','Dependências'],['manutencao','Documentação de manutenção'],['orcamentos','Orçamento e uso'],['ambientes','Ambientes e isolamento'],['acessos','Papéis e permissões'],['auditoria','Auditoria'],['backup','Catálogo de backups'],['avisos','Notificações'],['privacidade','Privacidade'],['visual','Tema e aparência'],['retencao','Retenção e descarte'],['configuracoes','Configurações e rollout'],['lgpd','Pedidos LGPD'],['cliente','Portal do cliente v2'],['financeiro_cadastros','Cadastros financeiros'],['monitoramento_ext','Central, biometria e automações']] as const;
export default function TiConsole(){
 const [active,setActive]=useState<string>('bases');
 return <UiTaskWorkspace id="ti-console"><h1>Sistema e tecnologia</h1><p>Administre conteúdo, acessos e ferramentas existentes. Cada operação continua sujeita à autorização da API. Configuração do Ollama e raízes físicas fica no ambiente do servidor, fora do GitHub.</p>
 <nav aria-label="Ferramentas de sistema" className={styles.tools}>{[{name:'Conteúdo e assistentes',keys:['bases','pastas']},{name:'Saúde e operação',keys:['saude','observacao','incidentes','integracoes','dependencias','manutencao','orcamentos','configuracoes']},{name:'Acesso e governança',keys:['acessos','auditoria','backup','privacidade','ambientes','retencao','lgpd']},{name:'Experiência e comunicação',keys:['avisos','visual','cliente']},{name:'Financeiro e cadastros',keys:['financeiro_cadastros']},{name:'Inteligência e monitoramento',keys:['monitoramento_ext']}].map(group=><fieldset key={group.name} className={styles.group}><legend>{group.name}</legend>{tabs.filter(([key])=>group.keys.includes(key)).map(([key,label])=><button key={key} type="button" aria-pressed={active===key} onClick={()=>setActive(key)}>{key==='visual'?'Aparência do site':label}</button>)}</fieldset>)}</nav>
 <section key={active} aria-label={tabs.find(t=>t[0]===active)?.[1]}>
 {active==='bases'&&<AiRagClient/>}{active==='pastas'&&<DirectorySourcesClient/>}{active==='saude'&&<HealthcheckClient/>}{active==='acessos'&&<RbacClient/>}{active==='auditoria'&&<AuditClient/>}{active==='backup'&&<BackupClient/>}{active==='avisos'&&<NotificationsClient/>}{active==='privacidade'&&<PrivacyClient/>}{active==='visual'&&<ThemeClient/>}
 {active==='observacao'&&<ObservabilityClient/>}{active==='incidentes'&&<IncidentClient/>}{active==='integracoes'&&<IntegrationLogClient/>}{active==='dependencias'&&<DependencyClient/>}{active==='manutencao'&&<MaintenanceDocClient/>}{active==='orcamentos'&&<BudgetClient/>}{active==='ambientes'&&<EnvClient/>}{active==='retencao'&&<RetentionClient/>}{active==='configuracoes'&&<ConfigClient/>}{active==='lgpd'&&<LgpdRequestClient/>}{active==='cliente'&&<CliAdvancedClient/>}{active==='financeiro_cadastros'&&<FinRegistryClient/>}{active==='monitoramento_ext'&&<ExtReportingClient/>}
 </section></UiTaskWorkspace>;
}
