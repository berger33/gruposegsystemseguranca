"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, Mail, ShieldCheck, UserRoundCheck } from "lucide-react";
import styles from "./InvitationFlow.module.css";

type Stage = "compose" | "email" | "acceptance";

const stages: Array<{ id: Stage; label: string }> = [
  { id: "compose", label: "Preparar" },
  { id: "email", label: "Mensagem" },
  { id: "acceptance", label: "Aceite e verificação" },
];

export default function InvitationFlowPreviewPage() {
  const [stage, setStage] = useState<Stage>("compose");
  const [email, setEmail] = useState("");

  function previewInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStage("email");
  }

  function resetPreview() {
    setStage("compose");
    setEmail("");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/portal" className={styles.back}><ArrowLeft size={15} /> Configuração de acesso</Link>
        <span className={styles.headerLabel}><Mail size={14} /> FLUXO DE CONVITE</span>
      </header>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>PORTAL DO CLIENTE · PRÉVIA DE PROCESSO</span><h1>Convite, aceite<br /><em>e verificação.</em></h1><p>Explore como o fluxo poderá se apresentar. Esta tela não cria nem envia convites.</p></div>
          {stage !== "compose" && <button className={styles.reset} type="button" onClick={resetPreview}>Reiniciar demonstração</button>}
        </div>

        <div className={styles.notice} role="note"><CircleAlert size={19} /><p><strong>Demonstração sem persistência:</strong> não use e-mails reais. O endereço digitado fica apenas na memória desta página e não é enviado a servidor nem a provedor de e-mail. Nenhum código ou link ativo será criado.</p></div>

        <nav className={styles.stepper} aria-label="Etapas do fluxo demonstrativo">
          {stages.map((item, index) => {
            const active = item.id === stage;
            const completed = stages.findIndex(candidate => candidate.id === stage) > index;
            return <div className={`${styles.step} ${active ? styles.stepActive : ""} ${completed ? styles.stepComplete : ""}`} key={item.id} aria-current={active ? "step" : undefined}><span>{completed ? <Check size={13} /> : `0${index + 1}`}</span><strong>{item.label}</strong></div>;
          })}
        </nav>

        {stage === "compose" ? (
          <div className={styles.composeGrid}>
            <form className={styles.formCard} onSubmit={previewInvitation}>
              <span className={styles.cardKicker}>01 · PREPARAÇÃO</span>
              <h2>Pré-visualizar um convite</h2>
              <p>Use um endereço fictício ou de teste. Nenhuma mensagem será enviada.</p>
              <label htmlFor="invite-email">E-mail de demonstração</label>
              <input id="invite-email" name="email" type="email" autoComplete="off" required maxLength={254} placeholder="teste@exemplo.com" value={email} onChange={event => setEmail(event.target.value)} />
              <small className={styles.fieldNote}>Endereço usado apenas para preencher a prévia local.</small>
              <button className={styles.primary} type="submit">Gerar prévia local <ArrowRight size={16} /></button>
            </form>
            <aside className={styles.rulesCard}>
              <span className={styles.rulesIcon}><ShieldCheck size={21} /></span>
              <h2>Antes de um convite real</h2>
              <ul>
                <li><Check size={14} /> Confirmar o vínculo da pessoa com o cliente.</li>
                <li><Check size={14} /> Definir quais contratos e documentos poderão ser acessados.</li>
                <li><Check size={14} /> Estabelecer validade, uso único, reenvio e revogação do convite.</li>
              </ul>
              <p>As regras de validade e operação ainda dependem de decisão e implementação.</p>
            </aside>
          </div>
        ) : stage === "email" ? (
          <section className={styles.previewCard} aria-live="polite">
            <div className={styles.previewHead}><span className={styles.mailIcon}><Mail size={19} /></span><div><span className={styles.cardKicker}>02 · RASCUNHO DE MENSAGEM</span><h2>Prévia do convite</h2></div><span className={styles.demoBadge}>NÃO ENVIADO</span></div>
            <div className={styles.mailFields}><span>Para</span><strong>{email}</strong><span>Assunto</span><strong>Convite demonstrativo · Área do Cliente</strong></div>
            <div className={styles.mailBody}>
              <p>Olá,</p>
              <p>A equipe do Grupo SEG System poderá convidar clientes a acessar a futura Área do Cliente após confirmar a identidade e o vínculo de atendimento.</p>
              <div className={styles.fakeLink}><span>O link de acesso será disponibilizado após a implementação.</span><strong>LINK NÃO GERADO</strong></div>
              <p>Nesta demonstração não foi enviado e-mail, criado código de acesso ou concedida autorização.</p>
              <p>Grupo SEG System</p>
            </div>
            <div className={styles.previewActions}><button className={styles.secondary} type="button" onClick={() => setStage("compose")}><ArrowLeft size={15} /> Voltar</button><button className={styles.primary} type="button" onClick={() => setStage("acceptance")}>Ver tela de aceite <ArrowRight size={16} /></button></div>
          </section>
        ) : (
          <section className={styles.acceptanceGrid} aria-live="polite">
            <div className={styles.acceptanceCard}>
              <span className={styles.acceptanceIcon}><UserRoundCheck size={23} /></span>
              <span className={styles.cardKicker}>03 · EXPERIÊNCIA DA PESSOA CONVIDADA</span>
              <h2>Este convite ainda não está ativo.</h2>
              <p>O fluxo real deverá validar um link assinado e confirmar o vínculo antes de permitir a criação de uma conta.</p>
              <label htmlFor="invite-code">Código ou link de convite</label>
              <input id="invite-code" type="text" value="Nenhum código foi gerado nesta prévia" readOnly />
              <button className={styles.disabledAction} type="button" disabled>Aceite indisponível</button>
              <small>Esta simulação não autentica nem libera acesso.</small>
            </div>
            <aside className={styles.checklist}>
              <h3><ShieldCheck size={18} /> Verificações necessárias</h3>
              <div><CircleCheck size={17} /><span><strong>Vínculo confirmado</strong><small>Uma pessoa autorizada verifica a relação com o cliente.</small></span></div>
              <div><CircleCheck size={17} /><span><strong>Permissões definidas</strong><small>O acesso é limitado ao escopo aprovado no servidor.</small></span></div>
              <div><CircleAlert size={17} /><span><strong>Política do convite pendente</strong><small>Validade, uso único, cancelamento e reenvio precisam ser definidos.</small></span></div>
              <button className={styles.secondary} type="button" onClick={() => setStage("email")}><ArrowLeft size={15} /> Voltar à mensagem</button>
            </aside>
          </section>
        )}

        <footer className={styles.footer}><span>Sem banco, conta, envio de e-mail ou link de acesso real.</span><Link href="/cliente">Ver página informativa do portal <ArrowRight size={14} /></Link></footer>
      </section>
    </main>
  );
}
