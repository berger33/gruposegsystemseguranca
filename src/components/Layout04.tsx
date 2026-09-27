"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Building2, Camera, Check,
  ChevronDown, ClipboardCheck, DoorOpen, Menu, MessageCircle, Radio,
  ShieldCheck, Sparkles, X,
} from "lucide-react";
import styles from "./Layout04.module.css";

const phone = "551134372217";
const items = [
  { id: "01", title: "Portaria e controle de acesso", summary: "Rotinas organizadas para entradas, saídas e atendimento.", icon: DoorOpen },
  { id: "02", title: "Segurança desarmada", summary: "Presença preventiva alinhada às características de cada local.", icon: ShieldCheck },
  { id: "03", title: "Monitoramento 24 horas", summary: "Acompanhamento contínuo e apoio operacional.", icon: Radio },
  { id: "04", title: "Câmeras e CFTV", summary: "Soluções de vídeo planejadas para o ambiente.", icon: Camera },
  { id: "05", title: "Supervisão e ronda", summary: "Acompanhamento de postos e suporte às equipes.", icon: ClipboardCheck },
  { id: "06", title: "Limpeza e conservação", summary: "Rotinas para manter áreas de trabalho e circulação cuidadas.", icon: Sparkles },
];
const questions = [
  ["A proposta depende de uma visita?", "Algumas necessidades exigem conhecer o local. Você pode solicitar uma visita; a equipe confirma a disponibilidade antes do agendamento."],
  ["Posso combinar vários serviços?", "Sim. Selecione os serviços de interesse no formulário. A equipe avalia o contexto e conversa com você sobre as opções."],
  ["Esta prévia registra a solicitação?", "Não. O formulário monta uma mensagem para você revisar e enviar pelo WhatsApp; esta página não armazena dados."],
];

