"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight, ArrowUpRight, Camera, Check, ChevronDown,
  DoorOpen, MapPin, MessageCircle, Radio, ShieldCheck, Sparkles,
} from "lucide-react";
import styles from "./Layout08.module.css";

const phone = "551134372217";
const services = [
  { id: "01", title: "Segurança desarmada", detail: "Presença preventiva e apoio à proteção patrimonial.", icon: ShieldCheck },
  { id: "02", title: "Portaria e controle de acesso", detail: "Organização de acessos, circulação e atendimento.", icon: DoorOpen },
  { id: "03", title: "Monitoramento 24 horas", detail: "Acompanhamento contínuo e suporte operacional.", icon: Radio },
  { id: "04", title: "Câmeras e CFTV", detail: "Soluções de vídeo avaliadas para cada ambiente.", icon: Camera },
  { id: "05", title: "Supervisão e ronda", detail: "Acompanhamento dos postos e suporte às equipes.", icon: MapPin },
  { id: "06", title: "Limpeza e conservação", detail: "Cuidado e organização nas rotinas do espaço.", icon: Sparkles },
];
const nodeClasses = [styles.nodeOne, styles.nodeTwo, styles.nodeThree, styles.nodeFour, styles.nodeFive, styles.nodeSix];
const faq = [
  ["Preciso escolher um único serviço?", "Não. Marque todas as frentes sobre as quais gostaria de conversar. A equipe ajuda a entender as possibilidades depois de conhecer o local."],
  ["O diagrama representa um sistema em funcionamento?", "Não. É uma representação visual conceitual das frentes de serviço apresentadas pela empresa."],
  ["Como envio meu pedido?", "Esta prévia monta uma mensagem no WhatsApp para você conferir e enviar. Nenhum dado é armazenado nesta página."],
];

