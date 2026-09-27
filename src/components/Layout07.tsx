"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, Building2,
  Camera, Check, ChevronDown, DoorOpen, MapPin, Menu, MessageCircle,
  Radio, ShieldCheck, Sparkles, X,
} from "lucide-react";
import styles from "./Layout07.module.css";

const phone = "551134372217";
const services = [
  { id: "01", title: "Segurança desarmada", detail: "Presença preventiva para a rotina do local.", icon: ShieldCheck, color: "blue" },
  { id: "02", title: "Portaria e controle de acesso", detail: "Atenção aos fluxos de entrada, saída e atendimento.", icon: DoorOpen, color: "white" },
  { id: "03", title: "Monitoramento 24 horas", detail: "Acompanhamento contínuo e apoio operacional.", icon: Radio, color: "pale" },
  { id: "04", title: "Câmeras e CFTV", detail: "Tecnologia de vídeo pensada para cada ambiente.", icon: Camera, color: "white" },
  { id: "05", title: "Supervisão e ronda", detail: "Acompanhamento dos postos e suporte às equipes.", icon: MapPin, color: "pale" },
  { id: "06", title: "Limpeza e conservação", detail: "Cuidado com as áreas comuns e de trabalho.", icon: Sparkles, color: "blue" },
];
const toneClasses: Record<string, string> = {
  blue: styles.cardBlue,
  white: styles.cardWhite,
  pale: styles.cardPale,
};
const faq = [
  ["Preciso saber qual serviço escolher?", "Não. Conte um pouco sobre o local e sua rotina. A equipe ajuda a entender quais serviços podem fazer sentido."],
  ["Posso selecionar mais de uma frente?", "Sim. Marque todos os temas que gostaria de conversar. A seleção será incluída na mensagem que você revisa antes de enviar."],
  ["A solicitação fica salva nesta página?", "Não nesta prévia. Os dados não são armazenados; uma mensagem será montada para você revisar e enviar pelo WhatsApp."],
];

