"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Building2, Check, ChevronDown,
  DoorOpen, MapPin, Menu, MessageCircle, ShieldCheck, Sparkles, X,
} from "lucide-react";
import styles from "./Layout03.module.css";

const phone = "551134372217";
const services = [
  { number: "01", title: "Portaria e controle de acesso", icon: DoorOpen, note: "Rotinas organizadas para receber, orientar e controlar acessos." },
  { number: "02", title: "Segurança desarmada", icon: ShieldCheck, note: "Presença preventiva e apoio à proteção patrimonial." },
  { number: "03", title: "Limpeza e conservação", icon: Sparkles, note: "Cuidado com os ambientes e as áreas de convivência." },
  { number: "04", title: "Supervisão e ronda", icon: MapPin, note: "Acompanhamento dos postos e apoio às equipes." },
  { number: "05", title: "Monitoramento 24 horas", icon: Building2, note: "Atenção contínua e suporte operacional." },
];
const questions = [
  ["Como peço uma proposta?", "Conte um pouco sobre o imóvel e os serviços de interesse. A equipe conversa com você e avalia os próximos passos."],
  ["Posso solicitar uma visita?", "Sim. Envie seu pedido com a preferência de dia ou período. A equipe confirma a disponibilidade antes de agendar."],
  ["A solicitação fica registrada no site?", "Esta é uma prévia. O botão prepara uma mensagem no WhatsApp para você revisar e enviar; não há armazenamento de dados."],
];

