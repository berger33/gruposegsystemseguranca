"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight, ArrowUpRight, Camera, Check, ChevronDown, DoorOpen,
  Headphones, MapPin, Menu, MessageCircle, Radio, ShieldCheck, Sparkles, X,
} from "lucide-react";
import styles from "./Layout10.module.css";

const phone = "551134372217";
const services = [
  { id: "01", title: "Segurança desarmada", icon: ShieldCheck, short: "Presença preventiva e atenção às rotinas do espaço.", long: "Converse com a equipe sobre as necessidades de proteção patrimonial e como a presença preventiva pode se integrar ao seu local." },
  { id: "02", title: "Portaria e controle de acesso", icon: DoorOpen, short: "Organização de entradas, saídas e atendimento.", long: "Descreva os fluxos de acesso, horários e pontos de contato para que a equipe entenda o funcionamento do ambiente." },
  { id: "03", title: "Monitoramento 24 horas", icon: Radio, short: "Acompanhamento contínuo e apoio operacional.", long: "Fale sobre o contexto do seu espaço e tire dúvidas sobre as possibilidades de monitoramento apresentadas pela empresa." },
  { id: "04", title: "Câmeras e CFTV", icon: Camera, short: "Soluções de vídeo avaliadas conforme o ambiente.", long: "Conte sobre o local e sua necessidade. A equipe pode conversar sobre a avaliação de sistemas de câmeras e CFTV." },
  { id: "05", title: "Supervisão e ronda", icon: MapPin, short: "Acompanhamento dos postos e apoio às equipes.", long: "Compartilhe o tipo de operação e os pontos que gostaria de discutir sobre supervisão e acompanhamento." },
  { id: "06", title: "Limpeza e conservação", icon: Sparkles, short: "Cuidado e organização das rotinas do espaço.", long: "Converse sobre o uso do espaço, as rotinas de cuidado e as áreas que precisam de atenção." },
];
const faq = [
  ["Os serviços abaixo são etapas em uma sequência?", "Não. A linha é somente uma forma visual de apresentar os serviços. As frentes são independentes e você pode conversar sobre uma ou mais delas."],
  ["Como funciona o primeiro contato?", "Você pode escolher um serviço em foco e enviar uma mensagem pelo WhatsApp. A equipe conversa com você para entender o contexto."],
  ["Este site mostra valores?", "Não. Esta prévia não calcula nem exibe preços. A conversa inicial serve para compreender o local e a necessidade."],
];

