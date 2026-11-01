"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ERROS,
  LIMITES,
  PROVEDORES,
  SITUACOES_INTEGRACAO,
  classificarLista,
  descreverTeste,
  filtrarIntegracoes,
  formatarQuando,
  mascararConfig,
  podeEscrever,
  queryDoFiltro,
  resumo,
  rotuloProvedor,
  rotuloSituacao,
  testeConectaDeVerdade,
  validarFiltros,
  validarNome,
  type Filtros,
  type Item,
  type Situacao,
} from "./integrations-state";
import styles from "./IntegrationsClient.module.css";

const FILTRO_INICIAL: Filtros = { provedor: "", situacao: "" };

/** Classe fixa por situação: módulo CSS não aceita nome montado em tempo de execução. */
const SELO: Record<string, string> = {
  not_configured: styles.selo_not_configured,
  configured: styles.selo_configured,
  failure: styles.selo_failure,
  testing: styles.selo_testing,
};

export default function IntegrationsClient() {
  const [itens, setItens] = useState<Item[]>([]);
  const [situacao, setSituacao] = useState<Situacao>("vazio");
  const [mensagemLista, setMensagemLista] = useState("Lendo o catálogo de integrações…");
  const [papel, setPapel] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTRO_INICIAL);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState("");
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [errosForm, setErrosForm] = useState<Record<string, string>>({});

  const carregar = useCallback(async (filtroAtual: Filtros) => {
    setCarregando(true);
    try {
      const resposta = await fetch(`/api/admin/integrations${queryDoFiltro(filtroAtual)}`, { cache: "no-store" });
      const corpo = await resposta.json().catch(() => null);
      const resultadoLista = classificarLista(resposta.status, corpo);
      setSituacao(resultadoLista.situacao);
      setItens(resultadoLista.itens);
      setMensagemLista(resultadoLista.mensagem);
      const papelDoServidor = (corpo as { role?: unknown } | null)?.role;
      if (typeof papelDoServidor === "string") setPapel(papelDoServidor);
    } catch {
      setSituacao("falha");
      setItens([]);
      setMensagemLista("Falha de rede ao ler o catálogo. Nada foi confirmado.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(FILTRO_INICIAL); }, [carregar]);

  async function aplicarFiltro(novos: Filtros) {
    const { ok, erros } = validarFiltros(novos);
    if (!ok) {
      setSituacao("invalido");
      setMensagemLista(Object.values(erros)[0] ?? ERROS.invalid_provider);
      return;
    }
    setFiltros(novos);
    await carregar(novos);
  }

  async function testar(id: string) {
    setOcupado(`teste:${id}`);
    setResultado(null);
    try {
      const resposta = await fetch(`/api/admin/integrations/${encodeURIComponent(id)}/test`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const corpo = await resposta.json().catch(() => null);
      const teste = descreverTeste(resposta.status, corpo);
      setResultado({ ok: teste.ok, texto: teste.mensagem });
      if (teste.ok) await carregar(filtros);
    } catch {
      setResultado({ ok: false, texto: "Falha de rede no teste de conexão. Nada foi confirmado." });
    } finally {
      setOcupado("");
    }
  }

  async function renomear(id: string) {
    const erro = validarNome(nomes[id] ?? "");
    if (erro) {
      setErrosForm((atual) => ({ ...atual, [id]: erro }));
      setResultado({ ok: false, texto: erro });
      return;
    }
    setErrosForm((atual) => { const proximo = { ...atual }; delete proximo[id]; return proximo; });
    setOcupado(`nome:${id}`);
    setResultado(null);
    try {
      const resposta = await fetch(`/api/admin/integrations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: (nomes[id] ?? "").trim() }),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        const codigo = typeof (corpo as { error?: unknown } | null)?.error === "string" ? String((corpo as { error: string }).error) : "";
        setResultado({ ok: false, texto: ERROS[codigo] ?? "A atualização foi recusada pelo servidor." });
        return;
      }
      const novoNome = (corpo as { integration?: { name?: unknown } } | null)?.integration?.name;
      setResultado({ ok: true, texto: `Nome atualizado para “${String(novoNome ?? "")}”.` });
      setNomes((atual) => { const proximo = { ...atual }; delete proximo[id]; return proximo; });
      await carregar(filtros);
    } catch {
      setResultado({ ok: false, texto: "Falha de rede ao renomear. Nada foi confirmado." });
    } finally {
      setOcupado("");
    }
  }

  const visiveis = filtrarIntegracoes(itens, filtros);
  const placar = resumo(itens);
  const escreve = podeEscrever(papel);

  return (
    <section className={styles.shell} data-testid="plt03" data-situacao={situacao} aria-labelledby="plt03-titulo">
      <header className={styles.header}>
        <h2 id="plt03-titulo">Integrações: catálogo, status e teste de conexão</h2>
        <p className={styles.lead}>
          PLT-03 — status configurado/não configurado/falha, último processamento, erro sanitizado e teste de
          conexão. O teste SMTP abre conexão real com o servidor de e-mail e <strong>não envia mensagem</strong>;
          os demais provedores respondem “não configurado” até existir credencial, sem chamada externa.
        </p>
      </header>

      <div className={styles.filtros} role="group" aria-label="Filtros do catálogo">
        <div className={styles.campo}>
          <label htmlFor="plt03-filtro-provedor">Provedor</label>
          <select
            id="plt03-filtro-provedor"
            value={filtros.provedor}
            onChange={(evento) => void aplicarFiltro({ ...filtros, provedor: evento.target.value })}
          >
            <option value="">Todos os provedores</option>
            {PROVEDORES.map((provedor) => (
              <option key={provedor} value={provedor}>{rotuloProvedor(provedor)}</option>
            ))}
          </select>
        </div>
        <div className={styles.campo}>
          <label htmlFor="plt03-filtro-situacao">Situação</label>
          <select
            id="plt03-filtro-situacao"
            value={filtros.situacao}
            onChange={(evento) => void aplicarFiltro({ ...filtros, situacao: evento.target.value })}
          >
            <option value="">Todas as situações</option>
            {SITUACOES_INTEGRACAO.map((chave) => (
              <option key={chave} value={chave}>{rotuloSituacao(chave)}</option>
            ))}
          </select>
        </div>
        <div className={styles.acoesFiltro}>
          <button type="button" onClick={() => void aplicarFiltro(FILTRO_INICIAL)} disabled={carregando || (!filtros.provedor && !filtros.situacao)}>
            Limpar filtros
          </button>
          <button type="button" onClick={() => void carregar(filtros)} disabled={carregando}>
            {carregando ? "Atualizando…" : "Recarregar"}
          </button>
        </div>
      </div>

      <p className={styles.placar} data-testid="plt03-resumo">
        {placar.total} no catálogo · {placar.configuradas} configurada(s) · {placar.emFalha} em falha ·{" "}
        {placar.naoConfiguradas} não configurada(s)
      </p>

      <p className={styles.situacao} data-testid="plt03-situacao" role="status" aria-live="polite">
        {mensagemLista}
      </p>

      {resultado && (
        <p
          className={resultado.ok ? styles.ok : styles.erro}
          data-testid={resultado.ok ? "plt03-ok" : "plt03-erro"}
          role={resultado.ok ? "status" : "alert"}
          aria-live="polite"
        >
          {resultado.texto}
        </p>
      )}

      {situacao === "negado" && (
        <p className={styles.explicacao} data-testid="plt03-negado">
          A sessão não tem permissão para ler o catálogo. Recarregue depois de entrar como <code>ti</code> ou{" "}
          <code>admin</code>. Isto <strong>não</strong> é um catálogo vazio.
        </p>
      )}

      {situacao === "falha" && (
        <button type="button" className={styles.retry} onClick={() => void carregar(filtros)} data-testid="plt03-retry">
          Tentar de novo
        </button>
      )}

      {!escreve && situacao === "ok" && (
        <p className={styles.explicacao} data-testid="plt03-somente-leitura">
          Seu papel (<strong>{papel || "desconhecido"}</strong>) lê o catálogo, mas não testa conexão nem renomeia
          integração — essas ações exigem <code>admin</code> ou <code>ti</code>.
        </p>
      )}

      <ul className={styles.lista}>
        {visiveis.map((item) => {
          const id = String(item.id ?? "");
          const emTeste = ocupado === `teste:${id}`;
          const salvando = ocupado === `nome:${id}`;
          const config = mascararConfig(item.config_sanitized);
          const status = String(item.status ?? "");
          return (
            <li key={id} className={styles.card} data-testid={`plt03-card-${id}`}>
              <div className={styles.cardTopo}>
                <h3>{String(item.name ?? id)}</h3>
                <code className={styles.identificador}>{id}</code>
                <span className={`${styles.selo} ${SELO[status] ?? styles.selo_desconhecida}`} data-testid={`plt03-status-${id}`}>
                  {rotuloSituacao(status)}
                </span>
              </div>
              <dl className={styles.detalhes}>
                <div><dt>Provedor</dt><dd>{rotuloProvedor(item.provider)}</dd></div>
                <div><dt>Última verificação</dt><dd>{formatarQuando(item.last_check_at)}</dd></div>
                <div><dt>Último sucesso</dt><dd>{formatarQuando(item.last_success_at)}</dd></div>
                <div><dt>Última falha</dt><dd>{formatarQuando(item.last_failure_at)}</dd></div>
                <div><dt>Último processamento</dt><dd>{formatarQuando(item.last_processed_at)}</dd></div>
              </dl>
              {typeof item.last_error_sanitized === "string" && item.last_error_sanitized && (
                <p className={styles.erroSanitizado} data-testid={`plt03-erro-${id}`}>
                  Erro sanitizado: {item.last_error_sanitized}
                </p>
              )}
              {config.length > 0 ? (
                <dl className={styles.config} aria-label={`Configuração sanitizada de ${id}`}>
                  {config.map((par) => (
                    <div key={par.chave}><dt>{par.chave}</dt><dd>{par.valor}</dd></div>
                  ))}
                </dl>
              ) : (
                <p className={styles.semConfig}>Configuração sanitizada não exposta por este provedor (nenhum campo público).</p>
              )}
              <div className={styles.cardAcoes}>
                <button
                  type="button"
                  onClick={() => void testar(id)}
                  disabled={!escreve || emTeste || salvando}
                  data-testid={`plt03-testar-${id}`}
                >
                  {emTeste ? "Testando…" : "Testar conexão"}
                </button>
                <div className={styles.campo}>
                  <label htmlFor={`plt03-nome-${id}`}>Nome da integração</label>
                  <input
                    id={`plt03-nome-${id}`}
                    value={nomes[id] ?? ""}
                    maxLength={LIMITES.nomeMax}
                    placeholder={String(item.name ?? id)}
                    onChange={(evento) => setNomes((atual) => ({ ...atual, [id]: evento.target.value }))}
                    disabled={!escreve || emTeste || salvando}
                    aria-invalid={errosForm[id] ? "true" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => void renomear(id)}
                    disabled={!escreve || emTeste || salvando || !(nomes[id] ?? "").trim()}
                    data-testid={`plt03-salvar-${id}`}
                  >
                    {salvando ? "Salvando…" : "Salvar nome"}
                  </button>
                  {errosForm[id] && <span className={styles.erroCampo}>{errosForm[id]}</span>}
                </div>
              </div>
              {!testeConectaDeVerdade(item.provider) && (
                <p className={styles.nota}>Sem credencial deste provedor o teste responde “não configurado”, sem chamada externa.</p>
              )}
            </li>
          );
        })}
      </ul>

      {situacao === "vazio" && (
        <p className={styles.explicacao} data-testid="plt03-vazio">
          Não há integração para este filtro. O catálogo nasce com sete padrões (SMTP, WhatsApp, pagamento, NF-e, IA,
          agenda e armazenamento) criados pelo servidor na primeira leitura.
        </p>
      )}

      <footer className={styles.rodape}>
        <p>
          <strong>Onde ficam os registros:</strong> jobs, logs, webhooks, entregas e reconciliação estão na aba
          <em> Registros de integração</em> (PLT-15). Esta tela não os duplica nem os substitui.
        </p>
        <p>
          <strong>O que esta tela não faz:</strong> não envia e-mail, não chama WhatsApp/pagamento/NF-e, não altera
          credencial (segredos nunca chegam ao navegador) e não promove nenhum requisito dos 222. Produção segue
          NO-GO; aceite humano segue 0/222.
        </p>
      </footer>
    </section>
  );
}