function whatsapp(message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function Layout07() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [openFaq, setOpenFaq] = useState(0);

  function toggleService(name: string) {
    setSelected(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
  }

  function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = [
      "Olá! Gostaria de conversar sobre segurança para meu espaço.",
      `Nome: ${String(form.get("name") || "")}`,
      `Telefone: ${String(form.get("phone") || "")}`,
      `Tipo de local: ${String(form.get("property") || "")}`,
      `Serviços selecionados: ${selected.length ? selected.join(", ") : "Quero orientação"}`,
      `Detalhes: ${String(form.get("details") || "A combinar")}`,
    ].join("\n");
    window.open(whatsapp(message), "_blank", "noopener,noreferrer");
  }

  return (
    <div className={styles.appShell} id="inicio">
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
        <a className={styles.brand} href="#inicio" aria-label="Grupo SEG System — início"><span className={styles.brandShield}><ShieldCheck size={23} /></span><span><strong>GRUPO<br />SEG SYSTEM</strong><small>SEGURANÇA<br />INTEGRADA</small></span></a>
        <div className={styles.sideRule}><span>MAPA DE CUIDADO</span><i /></div>
        <nav className={styles.sideNav} aria-label="Navegação do site"><a href="#mapa" onClick={() => setMenuOpen(false)}><span>01</span> Visão geral</a><a href="#servicos" onClick={() => setMenuOpen(false)}><span>02</span> Pontos de cuidado</a><a href="#processo" onClick={() => setMenuOpen(false)}><span>03</span> Como começar</a><a href="#contato" onClick={() => setMenuOpen(false)}><span>04</span> Conversar</a><a href="#duvidas" onClick={() => setMenuOpen(false)}><span>05</span> Dúvidas</a></nav>
        <div className={styles.sidebarFoot}><span className={styles.sidePulse} /> PRÉVIA VISUAL <b>07 / 10</b></div>
        <a className={styles.sideContact} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><MessageCircle size={17} /><span>Falar com<br />uma pessoa</span><ArrowUpRight size={14} /></a>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
          <span className={styles.breadcrumb}><span>GRUPO SEG SYSTEM</span><i>/</i> MAPA DE CUIDADO</span>
          <span className={styles.topLocation}><MapPin size={14} /> GUARULHOS, SP</span>
          <a className={styles.topCta} href="#contato">Começar uma conversa <ArrowUpRight size={14} /></a>
        </header>

        <section className={styles.hero} id="mapa" aria-labelledby="hero-title">
          <div className={styles.heroVisual}>
            <img src="/images/layout-07-map-blue.png" alt="Mapa conceitual ilustrado de uma cidade em tons de azul" />
            <div className={styles.mapTint} />
            <div className={styles.mapKey}><span><i className={styles.keyCobalt} /> ESPAÇOS</span><span><i className={styles.keySky} /> ROTINAS</span><span><i className={styles.keyWhite} /> PESSOAS</span></div>
            <div className={styles.mapPin}><span><MapPin size={16} /></span><b>SEU CENÁRIO</b></div>
            <div className={styles.mapCoordinate}><span>MAPA ILUSTRATIVO</span><b>07—A</b></div>
            <div className={styles.mapDisc}><ArrowDownRight size={19} /></div>
          </div>
          <div className={styles.heroCopy}>
            <span className={styles.heroKicker}><i /> PRÉVIA 07 <i /> EM CAMADAS</span>
            <h1 id="hero-title">O lugar é o começo de <em>toda boa proteção.</em></h1>
            <p>Entender entradas, pessoas e rotinas ajuda a construir uma conversa mais clara sobre o que seu espaço precisa.</p>
            <a className={styles.heroButton} href="#servicos">Explorar o mapa <ArrowDown size={15} /></a>
            <div className={styles.heroFootnote}><span>01</span><i /> Primeiro, conhecemos o contexto.</div>
          </div>
          <div className={styles.heroBottom}><span>ROTA 01</span><div className={styles.bottomLine}><i /></div><span>DO CONTEXTO À CONVERSA</span><a href="#servicos"><ArrowDownRight size={16} /></a></div>
        </section>

        <section className={styles.selection} id="servicos">
          <div className={styles.selectionHead}><div><span className={styles.sectionIndex}>02 <i /> SERVIÇOS</span><h2>Que ponto do seu espaço<br /><em>merece atenção?</em></h2></div><p>Selecione uma ou mais frentes para levar à conversa. Se ainda não souber, a equipe pode ajudar a identificar por onde começar.</p></div>
          <div className={styles.selectionStatus}><span><i /> SELEÇÃO INTERATIVA</span><b>{selected.length ? `${selected.length} ${selected.length === 1 ? "frente selecionada" : "frentes selecionadas"}` : "Toque nos cartões para selecionar"}</b></div>
          <div className={styles.mapGrid}>{services.map(({ id, title, detail, icon: Icon, color }) => {
            const active = selected.includes(title);
            return <button type="button" key={id} aria-pressed={active} onClick={() => toggleService(title)} className={`${styles.serviceCard} ${toneClasses[color]} ${active ? styles.cardSelected : ""}`}><div className={styles.serviceTop}><span>{id}</span><span className={styles.checkDot}>{active ? <Check size={12} /> : <Icon size={16} />}</span></div><h3>{title}</h3><p>{detail}</p><span className={styles.cardMore}>{active ? "SELECIONADO" : "ADICIONAR À CONVERSA"}<ArrowUpRight size={13} /></span></button>;
          })}</div>
          <div className={styles.selectionFoot}><span>AS OPÇÕES SÃO INICIAIS; A EQUIPE AJUDA A ENTENDER O ESCOPO.</span><a href="#contato">Levar seleção para o contato <ArrowRight size={14} /></a></div>
        </section>

        <section className={styles.routeSection} id="processo">
          <div className={styles.routeIntro}><span className={styles.sectionIndex}>03 <i /> CAMINHO</span><h2>Um próximo passo<br /><em>de cada vez.</em></h2><p>Uma conversa bem orientada pode começar com poucas informações e avançar conforme a necessidade.</p></div>
          <div className={styles.routeSteps}><article><span className={styles.routeNum}>A</span><div><small>OBSERVAR</small><h3>Conte sobre o lugar</h3><p>Tipo de imóvel, localização e rotina de acesso.</p></div><ArrowRight size={17} /></article><article><span className={styles.routeNum}>B</span><div><small>ENTENDER</small><h3>Converse com a equipe</h3><p>Compartilhe o que gostaria de proteger ou organizar.</p></div><ArrowRight size={17} /></article><article><span className={styles.routeNum}>C</span><div><small>AVANÇAR</small><h3>Combine próximos passos</h3><p>Quando fizer sentido, a equipe pode confirmar uma visita.</p></div><ArrowRight size={17} /></article></div>
        </section>

        <section className={styles.contact} id="contato">
          <div className={styles.contactSide}><span className={styles.sectionIndex}>04 <i /> CONTATO</span><h2>Leve o seu cenário<br /><em>para a conversa.</em></h2><p>Selecione os pontos de cuidado acima ou deixe que a equipe ajude você a começar.</p><div className={styles.selectedChips}>{selected.length ? selected.map(name => <span key={name}><i />{name}</span>) : <span className={styles.emptyChip}>Nenhum serviço selecionado — tudo bem.</span>}</div><a className={styles.directContact} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Atendimento humano <ArrowUpRight size={14} /></a></div>
          <form className={styles.form} onSubmit={submitLead}>
            <div className={styles.formHeading}><span>UM PRIMEIRO CONTATO</span><span>07 / 01</span></div>
            <label>Seu nome<input name="name" autoComplete="name" placeholder="Nome e sobrenome" required maxLength={100} /></label>
            <div className={styles.formRow}><label>Telefone / WhatsApp<input name="phone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" required maxLength={30} /></label><label>Tipo de local<select name="property" defaultValue="" required><option value="" disabled>Selecione</option><option>Condomínio</option><option>Empresa ou comércio</option><option>Indústria</option><option>Instituição</option><option>Outro</option></select></label></div>
            <label>Mais contexto<textarea name="details" rows={3} maxLength={800} placeholder="Cidade, bairro ou uma dúvida que gostaria de esclarecer..." /></label>
            <label className={styles.consent}><input type="checkbox" required /><span>Esta prévia não armazena dados. A mensagem será aberta no WhatsApp para você revisar e enviar.</span></label>
            <button className={styles.submit} type="submit">Preparar mensagem <ArrowUpRight size={15} /></button>
          </form>
        </section>

        <section className={styles.faq} id="duvidas"><div className={styles.faqIntro}><span className={styles.sectionIndex}>05 <i /> DÚVIDAS</span><h2>Se o mapa ainda não estiver claro, <em>pergunte.</em></h2><a href={whatsapp("Olá! Tenho uma dúvida sobre os serviços do Grupo SEG System.")} target="_blank" rel="noreferrer">Falar com uma pessoa <ArrowUpRight size={14} /></a></div><div className={styles.faqList}>{faq.map(([question, answer], index) => <article key={question}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>0{index + 1}</span>{question}<ChevronDown size={17} /></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

        <footer className={styles.footer}><a className={styles.footerBrand} href="#inicio"><span className={styles.brandShield}><ShieldCheck size={20} /></span><span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span></a><span>MAPA DE CUIDADO · LAYOUT 07</span><a href="/">Voltar ao layout 01 <ArrowUpRight size={13} /></a></footer>
      </main>
      <a className={styles.floating} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" aria-label="Conversar com a equipe pelo WhatsApp"><MessageCircle size={18} /><span>Falar com a equipe</span></a>
    </div>
  );
}
