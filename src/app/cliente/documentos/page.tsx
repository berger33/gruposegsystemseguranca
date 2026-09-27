import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText, FolderOpen, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import styles from "./ClientDocuments.module.css";

export const metadata: Metadata = {
  title: "Prévia de documentos | Grupo SEG System",
  description: "Prévia vazia da futura área de documentos autorizados do portal do cliente.",
};

export default function ClientDocumentsPreviewPage() {
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
        <div className={styles.previewTag}><span /> PRÉVIA · SEM DOCUMENTOS REAIS</div>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>ARQUIVOS AUTORIZADOS</span><h1>Documentos do<br /><em>seu relacionamento.</em></h1><p>Esta tela demonstra a estrutura planejada para consultar arquivos após validação do vínculo e das permissões.</p></div>
          <div className={styles.accessCard}><span><LockKeyhole size={18} /></span><strong>Acesso controlado</strong><p>Na versão real, cada arquivo será autorizado no servidor para o cliente e o escopo corretos.</p></div>
        </div>

        <div className={styles.notice} role="note"><TriangleAlert size={17} /><p><strong>Nenhum arquivo foi carregado.</strong> Esta prévia não contém contratos, documentos, dados de cliente nem links de download.</p></div>

        <section className={styles.documentArea} aria-labelledby="documents-title">
          <div className={styles.areaHeading}><div><span className={styles.eyebrow}>BIBLIOTECA DO PORTAL</span><h2 id="documents-title">Arquivos disponíveis</h2></div><span className={styles.count}>0 arquivos</span></div>
          <div className={styles.emptyState}>
            <span className={styles.folderIcon}><FolderOpen size={24} /></span>
            <h3>Nenhum documento nesta prévia</h3>
            <p>Quando o portal estiver implementado, somente arquivos vinculados ao cliente e expressamente autorizados serão exibidos aqui.</p>
            <span className={styles.emptyRule}><FileText size={14} /> Sem conteúdo demonstrativo inventado</span>
          </div>
        </section>

        <div className={styles.securityNote}><ShieldCheck size={16} /><p>Documentos reais não devem ficar em links públicos previsíveis. A implementação deverá verificar a autorização no servidor a cada consulta e download, respeitando o vínculo e o escopo do cliente.</p></div>
        <footer className={styles.footer}><Link href="/cliente/painel"><ArrowLeft size={13} /> Voltar ao painel</Link><span>Protótipo visual · sem autenticação, consulta ou persistência</span></footer>
      </section>
    </main>
  );
}
