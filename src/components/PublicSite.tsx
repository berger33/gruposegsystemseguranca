"use client";

import { useState, type FormEvent } from "react";
import BrandLogo from '@/components/BrandLogo';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Building2, Camera,
  Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, FileText, Headphones,
  LockKeyhole, Mail, MapPin, Menu, MessageCircle, MonitorDot, Phone,
  Send, Shield, ShieldCheck, Sparkles, Users, X, type LucideIcon,
} from "lucide-react";

const WHATSAPP = "551134372217"; // Número publicado no site atual; confirmar antes da produção.
const EMAIL = "contato@gruposegsystemseguranca.com.br";
const SITE_PHONE = "(11) 3437-2217";

type RequestKind = "orcamento" | "visita";

type Service = { name: string; short: string; icon: LucideIcon; number: string };
const services: Service[] = [
  { number: "01", name: "Segurança Desarmada", short: "Presença preventiva, rondas e proteção patrimonial com profissionais preparados.", icon: ShieldCheck },
  { number: "02", name: "Monitoramento 24 Horas", short: "Acompanhamento contínuo e apoio operacional na resposta a ocorrências.", icon: MonitorDot },
  { number: "03", name: "Câmeras e CFTV", short: "Projetos e instalação de sistemas de câmeras dimensionados para seu espaço.", icon: Camera },
  { number: "04", name: "Portaria e Controle de Acesso", short: "Rotinas de entrada, saída, identificação e atendimento para cada operação.", icon: Building2 },
  { number: "05", name: "Limpeza e Conservação", short: "Equipes para ambientes corporativos, condomínios e áreas comerciais.", icon: Sparkles },
  { number: "06", name: "Supervisão e Ronda", short: "Acompanhamento dos postos, visitas programadas e apoio às equipes.", icon: MapPin },
];

const questions = [
  { q: "Quais serviços o Grupo SEG System oferece?", a: "O site atual apresenta segurança desarmada, monitoramento 24 horas, câmeras e CFTV, portaria e controle de acesso, limpeza e conservação, além de supervisão e ronda. Conte-nos sobre sua necessidade para receber orientação." },
  { q: "É possível combinar mais de um serviço?", a: "Você pode selecionar vários serviços no formulário de orçamento. A equipe poderá avaliar uma solução adequada ao seu imóvel e à sua operação." },
  { q: "Como solicito uma visita técnica?", a: "Na seção de orçamento, selecione “Solicitar visita”, informe um período de preferência e envie sua mensagem. A visita só estará agendada após confirmação da equipe." },
  { q: "Vocês atendem condomínios e empresas?", a: "Sim. O site atual apresenta soluções para condomínios, empresas, indústrias, comércios e instituições. Consulte a equipe para confirmar disponibilidade e condições para o seu endereço." },
];

