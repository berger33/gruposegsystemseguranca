"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Building2, Camera, Check,
  ChevronDown, Headphones, MapPin, Menu, MessageCircle, Radio,
  ShieldCheck, Sparkles, X,
} from "lucide-react";
import styles from "./Layout02.module.css";

const phone = "551134372217";
const phoneLabel = "(11) 3437-2217";
const services = [
  { number: "01", title: "Segurança desarmada", icon: ShieldCheck, detail: "Presença preventiva para proteger pessoas, patrimônio e rotina." },
  { number: "02", title: "Monitoramento 24 horas", icon: Radio, detail: "Acompanhamento contínuo e apoio operacional." },
  { number: "03", title: "Câmeras e CFTV", icon: Camera, detail: "Soluções de vídeo dimensionadas para cada espaço." },
  { number: "04", title: "Portaria e controle de acesso", icon: Building2, detail: "Organização de entradas, saídas e atendimento." },
  { number: "05", title: "Limpeza e conservação", icon: Sparkles, detail: "Cuidado diário com ambientes corporativos e compartilhados." },
  { number: "06", title: "Supervisão e ronda", icon: MapPin, detail: "Acompanhamento de postos e apoio às equipes." },
];

const faq = [
  ["Quais serviços posso combinar?", "Você pode solicitar uma proposta com um ou mais serviços. A equipe avalia o contexto do imóvel e orienta sobre os próximos passos."],
  ["Como funciona a visita técnica?", "Envie uma solicitação com sua preferência de dia ou período. A visita só fica confirmada depois do retorno da equipe."],
  ["O site apresenta preços?", "Esta prévia capta pedidos de orçamento. Não há valores automáticos; a equipe precisa entender cada operação."],
];