function whatsapp(message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function Layout03() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selected = data.getAll("service").map(String);
    const message = [
      "Olá! Gostaria de conversar com o Grupo SEG System.",
      `Nome: ${String(data.get("name") || "")}`,
      `WhatsApp: ${String(data.get("phone") || "")}`,
      `Tipo de imóvel: ${String(data.get("property") || "")}`,
      `Serviços: ${selected.length ? selected.join(", ") : "Preciso de orientação"}`,
      `Mensagem: ${String(data.get("details") || "A combinar")}`,
    ].join("\n");
    window.open(whatsapp(message), "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.site} id="inicio">
      <div className={styles.topline}><span><i /> PRÉVIA DE INTERFACE 03</span><span>SEGURANÇA INTEGRADA · GUARULHOS / SP</span></div>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="Grupo SEG System — início">
          <span className={styles.brandSeal}><ShieldCheck size={24} /></span>
          <span className={styles.brandType}><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span>
        </a>
        <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`} aria-label="Navegação principal">
          <a href="#servicos" onClick={() => setMenuOpen(false)}>Serviços</a>
          <a href="#jeito" onClick={() => setMenuOpen(false)}>Nosso jeito</a>
          <a href="#duvidas" onClick={() => setMenuOpen(false)}>Dúvidas</a>
        </nav>
        <a className={styles.navCta} href="#contato">Vamos conversar <ArrowUpRight size={15} /></a>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><i /> CUIDADO PRESENTE, TODOS OS DIAS</span>
          <h1 id="hero-title">Segurança também é <em>como fazemos você se sentir.</em></h1>
          <p>Uma chegada tranquila, um ambiente bem cuidado, uma equipe atenta. Proteção integrada acontece nos detalhes que fazem parte da rotina.</p>
          <div className={styles.heroActions}><a className={styles.primaryButton} href="#contato">Conte o que você precisa <ArrowRight size={17} /></a><a className={styles.secondaryLink} href="#servicos">Conheça as soluções <ArrowDown size={15} /></a></div>
          <div className={styles.heroSignature}><span className={styles.signatureLine} /><span>RELAÇÕES DE CONFIANÇA<br /><b>COMEÇAM NO PRIMEIRO CONTATO</b></span></div>
        </div>
        <div className={styles.heroPhoto}>
          <img src="/images/layout-03-atendimento.png" alt="Profissional de portaria acolhe uma visitante em recepção contemporânea" />
          <div className={styles.photoFade} />
          <span className={styles.photoTag}>PRESENÇA QUE ACOLHE <b>·</b> ROTINA QUE FLUI</span>
          <div className={styles.photoNote}><span>01</span><p>O cuidado começa<br />antes mesmo de entrar.</p><ArrowDown size={16} /></div>
        </div>
        <div className={styles.heroFoot}><span>PARA CONDOMÍNIOS</span><i /><span>EMPRESAS</span><i /><span>INDÚSTRIAS</span><a href="#jeito" aria-label="Conheça nosso jeito"><ArrowDown size={16} /></a></div>
      </section>

      <section className={styles.manifesto} id="jeito">
        <div className={styles.manifestoHead}><span>UM JEITO MAIS PRÓXIMO DE CUIDAR</span><span>02 / NOSSA PRESENÇA</span></div>
        <div className={styles.manifestoBody}><span className={styles.quoteMark}>“</span><h2>Por trás de cada serviço, existem pessoas cuidando de <em>pessoas.</em></h2><div className={styles.manifestoText}><p>Por isso, cada solução deve respeitar o ritmo, as necessidades e a realidade do lugar. Escuta, organização e presença fazem parte do trabalho.</p><span className={styles.manifestoRule} /><small>PESSOAS · PROCESSOS · TECNOLOGIA</small></div></div>
        <div className={styles.valueBand}><span>CONFIANÇA SE CONSTRÓI</span><span className={styles.valueDot}>✳</span><span>NO COTIDIANO</span><span className={styles.valueDot}>✳</span><span>COM ATENÇÃO</span></div>
      </section>

      <section className={styles.services} id="servicos">
        <div className={styles.servicesIntro}><span className={styles.kicker}>03 / SOLUÇÕES</span><h2>Uma equipe pronta<br />para <em>somar.</em></h2><p>O site atual apresenta serviços que podem atender diferentes necessidades. Converse com a equipe para entender as possibilidades para o seu espaço.</p><a href="#contato">Fale sobre sua operação <ArrowUpRight size={15} /></a></div>
        <div className={styles.serviceList}>{services.map(({ number, title, icon: Icon, note }) => <article className={styles.serviceItem} key={number}><span className={styles.serviceNumber}>{number}</span><span className={styles.serviceIcon}><Icon size={19} /></span><div className={styles.serviceText}><h3>{title}</h3><p>{note}</p></div><a href="#contato" aria-label={`Falar sobre ${title}`}><ArrowUpRight size={17} /></a></article>)}</div>
      </section>

      <section className={styles.stepsSection}>
        <div className={styles.stepsHeading}><span className={styles.kicker}>04 / UM BOM COMEÇO</span><h2>Vamos por partes.<br /><em>Juntos.</em></h2><p>Um primeiro contato simples dá espaço para entender com calma o que é importante para você.</p></div>
        <div className={styles.stepsGrid}><article><span>01</span><h3>Você conta</h3><p>Fale sobre o imóvel, a rotina e o que gostaria de melhorar.</p><i /></article><article><span>02</span><h3>A gente escuta</h3><p>A equipe conversa com você e entende os detalhes da operação.</p><i /></article><article><span>03</span><h3>Planejamos juntos</h3><p>Se fizer sentido, avaliamos o local e apresentamos os próximos passos.</p><i /></article></div>
      </section>

      <section className={styles.contact} id="contato">
        <div className={styles.contactIntro}><span className={styles.kicker}>05 / PRIMEIRO CONTATO</span><h2>O que você precisa <em>proteger?</em></h2><p>Conte um pouco sobre o seu espaço. Uma pessoa da equipe poderá conversar com você sobre os próximos passos.</p><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><MessageCircle size={17} /> (11) 3437-2217 <ArrowUpRight size={14} /></a></div>
        <form className={styles.form} onSubmit={submitRequest}>
          <div className={styles.formHeading}><span>CONTE PARA NÓS</span><span>SEM COMPROMISSO</span></div>
          <div className={styles.formRow}><label>Seu nome<input name="name" autoComplete="name" required maxLength={100} placeholder="Como podemos chamar você?" /></label><label>Telefone / WhatsApp<input name="phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="(11) 99999-9999" /></label></div>
          <label>Tipo de local<select name="property" required defaultValue=""><option value="" disabled>Selecione uma opção</option><option>Condomínio</option><option>Empresa ou comércio</option><option>Indústria</option><option>Instituição</option><option>Outro</option></select></label>
          <fieldset><legend>Quais serviços gostaria de conhecer?</legend><div className={styles.checks}>{services.map(({ number, title }) => <label key={number}><input type="checkbox" name="service" value={title} /><span><Check size={12} /></span>{title}</label>)}</div></fieldset>
          <label>Tem algo importante para contar?<textarea name="details" rows={3} maxLength={800} placeholder="Cidade, bairro ou alguma necessidade específica..." /></label>
          <label className={styles.consent}><input type="checkbox" required /><span>Esta prévia não armazena seus dados. Ao continuar, uma mensagem será aberta no WhatsApp para você revisar e enviar.</span></label>
          <button className={styles.submit} type="submit">Preparar mensagem <ArrowUpRight size={16} /></button>
        </form>
      </section>

      <section className={styles.faq} id="duvidas"><div className={styles.faqTitle}><span className={styles.kicker}>06 / DÚVIDAS</span><h2>Estamos aqui<br />para ajudar.</h2><p>Se preferir, fale diretamente com a equipe.</p><a href={`https://wa.me/${phone}?text=${encodeURIComponent("Olá! Tenho uma dúvida sobre os serviços do Grupo SEG System.")}`} target="_blank" rel="noreferrer">Falar com uma pessoa <ArrowUpRight size={14} /></a></div><div className={styles.faqList}>{questions.map(([question, answer], index) => <article key={question}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>0{index + 1}</span>{question}<ChevronDown size={18} /></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

      <footer className={styles.footer}><a className={styles.footerBrand} href="#inicio"><span className={styles.brandSeal}><ShieldCheck size={21} /></span><span className={styles.brandType}><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a><span>Uma prévia em desenvolvimento · Layout 03</span><a href="/">Comparar com o Layout 01 <ArrowUpRight size={14} /></a></footer>
      <a className={styles.floatContact} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" aria-label="Conversar pelo WhatsApp"><MessageCircle size={19} /><span>Vamos conversar</span></a>
    </main>
  );
}