function whatsappLink(message: string) {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand ${compact ? "brand--compact" : ""}`} href="#inicio" aria-label="Grupo SEG System — voltar ao início">
      <BrandLogo size={50} alt=""/>
      <span className="brand__words"><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span>
    </a>
  );
}

export default function PublicSite() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [kind, setKind] = useState<RequestKind>("orcamento");
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [whatsappContinuation, setWhatsappContinuation] = useState("");

  function toggleService(name: string) {
    setSelectedServices(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
  }

  async function sendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const city = String(data.get("city") || "").trim();
    const property = String(data.get("property") || "").trim();
    const details = String(data.get("details") || "").trim();
    const preference = String(data.get("preference") || "").trim();
    const lines = [
      `Olá! Gostaria de ${kind === "visita" ? "solicitar uma visita técnica" : "solicitar um orçamento"} ao Grupo SEG System.`,
      `Nome: ${name}`, `Telefone: ${phone}`, `Cidade/bairro: ${city}`,
      `Tipo de imóvel: ${property}`,
      `Serviços de interesse: ${selectedServices.length ? selectedServices.join(", ") : "Gostaria de orientação"}`,
      ...(kind === "visita" ? [`Preferência de dia/turno: ${preference || "A combinar"}`] : []),
      ...(details ? [`Detalhes: ${details}`] : []),
    ];
    setSubmitting(true);
    setSubmissionMessage("");
    setWhatsappContinuation("");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKind: kind === "visita" ? "visit" : "quote",
          name,
          phone,
          city,
          propertyType: property,
          services: selectedServices,
          visitPreference: preference,
          details,
          consent: data.get("consent") === "on",
          website: String(data.get("website") || ""),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.recorded) {
        setSubmissionMessage(response.status === 429
          ? "Recebemos muitas tentativas deste dispositivo. Aguarde alguns minutos ou fale diretamente com a equipe."
          : "Não foi possível registrar sua solicitação agora. Tente novamente ou fale diretamente com a equipe.");
        return;
      }
      setWhatsappContinuation(whatsappLink(lines.join("\n")));
      setSubmissionMessage(kind === "visita"
        ? "Solicitação registrada. A visita ainda depende de confirmação da equipe. Você pode continuar pelo WhatsApp."
        : "Solicitação registrada. A equipe poderá dar continuidade pelo WhatsApp.");
      form.reset();
      setSelectedServices([]);
    } catch {
      setSubmissionMessage("Não foi possível conectar ao sistema. Tente novamente ou fale diretamente com a equipe.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedAssistantFaq = assistantQuestion === null ? null : questions[assistantQuestion];
  const handoffMessage = selectedAssistantFaq
    ? `Olá! Consultei a FAQ do site e gostaria de falar com uma pessoa sobre esta dúvida:\n${selectedAssistantFaq.q}\nResposta apresentada: ${selectedAssistantFaq.a}`
    : "Olá! Gostaria de falar com uma pessoa da equipe do Grupo SEG System.";

  return (
    <div className="site site--layered" id="inicio">
      <div className="preview-bar"><div className="container preview-bar__inner"><span><span className="preview-dot" /> DEMONSTRAÇÃO DO SISTEMA <span className="preview-bar__extra">· Ambiente de avaliação</span></span><span>Guarulhos, São Paulo <MapPin size={12} /></span></div></div>
      <header className="header">
        <div className="container header__inner">
          <Brand />
          <nav className={`nav ${menuOpen ? "nav--open" : ""}`} aria-label="Navegação principal">
            <a onClick={() => setMenuOpen(false)} href="#servicos">Serviços</a>
            <a onClick={() => setMenuOpen(false)} href="/simulador">Simulador</a>
            <a onClick={() => setMenuOpen(false)} href="#solucoes">Soluções</a>
            <a onClick={() => setMenuOpen(false)} href="#sobre">Sobre</a>
            <a onClick={() => setMenuOpen(false)} href="/cliente">Área do cliente</a>
            <a onClick={() => setMenuOpen(false)} href="#duvidas">Dúvidas</a>
          </nav>
          <div className="header__actions">
            <a className="header__contact" href={`tel:+${WHATSAPP}`} aria-label={`Ligar para ${SITE_PHONE}`}><Phone size={16} /> {SITE_PHONE}</a>
            <a className="button button--small button--primary header__cta" href="#orcamento">Solicitar proposta <ArrowUpRight size={16} /></a>
            <button className="menu-button" type="button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
          </div>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="container hero__grid">
            <div className="hero__content">
              <div className="eyebrow"><span className="eyebrow__line" /> SEGURANÇA <span className="hero-divider" /> EM CAMADAS</div>
              <h1 id="hero-title">Cuidar bem começa <em>por entender.</em></h1>
              <p className="hero__lead">Todo espaço tem sua própria rotina. O primeiro passo é conversar sobre o que faz sentido para o seu ambiente, conectando pessoas, processos e tecnologia.</p>
              <div className="hero__actions">
                <a href="#orcamento" className="button button--primary">Conte o que você precisa <ArrowUpRight size={18} /></a>
                <a href="#servicos" className="button button--text">Ver serviços <ArrowRight size={18} /></a>
              </div>
              <div className="hero__trust"><span className="trust-mark"><ShieldCheck size={18} /></span><span>Um primeiro passo começa<br />por uma conversa.</span></div>
            </div>
            <div className="hero__visual">
              <img className="visual__editorial" src="/images/layout-06-blueprint-editorial.png" alt="Ilustração editorial de edifícios conectados em tons de azul" />
              <div className="visual__grid" />
              <div className="visual__orbit visual__orbit--one" /><div className="visual__orbit visual__orbit--two" />
              <div className="visual__building visual__building--back" /><div className="visual__building visual__building--front" />
              <div className="visual__shield"><Shield size={66} strokeWidth={1} /><span>SEG</span></div>
              <div className="visual__top"><span className="visual__pulse" /> SEGURANÇA INTEGRADA <span>↗</span></div>
              <div className="visual__bottom"><span className="visual__bottom-icon"><MonitorDot size={22} /></span><span>Uma proteção que se adapta<br /><strong>à sua realidade.</strong></span><ArrowUpRight size={18} /></div>
              <span className="visual__caption">GRUPO SEG SYSTEM <span> / </span> GUARULHOS · SP</span>
            </div>
          </div>
          <div className="container hero__footer"><span>01 / NOSSA ESSÊNCIA</span><a href="#servicos">Descubra o que fazemos <ArrowDownRight size={17} /></a></div>
        </section>

        <div className="ticker" aria-label="Áreas de atuação"><div className="container ticker__inner"><span><ShieldCheck size={17} /> Segurança patrimonial</span><i /> <span><Camera size={17} /> Tecnologia e CFTV</span><i /> <span><Users size={17} /> Portaria e acesso</span><i /> <span><MapPin size={17} /> Supervisão e ronda</span></div></div>

        <section className="layer-note" aria-label="Nossa abordagem">
          <span className="layer-note__index">A.</span>
          <h2>Segurança não é uma peça isolada.<br /><em>É um sistema de escolhas.</em></h2>
          <p>Presença, organização e tecnologia precisam fazer sentido para cada espaço.</p>
          <span className="layer-note__mark" aria-hidden="true"><LockKeyhole size={21} /></span>
        </section>

        <section className="section services-section" id="servicos">
          <div className="container">
            <div className="section-heading section-heading--split"><div><span className="kicker">01 — O QUE FAZEMOS</span><h2>Proteção completa.<br /><em>Do seu jeito.</em></h2></div><p>Da presença no local à tecnologia que acompanha sua operação: escolha os serviços que fazem sentido para o seu espaço.</p></div>
            <div className="service-grid">{services.map(service => { const Icon = service.icon; return <article className="service-card" key={service.name}><div className="service-card__top"><span className="service-card__icon"><Icon size={26} strokeWidth={1.6} /></span><span className="service-card__number">{service.number} / 06</span></div><h3>{service.name}</h3><p>{service.short}</p><a href="#orcamento" onClick={() => setSelectedServices(current => current.includes(service.name) ? current : [...current, service.name])} aria-label={`Solicitar proposta de ${service.name}`}>Incluir na proposta <ArrowUpRight size={17} /></a></article>; })}</div>
            <div className="services-note"><span><CircleHelp size={19} /> Não sabe por onde começar?</span><a href="/simulador">Monte sua solicitação em 4 etapas <ArrowRight size={17} /></a></div>
          </div>
        </section>

        <section className="solutions-section" id="solucoes"><div className="container solutions-grid"><div className="solutions-intro"><span className="kicker">02 — SOLUÇÕES SOB MEDIDA</span><h2>Um cuidado diferente para <em>cada ambiente.</em></h2><p>O mesmo compromisso com a proteção, com um plano pensado para a dinâmica de cada cliente.</p><a className="button button--light" href="/simulador">Montar minha solicitação <ArrowUpRight size={18} /></a></div><div className="solutions-list">{[{ icon: Building2, name: "Condomínios", desc: "Rotina, acessos e convivência." }, { icon: Shield, name: "Empresas e comércios", desc: "Pessoas, patrimônio e continuidade." }, { icon: MonitorDot, name: "Indústrias", desc: "Operações que pedem atenção constante." }].map(({icon: Icon, name, desc}, i) => <div className="solution-row" key={name}><span className="solution-row__index">0{i + 1}</span><span className="solution-row__icon"><Icon size={24} strokeWidth={1.5} /></span><span className="solution-row__text"><strong>{name}</strong><small>{desc}</small></span><ArrowUpRight size={20} /></div>)}</div></div></section>

        <section className="section about-section" id="sobre"><div className="container about-grid"><div className="about-art"><div className="about-art__lines" /><div className="about-art__mark"><Shield size={96} strokeWidth={0.7} /><span>SEG</span></div><span className="about-art__label">PROTEÇÃO EM CADA DETALHE</span><div className="about-art__tag"><span className="preview-dot" /> PRESENÇA. PROCESSO. TECNOLOGIA.</div></div><div className="about-copy"><span className="kicker">03 — SOBRE NÓS</span><h2>Segurança vai além de estar presente.</h2><p>O Grupo SEG System Segurança Integrada atua com foco em proteção patrimonial, prevenção e soluções ajustadas às necessidades de diferentes operações.</p><p>Unimos profissionais, processos e tecnologia para oferecer um atendimento responsável, organizado e próximo de cada cliente.</p><div className="about-points"><span><CheckCircle2 size={19} /> Atendimento personalizado</span><span><CheckCircle2 size={19} /> Foco em prevenção</span><span><CheckCircle2 size={19} /> Tecnologia integrada</span></div><a className="text-link" href="#orcamento">Fale com a nossa equipe <ArrowUpRight size={18} /></a></div></div></section>

        <section className="process-section"><div className="container"><div className="section-heading"><span className="kicker">04 — COMO COMEÇAR</span><h2>Do primeiro contato à <em>solução certa.</em></h2></div><div className="steps"><div><span>01</span><MessageCircle size={28} /><h3>Conte sua necessidade</h3><p>Selecione os serviços e descreva seu imóvel ou operação.</p></div><div><span>02</span><CalendarIcon /><h3>Converse com a equipe</h3><p>Quando necessário, solicite uma visita. A equipe confirma a disponibilidade.</p></div><div><span>03</span><ShieldCheck size={28} /><h3>Receba uma proposta</h3><p>Uma solução dimensionada conforme o que você realmente precisa.</p></div></div></div></section>

        <section className="section quote-section" id="orcamento"><div className="container quote-grid"><div className="quote-copy"><span className="kicker">05 — VAMOS CONVERSAR</span><h2>Vamos construir uma proteção <em>para você?</em></h2><p>Escolha o que faz sentido agora. Sua solicitação será preparada para envio pelo WhatsApp — nenhum valor é calculado automaticamente nesta prévia.</p><div className="quote-benefits"><span><Check size={17} /> Sem compromisso</span><span><Check size={17} /> Serviços combináveis</span><span><Check size={17} /> Atendimento humano</span></div><div className="quote-contact"><small>PREFERE CONVERSAR DIRETAMENTE?</small><a href={whatsappLink("Olá! Gostaria de falar com a equipe do Grupo SEG System.")} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} /> {SITE_PHONE} <ArrowUpRight size={16} /></a></div></div><div className="quote-form-wrap"><div className="form-heading"><span>SUA SOLICITAÇÃO</span><span>ETAPA 01 / 01</span></div><div className="form-tabs" role="group" aria-label="Tipo de solicitação"><button className={kind === "orcamento" ? "active" : ""} type="button" onClick={() => setKind("orcamento")}>Orçamento</button><button className={kind === "visita" ? "active" : ""} type="button" onClick={() => setKind("visita")}>Solicitar visita</button></div><form onSubmit={sendRequest}><fieldset className="service-choices"><legend>Quais serviços interessam a você?</legend><div className="service-choices__grid">{services.map(service => <button type="button" key={service.name} className={`choice ${selectedServices.includes(service.name) ? "choice--selected" : ""}`} aria-pressed={selectedServices.includes(service.name)} onClick={() => toggleService(service.name)}><span className="choice__check">{selectedServices.includes(service.name) && <Check size={13} strokeWidth={3} />}</span>{service.name}</button>)}</div></fieldset><div className="form-row"><label>Seu nome <span>*</span><input name="name" autoComplete="name" placeholder="Como podemos chamar você?" required maxLength={100} /></label><label>Telefone / WhatsApp <span>*</span><input name="phone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" required maxLength={30} /></label></div><div className="form-row"><label>Cidade / bairro <span>*</span><input name="city" placeholder="Onde fica o imóvel?" required maxLength={100} /></label><label>Tipo de imóvel <span>*</span><select name="property" required defaultValue=""><option value="" disabled>Selecione uma opção</option><option>Condomínio</option><option>Empresa ou comércio</option><option>Indústria</option><option>Instituição</option><option>Outro</option></select></label></div>{kind === "visita" && <label className="field-full">Dia ou turno de preferência <span>*</span><input name="preference" placeholder="Ex.: terça-feira à tarde" required maxLength={120} /></label>}<label className="field-full">Conte um pouco mais <span className="optional">(opcional)</span><textarea name="details" placeholder="Tamanho do local, necessidades ou dúvidas..." rows={3} maxLength={1000} /></label><label className="consent"><input name="consent" type="checkbox" required /><span>Autorizo o registro destes dados para que a equipe do Grupo SEG System responda ao meu pedido. Após o registro, poderei continuar pelo WhatsApp.</span></label><label className="honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label><button className="button button--primary form-submit" type="submit" disabled={submitting}>{submitting ? "Registrando solicitação…" : "Registrar e continuar"} <ArrowUpRight size={18} /></button>{submissionMessage && <p className="form-disclaimer" role="status" aria-live="polite">{submissionMessage}</p>}{whatsappContinuation && <a className="button button--outline" href={whatsappContinuation} target="_blank" rel="noopener noreferrer">Continuar pelo WhatsApp <MessageCircle size={17} /></a>}<p className="form-disclaimer">{kind === "visita" ? "O pedido será registrado, mas a visita só é confirmada por uma pessoa da equipe." : "Um orçamento depende da avaliação da equipe. Não exibimos preços automáticos."}</p></form></div></div></section>

        <section className="extras-section" id="portal"><div className="container"><div className="section-heading section-heading--split"><div><span className="kicker">EM CONSTRUÇÃO</span><h2>Mais perto de quem <em>confia na gente.</em></h2></div><p>O novo sistema vai reunir atendimento, relacionamento e informações em um só lugar. Estas áreas ainda não estão disponíveis nesta prévia.</p></div><div className="extras-grid"><div className="extra-card"><span className="extra-card__icon"><LockKeyhole size={25} /></span><h3>Portal do cliente</h3><p>Contratos autorizados, documentos e acompanhamento de chamados em um ambiente reservado.</p><a className="text-link" href="/cliente">Saiba como funcionará o convite <ArrowRight size={15} /></a><span className="status-pill">Em desenvolvimento</span></div><div className="extra-card"><span className="extra-card__icon"><FileText size={25} /></span><h3>Conteúdo e novidades</h3><p>Dicas de prevenção e informações sobre segurança, com conteúdo revisado antes da publicação.</p><span className="status-pill">Em desenvolvimento</span></div><div className="extra-card"><span className="extra-card__icon"><Users size={25} /></span><h3>Trabalhe conosco</h3><p>Um espaço para conhecer oportunidades e se candidatar com segurança e privacidade.</p><span className="status-pill">Em desenvolvimento</span></div></div></div></section>

        <section className="section faq-section" id="duvidas"><div className="container faq-grid"><div><span className="kicker">06 — DÚVIDAS FREQUENTES</span><h2>Respostas para começar <em>com confiança.</em></h2><p>Informações iniciais baseadas nos serviços apresentados pela empresa. Para uma situação específica, fale diretamente com a equipe.</p><a className="button button--outline" target="_blank" rel="noopener noreferrer" href={whatsappLink("Olá! Tenho uma dúvida sobre os serviços do Grupo SEG System.")}>Falar com uma pessoa <ArrowUpRight size={18} /></a></div><div className="faq-list">{questions.map(({q, a}, i) => <div className={`faq-item ${faqOpen === i ? "faq-item--open" : ""}`} key={q}><button type="button" aria-expanded={faqOpen === i} onClick={() => setFaqOpen(faqOpen === i ? null : i)}><span>{String(i + 1).padStart(2, "0")}</span>{q}<ChevronDown size={20} /></button>{faqOpen === i && <p>{a}</p>}</div>)}</div></div></section>

        <section className="closing"><div className="container closing__inner"><div><span className="kicker">GRUPO SEG SYSTEM</span><h2>A proteção começa com uma conversa.</h2></div><a href="#orcamento" className="button button--light">Solicitar proposta <ArrowUpRight size={20} /></a></div></section>
      </main>

      <footer className="footer"><div className="container footer__main"><div className="footer__brand"><Brand compact /><p>Proteção patrimonial, prevenção e soluções integradas para sua operação.</p></div><div><strong>Navegação</strong><a href="#servicos">Serviços</a><a href="#solucoes">Soluções</a><a href="#sobre">Sobre o grupo</a><a href="#duvidas">Dúvidas frequentes</a></div><div><strong>Contato</strong><a href={`tel:+${WHATSAPP}`}><Phone size={15} /> {SITE_PHONE}</a><a href={`mailto:${EMAIL}`}><Mail size={15} /> {EMAIL}</a><span className="footer__address"><MapPin size={15} /> Av. Armando Bei, 305 - Sala 01<br />Vila Nova Bonsucesso, Guarulhos / SP</span></div></div><div className="container footer__bottom"><span>© {new Date().getFullYear()} Grupo SEG System. Prévia em desenvolvimento.</span><span>Dados de contato extraídos do site atual — aguardando confirmação.</span></div></footer>

      <div className="assistant-area">
        {assistantOpen && (
          <section className="assistant-panel" role="dialog" aria-label="Assistente de dúvidas">
            <div className="assistant-panel__head">
              <span className="assistant-panel__avatar"><Headphones size={22} /></span>
              <span><strong>Posso ajudar?</strong><small>Respostas da FAQ · sem IA</small></span>
              <button type="button" aria-label="Fechar assistente" onClick={() => setAssistantOpen(false)}><X size={19} /></button>
            </div>
            <div className="assistant-panel__body" aria-live="polite">
              <p className="assistant-bubble">Olá! Escolha uma pergunta para consultar a FAQ ou fale com a nossa equipe.</p>
              {selectedAssistantFaq && <>
                <p className="assistant-user">{selectedAssistantFaq.q}</p>
                <p className="assistant-bubble">{selectedAssistantFaq.a}</p>
              </>}
              <div className="assistant-prompts">
                {questions.map(({ q }, index) => (
                  <button type="button" key={q} aria-pressed={assistantQuestion === index} onClick={() => setAssistantQuestion(index)}>
                    {q} <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </div>
            <a className="assistant-panel__handoff" href={whatsappLink(handoffMessage)} target="_blank" rel="noopener noreferrer">
              {selectedAssistantFaq ? "Falar com uma pessoa sobre esta dúvida" : "Falar com uma pessoa"} <Send size={16} />
            </a>
          </section>
        )}
        <button className="assistant-trigger" type="button" onClick={() => setAssistantOpen(!assistantOpen)} aria-label={assistantOpen ? "Fechar assistente" : "Abrir assistente de dúvidas"} aria-expanded={assistantOpen}>
          {assistantOpen ? <X size={24} /> : <MessageCircle size={25} />}<span>{assistantOpen ? "Fechar" : "Dúvidas?"}</span>
        </button>
      </div>
    </div>
  );
}

function CalendarIcon() { return <Clock3 size={28} />; }
