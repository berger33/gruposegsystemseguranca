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
const EmployeeComplaintClient=dynamic(()=>import('./EmployeeComplaintClient'));
const AdmClient=dynamic(()=>import('./AdmClient'));
const CliFinanceClient=dynamic(()=>import('./CliFinanceClient'));
const CmsClient=dynamic(()=>import('./CmsClient'));
const SeoClient=dynamic(()=>import('./SeoClient'));
const OriginMetricsClient=dynamic(()=>import('./OriginMetricsClient'));
const NotificationPreferencesClient=dynamic(()=>import('./NotificationPreferencesClient'));
const EmpPwaClient=dynamic(()=>import('./EmpPwaClient'));
const PubFaqAssistedClient=dynamic(()=>import('./PubFaqAssistedClient'));
import UiTaskWorkspace from '@/components/ui/UiTaskWorkspace';
import styles from './TiConsole.module.css';
const tabs=[['bases','Bases dos assistentes'],['pastas','Fontes em pastas'],['saude','Saúde do sistema'],['observacao','Observabilidade'],['incidentes','Incidentes'],['integracoes','Registros de integração'],['dependencias','Dependências'],['manutencao','Documentação de manutenção'],['orcamentos','Orçamento e uso'],['ambientes','Ambientes e isolamento'],['acessos','Papéis e permissões'],['auditoria','Auditoria'],['backup','Catálogo de backups'],['avisos','Notificações'],['privacidade','Privacidade'],['visual','Tema e aparência'],['retencao','Retenção e descarte'],['configuracoes','Configurações e rollout'],['lgpd','Pedidos LGPD'],['cliente','Portal do cliente v2'],['financeiro_cadastros','Cadastros financeiros'],['monitoramento_ext','Central, biometria e automações'],['reclamacoes_colaboradores','Reclamações de colaboradores'],['adm','Pauta, retratos e aprovações'],['cli_financeiro','Financeiro do portal'],['cms','Conteúdo do site'],['seo','SEO e domínios'],['pub_metricas','Mensuração de origem e A/B'],['plt_notificacoes','Preferências e modelos de notificação'],['emp_pwa','App do funcionário: PWA e FAQ'],['pub_faq','FAQ assistida e segmentos']] as const;
export default function TiConsole(){
 const [active,setActive]=useState<string>('bases');
 return <UiTaskWorkspace id="ti-console"><h1>Sistema e tecnologia</h1><p>Administre conteúdo, acessos e ferramentas existentes. Cada operação continua sujeita à autorização da API. Configuração do Ollama e raízes físicas fica no ambiente do servidor, fora do GitHub.</p>
 <nav aria-label="Ferramentas de sistema" className={styles.tools}>{[{name:'Conteúdo e assistentes',keys:['bases','pastas']},{name:'Saúde e operação',keys:['saude','observacao','incidentes','integracoes','dependencias','manutencao','orcamentos','configuracoes']},{name:'Acesso e governança',keys:['acessos','auditoria','backup','privacidade','ambientes','retencao','lgpd','reclamacoes_colaboradores']},{name:'Experiência e comunicação',keys:['avisos','visual','cliente','cms','seo','plt_notificacoes','emp_pwa','pub_faq']},{name:'Gestão e aprovações',keys:['adm']},{name:'Financeiro e cadastros',keys:['financeiro_cadastros','cli_financeiro']},{name:'Inteligência e monitoramento',keys:['monitoramento_ext','pub_metricas']}].map(group=><fieldset key={group.name} className={styles.group}><legend>{group.name}</legend>{tabs.filter(([key])=>group.keys.includes(key)).map(([key,label])=><button key={key} type="button" aria-pressed={active===key} onClick={()=>setActive(key)}>{key==='visual'?'Aparência do site':label}</button>)}</fieldset>)}</nav>
 <section key={active} aria-label={tabs.find(t=>t[0]===active)?.[1]}>
 {active==='bases'&&<AiRagClient/>}{active==='pastas'&&<DirectorySourcesClient/>}{active==='saude'&&<HealthcheckClient/>}{active==='acessos'&&<RbacClient/>}{active==='auditoria'&&<AuditClient/>}{active==='backup'&&<BackupClient/>}{active==='avisos'&&<NotificationsClient/>}{active==='privacidade'&&<PrivacyClient/>}{active==='visual'&&<ThemeClient/>}
 {active==='observacao'&&<ObservabilityClient/>}{active==='incidentes'&&<IncidentClient/>}{active==='integracoes'&&<IntegrationLogClient/>}{active==='dependencias'&&<DependencyClient/>}{active==='manutencao'&&<MaintenanceDocClient/>}{active==='orcamentos'&&<BudgetClient/>}{active==='ambientes'&&<EnvClient/>}{active==='retencao'&&<RetentionClient/>}{active==='configuracoes'&&<ConfigClient/>}{active==='lgpd'&&<LgpdRequestClient/>}{active==='cliente'&&<CliAdvancedClient/>}{active==='financeiro_cadastros'&&<FinRegistryClient/>}{active==='monitoramento_ext'&&<ExtReportingClient/>}{active==='reclamacoes_colaboradores'&&<EmployeeComplaintClient/>}{active==='adm'&&<AdmClient/>}{active==='cli_financeiro'&&<CliFinanceClient/>}{active==='cms'&&<CmsClient/>}{active==='seo'&&<SeoClient/>}{active==='pub_metricas'&&<OriginMetricsClient/>}{active==='plt_notificacoes'&&<NotificationPreferencesClient/>}{active==='emp_pwa'&&<EmpPwaClient/>}
 {active==='pub_faq'&&<PubFaqAssistedClient/>}
 </section></UiTaskWorkspace>;
}
