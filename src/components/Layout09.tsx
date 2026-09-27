"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Building2, Camera, Check,
  ChevronDown, DoorOpen, MessageCircle, Radio, ShieldCheck, Sparkles,
  MapPin, Menu, X,
} from "lucide-react";
import styles from "./Layout09.module.css";

const phone = "551134372217";
const places = [
  { id: "condominio", title: "Condomínio", detail: "Residencial ou comercial", icon: Building2 },
  { id: "empresa", title: "Empresa / comércio", detail: "Escritório, loja ou operação", icon: DoorOpen },
  { id: "industria", title: "Indústria", detail: "Galpão ou área operacional", icon: Radio },
  { id: "outro", title: "Outro espaço", detail: "Conte para a equipe", icon: MapPin },
];
const serviceOptions = [
  { title: "Segurança desarmada", icon: ShieldCheck },
  { title: "Portaria e controle de acesso", icon: DoorOpen },
  { title: "Monitoramento 24 horas", icon: Radio },
  { title: "Câmeras e CFTV", icon: Camera },
  { title: "Supervisão e ronda", icon: MapPin },
  { title: "Limpeza e conservação", icon: Sparkles },
];
const questions = [
  ["Preciso conhecer os serviços antes de começar?", "Não. Escolha o tipo de espaço e marque o que já sabe. Você também pode avançar sem escolher serviços e pedir orientação à equipe."],
  ["O sistema calcula um preço?", "Não. Esta prévia organiza as informações para uma conversa; não calcula nem mostra preços."],
  ["O que acontece ao enviar?", "A prévia abre uma mensagem no WhatsApp para você revisar. Só será enviada se você confirmar no WhatsApp."],
];

