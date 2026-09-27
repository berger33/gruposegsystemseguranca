"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Building2, Camera, Check,
  ChevronDown, ClipboardList, DoorOpen, FileCheck2, Menu, MessageCircle,
  Radio, ShieldCheck, Sparkles, X,
} from "lucide-react";
import styles from "./Layout05.module.css";

const phone = "551134372217";
const services = [
  { id: "A1", title: "Segurança desarmada", text: "Presença preventiva e atenção às rotinas patrimoniais.", icon: ShieldCheck },
  { id: "A2", title: "Portaria e controle de acesso", text: "Organização de entradas, saídas e atendimento.", icon: DoorOpen },
  { id: "A3", title: "Monitoramento 24 horas", text: "Acompanhamento contínuo e suporte operacional.", icon: Radio },
  { id: "A4", title: "Câmeras e CFTV", text: "Soluções de vídeo avaliadas conforme o ambiente.", icon: Camera },
  { id: "A5", title: "Supervisão e ronda", text: "Acompanhamento dos postos e apoio às equipes.", icon: ClipboardList },
  { id: "A6", title: "Limpeza e conservação", text: "Apoio às rotinas de cuidado dos espaços.", icon: Sparkles },
];
const faqs = [
  ["Como solicitar uma proposta para minha empresa?", "Use o formulário para apresentar o tipo de local, os serviços de interesse e um contato. A equipe conversa com você para entender o escopo."],
  ["É possível avaliar mais de um serviço?", "Sim. Você pode marcar diferentes frentes no formulário. A combinação final depende da análise da necessidade e do local."],
  ["O orçamento é calculado automaticamente?", "Não nesta prévia. O pedido é encaminhado como conversa para avaliação humana, sem faixa de preço automática."],
];