function whatsapp(message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function Layout04() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openQuestion, setOpenQuestion] = useState(0);

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selected = form.getAll("service").map(String);
    const message = [
      "Olá! Quero conversar sobre segurança para minha operação.",
      `Nome: ${String(form.get("name") || "")}`,
      `WhatsApp: ${String(form.get("phone") || "")}`,
      `Tipo de local: ${String(form.get("property") || "")}`,
      `Serviços de interesse: ${selected.length ? selected.join(", ") : "Preciso de orientação"}`,
      `Detalhes: ${String(form.get("details") || "A combinar")}`,
    ].join("\n");
    window.open(whatsapp(message), "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.site} id="inicio">
      <div className={styles.systemBar}><span><i /> PRÉVIA 04 <b>/</b> OPERAÇÃO</span><span>GRUPO SEG SYSTEM <b>—</b> GUARULHOS, SP</span></div>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="Grupo SEG System, início"><span className={styles.brandIcon}><ShieldCheck size={23} /></span><span><strong>SEG<span> / </span>SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a>
        <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`} aria-label="Navegação principal"><a href="#solucoes" onClick={() => setMenuOpen(false)}>Soluções</a><a href="#metodo" onClick={() => setMenuOpen(false)}>Método</a><a href="#setores" onClick={() => setMenuOpen(false)}>Atuação</a><a href="#duvidas" onClick={() => setMenuOpen(false)}>FAQ</a></nav>
        <a className={styles.headerCta} href="#contato">Solicitar avaliação <ArrowUpRight size={15} /></a>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <div className={styles.kicker}><span className={styles.kickerMark}>04</span> PROTEÇÃO PARA A ROTINA DA OPERAÇÃO</div>
          <h1 id="hero-title">Estrutura forte.<br /><em>Presença constante.</em></h1>
          <p>Segurança e serviços integrados, organizados para acompanhar as necessidades de cada ambiente — do acesso às rotinas diárias.</p>
          <div className={styles.heroButtons}><a className={styles.primaryButton} href="#contato">Mapear minha necessidade <ArrowRight size={16} /></a><a className={styles.secondaryButton} href="#solucoes">Ver soluções <ArrowDown size={15} /></a></div>
          <div className={styles.heroStamp}><span>SEG</span><b>PREVENÇÃO<br />E CUIDADO</b><span>04 / 10</span></div>
        </div>
        <div className={styles.heroImage}>
          <img src="/images/layout-04-industrial.png" alt="Acesso industrial organizado com guarita e controle de entrada" />
          <div className={styles.imageShade} />
          <div className={styles.imageCorner}><span>ACESSO</span><b>01</b><span>AMBIENTE ILUSTRATIVO</span></div>
          <div className={styles.imageCaption}><span className={styles.orangeTick} /> AVALIAÇÃO CONFORME O LOCAL</div>
        </div>
        <div className={styles.heroRail}><span>SEGURANÇA</span><i /><span>CONTROLE</span><i /><span>SUPERVISÃO</span><a href="#setores"><ArrowDown size={15} /></a></div>
      </section>

      <section className={styles.sectorBand} id="setores"><div className={styles.sectorTitle}><span className={styles.orangeTick} /> AMBIENTES COM ROTINAS DIFERENTES</div><div className={styles.sectorItems}><span><Building2 size={17} /> CONDOMÍNIOS</span><span><Building2 size={17} /> EMPRESAS</span><span><Building2 size={17} /> INDÚSTRIAS</span><span><Building2 size={17} /> COMÉRCIOS</span></div></section>

      <section className={styles.solutions} id="solucoes">
        <div className={styles.sectionHeader}><div><span className={styles.sectionKicker}>01 / SERVIÇOS</span><h2>Uma estrutura de serviços.<br /><em>Um plano para o seu espaço.</em></h2></div><p>Conheça as frentes apresentadas pela empresa. A combinação e o formato dependem da necessidade de cada local e da avaliação da equipe.</p></div>
        <div className={styles.serviceGrid}>{items.map(({ id, title, summary, icon: Icon }) => <article className={styles.serviceCard} key={id}><div className={styles.cardHead}><span>{id}</span><Icon size={20} strokeWidth={1.7} /></div><h3>{title}</h3><p>{summary}</p><a href="#contato" aria-label={`Solicitar informações sobre ${title}`}><ArrowUpRight size={16} /></a></article>)}</div>
        <div className={styles.solutionsFoot}><span>ESCOPO A DEFINIR COM A EQUIPE</span><a href="#contato">Conversar sobre uma solução <ArrowRight size={15} /></a></div>
      </section>

      <section className={styles.method} id="metodo">
        <div className={styles.methodHead}><span className={styles.sectionKicker}>02 / PROCESSO</span><h2>Do local ao plano.<br /><em>Com método.</em></h2><p>Um começo organizado ajuda a entender prioridades antes de propor uma solução.</p></div>
        <div className={styles.methodSteps}><article><div className={styles.stepTop}><span>ETAPA 01</span><i>01</i></div><h3>Levantamento</h3><p>Conversamos sobre o imóvel, os acessos e as rotinas que precisam de atenção.</p></article><article><div className={styles.stepTop}><span>ETAPA 02</span><i>02</i></div><h3>Avaliação</h3><p>Quando necessário, solicitamos uma visita para entender o contexto do local.</p></article><article><div className={styles.stepTop}><span>ETAPA 03</span><i>03</i></div><h3>Proposta</h3><p>A equipe apresenta os próximos passos conforme as informações levantadas.</p></article></div>
      </section>

      <section className={styles.contact} id="contato">
        <div className={styles.contactLead}><span className={styles.sectionKicker}>03 / PRÓXIMO PASSO</span><h2>Vamos desenhar uma resposta <em>adequada ao seu espaço?</em></h2><p>Compartilhe o básico para a equipe entender sua necessidade e retornar a conversa.</p><div className={styles.contactDirect}><span>ATENDIMENTO HUMANO</span><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><MessageCircle size={17} /> (11) 3437-2217 <ArrowUpRight size={14} /></a></div><div className={styles.contactNote}><span className={styles.orangeTick} /> Nenhum preço automático nesta prévia.</div></div>
        <form className={styles.form} onSubmit={submitRequest}>
          <div className={styles.formTop}><span>FORMULÁRIO DE INTERESSE</span><span>04.01</span></div>
          <label>Responsável<input name="name" autoComplete="name" placeholder="Nome e sobrenome" maxLength={100} required /></label>
          <div className={styles.formRow}><label>Telefone / WhatsApp<input name="phone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" maxLength={30} required /></label><label>Tipo de local<select name="property" defaultValue="" required><option value="" disabled>Selecione</option><option>Condomínio</option><option>Empresa ou comércio</option><option>Indústria</option><option>Instituição</option><option>Outro</option></select></label></div>
          <fieldset><legend>SERVIÇOS DE INTERESSE</legend><div className={styles.checkGrid}>{items.map(({ id, title }) => <label key={id}><input type="checkbox" name="service" value={title} /><span><Check size={11} /></span>{title}</label>)}</div></fieldset>
          <label>Resumo da necessidade<textarea name="details" rows={3} maxLength={800} placeholder="Cidade, bairro e detalhes importantes..." /></label>
          <label className={styles.consent}><input type="checkbox" required /><span>Esta prévia não armazena os dados. A mensagem será aberta no WhatsApp para revisão e envio manual.</span></label>
          <button className={styles.submit} type="submit">Preparar solicitação <ArrowUpRight size={16} /></button>
        </form>
      </section>

      <section className={styles.faq} id="duvidas"><div className={styles.faqHeader}><span className={styles.sectionKicker}>04 / PERGUNTAS FREQUENTES</span><h2>Antes da avaliação.</h2><a href={`https://wa.me/${phone}?text=${encodeURIComponent("Olá! Gostaria de saber mais sobre os serviços do Grupo SEG System.")}`} target="_blank" rel="noreferrer">Falar com a equipe <ArrowUpRight size={15} /></a></div><div className={styles.faqList}>{questions.map(([question, answer], index) => <article key={question}><button type="button" aria-expanded={openQuestion === index} onClick={() => setOpenQuestion(openQuestion === index ? -1 : index)}><span>Q.0{index + 1}</span>{question}<ChevronDown size={17} /></button>{openQuestion === index && <p>{answer}</p>}</article>)}</div></section>

      <footer className={styles.footer}><a className={styles.footerBrand} href="#inicio"><span className={styles.brandIcon}><ShieldCheck size={21} /></span><span><strong>SEG <i>/</i> SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a><span>LAYOUT 04 <b>·</b> PRÉVIA EM DESENVOLVIMENTO</span><a href="/layout-01">Comparar com layout 01 <ArrowUpRight size={14} /></a></footer>
      <a className={styles.floating} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" aria-label="Falar pelo WhatsApp"><MessageCircle size={18} /><span>Falar com a equipe</span></a>
    </main>
  );
}
