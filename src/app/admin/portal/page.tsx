"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, CircleHelp, KeyRound, LockKeyhole, UserRoundPlus } from "lucide-react";
import styles from "./PortalAccess.module.css";

type AccessMode = "invite" | "approval" | "self_service";

const modes: Array<{
  id: AccessMode;
  title: string;
  description: string;
  icon: typeof KeyRound;
  previewTitle: string;
  previewText: string;
  previewAction: string;
}> = [
  {
    id: "invite",
    title: "Somente por convite",
    description: "A equipe inicia o acesso e confirma o vínculo do cliente antes de liberar a conta.",
    icon: KeyRound,
    previewTitle: "Você recebeu um convite?",
    previewText: "O acesso será iniciado a partir de um convite individual enviado pela equipe.",
    previewAction: "Acesso por convite",
  },
  {
    id: "approval",
    title: "Solicitação com aprovação",
    description: "A pessoa pode pedir acesso; a equipe analisa e aprova antes de ativar a conta.",
    icon: UserRoundPlus,
    previewTitle: "Solicite acesso ao portal",
    previewText: "Sua solicitação precisará ser verificada e aprovada pela equipe antes de qualquer acesso.",
    previewAction: "Solicitar análise",
  },
  {
    id: "self_service",
    title: "Autocadastro com verificação",
    description: "A pessoa inicia o cadastro; a relação com o cliente ainda precisa ser validada no servidor.",
    icon: CircleHelp,
    previewTitle: "Crie seu acesso",
    previewText: "Mesmo com autocadastro, contratos e documentos só serão liberados após validar seu vínculo.",
    previewAction: "Iniciar cadastro",
  },
];

export default function PortalAccessAdminPage() {
  const [selectedMode, setSelectedMode] = useState<AccessMode>("invite");
  const currentMode = modes.find(mode => mode.id === selectedMode) || modes[0];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/leads" className={styles.back}><ArrowLeft size={15} /> Administração</Link>
        <span className={styles.headerTag}><LockKeyhole size={14} /> PORTAL DO CLIENTE</span>
      </header>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>CONFIGURAÇÃO PLANEJADA · DEMONSTRAÇÃO LOCAL</span>
            <h1>Como o cliente<br /><em>poderá obter acesso.</em></h1>
            <p>Convite é o modo inicial previsto. Compare as opções para orientar a futura configuração administrativa do portal.</p>
          </div>
          <div className={styles.previewLinks}>
            <Link className={styles.previewLink} href="/cliente">Ver página do cliente <ArrowUpRight size={15} /></Link>
            <Link className={styles.previewLink} href="/admin/portal/convites">Prévia do fluxo de convite <ArrowUpRight size={15} /></Link>
            <Link className={styles.previewLink} href="/admin/portal/solicitacoes">Prévia de análise de acesso <ArrowUpRight size={15} /></Link>
            <Link className={styles.previewLink} href="/admin/portal/autocadastro">Prévia de autocadastro <ArrowUpRight size={15} /></Link>
            <Link className={styles.previewLink} href="/admin/portal/alertas">Prévia de alertas de segurança <ArrowUpRight size={15} /></Link>
            <Link className={styles.previewLink} href="/admin/portal/permissoes">Prévia de permissões administrativas <ArrowUpRight size={15} /></Link>
          </div>
        </div>

        <div className={styles.prototypeNotice} role="note">
          <span><CircleHelp size={18} /></span>
          <p><strong>Protótipo sem efeito real.</strong> A escolha abaixo só atualiza esta demonstração enquanto a página estiver aberta. Não salva configuração, não envia solicitações e não altera autenticação nem permissões.</p>
        </div>

        <div className={styles.workspace}>
          <section className={styles.options} aria-labelledby="modes-title">
            <div className={styles.sectionHeading}><span>01 · MODO DE ACESSO</span><h2 id="modes-title">Escolha uma opção para pré-visualizar</h2></div>
            <div className={styles.modeList} role="radiogroup" aria-label="Modo de acesso demonstrativo">
              {modes.map(({ id, title, description, icon: Icon }) => (
                <button key={id} type="button" role="radio" aria-checked={selectedMode === id} className={`${styles.modeCard} ${selectedMode === id ? styles.modeSelected : ""}`} onClick={() => setSelectedMode(id)}>
                  <span className={styles.modeIcon}><Icon size={19} /></span>
                  <span className={styles.modeCopy}><strong>{title}</strong><small>{description}</small></span>
                  <span className={styles.radioMark}>{selectedMode === id && <Check size={13} />}</span>
                </button>
              ))}
            </div>
            <div className={styles.policyNote}><LockKeyhole size={16} /><p>Em qualquer modo, cadastro não deve liberar contratos automaticamente. O vínculo e as permissões precisam ser confirmados no servidor.</p></div>
          </section>

          <aside className={styles.preview} aria-live="polite" aria-label="Prévia demonstrativa para o cliente">
            <div className={styles.previewTop}><span>02 · VISÃO DO CLIENTE</span><span className={styles.previewPill}>SOMENTE PRÉVIA</span></div>
            <div className={styles.clientCard}>
              <span className={styles.clientMark}><LockKeyhole size={20} /></span>
              <small>ÁREA DO CLIENTE</small>
              <h2>{currentMode.previewTitle}</h2>
              <p>{currentMode.previewText}</p>
              <button type="button" className={styles.previewButton} disabled>{currentMode.previewAction}</button>
              <span className={styles.disabledNote}>Indisponível até a implementação do portal.</span>
            </div>
            <div className={styles.previewFooter}><span>Modo demonstrativo selecionado</span><strong>{currentMode.title}</strong></div>
          </aside>
        </div>

        <footer className={styles.footer}>
          <span>Configuração persistida, autenticação e revisão de segurança ficam para uma fase posterior.</span>
          <Link href="/cliente">Abrir página informativa <ArrowUpRight size={13} /></Link>
        </footer>
      </section>
    </main>
  );
}