function whatsapp(message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function Layout02() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requested = form.getAll("service").map(String);
    const message = [
      "Olá! Gostaria de conversar sobre uma solução de segurança integrada.",
      `Nome: ${String(form.get("name") || "")}`,
      `Telefone: ${String(form.get("phone") || "")}`,
      `Tipo de local: ${String(form.get("property") || "")}`,
      `Serviços de interesse: ${requested.length ? requested.join(", ") : "Preciso de orientação"}`,
      `Detalhes: ${String(form.get("details") || "A combinar")}`,
    ].join("\n");
    window.open(whatsapp(message), "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.site} id="topo">
      <div className={styles.notice}><span><i /> PRÉVIA 02 · CONCEITO CENTRAL</span><span>GRUPO SEG SYSTEM <b>—</b> GUARULHOS, SP</span></div>
      <header className={styles.header}>
        <a className={styles.brand} href="#topo" aria-label="Grupo SEG System, início">
          <span className={styles.brandMark}><ShieldCheck size={25} strokeWidth={1.7} /></span>
          <span><strong>GRUPO <b>SEG</b></strong><small>SEGURANÇA INTEGRADA</small></span>
        </a>
        <button className={styles.menuButton} onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen}>
          {menuOpen ? <X /> : <Menu />}
        </button>
        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`} aria-label="Navegação principal">
          <a href="#solucoes" onClick={() => setMenuOpen(false)}>Soluções</a>
          <a href="#metodo" onClick={() => setMenuOpen(false)}>Como trabalhamos</a>
          <a href="#empresa" onClick={() => setMenuOpen(false)}>A empresa</a>
          <a href="#duvidas" onClick={() => setMenuOpen(false)}>Dúvidas</a>
        </nav>
        <a className={styles.headerCta} href="#contato">Falar com a equipe <ArrowUpRight size={16} /></a>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><span>01</span> SEGURANÇA EM CAMADAS</div>
          <h1 id="hero-title">Atenção em cada detalhe. <em>Presença em cada momento.</em></h1>
          <p>Proteção integrada começa com pessoas preparadas, processos claros e tecnologia adequada ao seu espaço.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#contato">Desenhar uma solução <ArrowRight size={17} /></a>
            <a className={styles.textLink} href="#solucoes">Conhecer serviços <ArrowDown size={15} /></a>
          </div>
          <div className={styles.heroMeta}><span><span className={styles.metaIcon}><MapPin size={16} /></span> Guarulhos e região</span><span><span className={styles.metaIcon}><Headphones size={16} /></span> Atendimento humano</span></div>
        </div>
        <div className={styles.heroVisual}>
          <img className={styles.heroImage} src="/images/layout-02-central-monitoramento.png" alt="Imagem conceitual de uma central moderna de monitoramento patrimonial" />
          <div className={styles.imageTint} />
          <div className={styles.visualHud}><span className={styles.hudPulse} /> CENTRAL · VISÃO INTEGRADA <span className={styles.hudLine} /></div>
          <div className={styles.visualCard}><span className={styles.cardIcon}><Radio size={17} /></span><span><small>TECNOLOGIA + EQUIPE</small><strong>Uma resposta coordenada</strong></span><ArrowUpRight size={16} /></div>
          <span className={styles.imageCaption}>IMAGEM CONCEITUAL · AMBIENTE ILUSTRATIVO</span>
          <div className={styles.heroIndex}><span>SEG</span><b>02</b><span>/ 10</span></div>
        </div>
        <div className={styles.heroFoot}><span>PROTEÇÃO PATRIMONIAL</span><span className={styles.footRule} /><span>PREVENÇÃO</span><span className={styles.footRule} /><span>OPERAÇÃO</span><a href="#solucoes" aria-label="Ver soluções"><ArrowDown size={17} /></a></div>
      </section>

      <section className={styles.intro} id="empresa">
        <div className={styles.introLabel}><span>02 / NOSSA ABORDAGEM</span><span>SEGURANÇA INTEGRADA</span></div>
        <div className={styles.introGrid}>
          <h2>Não é só vigiar.<br /><em>É cuidar do todo.</em></h2>
          <div className={styles.introBody}><p>Uma operação segura depende de decisões que se conectam. Reunimos serviços de segurança, portaria, monitoramento e apoio para atender às necessidades de cada local.</p><a href="#metodo">Entenda nossa abordagem <ArrowRight size={16} /></a></div>
        </div>
        <div className={styles.signalStrip}><span><i /> PESSOAS</span><span>+</span><span><i /> PROCESSOS</span><span>+</span><span><i /> TECNOLOGIA</span><span className={styles.signalNote}>CONSTRUÍDOS EM CONJUNTO</span></div>
      </section>

      <section className={styles.solutions} id="solucoes">
        <div className={styles.sectionTop}><div><span className={styles.sectionLabel}>03 / SERVIÇOS</span><h2>Uma estrutura.<br /><em>As soluções certas.</em></h2></div><p>Escolha um ponto de partida. Nossa equipe ajuda a entender como os serviços podem se integrar à sua operação.</p></div>
        <div className={styles.serviceGrid}>{services.map(({ number, title, detail, icon: Icon }) => <article className={styles.serviceCard} key={number}><div className={styles.serviceCardTop}><span>{number}</span><Icon size={22} strokeWidth={1.7} /></div><h3>{title}</h3><p>{detail}</p><a href="#contato" aria-label={`Solicitar informações sobre ${title}`}><ArrowUpRight size={17} /></a></article>)}</div>
        <div className={styles.solutionsFoot}><span>PROJETOS AVALIADOS CONFORME O LOCAL E A NECESSIDADE</span><a href="#contato">Montar uma solicitação <ArrowRight size={15} /></a></div>
      </section>

      <section className={styles.method} id="metodo">
        <div className={styles.methodAside}><span className={styles.sectionLabel}>04 / COMO COMEÇAMOS</span><h2>Do primeiro contato<br />à <em>proposta.</em></h2><p>Um caminho simples, com conversa e avaliação humana em cada etapa.</p><a className={styles.methodLink} href="#contato">Começar uma conversa <ArrowUpRight size={16} /></a></div>
        <div className={styles.steps}><article><span>01</span><div><h3>Conte o contexto</h3><p>Fale sobre seu espaço, sua rotina e o que precisa proteger.</p></div><ArrowRight size={17} /></article><article><span>02</span><div><h3>A equipe avalia</h3><p>Entendemos os detalhes e, se necessário, combinamos uma visita.</p></div><ArrowRight size={17} /></article><article><span>03</span><div><h3>Receba uma proposta</h3><p>Uma pessoa da equipe retorna com os próximos passos.</p></div><ArrowRight size={17} /></article></div>
      </section>

      <section className={styles.contact} id="contato">
        <div className={styles.contactCopy}><span className={styles.sectionLabel}>05 / FALE COM A SEG</span><h2>Vamos conversar sobre<br /><em>o que importa?</em></h2><p>Conte um pouco sobre seu espaço. Nesta prévia, o formulário prepara uma mensagem para você revisar e enviar pelo WhatsApp.</p><div className={styles.contactInfo}><span><MessageCircle size={17} /> WhatsApp</span><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">{phoneLabel} <ArrowUpRight size={14} /></a></div><div className={styles.contactInfo}><span><MapPin size={17} /> Localização</span><strong>Guarulhos · São Paulo</strong></div></div>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.formHead}><span>NOVA SOLICITAÇÃO</span><span>01 — 01</span></div>
          <label>Seu nome<input name="name" autoComplete="name" placeholder="Nome e sobrenome" required maxLength={100} /></label>
          <div className={styles.formRow}><label>WhatsApp<input name="phone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" required maxLength={30} /></label><label>Tipo de local<select name="property" defaultValue="" required><option value="" disabled>Selecione</option><option>Condomínio</option><option>Empresa ou comércio</option><option>Indústria</option><option>Instituição</option><option>Outro</option></select></label></div>
          <fieldset><legend>O que você procura?</legend><div className={styles.checkGrid}>{services.map(service => <label key={service.number}><input type="checkbox" name="service" value={service.title} /><span><Check size={12} /></span>{service.title}</label>)}</div></fieldset>
          <label>Conte mais (opcional)<textarea name="details" rows={3} maxLength={800} placeholder="Cidade, bairro ou detalhes importantes..." /></label>
          <label className={styles.consent}><input type="checkbox" required /><span>Entendo que esta prévia não armazena os dados. A mensagem será aberta no WhatsApp para eu revisar e enviar.</span></label>
          <button className={styles.submit} type="submit">Preparar mensagem <ArrowUpRight size={17} /></button>
          <small className={styles.formNote}>A equipe confirma disponibilidade e próximos passos.</small>
        </form>
      </section>

      <section className={styles.faq} id="duvidas"><div className={styles.faqHeading}><span className={styles.sectionLabel}>06 / DÚVIDAS FREQUENTES</span><h2>Antes de começar.</h2><a href={`https://wa.me/${phone}?text=${encodeURIComponent("Olá! Tenho uma dúvida sobre os serviços do Grupo SEG System.")}`} target="_blank" rel="noreferrer">Prefere atendimento direto? <ArrowUpRight size={15} /></a></div><div className={styles.faqList}>{faq.map(([question, answer], index) => <article className={styles.faqItem} key={question}><button type="button" aria-expanded={faqOpen === index} onClick={() => setFaqOpen(faqOpen === index ? -1 : index)}><span>0{index + 1}</span>{question}<ChevronDown size={18} /></button>{faqOpen === index && <p>{answer}</p>}</article>)}</div></section>

      <footer className={styles.footer}><a className={styles.footerBrand} href="#topo"><span className={styles.brandMark}><ShieldCheck size={23} /></span><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a><span>Prévia de interface · Layout 02 / Central</span><a href="/layout-01">Comparar com o layout 01 <ArrowUpRight size={14} /></a></footer>
      <a className={styles.floatingContact} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" aria-label="Falar com a equipe pelo WhatsApp"><MessageCircle size={20} /><span>Falar com a equipe</span></a>
    </main>
  );
}
