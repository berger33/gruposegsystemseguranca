"use client";

import BrandLogo from "@/components/BrandLogo";
import { useState, type FormEvent } from "react";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Building2, Camera, Check,
  ChevronDown, DoorOpen, LockKeyhole, MapPinned, Menu, MessageCircle,
  Radio, ShieldCheck, Sparkles, X,
} from "lucide-react";
import styles from "./Layout06.module.css";

const phone = "551134372217";
const services = [
  { id: "01", title: "Segurança desarmada", icon: ShieldCheck, detail: "Presença preventiva para apoiar a rotina do seu espaço." },
  { id: "02", title: "Portaria e controle de acesso", icon: DoorOpen, detail: "Atenção aos fluxos de chegada, circulação e saída." },
  { id: "03", title: "Monitoramento 24 horas", icon: Radio, detail: "Acompanhamento contínuo e apoio operacional." },
  { id: "04", title: "Câmeras e CFTV", icon: Camera, detail: "Tecnologia de vídeo pensada para cada ambiente." },
  { id: "05", title: "Supervisão e ronda", icon: MapPinned, detail: "Presença de supervisão e acompanhamento dos postos." },
  { id: "06", title: "Limpeza e conservação", icon: Sparkles, detail: "Cuidado e organização nas rotinas de cada ambiente." },
];
const faq = [
  ["Por onde começo?", "Conte o tipo de local e o que gostaria de proteger. A equipe conversa com você para entender as possibilidades."],
  ["Posso pedir mais de um serviço?", "Sim. Marque as frentes que deseja conversar no formulário. A equipe pode orientar sobre a combinação mais adequada após compreender o contexto."],
  ["O formulário envia os dados automaticamente?", "Esta prévia não guarda os dados. Ela prepara uma mensagem para você revisar e enviar pelo WhatsApp."],
];