function whatsapp(message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function Layout09() {
  const [step, setStep] = useState(1);
  const [place, setPlace] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  function toggleService(title: string) {
    setSelected(current => current.includes(title) ? current.filter(item => item !== title) : [...current, title]);
  }

  function continueStep() {
    if (step < 3) setStep(current => current + 1);
  }

  function sendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const placeTitle = places.find(option => option.id === place)?.title || "Não informado";
    const message = [
      "Olá! Gostaria de conversar sobre uma solução para meu espaço.",
      `Tipo de local: ${placeTitle}`,
      `Nome: ${String(form.get("name") || "")}`,
      `Telefone: ${String(form.get("phone") || "")}`,
      `Serviços de interesse: ${selected.length ? selected.join(", ") : "Gostaria de orientação"}`,
      `Cidade / bairro: ${String(form.get("location") || "")}`,
      `Detalhes: ${String(form.get("details") || "A combinar")}`,
    ].join("\n");
    window.open(whatsapp(message), "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.site} id="inicio">
      <div className={styles.topline}><span><i /> PRÉVIA DE INTERFACE <b>09 / 10</b></span><span>GUARULHOS · SÃO PAULO</span></div>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="Grupo SEG System — início"><span className={styles.brandMark}><ShieldCheck size={22} /></span><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a>
        <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`} aria-label="Navegação principal"><a href="#briefing" onClick={() => setMenuOpen(false)}>Briefing</a><a href="#servicos" onClick={() => setMenuOpen(false)}>Serviços</a><a href="#duvidas" onClick={() => setMenuOpen(false)}>Dúvidas</a></nav>
        <a className={styles.headerCta} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">Falar com a equipe <ArrowUpRight size={14} /></a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroOrb} aria-hidden="true"><span>09</span><i /><b>SEG</b></div>
        <span className={styles.kicker}><i /> UM BRIEFING SIMPLES, COM ATENDIMENTO HUMANO</span>
        <h1>Antes de escolher o serviço,<br /><em>vamos entender o seu espaço.</em></h1>
        <p>Conte o que você precisa proteger. O roteiro abaixo organiza o primeiro contato — sem preço automático e sem compromisso.</p>
        <a className={styles.heroLink} href="#briefing">Começar o briefing <ArrowRight size={16} /></a>
        <div className={styles.heroFoot}><span>CONTEXTO</span><i /><span>INTERESSES</span><i /><span>CONVERSA</span></div>
      </section>

      <section className={styles.briefingZone} id="briefing">
        <div className={styles.zoneHeading}><span className={styles.sectionIndex}>ROTEIRO 09 <i /> PRIMEIRO CONTATO</span><span className={styles.zoneNote}>ROTEIRO EM 3 ETAPAS</span></div>
        <div className={styles.briefingCard}>
          <div className={styles.wizardMain}>
            <div className={styles.progress} aria-label={`Etapa ${step} de 3`}>
              {[1, 2, 3].map(item => <div key={item} className={`${styles.progressStep} ${step >= item ? styles.progressActive : ""}`}><span>{step > item ? <Check size={13} /> : `0${item}`}</span><small>{item === 1 ? "ESPAÇO" : item === 2 ? "INTERESSES" : "CONTATO"}</small></div>)}
            </div>
            <div className={styles.progressLine}><i style={{ width: `${((step - 1) / 2) * 100}%` }} /></div>

            {step === 1 && <div className={styles.stepContent}>
              <span className={styles.stepLabel}>ETAPA 01 · CONTEXTO</span>
              <h2>Que tipo de espaço<br />quer proteger?</h2>
              <p>Isso ajuda a equipe a compreender a rotina. Escolha uma opção para continuar.</p>
              <div className={styles.placeGrid}>{places.map(({ id, title, detail, icon: Icon }) => <button type="button" key={id} aria-pressed={place === id} onClick={() => setPlace(id)} className={`${styles.placeCard} ${place === id ? styles.placeSelected : ""}`}><span className={styles.placeIcon}><Icon size={19} /></span><span><strong>{title}</strong><small>{detail}</small></span><i>{place === id && <Check size={12} />}</i></button>)}</div>
              <div className={styles.stepActions}><span>VOCÊ PODERÁ REVISAR ANTES DE ENVIAR</span><button type="button" className={styles.nextButton} onClick={continueStep} disabled={!place}>Continuar <ArrowRight size={15} /></button></div>
            </div>}

            {step === 2 && <div className={styles.stepContent}>
              <span className={styles.stepLabel}>ETAPA 02 · INTERESSES</span>
              <h2>Quais frentes deseja<br />conversar?</h2>
              <p>Marque o que já sabe. Se ainda estiver em dúvida, pode seguir sem selecionar.</p>
              <div className={styles.serviceGrid}>{serviceOptions.map(({ title, icon: Icon }) => <button type="button" key={title} aria-pressed={selected.includes(title)} onClick={() => toggleService(title)} className={`${styles.serviceOption} ${selected.includes(title) ? styles.serviceOptionSelected : ""}`}><span className={styles.serviceIcon}>{selected.includes(title) ? <Check size={15} /> : <Icon size={17} />}</span><strong>{title}</strong><i>{selected.includes(title) && <Check size={10} />}</i></button>)}</div>
              <div className={styles.stepActions}><button type="button" className={styles.backButton} onClick={() => setStep(1)}><ArrowLeft size={14} /> Voltar</button><button type="button" className={styles.nextButton} onClick={continueStep}>Continuar <ArrowRight size={15} /></button></div>
            </div>}

            {step === 3 && <form className={styles.stepContent} onSubmit={sendRequest}>
              <span className={styles.stepLabel}>ETAPA 03 · CONVERSA</span>
              <h2>Como a equipe pode<br />falar com você?</h2>
              <p>Revise o resumo ao lado e deixe um contato para abrir sua mensagem no WhatsApp.</p>
              <div className={styles.formRow}><label>Seu nome<input name="name" autoComplete="name" required maxLength={100} placeholder="Nome e sobrenome" /></label><label>Telefone / WhatsApp<input name="phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="(11) 99999-9999" /></label></div>
              <label> Cidade / bairro <input name="location" maxLength={100} placeholder="Onde fica o espaço?" /></label>
              <label>Algum detalhe para acrescentar?<textarea name="details" rows={2} maxLength={800} placeholder="Uma dúvida ou informação importante..." /></label>
              <label className={styles.consent}><input type="checkbox" required /><span>Esta prévia não armazena os dados. O WhatsApp será aberto para eu revisar e enviar a mensagem.</span></label>
              <div className={styles.stepActions}><button type="button" className={styles.backButton} onClick={() => setStep(2)}><ArrowLeft size={14} /> Voltar</button><button type="submit" className={styles.submitButton}>Preparar mensagem <ArrowUpRight size={15} /></button></div>
            </form>}
          </div>

          <aside className={styles.summary} aria-live="polite">
            <div className={styles.summaryTop}><span>RESUMO DO BRIEFING</span><span>09.01</span></div>
            <div className={styles.summaryCircle}><span>SEU</span><b>ESPAÇO</b><i><ShieldCheck size={22} /></i></div>
            <div className={styles.summaryBlock}><small>TIPO DE LOCAL</small><strong>{places.find(option => option.id === place)?.title || "Aguardando escolha"}</strong></div>
            <div className={styles.summaryBlock}><small>FRENTES DE INTERESSE</small>{selected.length ? <ul>{selected.map(name => <li key={name}><i />{name}</li>)}</ul> : <strong className={styles.summaryEmpty}>Você pode pedir orientação</strong>}</div>
            <div className={styles.summaryFoot}><span><i /> RASCUNHO LOCAL</span><small>Não é enviado até sua confirmação no WhatsApp.</small></div>
            {step > 1 && <button type="button" className={styles.editSummary} onClick={() => setStep(1)}><ArrowLeft size={13} /> Editar respostas</button>}
          </aside>
        </div>
      </section>

      <section className={styles.serviceIndex} id="servicos"><div className={styles.serviceIndexHeader}><span className={styles.sectionIndex}>SERVIÇOS APRESENTADOS <i /> REFERÊNCIA</span><p>Se preferir, explore as frentes antes de preencher o briefing.</p></div><div className={styles.serviceIndexList}>{serviceOptions.map(({ title }, index) => <div key={title}><span>0{index + 1}</span><strong>{title}</strong><ArrowUpRight size={14} /></div>)}</div></section>

      <section className={styles.faq} id="duvidas"><div className={styles.faqTitle}><span className={styles.sectionIndex}>DÚVIDAS <i /> ANTES DE COMEÇAR</span><h2>Um bom atendimento<br />começa com escuta.</h2><a href={whatsapp("Olá! Tenho uma dúvida sobre os serviços do Grupo SEG System.")} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Falar com a equipe</a></div><div className={styles.faqList}>{questions.map(([question, answer], index) => <article key={question}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>0{index + 1}</span>{question}<ChevronDown size={17} /></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

      <footer className={styles.footer}><a className={styles.footerBrand} href="#inicio"><span className={styles.brandMark}><ShieldCheck size={19} /></span><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a><span>LAYOUT 09 · BRIEFING GUIADO</span><a href="/layout-01">Comparar com Layout 01 <ArrowUpRight size={13} /></a></footer>
    </main>
  );
}