function whatsapp(message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function Layout05() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  function sendLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selection = form.getAll("service").map(String);
    const message = [
      "Olá! Gostaria de estruturar uma conversa sobre segurança para minha organização.",
      `Contato: ${String(form.get("name") || "")}`,
      `Telefone: ${String(form.get("phone") || "")}`,
      `Organização / local: ${String(form.get("property") || "")}`,
      `Serviços de interesse: ${selection.length ? selection.join(", ") : "Quero orientação"}`,
      `Contexto: ${String(form.get("details") || "A combinar")}`,
    ].join("\n");
    window.open(whatsapp(message), "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.site} id="inicio">
      <div className={styles.topBar}><span><i /> BRIEFING VISUAL <b>05</b></span><span>GRUPO SEG SYSTEM <i /> GUARULHOS / SP</span></div>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="Grupo SEG System, início"><span className={styles.brandMark}><ShieldCheck size={22} /></span><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a>
        <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`} aria-label="Navegação principal"><a href="#solucoes" onClick={() => setMenuOpen(false)}>Soluções</a><a href="#processo" onClick={() => setMenuOpen(false)}>Processo</a><a href="#empresa" onClick={() => setMenuOpen(false)}>Perfil de atendimento</a><a href="#duvidas" onClick={() => setMenuOpen(false)}>Dúvidas</a></nav>
        <a className={styles.headerCta} href="#contato">Solicitar conversa <ArrowUpRight size={15} /></a>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <div className={styles.heroKicker}><span>01</span> SEGURANÇA INTEGRADA · RELACIONAMENTO B2B</div>
          <h1 id="hero-title">Uma operação protegida começa com um <em>escopo bem entendido.</em></h1>
          <p>Converse com a equipe sobre o seu espaço, suas rotinas e os serviços de interesse. O primeiro passo é compreender o contexto.</p>
          <div className={styles.heroActions}><a className={styles.primary} href="#contato">Apresentar minha necessidade <ArrowRight size={16} /></a><a className={styles.linkButton} href="#solucoes">Explorar soluções <ArrowDown size={15} /></a></div>
          <div className={styles.heroByline}><span>PARCERIA</span><i /> <span>PLANEJAMENTO</span><i /> <span>ACOMPANHAMENTO</span></div>
        </div>
        <div className={styles.heroVisual}>
          <img src="/images/layout-05-b2b-building.png" alt="Entrada de um edifício comercial contemporâneo" />
          <div className={styles.visualOverlay} />
          <div className={styles.visualIndex}><span>INSTITUCIONAL</span><b>01</b><span>IMAGEM ILUSTRATIVA</span></div>
          <div className={styles.visualCaption}><span>ACESSO</span><i /> <span>AMBIENTE CORPORATIVO</span></div>
        </div>
        <div className={styles.heroFooter}><span>ENTENDER</span><div /><span>DIMENSIONAR</span><div /><span>CONVERSAR</span><a href="#empresa"><ArrowDown size={15} /></a></div>
      </section>

      <section className={styles.profile} id="empresa">
        <div className={styles.profileLabel}><span>02 / PERFIL DE ATENDIMENTO</span><span>INFORMAÇÃO CLARA, CONVERSA DIRETA</span></div>
        <div className={styles.profileGrid}><h2>Serviços conectados.<br /><em>Escopo construído em conjunto.</em></h2><div className={styles.profileText}><p>O Grupo SEG System apresenta serviços para condomínios, empresas, comércios, indústrias e instituições. A necessidade de cada local orienta a conversa sobre as possibilidades de atendimento.</p><a href="#contato">Fale sobre seu cenário <ArrowUpRight size={15} /></a></div></div>
        <div className={styles.profileFooter}><span><Building2 size={16} /> CONDOMÍNIOS</span><span><Building2 size={16} /> EMPRESAS</span><span><Building2 size={16} /> INDÚSTRIAS</span><span><Building2 size={16} /> COMÉRCIOS</span></div>
      </section>

      <section className={styles.solutions} id="solucoes">
        <div className={styles.sectionHead}><div><span className={styles.sectionKicker}>03 / PORTFÓLIO DE SERVIÇOS</span><h2>Frentes de trabalho<br /><em>em um só diálogo.</em></h2></div><p>Uma apresentação objetiva dos serviços citados no site atual. Marque os temas que deseja discutir e a equipe poderá orientar os próximos passos.</p></div>
        <div className={styles.services}>{services.map(({ id, title, text, icon: Icon }) => <article key={id} className={styles.service}><div className={styles.serviceMeta}><span>{id}</span><Icon size={20} /></div><h3>{title}</h3><p>{text}</p><a href="#contato" aria-label={`Conversar sobre ${title}`}><ArrowUpRight size={16} /></a></article>)}</div>
        <div className={styles.servicesFooter}><span>INFORMAÇÕES SUJEITAS À CONFIRMAÇÃO DA EQUIPE</span><a href="#contato">Solicitar avaliação do escopo <ArrowRight size={14} /></a></div>
      </section>

      <section className={styles.process} id="processo">
        <div className={styles.processIntro}><span className={styles.sectionKicker}>04 / FLUXO DE CONVERSA</span><h2>Uma avaliação<br /><em>bem estruturada.</em></h2><p>Começamos pelas informações essenciais e avançamos com acompanhamento humano.</p></div>
        <div className={styles.processList}><article><span>01</span><div><h3>Contexto</h3><p>Compartilhe tipo de local, rotina e necessidades iniciais.</p></div><FileCheck2 size={19} /></article><article><span>02</span><div><h3>Alinhamento</h3><p>A equipe conversa sobre o escopo e identifica pontos a esclarecer.</p></div><MessageCircle size={19} /></article><article><span>03</span><div><h3>Próximos passos</h3><p>Quando necessário, uma visita pode ser solicitada e confirmada pela equipe.</p></div><ArrowUpRight size={19} /></article></div>
      </section>

      <section className={styles.contact} id="contato">
        <div className={styles.contactCopy}><span className={styles.sectionKicker}>05 / FALE COM A EQUIPE</span><h2>Vamos começar pelo que é <em>importante para você.</em></h2><p>Deixe um contato e uma breve descrição. A prévia monta a mensagem para você revisar antes de enviar pelo WhatsApp.</p><div className={styles.contactRoute}><span>CANAL DIRETO</span><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><MessageCircle size={17} /> (11) 3437-2217 <ArrowUpRight size={14} /></a></div><div className={styles.contactNote}>Sem preços estimados nesta prévia.</div></div>
        <form className={styles.form} onSubmit={sendLead}>
          <div className={styles.formHead}><span>FORMULÁRIO DE INTERESSE</span><span>05.01</span></div>
          <label>Nome do contato<input name="name" autoComplete="name" required maxLength={100} placeholder="Nome e sobrenome" /></label>
          <div className={styles.formRow}><label>Telefone<input name="phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="(11) 99999-9999" /></label><label>Tipo de organização<select name="property" defaultValue="" required><option value="" disabled>Selecione</option><option>Condomínio</option><option>Empresa ou comércio</option><option>Indústria</option><option>Instituição</option><option>Outro</option></select></label></div>
          <fieldset><legend>SERVIÇOS A CONVERSAR</legend><div className={styles.checkGrid}>{services.map(({ id, title }) => <label key={id}><input type="checkbox" name="service" value={title} /><span><Check size={11} /></span>{title}</label>)}</div></fieldset>
          <label>Contexto breve<textarea name="details" rows={3} maxLength={800} placeholder="Cidade, bairro, horários ou detalhes relevantes..." /></label>
          <label className={styles.consent}><input type="checkbox" required /><span>Sei que esta prévia não salva os dados. A mensagem será aberta no WhatsApp para revisão e envio manual.</span></label>
          <button className={styles.submit} type="submit">Preparar mensagem <ArrowUpRight size={16} /></button>
        </form>
      </section>

      <section className={styles.faq} id="duvidas"><div className={styles.faqIntro}><span className={styles.sectionKicker}>06 / PERGUNTAS FREQUENTES</span><h2>Pontos importantes<br />antes da conversa.</h2><a href={whatsapp("Olá! Gostaria de falar sobre os serviços do Grupo SEG System.")} target="_blank" rel="noreferrer">Falar com atendimento humano <ArrowUpRight size={14} /></a></div><div className={styles.faqList}>{faqs.map(([question, answer], index) => <article key={question}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>0{index + 1}</span>{question}<ChevronDown size={18} /></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

      <footer className={styles.footer}><a className={styles.footerBrand} href="#inicio"><span className={styles.brandMark}><ShieldCheck size={20} /></span><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a><span>PRÉVIA VISUAL · LAYOUT 05</span><a href="/">Comparar com Layout 01 <ArrowUpRight size={13} /></a></footer>
      <a className={styles.floating} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" aria-label="Conversar com a equipe pelo WhatsApp"><MessageCircle size={18} /><span>Falar com a equipe</span></a>
    </main>
  );
}