function whatsapp(message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function Layout06() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const chosen = form.getAll("service").map(String);
    const message = [
      "Olá! Gostaria de conversar sobre uma solução para meu espaço.",
      `Nome: ${String(form.get("name") || "")}`,
      `Telefone: ${String(form.get("phone") || "")}`,
      `Tipo de local: ${String(form.get("property") || "")}`,
      `Serviços de interesse: ${chosen.length ? chosen.join(", ") : "Quero orientação"}`,
      `Mensagem: ${String(form.get("details") || "A combinar")}`,
    ].join("\n");
    window.open(whatsapp(message), "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.site} id="inicio">
      <div className={styles.issueBar}><span><i /> IDEIAS PARA CUIDAR MELHOR <b>·</b> PRÉVIA 06</span><span>GUARULHOS, SP <ArrowUpRight size={11} /></span></div>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="Grupo SEG System — início"><BrandLogo size={48} alt=""/><span><strong>GRUPO SEG</strong><small>SEGURANÇA INTEGRADA</small></span></a>
        <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`} aria-label="Navegação principal"><a href="#ideia" onClick={() => setMenuOpen(false)}>A ideia</a><a href="#servicos" onClick={() => setMenuOpen(false)}>Soluções</a><a href="#contato" onClick={() => setMenuOpen(false)}>Converse com a gente</a></nav>
        <a className={styles.navCta} href="#contato">Começar <ArrowUpRight size={15} /></a>
      </header>

      <section className={styles.hero} id="ideia" aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <div className={styles.heroEyebrow}><span>SEGURANÇA</span><i /> <span>EM CAMADAS</span></div>
          <h1 id="hero-title">Cuidar bem começa <em>por entender.</em></h1>
          <p>Todo espaço tem sua própria rotina. O primeiro passo para protegê-lo é fazer as perguntas certas e conectar pessoas, processos e tecnologia.</p>
          <div className={styles.heroActions}><a className={styles.primary} href="#contato">Conte o que você precisa <ArrowRight size={16} /></a><a className={styles.heroLink} href="#servicos">Ver serviços <ArrowDownRight size={15} /></a></div>
          <div className={styles.heroIndex}><span>01</span><i /><span>UMA CONVERSA</span></div>
        </div>
        <div className={styles.heroArt}>
          <img src="/images/layout-06-blueprint-editorial.png" alt="Ilustração editorial de edifícios conectados em tons de azul" />
          <div className={styles.artVeil} />
          <span className={styles.artStamp}>GRUPO<br />SEG <i>✳</i></span>
          <span className={styles.artCaption}>CIDADE · ESPAÇO · ROTINA</span>
          <div className={styles.artNumber}>06</div>
        </div>
        <div className={styles.heroRail}><span>01 / 06</span><div className={styles.railLine}><i /></div><span>UMA NOVA FORMA DE APRESENTAR</span><a href="#servicos"><ArrowDownRight size={17} /></a></div>
      </section>

      <section className={styles.blueNote}>
        <div className={styles.noteNumber}>A.</div><h2>Segurança não é uma peça isolada.<br /><em>É um sistema de escolhas.</em></h2><p>Presença, organização e tecnologia precisam fazer sentido juntas para cada lugar.</p><span className={styles.noteMark}><LockKeyhole size={19} /></span>
      </section>

      <section className={styles.services} id="servicos">
        <div className={styles.sectionHeading}><div><span className={styles.eyebrowBlue}>02 / ESCOLHA UMA FRENTE</span><h2>Peças que podem<br /><em>trabalhar juntas.</em></h2></div><p>Conheça os serviços apresentados pela empresa. A equipe pode ajudar a entender quais conversas fazem sentido para o seu espaço.</p></div>
        <div className={styles.serviceMosaic}>{services.map(({ id, title, detail, icon: Icon }, index) => <article className={`${styles.serviceCard} ${index === 0 || index === 5 ? styles.serviceCardAccent : ""}`} key={id}><div className={styles.cardTop}><span>{id}</span><Icon size={21} strokeWidth={1.7} /></div><h3>{title}</h3><p>{detail}</p><a href="#contato" aria-label={`Conversar sobre ${title}`}><ArrowUpRight size={16} /></a></article>)}</div>
        <div className={styles.servicesBottom}><span>PROTEÇÃO PATRIMONIAL · ATENDIMENTO · TECNOLOGIA</span><a href="#contato">Montar minha solicitação <ArrowRight size={14} /></a></div>
      </section>

      <section className={styles.context}>
        <div className={styles.contextShape}><span>SEG</span><i>✳</i><span>SYSTEM</span></div>
        <div className={styles.contextCopy}><span className={styles.eyebrowBlue}>03 / O CONTEXTO IMPORTA</span><h2>Condomínio?<br />Empresa?<br /><em>Vamos entender.</em></h2><p>As necessidades mudam conforme o local, o fluxo de pessoas e a rotina da operação. Conte seu cenário — sem precisar saber de antemão qual serviço pedir.</p><a href="#contato">Falar com a equipe <ArrowUpRight size={15} /></a></div>
        <div className={styles.contextTags}><span><Building2 size={16} /> CONDOMÍNIOS</span><span><Building2 size={16} /> EMPRESAS</span><span><Building2 size={16} /> INDÚSTRIAS</span><span><Building2 size={16} /> COMÉRCIOS</span></div>
      </section>

      <section className={styles.contact} id="contato">
        <div className={styles.contactCopy}><span className={styles.eyebrowBlue}>04 / PRÓXIMO PASSO</span><h2>Uma boa conversa muda <em>o ponto de partida.</em></h2><p>Conte um pouco sobre o lugar e as suas dúvidas. Nesta prévia, você revisa os dados antes de abrir o WhatsApp.</p><div className={styles.contactCall}><span>ATENDIMENTO HUMANO</span><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><MessageCircle size={17} /> (11) 3437-2217 <ArrowUpRight size={14} /></a></div><div className={styles.contactCaption}>Sem preços automáticos nesta prévia.</div></div>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.formTitle}><span>VAMOS COMEÇAR PELO BÁSICO</span><span>FORM. 06</span></div>
          <label>Como podemos chamar você?<input name="name" autoComplete="name" required maxLength={100} placeholder="Nome e sobrenome" /></label>
          <div className={styles.formRow}><label>Telefone / WhatsApp<input name="phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="(11) 99999-9999" /></label><label>Seu espaço<select name="property" defaultValue="" required><option value="" disabled>Escolha uma opção</option><option>Condomínio</option><option>Empresa ou comércio</option><option>Indústria</option><option>Instituição</option><option>Outro</option></select></label></div>
          <fieldset><legend>Quais temas quer conversar?</legend><div className={styles.checks}>{services.map(({ id, title }) => <label key={id}><input type="checkbox" name="service" value={title} /><span><Check size={11} /></span>{title}</label>)}</div></fieldset>
          <label>O que mais devemos saber?<textarea name="details" rows={3} maxLength={800} placeholder="Cidade, bairro ou uma dúvida que gostaria de esclarecer..." /></label>
          <label className={styles.consent}><input type="checkbox" required /><span>Esta prévia não armazena os dados. A mensagem será aberta no WhatsApp para você revisar e enviar.</span></label>
          <button className={styles.submit} type="submit">Abrir mensagem <ArrowUpRight size={16} /></button>
        </form>
      </section>

      <section className={styles.faq} id="duvidas"><div className={styles.faqHeading}><span className={styles.eyebrowBlue}>05 / PARA COMEÇAR</span><h2>Algumas respostas.<br /><em>O resto, conversamos.</em></h2><a href={whatsapp("Olá! Tenho uma dúvida sobre os serviços do Grupo SEG System.")} target="_blank" rel="noreferrer">Chamar alguém da equipe <ArrowUpRight size={14} /></a></div><div className={styles.faqList}>{faq.map(([question, answer], index) => <article key={question}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>0{index + 1}</span>{question}<ChevronDown size={17} /></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

      <footer className={styles.footer}><a className={styles.footerBrand} href="#inicio"><BrandLogo size={48} alt=""/><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a><span>PRÉVIA VISUAL · LAYOUT 06</span><a href="/layout-01">Comparar com Layout 01 <ArrowUpRight size={13} /></a></footer>
      <a className={styles.floating} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" aria-label="Falar com a equipe pelo WhatsApp"><MessageCircle size={18} /><span>Vamos conversar</span></a>
    </main>
  );
}
