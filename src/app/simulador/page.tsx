"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Building2, Camera, Check, CheckCircle2, Clock3,
  MapPin, MessageCircle, MonitorDot, Phone, Shield, ShieldCheck, Sparkles,
  Mail, type LucideIcon,
} from "lucide-react";
import { PROPERTY_TYPES, PUBLIC_SERVICES, buildRequestSummary } from "@/lib/service-catalog.mjs";
import styles from "./Simulator.module.css";

const WHATSAPP = "551134372217"; // Número publicado no site atual; confirmar antes da produção.
const EMAIL = "contato@gruposegsystemseguranca.com.br";
const SITE_PHONE = "(11) 3437-2217";

const SERVICE_ICONS: Record<string, LucideIcon> = {
  "Segurança Desarmada": ShieldCheck,
  "Monitoramento 24 Horas": MonitorDot,
  "Câmeras e CFTV": Camera,
  "Portaria e Controle de Acesso": Building2,
  "Limpeza e Conservação": Sparkles,
  "Supervisão e Ronda": MapPin,
};

const STEPS = [
  { id: "espaco", label: "Seu espaço" },
  { id: "servicos", label: "O que você precisa" },
  { id: "contato", label: "Seus dados" },
  { id: "revisao", label: "Revisão" },
] as const;

type Kind = "quote" | "visit";

type FormState = {
  propertyType: string;
  services: string[];
  kind: Kind;
  name: string;
  phone: string;
  city: string;
  visitPreference: string;
  details: string;
  consent: boolean;
};

