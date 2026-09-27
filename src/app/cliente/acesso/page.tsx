"use client";

import ClientPortalNavigation from "@/components/ClientPortalNavigation";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import styles from "./ClientAccess.module.css";

type AccessStage = "login" | "invite" | "confirm" | "create" | "complete";
type SimulatedInviteStatus = "valid" | "expired" | "used" | "revoked";

const inviteStatusMessages: Record<SimulatedInviteStatus, string> = {
  valid: "Estado recebido da prévia administrativa: válido. Nenhum código, token ou convite real foi transferido.",
  expired: "Este convite de demonstração está expirado. O aceite não pode continuar; a equipe precisaria avaliar um novo convite.",
  used: "Este convite de demonstração já foi utilizado. O aceite não pode continuar.",
  revoked: "Este convite de demonstração foi revogado. O aceite não pode continuar.",
};

export default function ClientAccessPreviewPage() {
  const [stage, setStage] = useState<AccessStage>("login");
  const [linkedInviteStatus, setLinkedInviteStatus] = useState<SimulatedInviteStatus | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("demoInvite");
    if (status === "valid" || status === "expired" || status === "used" || status === "revoked") {
      setLinkedInviteStatus(status);
      setStage("invite");
    }
  }, []);

  function startInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (linkedInviteStatus && linkedInviteStatus !== "valid") {
      setMessage(inviteStatusMessages[linkedInviteStatus]);
      return;
    }
    setMessage("");
    setStage("confirm");
  }

  function saveDemoPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== passwordAgain) {
      setMessage("As senhas demonstrativas não coincidem. Confira os campos.");
      return;
    }
    setMessage("");
    setPassword("");
    setPasswordAgain("");
    setStage("complete");
  }

  function simulateLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Demonstração: autenticação ainda não está ativa. Nenhum dado foi enviado ou verificado.");
  }

  function resetToLogin() {
    setStage("login");
    setLinkedInviteStatus(null);
    if (typeof window !== "undefined") window.history.replaceState(window.history.state, "", window.location.pathname);
    setPassword("");
    setPasswordAgain("");
    setMessage("");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/cliente" className={styles.back}><ArrowLeft size={15} /> Área do Cliente</Link>
        <span className={styles.brand}><ShieldCheck size={15} /> GRUPO SEG SYSTEM</span>
      </header>
      <ClientPortalNavigation />
      <section className={styles.content}>
        <span className={styles.eyebrow}>PORTAL DO CLIENTE · FLUXO DEMONSTRATIVO</span>
        <h1>{stage === "login" ? <>Acesse sua<br /><em>área reservada.</em></> : stage === "invite" ? <>Ative seu<br /><em>convite.</em></> : stage === "confirm" ? <>Confirme seu<br /><em>e-mail.</em></> : stage === "create" ? <>Crie sua<br /><em>senha.</em></> : <>Tudo pronto<br /><em>na prévia.</em></>}</h1>
        <div className={styles.notice} role="note"><CircleAlert size={18} /><p><strong>Protótipo — não use dados reais.</strong> Não use seu e-mail nem senha verdadeira. Os dados ficam apenas na memória desta página e nunca são enviados ao servidor.</p></div>

        {stage === "login" && (
          <section className={styles.card}>
            <span className={styles.icon}><LockKeyhole size={20} /></span>
            <h2>Entrar no portal</h2>
            <p>O login ainda não está ativo. Use valores fictícios para visualizar a resposta desta tela. A regra planejada aplica, após a 5ª falha, esperas progressivas de 1, 5 e 15 minutos por conta e origem. A contagem zera após login bem-sucedido ou 24 horas sem novas falhas.</p>
            <form onSubmit={simulateLogin}>
              <label htmlFor="login-email">E-mail</label>
              <input id="login-email" type="email" autoComplete="off" required placeholder="teste@exemplo.com" value={email} onChange={event => setEmail(event.target.value)} />
              <label htmlFor="login-password">Senha</label>
              <input id="login-password" type="password" autoComplete="new-password" required placeholder="Senha fictícia" value={password} onChange={event => setPassword(event.target.value)} />
              <button type="submit">Pré-visualizar login <ArrowRight size={15} /></button>
            </form>
            {message && <p className={styles.feedback} role="status">{message}</p>}
            <button className={styles.textButton} type="button" onClick={() => { setStage("invite"); setMessage(""); }}>Tenho um convite · prévia de cadastro <ArrowRight size={14} /></button>
            <Link className={styles.recoveryLink} href="/cliente/recuperar-senha">Esqueci minha senha</Link>
          </section>
        )}

        {stage === "invite" && (
          <section className={styles.card}>
            <span className={styles.icon}><UserRound size={20} /></span>
            <h2>Preparar cadastro por convite</h2>
            <p>Na versão real, o convite será verificado no servidor e o vínculo será conferido no cadastro central.</p>
            {linkedInviteStatus && <div className={linkedInviteStatus === "valid" ? styles.invitePreviewValid : styles.feedback} role="status">{inviteStatusMessages[linkedInviteStatus]}</div>}
            <form onSubmit={startInvitation}>
              {!linkedInviteStatus && <><label htmlFor="invite-demo-code">Código demonstrativo</label><input id="invite-demo-code" type="text" autoComplete="off" required placeholder="Código fictício" /></>}
              <label htmlFor="invite-demo-email">E-mail convidado</label>
              <input id="invite-demo-email" type="email" autoComplete="off" required placeholder="teste@exemplo.com" value={email} onChange={event => setEmail(event.target.value)} />
              <small>{linkedInviteStatus ? "Informe somente um e-mail fictício. O estado veio da prévia administrativa; nenhum endereço ou token foi compartilhado." : "Esta prévia não valida o código. Convites reais serão de uso único e válidos por 7 dias."}</small>
              <button type="submit" disabled={linkedInviteStatus !== null && linkedInviteStatus !== "valid"}>{linkedInviteStatus === "valid" ? "Continuar aceite demonstrativo" : linkedInviteStatus ? "Aceite bloqueado para este estado" : "Simular convite válido"} <ArrowRight size={15} /></button>
              {message && <p className={styles.feedback} role="status">{message}</p>}
            </form>
            <button className={styles.textButton} type="button" onClick={resetToLogin}><ArrowLeft size={14} /> Voltar ao login</button>
          </section>
        )}

        {stage === "confirm" && (
          <section className={styles.card}>
            <span className={styles.icon}><Mail size={20} /></span>
            <h2>Confirme o endereço</h2>
            <p>Prévia de uma mensagem para <strong>{email}</strong>. Na implementação, o link de confirmação valerá 7 dias; os limites de reenvio serão aplicados no servidor.</p>
            <div className={styles.emailDraft}><span>ASSUNTO · Confirme seu e-mail</span><p>Use o link enviado para confirmar que você controla este endereço e continuar a criação da conta.</p><small>LINK NÃO ENVIADO · Esta é uma simulação local.</small></div>
            <button type="button" onClick={() => { setStage("create"); setMessage(""); }}>Simular confirmação do e-mail <Check size={15} /></button>
            <button className={styles.textButton} type="button" onClick={() => setStage("invite")}><ArrowLeft size={14} /> Voltar</button>
          </section>
        )}

        {stage === "create" && (
          <section className={styles.card}>
            <span className={styles.icon}><KeyRound size={20} /></span>
            <h2>Defina uma senha</h2>
            <p>E-mail demonstrativo confirmado: <strong>{email}</strong>. A senha deverá ter pelo menos 12 caracteres; frases-senha são aceitas, sem exigência de maiúscula, número ou símbolo.</p>
            <form onSubmit={saveDemoPassword}>
              <label htmlFor="new-password">Nova senha fictícia</label>
              <input id="new-password" type="password" autoComplete="new-password" required minLength={12} placeholder="12 caracteres ou mais · apenas fictícia" value={password} onChange={event => setPassword(event.target.value)} />
              <label htmlFor="confirm-password">Repita a senha fictícia</label>
              <input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} placeholder="Repita apenas o valor de teste" value={passwordAgain} onChange={event => setPasswordAgain(event.target.value)} />
              <small>A validação real também rejeitará senhas comuns; esta prévia verifica apenas tamanho e correspondência.</small>
              {message && <p className={styles.feedback} role="alert">{message}</p>}
              <button type="submit">Pré-visualizar criação de senha <ArrowRight size={15} /></button>
            </form>
            <small className={styles.fieldNote}>Não salvamos a senha; ela é descartada ao sair ou recarregar a página.</small>
          </section>
        )}

        {stage === "complete" && (
          <section className={styles.card} aria-live="polite">
            <span className={styles.icon}><Check size={20} /></span>
            <h2>Cadastro concluído na prévia</h2>
            <p>O fluxo demonstrativo chegou ao fim para <strong>{email}</strong>. Nenhuma conta foi criada e nenhuma senha foi salva.</p>
            <div className={styles.summary}><span>Convite simulado · verificação de e-mail simulada · senha fictícia conferida</span><span>Sem vínculo real, sessão ou acesso a documentos.</span></div>
            <button type="button" onClick={resetToLogin}>Ver tela de login <ArrowRight size={15} /></button>
          </section>
        )}
        <footer className={styles.footer}><span>Prévia sem autenticação, persistência ou envio de e-mail.</span><Link href="/cliente">Voltar à Área do Cliente</Link></footer>
      </section>
    </main>
  );
}