function whatsapp(message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function Layout10() {
  const [activeService, setActiveService] = useState(services[0].id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const currentService = services.find(service => service.id === activeService) || services[0];

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = [
      "Olá! Gostaria de conversar sobre uma solução para meu espaço.",
      `Serviço em foco: ${currentService.title}`,
      `Nome: ${String(form.get("name") || "")}`,
      `Telefone: ${String(form.get("phone") || "")}`,
      `Tipo de local: ${String(form.get("property") || "")}`,
      `Cidade / bairro: ${String(form.get("location") || "")}`,
      `Detalhes: ${String(form.get("details") || "A combinar")}`,
    ].join("\n");
    window.open(whatsapp(message), "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.site} id="inicio">
      <div className={styles.topStrip}><span><i /> INTERFACE 10 <b>·</b> LINHA DE CUIDADO</span><span>GRUPO SEG SYSTEM <i /> GUARULHOS / SP</span></div>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="Grupo SEG System — início"><span className={styles.brandMark}><ShieldCheck size={22} /></span><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a>
        <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`} aria-label="Navegação principal"><a href="#frentes" onClick={() => setMenuOpen(false)}>Frentes de cuidado</a><a href="#contato" onClick={() => setMenuOpen(false)}>Contato</a><a href="#duvidas" onClick={() => setMenuOpen(false)}>Dúvidas</a></nav>
        <a className={styles.headerCta} href="#contato">Iniciar conversa <ArrowUpRight size={14} /></a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroIndex}>10<span>/10</span></div>
        <span className={styles.kicker}><i /> UMA APRESENTAÇÃO EM LINHA CONTÍNUA</span>
        <h1>Frentes diferentes.<br /><em>Um cuidado conectado.</em></h1>
        <p>Conheça os serviços apresentados pelo Grupo SEG System e escolha por onde gostaria de começar a conversa.</p>
        <a className={styles.heroCta} href="#frentes">Percorrer as frentes <ArrowRight size={15} /></a>
        <div className={styles.heroFoot}><span>ATENDIMENTO HUMANO</span><i /><span>ESCOPO A CONVERSAR</span><i /><span>SEM PREÇO AUTOMÁTICO</span></div>
      </section>

      <section className={styles.introBand}><span className={styles.introLine} /><p>A linha representa conexão visual, <strong>não uma sequência obrigatória.</strong> As frentes podem ser conversadas individualmente ou em conjunto.</p><span className={styles.introLine} /></section>

      <section className={styles.services} id="frentes">
        <div className={styles.sectionHeader}><div><span className={styles.sectionNum}>01 <i /> FRENTES DE CUIDADO</span><h2>Escolha um ponto<br /><em>para iniciar.</em></h2></div><p>Cada ambiente tem suas próprias rotinas. Selecione um serviço em foco para ver uma breve descrição e iniciar o contato com esse contexto.</p></div>
        <div className={styles.timeline}>
          <div className={styles.timelineSpine} aria-hidden="true"><i /></div>
          {services.map(({ id, title, short, long, icon: Icon }, index) => {
            const active = activeService === id;
            const alignment = index % 2 === 0 ? styles.itemLeft : styles.itemRight;
            return <article key={id} className={`${styles.timelineItem} ${alignment} ${active ? styles.itemActive : ""}`}>
              <button type="button" className={styles.serviceCard} aria-expanded={active} onClick={() => setActiveService(id)}>
                <span className={styles.cardNumber}>{id}</span>
                <span className={styles.cardIcon}><Icon size={19} /></span>
                <span className={styles.cardCopy}><strong>{title}</strong><small>{short}</small>{active && <em>{long}</em>}</span>
                <span className={styles.cardAction}>{active ? <Check size={15} /> : <ArrowUpRight size={15} />}</span>
              </button>
              <span className={styles.timelineNode} aria-hidden="true"><i /></span>
              <span className={styles.timelineEmpty} aria-hidden="true" />
            </article>;
          })}
        </div>
        <div className={styles.serviceFocus}><span><i /> SERVIÇO EM FOCO</span><strong>{currentService.title}</strong><a href="#contato">Conversar sobre esta frente <ArrowRight size={14} /></a></div>
      </section>

      <section className={styles.contact} id="contato">
        <div className={styles.contactCopy}><span className={styles.sectionNum}>02 <i /> CONVERSA</span><h2>Um primeiro contato,<br /><em>com contexto.</em></h2><p>A frente selecionada será incluída na mensagem. Revise os dados antes de abrir o WhatsApp.</p><div className={styles.focusSummary}><span>SERVIÇO EM FOCO</span><strong>{currentService.title}</strong><small>Você pode voltar e selecionar outra frente.</small></div><a className={styles.directContact} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> (11) 3437-2217 <ArrowUpRight size={13} /></a></div>
        <form className={styles.form} onSubmit={submitRequest}>
          <div className={styles.formHeading}><span>FALE COM A EQUIPE</span><span>10.01</span></div>
          <div className={styles.formRow}><label>Seu nome<input name="name" autoComplete="name" required maxLength={100} placeholder="Nome e sobrenome" /></label><label>Telefone / WhatsApp<input name="phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="(11) 99999-9999" /></label></div>
          <div className={styles.formRow}><label>Tipo de local<select name="property" defaultValue="" required><option value="" disabled>Selecione</option><option>Condomínio</option><option>Empresa ou comércio</option><option>Indústria</option><option>Instituição</option><option>Outro</option></select></label><label>Cidade / bairro<input name="location" maxLength={100} placeholder="Onde fica o espaço?" /></label></div>
          <label>O que gostaria de acrescentar?<textarea name="details" rows={3} maxLength={800} placeholder="Uma necessidade ou pergunta importante..." /></label>
          <label className={styles.consent}><input type="checkbox" required /><span>Esta prévia não armazena dados. A mensagem será aberta no WhatsApp para eu revisar e enviar.</span></label>
          <button className={styles.submit} type="submit">Preparar mensagem <ArrowUpRight size={15} /></button>
        </form>
      </section>

      <section className={styles.faq} id="duvidas"><div className={styles.faqIntro}><span className={styles.sectionNum}>03 <i /> DÚVIDAS</span><h2>Se ainda houver<br />uma pergunta.</h2><a href={whatsapp("Olá! Tenho uma dúvida sobre os serviços do Grupo SEG System.")} target="_blank" rel="noreferrer"><Headphones size={15} /> Falar com uma pessoa</a></div><div className={styles.faqList}>{faq.map(([question, answer], index) => <article key={question}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>0{index + 1}</span>{question}<ChevronDown size={17} /></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

      <footer className={styles.footer}><a className={styles.footerBrand} href="#inicio"><span className={styles.brandMark}><ShieldCheck size={19} /></span><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a><span>LAYOUT 10 · LINHA DE CUIDADO</span><a href="/">Comparar com Layout 01 <ArrowUpRight size={13} /></a></footer>
    </main>
  );
}
