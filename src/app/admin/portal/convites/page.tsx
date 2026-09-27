"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, Mail, ShieldCheck, UserRoundCheck } from "lucide-react";
import styles from "./InvitationFlow.module.css";

type Stage = "compose" | "email" | "acceptance";
type SimulatedInviteStatus = "valid" | "expired" | "used" | "revoked";

const invitationStatuses: Array<{ id: SimulatedInviteStatus; label: string; title: string; description: string }> = [
  { id: "valid", label: "Válido", title: "Convite dentro do prazo", description: "Demonstração: um convite real só permitiria continuar depois de confirmar o e-mail e validar o vínculo no cadastro central." },
  { id: "expired", label: "Expirado", title: "Este convite expirou", description: "Convites reais deixam de funcionar após 7 dias. A equipe precisará emitir um novo convite após nova verificação." },
  { id: "used", label: "Utilizado", title: "Este convite já foi utilizado", description: "O convite é de uso único. Após o aceite, não pode ser reutilizado para entrar novamente." },
  { id: "revoked", label: "Revogado", title: "Este convite foi revogado", description: "Marcelo ou TI pode revogar um convite antes do aceite. Um link revogado não deve liberar acesso." },
];

const stages: Array<{ id: Stage; label: string }> = [
  { id: "compose", label: "Preparar" },
  { id: "email", label: "Mensagem" },
  { id: "acceptance", label: "Aceite e verificação" },
];