const INITIAL: FormState = {
  propertyType: "",
  services: [],
  kind: "quote",
  name: "",
  phone: "",
  city: "",
  visitPreference: "",
  details: "",
  consent: false,
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export default function SimulatorPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ message: string; whatsapp: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const propertyQuestion = PROPERTY_TYPES.find(item => item.name === form.propertyType)?.question ?? "";
  const summary = useMemo(
    () => buildRequestSummary({ kind: form.kind, name: form.name, phone: form.phone, city: form.city, propertyType: form.propertyType, services: form.services, visitPreference: form.visitPreference, details: form.details }),
    [form],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setError("");
  }

  function toggleService(name: string) {
    setForm(current => ({
      ...current,
      services: current.services.includes(name) ? current.services.filter(item => item !== name) : [...current.services, name],
    }));
    setError("");
  }

  function goTo(next: number) {
    setStep(next);
    setError("");
    // Devolve o foco ao título da etapa para leitores de tela.
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }

  function validateStep(current: number) {
    if (current === 0 && !form.propertyType) return "Escolha o tipo de imóvel para continuar.";
    if (current === 2) {
      if (form.name.trim().length < 2) return "Informe seu nome.";
      if (digits(form.phone).length < 8 || digits(form.phone).length > 15) return "Informe um telefone com DDD.";
      if (form.city.trim().length < 2) return "Informe a cidade ou o bairro.";
      if (form.kind === "visit" && form.visitPreference.trim().length < 2) return "Informe um dia ou turno de preferência.";
      if (!form.consent) return "É preciso autorizar o registro dos dados para enviar a solicitação.";
    }
    return "";
  }

  function next() {
    const problem = validateStep(step);
    if (problem) {
      setError(problem);
      return;
    }
    goTo(Math.min(step + 1, STEPS.length - 1));
  }

  function back() {
    goTo(Math.max(step - 1, 0));
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setStatus(null);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKind: form.kind,
          name: form.name.trim(),
          phone: form.phone.trim(),
          city: form.city.trim(),
          propertyType: form.propertyType,
          services: form.services,
          visitPreference: form.kind === "visit" ? form.visitPreference.trim() : "",
          details: form.details.trim(),
          consent: form.consent,
          website: "",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.recorded) {
        setError(response.status === 429
          ? "Recebemos muitas tentativas deste dispositivo. Aguarde alguns minutos ou fale com a equipe."
          : "Não foi possível registrar sua solicitação agora. Tente novamente ou fale com a equipe.");
        return;
      }
      setStatus({
        message: form.kind === "visit"
          ? "Solicitação registrada. A visita ainda depende de confirmação de uma pessoa da equipe."
          : "Solicitação registrada. A equipe poderá dar continuidade pelo WhatsApp.",
        whatsapp: `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(summary.join("\n"))}`,
      });
    } catch {
      setError("Não foi possível conectar ao sistema. Tente novamente ou fale com a equipe.");
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    setForm(INITIAL);
    setStatus(null);
    setError("");
    goTo(0);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="Grupo SEG System — voltar ao início">
            <span className={styles.brandSymbol} aria-hidden="true"><Shield size={22} strokeWidth={1.7} /><span>S</span></span>
            <span className={styles.brandWords}><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span>
          </Link>
          <nav className={styles.headerNav} aria-label="Navegação do simulador">
            <Link href="/">Voltar ao site</Link>
            <a href={`tel:+${WHATSAPP}`} aria-label={`Ligar para ${SITE_PHONE}`}><Phone size={15} /> {SITE_PHONE}</a>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <span className={styles.kicker}>MONTAR MINHA SOLICITAÇÃO</span>
          <h1>Conte o que você precisa.<br /><em>A gente cuida do resto.</em></h1>
          <p>Quatro passos curtos para a equipe entender seu espaço. Nenhum preço é calculado aqui: a solicitação é registrada e uma pessoa retorna o contato.</p>
        </section>

        <ol className={styles.steps} aria-label="Etapas do simulador">
          {STEPS.map((item, index) => (
            <li key={item.id} className={index === step ? styles.stepActive : index < step ? styles.stepDone : ""} aria-current={index === step ? "step" : undefined}>
              <span>{index < step ? <Check size={13} strokeWidth={3} /> : `0${index + 1}`}</span>
              <small>{item.label}</small>
            </li>
          ))}
        </ol>

        {status ? (
          <section className={styles.done} aria-live="polite">
            <span className={styles.doneIcon}><CheckCircle2 size={30} /></span>
            <h2>Solicitação registrada</h2>
            <p>{status.message}</p>
            <div className={styles.doneActions}>
              <a className={styles.primaryButton} href={status.whatsapp} target="_blank" rel="noopener noreferrer">Continuar pelo WhatsApp <MessageCircle size={17} /></a>
              <button className={styles.secondaryButton} type="button" onClick={restart}>Registrar outra solicitação</button>
            </div>
            <p className={styles.doneNote}>Guarde este registro: ele entrou na fila da equipe em <strong>/admin/leads</strong>. Nada é confirmado automaticamente.</p>
          </section>
        ) : (
          <div className={styles.workspace}>
            <div className={styles.panel}>
              <h2 ref={headingRef} tabIndex={-1} className={styles.panelTitle}>{STEPS[step].label}</h2>

              {step === 0 && (
                <fieldset className={styles.group}>
                  <legend>Para qual tipo de espaço você procura apoio?</legend>
                  <div className={styles.optionGrid}>
                    {PROPERTY_TYPES.map(item => (
                      <button
                        key={item.name}
                        type="button"
                        className={`${styles.option} ${form.propertyType === item.name ? styles.optionSelected : ""}`}
                        aria-pressed={form.propertyType === item.name}
                        onClick={() => update("propertyType", item.name)}
                      >
                        <Building2 size={19} strokeWidth={1.6} />
                        <span>{item.name}</span>
                        {form.propertyType === item.name && <Check size={15} strokeWidth={3} className={styles.optionTick} />}
                      </button>
                    ))}
                  </div>
                  {propertyQuestion && <p className={styles.question}><Clock3 size={15} /> {propertyQuestion}</p>}
                </fieldset>
              )}

              {step === 1 && (
                <fieldset className={styles.group}>
                  <legend>Quais frentes fazem sentido para você?</legend>
                  <div className={styles.serviceGrid}>
                    {PUBLIC_SERVICES.map(service => {
                      const Icon = SERVICE_ICONS[service.name] ?? Shield;
                      const selected = form.services.includes(service.name);
                      return (
                        <button
                          key={service.name}
                          type="button"
                          className={`${styles.service} ${selected ? styles.serviceSelected : ""}`}
                          aria-pressed={selected}
                          onClick={() => toggleService(service.name)}
                        >
                          <span className={styles.serviceIcon}><Icon size={22} strokeWidth={1.6} /></span>
                          <strong>{service.name}</strong>
                          <small>{service.short}</small>
                          <span className={styles.serviceTick}>{selected && <Check size={13} strokeWidth={3} />}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className={styles.hint}>Pode escolher mais de uma. Se ainda não souber, deixe em branco e a equipe orienta.</p>
                </fieldset>
              )}

              {step === 2 && (
                <div className={styles.group}>
                  <div className={styles.tabs} role="group" aria-label="Tipo de solicitação">
                    <button type="button" className={form.kind === "quote" ? styles.tabSelected : ""} aria-pressed={form.kind === "quote"} onClick={() => update("kind", "quote")}>Quero um orçamento</button>
                    <button type="button" className={form.kind === "visit" ? styles.tabSelected : ""} aria-pressed={form.kind === "visit"} onClick={() => update("kind", "visit")}>Quero solicitar uma visita</button>
                  </div>

                  <div className={styles.fields}>
                    <label className={styles.field}>Seu nome *
                      <input value={form.name} onChange={event => update("name", event.target.value)} autoComplete="name" maxLength={100} placeholder="Como podemos chamar você?" />
                    </label>
                    <label className={styles.field}>Telefone / WhatsApp *
                      <input value={form.phone} onChange={event => update("phone", event.target.value)} inputMode="tel" autoComplete="tel" maxLength={30} placeholder="(11) 99999-9999" />
                    </label>
                    <label className={styles.field}>Cidade / bairro *
                      <input value={form.city} onChange={event => update("city", event.target.value)} maxLength={100} placeholder="Onde fica o imóvel?" />
                    </label>
                    {form.kind === "visit" && (
                      <label className={styles.field}>Dia ou turno de preferência *
                        <input value={form.visitPreference} onChange={event => update("visitPreference", event.target.value)} maxLength={120} placeholder="Ex.: terça-feira à tarde" />
                      </label>
                    )}
                    <label className={`${styles.field} ${styles.fieldFull}`}>Quer contar mais alguma coisa? <span>(opcional)</span>
                      <textarea value={form.details} onChange={event => update("details", event.target.value)} rows={3} maxLength={1000} placeholder="Tamanho do local, dispositivos que já existem, dúvidas..." />
                    </label>
                    <label className={`${styles.consent} ${styles.fieldFull}`}>
                      <input type="checkbox" checked={form.consent} onChange={event => update("consent", event.target.checked)} />
                      <span>Autorizo o registro destes dados para que a equipe do Grupo SEG System responda ao meu pedido. A visita, quando solicitada, só é confirmada por uma pessoa.</span>
                    </label>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className={styles.group}>
                  <dl className={styles.review}>
                    <div><dt>Tipo de imóvel</dt><dd>{form.propertyType}</dd></div>
                    <div><dt>Solicitação</dt><dd>{form.kind === "visit" ? "Visita técnica" : "Orçamento"}</dd></div>
                    <div><dt>Serviços</dt><dd>{form.services.length ? form.services.join(", ") : "Gostaria de orientação"}</dd></div>
                    <div><dt>Contato</dt><dd>{form.name} · {form.phone}<br />{form.city}</dd></div>
                    {form.kind === "visit" && <div><dt>Preferência</dt><dd>{form.visitPreference}</dd></div>}
                    {form.details && <div><dt>Detalhes</dt><dd>{form.details}</dd></div>}
                  </dl>
                  <p className={styles.noPrice}><ShieldCheck size={16} /> Este simulador não exibe preços nem registra uma reserva. Ele envia uma solicitação para a equipe confirmar o próximo passo.</p>
                </div>
              )}

              {error && <p className={styles.error} role="alert">{error}</p>}

              <div className={styles.nav}>
                <button className={styles.secondaryButton} type="button" onClick={back} disabled={step === 0}><ArrowLeft size={16} /> Voltar</button>
                {step < STEPS.length - 1 ? (
                  <button className={styles.primaryButton} type="button" onClick={next}>Continuar <ArrowRight size={16} /></button>
                ) : (
                  <button className={styles.primaryButton} type="button" onClick={submit} disabled={submitting}>{submitting ? "Registrando…" : "Registrar solicitação"} <ArrowRight size={16} /></button>
                )}
              </div>
            </div>

            <aside className={styles.aside}>
              <h2>Sua solicitação</h2>
              <p className={styles.asideIntro}>Resumo do que você está montando.</p>
              {form.propertyType ? (
                <div className={styles.summaryBlock}>
                  <span>Espaço</span>
                  <strong>{form.propertyType}</strong>
                </div>
              ) : (
                <p className={styles.summaryEmpty}>Escolha o tipo de imóvel para começar.</p>
              )}
              <div className={styles.summaryBlock}>
                <span>Serviços</span>
                {form.services.length ? (
                  <ul>{form.services.map(name => <li key={name}><Check size={12} strokeWidth={3} /> {name}</li>)}</ul>
                ) : (
                  <p className={styles.summaryEmpty}>Nenhum selecionado ainda.</p>
                )}
              </div>
              <div className={styles.summaryBlock}>
                <span>Tipo</span>
                <strong>{form.kind === "visit" ? "Solicitar visita" : "Orçamento"}</strong>
              </div>
              <div className={styles.asideNote}>
                <p>Prefere falar direto? <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp <MessageCircle size={13} /></a></p>
                <p>Ou escreva para <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
              </div>
            </aside>
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <span>Grupo SEG System Segurança Integrada · Guarulhos / SP</span>
        <span>Prévia em desenvolvimento — nenhum preço é exibido.</span>
      </footer>
    </div>
  );
}
