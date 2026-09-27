import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, FileText, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import styles from "./ClientContracts.module.css";

export const metadata: Metadata = {
  title: "Prévia de contratos e serviços | Grupo SEG System",
  description: "Prévia vazia da futura área de contratos e serviços autorizados do portal do cliente.",
};

export default function ClientContractsPreviewPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/cliente/painel" aria-label="Voltar ao painel do cliente">
          <span className={styles.brandMark}><ShieldCheck size={20} /></span>
          <span><strong>GRUPO SEG SYSTEM</strong><small>ÁREA DO CLIENTE · PRÉVIA</small></span>
        </Link>
        <Link className={styles.back} href="/cliente/painel"><ArrowLeft size={14} /> Painel do cliente</Link>
      </header>

      <section className={styles.content}>
        <div className={styles.previewTag}><span /> PRÉVIA · SEM DADOS CONTRATUAIS</div>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>RELACIONAMENTO AUTORIZADO</span><h1>Contratos e<br /><em>serviços.</em></h1><p>Estrutura planejada para consultar informações relacionadas ao vínculo confirmado do cliente.</p></div>
          <div className={styles.accessCard}><span><LockKeyhole size={18} /></span><strong>Escopo individual</strong><p>O acesso real dependerá da validação do vínculo e das permissões definidas para cada cliente.</p></div>
        </div>

        <div className={styles.notice} role="note"><TriangleAlert size={17} /><p><strong>Esta prévia não contém cadastros reais.</strong> Não há contratos, valores, unidades, serviços ativos ou informações de clientes para consultar.</p></div>

        <div className={styles.cards}>
          <section className={styles.module} aria-labelledby="contracts-title">
            <div className={styles.moduleHead}><span className={styles.icon}><FileText size={18} /></span><div><span className={styles.eyebrow}>DOCUMENTOS DO VÍNCULO</span><h2 id="contracts-title">Contratos</h2></div></div>
            <div className={styles.empty}><strong>Nenhum contrato disponível</strong><p>Contratos só poderão aparecer depois da validação do vínculo e da autorização no servidor.</p></div>
          </section>
          <section className={styles.module} aria-labelledby="services-title">
            <div className={styles.moduleHead}><span className={styles.icon}><BriefcaseBusiness size={18} /></span><div><span className={styles.eyebrow}>INFORMAÇÕES AUTORIZADAS</span><h2 id="services-title">Serviços</h2></div></div>
            <div className={styles.empty}><strong>Nenhuma informação de serviço</strong><p>Não exibimos nomes de postos, escopos, datas ou condições comerciais nesta demonstração.</p></div>
          </section>
        </div>

        <div className={styles.securityNote}><ShieldCheck size={16} /><p>A implementação deverá verificar, em cada requisição, a identidade, o vínculo e o escopo do cliente. Não confiar em IDs informados pelo navegador nem expor registros de outra empresa ou unidade.</p></div>
        <footer className={styles.footer}><Link href="/cliente/painel"><ArrowLeft size={13} /> Voltar ao painel</Link><Link href="/cliente/documentos">Prévia de documentos <ArrowRight size={13} /></Link></footer>
      </section>
    </main>
  );
}