export default function InvitationFlowPreviewPage() {
  const [stage, setStage] = useState<Stage>("compose");
  const [email, setEmail] = useState("");
  const [simulatedStatus, setSimulatedStatus] = useState<SimulatedInviteStatus>("valid");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [resendCount, setResendCount] = useState(0);

  function previewInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStage("email");
  }

  function resetPreview() {
    setStage("compose");
    setEmail("");
    setSimulatedStatus("valid");
    setEmailConfirmed(false);
    setResendCount(0);
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
                <li><Check size={14} /> Conferir o vínculo no cadastro central da empresa.</li>
                <li><Check size={14} /> Marcelo ou TI define e aprova o escopo de acesso.</li>
                <li><Check size={14} /> Convite válido por 7 dias, de uso único e revogável antes do aceite.</li>
              </ul>
              <p>Política definida para orientar o desenvolvimento. O envio e a validação ainda não estão ativos.</p>
            </aside>
          </div>
        ) : stage === "email" ? (
          <section className={styles.previewCard} aria-live="polite">
            <div className={styles.previewHead}><span className={styles.mailIcon}><Mail size={19} /></span><div><span className={styles.cardKicker}>02 · RASCUNHO DE MENSAGEM</span><h2>Prévia do convite</h2></div><span className={styles.demoBadge}>NÃO ENVIADO</span></div>
            <div className={styles.mailFields}><span>Para</span><strong>{email}</strong><span>Assunto</span><strong>Convite demonstrativo · Área do Cliente</strong></div>
            <div className={styles.mailBody}>
              <p>Olá,</p>
              <p>A equipe do Grupo SEG System poderá convidar clientes a acessar a futura Área do Cliente após confirmar a identidade e o vínculo de atendimento.</p>
              <div className={styles.fakeLink}><span>Convite previsto: válido por 7 dias e de uso único. Link real não é gerado nesta prévia.</span><strong>LINK NÃO GERADO</strong></div>
              <p>Após a implementação, a pessoa confirmará o e-mail e definirá uma senha. O vínculo será conferido no cadastro central; Marcelo ou TI aprovará o escopo. Nenhuma dessas ações acontece nesta demonstração.</p>
              <p>Grupo SEG System</p>
            </div>
            <div className={styles.previewActions}><button className={styles.secondary} type="button" onClick={() => setStage("compose")}><ArrowLeft size={15} /> Voltar</button><button className={styles.primary} type="button" onClick={() => setStage("acceptance")}>Ver tela de aceite <ArrowRight size={16} /></button></div>
          </section>
        ) : (
          <section className={styles.acceptanceGrid} aria-live="polite">
            <div className={styles.acceptanceCard}>
              <span className={styles.acceptanceIcon}><UserRoundCheck size={23} /></span>
              <span className={styles.cardKicker}>03 · EXPERIÊNCIA DA PESSOA CONVIDADA</span>
              <h2>{invitationStatuses.find(item => item.id === simulatedStatus)?.title}</h2>
              <p>{invitationStatuses.find(item => item.id === simulatedStatus)?.description}</p>
              <label htmlFor="invite-code">Código ou link de convite</label>
              <input id="invite-code" type="text" value="Nenhum código foi gerado nesta prévia" readOnly />
              <button className={styles.disabledAction} type="button" disabled>Aceite indisponível nesta prévia</button>
              <div className={styles.emailConfirmation}>
                <span className={styles.cardKicker}>CONFIRMAÇÃO DO E-MAIL · SIMULAÇÃO</span>
                <p><strong>Para:</strong> {email || "endereço de teste"}</p>
                <p><strong>Assunto:</strong> Confirme seu e-mail para continuar</p>
                <p>Na implementação, o cliente receberá uma mensagem de confirmação. O link terá validade de 7 dias. Clique nos controles abaixo apenas para visualizar os estados; nenhum e-mail ou link real é enviado.</p>
                <button className={styles.secondary} type="button" aria-pressed={emailConfirmed} onClick={() => setEmailConfirmed(current => !current)}>{emailConfirmed ? "E-mail confirmado · desfazer simulação" : "Simular confirmação do e-mail"}</button>
                {!emailConfirmed && <button className={styles.resendButton} type="button" disabled={resendCount >= 5} onClick={() => setResendCount(count => Math.min(5, count + 1))}>{resendCount >= 5 ? "Limite demonstrativo atingido" : "Simular reenvio do link"}</button>}
                <small className={emailConfirmed ? styles.confirmedNote : ""} role="status">{emailConfirmed ? "E-mail marcado como confirmado nesta demonstração. Isso não cria conta nem libera documentos." : `Reenvios simulados: ${resendCount}/5 por endereço em 24 horas; intervalo mínimo de 2 minutos. ${resendCount > 0 ? "O link anterior foi invalidado na simulação. " : ""}O limite real precisa ser aplicado no servidor.`}</small>
              </div>
              <small>Esta simulação não autentica nem libera acesso.</small>
            </div>
            <aside className={styles.checklist}>
              <h3><ShieldCheck size={18} /> Simular estado do convite</h3>
              <p className={styles.simulatorHelp}>Escolha um estado para visualizar a resposta esperada. Os botões só alteram esta demonstração local.</p>
              <div className={styles.statusChoices} role="group" aria-label="Estado demonstrativo do convite">
                {invitationStatuses.map(item => (
                  <button key={item.id} type="button" className={`${styles.statusChoice} ${simulatedStatus === item.id ? styles.statusChoiceActive : ""}`} aria-pressed={simulatedStatus === item.id} onClick={() => setSimulatedStatus(item.id)}>{item.label}</button>
                ))}
              </div>
              <Link className={styles.primary} href={`/cliente/acesso?demoInvite=${simulatedStatus}`}>Abrir aceite na prévia do cliente <ArrowRight size={14} /></Link>
              <small className={styles.handoffNote}>Transfere apenas o estado demonstrativo — nunca um token, e-mail ou convite real.</small>
              <h3><ShieldCheck size={18} /> Regras confirmadas</h3>
              <div><CircleCheck size={17} /><span><strong>Vínculo confirmado</strong><small>Uma pessoa autorizada verifica a relação com o cliente.</small></span></div>
              <div><CircleCheck size={17} /><span><strong>Permissões definidas</strong><small>O acesso é limitado ao escopo aprovado no servidor.</small></span></div>
              <div><CircleCheck size={17} /><span><strong>Convite com prazo e uso limitados</strong><small>Prazo de 7 dias; uso único; revogável antes do aceite.</small></span></div>
              <div><CircleCheck size={17} /><span><strong>Entrada com senha e e-mail confirmado</strong><small>O cliente confirma o e-mail e define uma senha após aceitar o convite.</small></span></div>
              <div><ShieldCheck size={17} /><span><strong>MFA opcional para clientes</strong><small>Opcional; o cliente escolherá aplicativo autenticador ou código por e-mail. Haverá códigos de recuperação e suporte da equipe após verificação.</small></span></div>
              <button className={styles.secondary} type="button" onClick={() => setStage("email")}><ArrowLeft size={15} /> Voltar à mensagem</button>
            </aside>
          </section>
        )}

        <footer className={styles.footer}><span>Sem banco, conta, envio de e-mail ou link de acesso real.</span><Link href="/cliente">Ver página informativa do portal <ArrowRight size={14} /></Link></footer>
      </section>
    </main>
  );
}