function whatsapp(message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function Layout08() {
  const [selected, setSelected] = useState<string[]>([]);
  const [openFaq, setOpenFaq] = useState(0);

  function toggleService(title: string) {
    setSelected(current => current.includes(title) ? current.filter(item => item !== title) : [...current, title]);
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = [
      "Olá! Gostaria de entender soluções de segurança para meu espaço.",
      `Nome: ${String(form.get("name") || "")}`,
      `Telefone: ${String(form.get("phone") || "")}`,
      `Tipo de local: ${String(form.get("property") || "")}`,
      `Frentes selecionadas: ${selected.length ? selected.join(", ") : "Quero orientação"}`,
      `Detalhes: ${String(form.get("details") || "A combinar")}`,
    ].join("\n");
    window.open(whatsapp(message), "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.site} id="inicio">
      <div className={styles.topStrip}><span><i /> LAYOUT 08 <b>/</b> NÚCLEO INTEGRADO</span><span>GRUPO SEG SYSTEM <i /> GUARULHOS, SP</span></div>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="Grupo SEG System — início"><span className={styles.brandMark}><ShieldCheck size={24} /></span><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a>
        <nav className={styles.nav} aria-label="Navegação principal"><a href="#nucleo">O núcleo</a><a href="#frentes">Frentes de serviço</a><a href="#metodo">Como começar</a><a href="#duvidas">Dúvidas</a></nav>
        <a className={styles.headerCta} href="#contato">Fale com a equipe <ArrowUpRight size={15} /></a>
      </header>

      <section className={styles.hero} id="nucleo" aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><i /> PROTEÇÃO EM CONJUNTO</span>
          <h1 id="hero-title">Várias frentes.<br /><em>Um núcleo de cuidado.</em></h1>
          <p>Segurança, acesso, monitoramento e serviços podem se conectar de formas diferentes. O ponto de partida é entender o que seu espaço precisa.</p>
          <a className={styles.heroButton} href="#frentes">Explore as frentes <ArrowRight size={16} /></a>
          <div className={styles.heroFoot}><span>UM DIAGRAMA CONCEITUAL</span><i /> SELECIONE OS SERVIÇOS QUE QUER DISCUTIR</div>
        </div>
        <div className={styles.orbitWrap}>
          <div className={styles.orbitLabel}><span>SEG / 08</span><i /> MAPA DE SERVIÇOS</div>
          <div className={styles.orbitDiagram}>
            <div className={styles.orbitRingOuter} /><div className={styles.orbitRingInner} />
            <span className={`${styles.orbitDot} ${styles.dotTop}`} /><span className={`${styles.orbitDot} ${styles.dotRight}`} /><span className={`${styles.orbitDot} ${styles.dotBottom}`} /><span className={`${styles.orbitDot} ${styles.dotLeft}`} />
            <div className={styles.core}><span className={styles.coreShield}><ShieldCheck size={27} /></span><strong>SEG</strong><small>NÚCLEO<br />INTEGRADO</small><i /></div>
            {services.map(({ id, title, icon: Icon }, index) => {
              const active = selected.includes(title);
              return <button type="button" key={id} className={`${styles.orbitNode} ${nodeClasses[index]} ${active ? styles.nodeActive : ""}`} aria-pressed={active} onClick={() => toggleService(title)}><span className={styles.nodeIcon}>{active ? <Check size={16} /> : <Icon size={17} />}</span><span className={styles.nodeWords}><small>{id} / SERVIÇO</small><b>{title}</b></span></button>;
            })}
          </div>
          <div className={styles.orbitSummary}><span><i /> INTERAÇÃO</span><b>{selected.length ? `${selected.length} frente${selected.length > 1 ? "s" : ""} selecionada${selected.length > 1 ? "s" : ""}` : "Toque em uma frente para explorar"}</b></div>
        </div>
      </section>

      <section className={styles.serviceSection} id="frentes">
        <div className={styles.serviceHeader}><span className={styles.sectionNum}>01 <i /> VISÃO DO NÚCLEO</span><h2>Serviços que podem conversar<br /><em>entre si — e com você.</em></h2><p>Selecione as frentes no diagrama ou use os atalhos abaixo. Sua seleção é apenas uma ajuda para iniciar a conversa.</p></div>
        <div className={styles.serviceRows}>{services.map(({ id, title, detail, icon: Icon }) => <button type="button" key={id} onClick={() => toggleService(title)} className={`${styles.serviceRow} ${selected.includes(title) ? styles.rowSelected : ""}`} aria-pressed={selected.includes(title)}><span className={styles.rowId}>{id}</span><span className={styles.rowIcon}><Icon size={18} /></span><span className={styles.rowText}><strong>{title}</strong><small>{detail}</small></span><span className={styles.rowAction}>{selected.includes(title) ? <Check size={16} /> : <ArrowUpRight size={16} />}</span></button>)}</div>
        <div className={styles.serviceFooter}><span>INFORMAÇÕES DO SITE ATUAL · ESCOPO A CONFIRMAR COM A EQUIPE</span><a href="#contato">Continuar para contato <ArrowRight size={14} /></a></div>
      </section>

      <section className={styles.method} id="metodo">
        <div className={styles.methodHeader}><span className={styles.sectionNum}>02 <i /> PRÓXIMO PASSO</span><h2>Da intenção<br /><em>à conversa.</em></h2><p>Um roteiro simples, sem presumir o que você precisa antes de ouvir o contexto.</p></div>
        <div className={styles.methodSteps}><article><span>A</span><div><small>OBSERVAR</small><h3>Apresente o espaço</h3><p>Conte se é condomínio, empresa, comércio ou outro ambiente.</p></div></article><article><span>B</span><div><small>CONVERSAR</small><h3>Escolha as frentes</h3><p>Marque o que já conhece ou peça orientação sobre as opções.</p></div></article><article><span>C</span><div><small>ALINHAR</small><h3>Combine o próximo passo</h3><p>A equipe avalia a necessidade e, se preciso, confirma uma visita.</p></div></article></div>
      </section>

      <section className={styles.contact} id="contato">
        <div className={styles.contactCopy}><span className={styles.sectionNum}>03 <i /> CONTATO</span><h2>Leve as escolhas do diagrama <em>para uma conversa real.</em></h2><p>Os serviços selecionados acima entram na mensagem preparada para sua revisão.</p><div className={styles.selectedList}>{selected.length ? selected.map((name, index) => <span key={name}><b>{String(index + 1).padStart(2, "0")}</b>{name}</span>) : <span className={styles.emptySelection}>Nenhuma frente selecionada — a equipe pode ajudar.</span>}</div><a className={styles.directLink} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><MessageCircle size={17} /> (11) 3437-2217 <ArrowUpRight size={14} /></a></div>
        <form className={styles.form} onSubmit={submitRequest}>
          <div className={styles.formHeader}><span>INICIAR UMA SOLICITAÇÃO</span><span>08 / 01</span></div>
          <label>Seu nome<input name="name" autoComplete="name" placeholder="Nome e sobrenome" required maxLength={100} /></label>
          <div className={styles.formRow}><label>Telefone / WhatsApp<input name="phone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" required maxLength={30} /></label><label>Tipo de local<select name="property" defaultValue="" required><option value="" disabled>Selecione</option><option>Condomínio</option><option>Empresa ou comércio</option><option>Indústria</option><option>Instituição</option><option>Outro</option></select></label></div>
          <label>O que gostaria que a equipe soubesse?<textarea name="details" rows={3} maxLength={800} placeholder="Cidade, bairro ou uma necessidade importante..." /></label>
          <label className={styles.consent}><input type="checkbox" required /><span>Esta prévia não armazena os dados. A mensagem será aberta no WhatsApp para você revisar e enviar.</span></label>
          <button className={styles.submit} type="submit">Preparar mensagem <ArrowUpRight size={15} /></button>
        </form>
      </section>

      <section className={styles.faq} id="duvidas"><div className={styles.faqTitle}><span className={styles.sectionNum}>04 <i /> DÚVIDAS</span><h2>Sobre as conexões.</h2><a href={whatsapp("Olá! Tenho uma dúvida sobre os serviços do Grupo SEG System.")} target="_blank" rel="noreferrer">Falar com uma pessoa <ArrowUpRight size={14} /></a></div><div className={styles.faqList}>{faq.map(([question, answer], index) => <article key={question}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>0{index + 1}</span>{question}<ChevronDown size={17} /></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

      <footer className={styles.footer}><a className={styles.footerBrand} href="#inicio"><span className={styles.brandMark}><ShieldCheck size={20} /></span><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a><span>PRÉVIA CONCEITUAL · LAYOUT 08</span><a href="/layout-01">Ver Layout 01 <ArrowUpRight size={13} /></a></footer>
    </main>
  );
}
