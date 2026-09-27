"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, ClipboardCheck, LockKeyhole, ShieldCheck, UserRoundPlus } from "lucide-react";
import styles from "./SelfRegistration.module.css";

type PreviewState = "pending" | "verified" | null;

export default function SelfRegistrationPreviewPage() {
  const [previewState, setPreviewState] = useState<PreviewState>(null);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/portal" className={styles.back}><ArrowLeft size={15} /> Configuração do portal</Link>
        <span className={styles.headerLabel}><UserRoundPlus size={14} /> AUTOCADASTRO VERIFICADO</span>
      </header>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>PORTAL DO CLIENTE · MODO ALTERNATIVO</span><h1>Cadastro iniciado<br /><em>com acesso restrito.</em></h1><p>Prévia do modo de autocadastro, mantendo a verificação do vínculo antes de qualquer autorização.</p></div>
          <Link className={styles.clientLink} href="/cliente">Página informativa do cliente <ArrowRight size={14} /></Link>
        </div>

        <div className={styles.notice} role="note"><CircleAlert size={18} /><p><strong>Simulação sem cadastro real.</strong> Não há formulário de dados pessoais, validação de vínculo, conta ou acesso a documentos. Os estados abaixo são apenas demonstrações visuais.</p></div>

        <section className={styles.process} aria-labelledby="process-title">
          <div className={styles.sectionHead}><span className={styles.sectionLabel}>FLUXO PREVISTO</span><h2 id="process-title">Autocadastro não significa acesso automático</h2><p>A conta e o escopo só poderiam ser habilitados após validações no servidor e definição da política administrativa.</p></div>
          <div className={styles.steps}>
            <article><span className={styles.number}>01</span><span className={styles.icon}><UserRoundPlus size={20} /></span><strong>Iniciar cadastro</strong><small>Campos e método de identificação ainda serão definidos.</small></article>
            <ArrowRight className={styles.connector} size={17} />
            <article><span className={styles.number}>02</span><span className={styles.icon}><ClipboardCheck size={20} /></span><strong>Verificar vínculo</strong><small>A relação com o cliente é confirmada por regra autorizada.</small></article>
            <ArrowRight className={styles.connector} size={17} />
            <article><span className={styles.number}>03</span><span className={styles.icon}><LockKeyhole size={20} /></span><strong>Definir permissões</strong><small>Somente o escopo aprovado fica disponível.</small></article>
          </div>
        </section>

        <section className={styles.previewSection} aria-labelledby="preview-title">
          <div className={styles.previewHeading}><div><span className={styles.sectionLabel}>PRÉVIA INTERATIVA · SEM REGISTRO</span><h2 id="preview-title">Escolha um estado para visualizar</h2></div><span className={styles.demoLabel}>NENHUM DADO REAL</span></div>
          <div className={styles.controls} role="group" aria-label="Estados demonstrativos do vínculo">
            <button className={`${styles.stateButton} ${previewState === "pending" ? styles.statePending : ""}`} type="button" aria-pressed={previewState === "pending"} onClick={() => setPreviewState("pending")}><span><CircleAlert size={17} /></span><strong>Vínculo pendente</strong><small>Ver como o acesso permanece bloqueado.</small></button>
            <button className={`${styles.stateButton} ${previewState === "verified" ? styles.stateVerified : ""}`} type="button" aria-pressed={previewState === "verified"} onClick={() => setPreviewState("verified")}><span><CircleCheck size={17} /></span><strong>Vínculo verificado</strong><small>Ver a próxima etapa, sem liberar a conta.</small></button>
          </div>
          {previewState && (
            <div className={`${styles.result} ${previewState === "verified" ? styles.resultVerified : styles.resultPending}`} role="status" aria-live="polite">
              {previewState === "verified" ? <ShieldCheck size={20} /> : <LockKeyhole size={20} />}
              <div>
                <strong>{previewState === "verified" ? "Prévia: vínculo verificado" : "Prévia: aguardando verificação"}</strong>
                <p>{previewState === "verified" ? "A verificação demonstrativa não cria conta. Em produção, uma pessoa ou regra aprovada ainda precisaria definir o escopo e concluir a ativação no servidor." : "O cadastro permaneceria pendente. Contratos e documentos continuariam indisponíveis até a revisão autorizada."}</p>
              </div>
            </div>
          )}
        </section>

        <div className={styles.policy}><ShieldCheck size={18} /><p>O modo inicial continua sendo convite. Autocadastro só deverá ser habilitado por decisão administrativa, com verificação de vínculo, permissões mínimas e trilha de auditoria.</p></div>
        <footer className={styles.footer}><span>Não cria conta, não salva informações e não abre acesso ao portal.</span><Link href="/admin/portal">Voltar às opções de acesso <ArrowLeft size={13} /></Link></footer>
      </section>
    </main>
  );
}
